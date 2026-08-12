"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/config";

export async function signOut() {
  if (!isDemoMode) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
