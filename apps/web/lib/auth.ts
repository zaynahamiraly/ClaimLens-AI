import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEMO_VIEWER } from "@/lib/demo";
import { hasSupabaseConfig, isDemoMode } from "@/lib/config";
import type { UserRole, ViewerDTO } from "@/lib/types";

export const requireViewer = cache(async (): Promise<ViewerDTO> => {
  if (isDemoMode) return DEMO_VIEWER;
  if (!hasSupabaseConfig) redirect("/login?error=configuration");

  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("display_name,role,status")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError || !profile) redirect("/login?error=profile");
  if (profile.status !== "active") {
    await supabase.auth.signOut();
    redirect("/login?error=inactive");
  }

  return {
    id: user.id,
    email: user.email ?? "unknown@claimlens.local",
    displayName: profile.display_name,
    role: profile.role as UserRole,
    status: "active",
  };
});

export async function requireRole(allowed: readonly UserRole[]) {
  const viewer = await requireViewer();
  if (!allowed.includes(viewer.role)) redirect("/dashboard?denied=1");
  return viewer;
}
