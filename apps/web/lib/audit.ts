import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireRole, requireViewer } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import type { AuditEventDTO } from "@/lib/types";

type AuditRow = {
  id: string; event_type: string; created_at: string; actor_id: string;
  claim_id: string | null; subject_user_id: string | null;
};

async function hydrateAudit(rows: AuditRow[]): Promise<AuditEventDTO[]> {
  const supabase = await createClient();
  const userIds = [...new Set(rows.flatMap((row) => [row.actor_id, row.subject_user_id]).filter((id): id is string => Boolean(id)))];
  const claimIds = [...new Set(rows.map((row) => row.claim_id).filter((id): id is string => Boolean(id)))];
  const [{ data: profiles }, { data: claims }] = await Promise.all([
    userIds.length ? supabase.from("profiles").select("id,display_name").in("id", userIds) : Promise.resolve({ data: [] }),
    claimIds.length ? supabase.from("claims").select("id,reference").in("id", claimIds) : Promise.resolve({ data: [] }),
  ]);
  const names = new Map((profiles ?? []).map((profile) => [profile.id as string, profile.display_name as string]));
  const references = new Map((claims ?? []).map((claim) => [claim.id as string, claim.reference as string]));
  return rows.map((row) => ({
    id: row.id,
    eventType: row.event_type,
    createdAt: row.created_at,
    actorName: names.get(row.actor_id) ?? "System",
    claimReference: row.claim_id ? references.get(row.claim_id) ?? null : null,
    subjectName: row.subject_user_id ? names.get(row.subject_user_id) ?? "User" : null,
  }));
}

export async function listAuditEvents(limit = 100) {
  await requireRole(["claims_officer", "supervisor", "administrator"]);
  if (isDemoMode) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("audit_events")
    .select("id,event_type,created_at,actor_id,claim_id,subject_user_id")
    .order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error("Unable to load the audit trail.");
  return hydrateAudit(data as AuditRow[]);
}

export async function getClaimAudit(claimId: string) {
  await requireViewer();
  if (isDemoMode) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("audit_events")
    .select("id,event_type,created_at,actor_id,claim_id,subject_user_id")
    .eq("claim_id", claimId).order("created_at", { ascending: false });
  if (error) throw new Error("Unable to load claim history.");
  return hydrateAudit(data as AuditRow[]);
}
