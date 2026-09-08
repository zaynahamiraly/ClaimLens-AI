"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const passwordSchema = z.object({
  password: z.string().min(8).max(128),
  confirmPassword: z.string(),
}).refine((value) => value.password === value.confirmPassword, { path: ["confirmPassword"] });

export type UpdatePasswordState = { error?: string };

export async function updatePassword(_state: UpdatePasswordState, formData: FormData): Promise<UpdatePasswordState> {
  void _state;
  const parsed = passwordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { error: "Use at least 8 characters and make sure both passwords match." };

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { error: "This recovery session is invalid or expired. Ask an administrator for a new link." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.status === 422 ? "Choose a password you have not used before." : "The password could not be updated." };
  await supabase.auth.signOut({ scope: "global" });
  redirect("/login?password=updated");
}
