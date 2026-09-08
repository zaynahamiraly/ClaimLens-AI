"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hasSupabaseConfig, isDemoMode } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

const signupSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  email: z.email().trim().toLowerCase(),
  password: z.string().min(8).max(128),
});

export type SignupState = { error?: string; success?: string };

export async function signup(_state: SignupState, formData: FormData): Promise<SignupState> {
  if (isDemoMode || !hasSupabaseConfig) return { error: "Public registration is not available in this environment." };

  const parsed = signupSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Enter a valid name and email, and use a password of at least 8 characters." };
  }

  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  if (!origin) return { error: "Registration could not determine the secure application address." };
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || origin).replace(/\/+$/, "");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: `${siteUrl}/auth/callback`,
    },
  });

  if (error) {
    if (error.status === 429) return { error: "Supabase temporarily limited registrations. If the account was already created, use Sign in. Otherwise wait before retrying." };
    return { error: "The account could not be created. Try signing in or use a different email address." };
  }

  if (data.session) redirect("/dashboard");
  return { success: "Your account was created. Confirm it from the email, then use Sign in." };
}
