import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEMO_VIEWER } from "@/lib/demo";
import { hasSupabaseConfig, isDemoMode } from "@/lib/config";
import type { ViewerDTO } from "@/lib/types";

export const requireViewer = cache(async (): Promise<ViewerDTO> => {
  if (isDemoMode) return DEMO_VIEWER;
  if (!hasSupabaseConfig) redirect("/login?error=configuration");

  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");

  const role = user.app_metadata?.role;
  return {
    id: user.id,
    email: user.email ?? "unknown@claimlens.local",
    displayName: user.app_metadata?.display_name ?? user.email?.split("@")[0] ?? "Claims officer",
    role: role === "administrator" || role === "supervisor" ? role : "claims_officer",
  };
});
