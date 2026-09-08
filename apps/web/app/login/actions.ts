"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig, isDemoMode } from "@/lib/config";

const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(8).max(128),
  next: z.string().optional(),
});

export type LoginState = { error?: string };

export async function login(_state: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") || undefined,
  });
  if (!parsed.success) return { error: "Enter a valid email and password." };

  if (!isDemoMode) {
    if (!hasSupabaseConfig) return { error: "The production service is not configured yet." };
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    if (error?.code === "email_not_confirmed") return { error: "Your account exists, but the email is not confirmed yet. Confirm it in Supabase or from the confirmation email." };
    if (error) return { error: "The email or password is incorrect." };
  }

  const next = parsed.data.next?.startsWith("/") && !parsed.data.next.startsWith("//")
    ? parsed.data.next
    : "/dashboard";
  redirect(next);
}
