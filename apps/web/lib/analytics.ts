import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/config";
import { requireRole } from "@/lib/auth";
import { listClaimsOfficers } from "@/lib/users";

export type AnalyticsJob = {
  claimId: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};

export type AnalyticsField = {
  claimId: string;
  confidence: number;
};

export type AnalyticsDecision = {
  claimId: string;
  approvedAmount: number | null;
};

export type AnalyticsEvent = {
  claimId: string;
  eventType: string;
  createdAt: string;
};

export type AnalyticsOfficer = {
  id: string;
  displayName: string;
};

export type AnalyticsSupplement = {
  jobs: AnalyticsJob[];
  fields: AnalyticsField[];
  decisions: AnalyticsDecision[];
  events: AnalyticsEvent[];
  officers: AnalyticsOfficer[];
};

export async function getAnalyticsSupplement(claimIds: string[]): Promise<AnalyticsSupplement> {
  await requireRole(["claims_officer", "supervisor", "administrator"]);
  const officersPromise = listClaimsOfficers();
  if (isDemoMode || claimIds.length === 0) {
    return { jobs: [], fields: [], decisions: [], events: [], officers: await officersPromise };
  }

  const supabase = await createClient();
  const [jobsResult, fieldsResult, decisionsResult, eventsResult, officers] = await Promise.all([
    supabase
      .from("claim_processing_jobs")
      .select("claim_id,status,started_at,finished_at,created_at")
      .in("claim_id", claimIds)
      .order("created_at", { ascending: false })
      .limit(5000),
    supabase
      .from("claim_extracted_fields")
      .select("claim_id,confidence")
      .in("claim_id", claimIds)
      .limit(10000),
    supabase
      .from("claim_decisions")
      .select("claim_id,approved_amount")
      .in("claim_id", claimIds)
      .limit(1000),
    supabase
      .from("audit_events")
      .select("claim_id,event_type,created_at")
      .in("claim_id", claimIds)
      .in("event_type", ["PROCESSING_COMPLETED", "CLAIM_VERIFIED", "CLAIM_APPROVED", "CLAIM_REJECTED", "CLAIM_PAID"])
      .order("created_at", { ascending: true })
      .limit(5000),
    officersPromise,
  ]);

  if (jobsResult.error || fieldsResult.error || decisionsResult.error || eventsResult.error) {
    throw new Error("Unable to load analytics details.");
  }

  return {
    jobs: (jobsResult.data ?? []).map((row) => ({
      claimId: row.claim_id as string,
      status: row.status as AnalyticsJob["status"],
      startedAt: row.started_at as string | null,
      finishedAt: row.finished_at as string | null,
      createdAt: row.created_at as string,
    })),
    fields: (fieldsResult.data ?? []).map((row) => ({
      claimId: row.claim_id as string,
      confidence: Number(row.confidence),
    })),
    decisions: (decisionsResult.data ?? []).map((row) => ({
      claimId: row.claim_id as string,
      approvedAmount: row.approved_amount == null ? null : Number(row.approved_amount),
    })),
    events: (eventsResult.data ?? []).map((row) => ({
      claimId: row.claim_id as string,
      eventType: row.event_type as string,
      createdAt: row.created_at as string,
    })),
    officers,
  };
}
