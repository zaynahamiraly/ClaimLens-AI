import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/config";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProfileDTO, UserRole } from "@/lib/types";

type ProfileRow = {
  id: string;
  display_name: string;
  role: UserRole;
  status: "active" | "inactive";
  created_at: string;
};

export const listProfiles = cache(async (): Promise<ProfileDTO[]> => {
  await requireRole(["administrator"]);
  if (isDemoMode) return [];
  const supabase = await createClient();
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id,display_name,role,status,created_at")
    .order("created_at", { ascending: true });
  if (error) throw new Error("Unable to load users.");
  const rows = profiles as ProfileRow[];
  const admin = createAdminClient();
  const { data: authData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const emails = new Map(authData.users.map((user) => [user.id, user.email ?? "No email"]));
  return rows.map((profile) => ({
    id: profile.id,
    email: emails.get(profile.id) ?? "No email",
    displayName: profile.display_name,
    role: profile.role,
    status: profile.status,
    createdAt: profile.created_at,
  }));
});

export const listClaimsOfficers = cache(async () => {
  await requireRole(["claims_officer", "supervisor", "administrator"]);
  if (isDemoMode) return [{ id: "demo-user", displayName: "Shuaib" }];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id,display_name")
    .eq("role", "claims_officer")
    .eq("status", "active")
    .order("display_name");
  if (error) throw new Error("Unable to load claims officers.");
  return (data ?? []).map((profile) => ({ id: profile.id as string, displayName: profile.display_name as string }));
});
