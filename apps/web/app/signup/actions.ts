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
  confirmPassword: z.string(),
}).refine((value) => value.password === value.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
});

export type SignupState = { error?: string; success?: string };

export async function signup(_state: SignupState, formData: FormData): Promise<SignupState> {
  if (isDemoMode || !hasSupabaseConfig) return { error: "Public registration is not available in this environment." };

  const parsed = signupSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: "Enter a valid name and email. Use at least 8 characters and make sure both passwords match." };
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
    if (error.status === 429) return { error: "Too many registration attempts. Please wait and try again." };
    return { error: "The account could not be created. Try signing in or use a different email address." };
  }

  if (data.session) redirect("/dashboard");
  return { success: "Check your email to confirm your account, then sign in to start a claim." };
}
