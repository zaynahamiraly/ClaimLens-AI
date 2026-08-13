"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const roles = ["client", "claims_officer", "supervisor", "administrator"] as const;
const createSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  email: z.email().trim().toLowerCase(),
  role: z.enum(roles),
  password: z.string().min(12).max(128),
});

const updateSchema = z.object({
  userId: z.uuid(),
  displayName: z.string().trim().min(2).max(120),
  role: z.enum(roles),
  status: z.enum(["active", "inactive"]),
});

export type UserActionState = { error?: string; success?: string };

export async function createUser(_state: UserActionState, formData: FormData): Promise<UserActionState> {
  await requireRole(["administrator"]);
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter a valid name, email, role, and temporary password of at least 12 characters." };
  if (isDemoMode) return { success: "Demo user created for this session." };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { display_name: parsed.data.displayName },
  });
  if (error || !data.user) return { error: error?.message ?? "Could not create the user." };

  const supabase = await createClient();
  const { error: profileError } = await supabase.rpc("admin_update_user_profile", {
    p_user_id: data.user.id,
    p_display_name: parsed.data.displayName,
    p_role: parsed.data.role,
    p_status: "active",
    p_event_type: "USER_CREATED",
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: "The account profile could not be secured, so the partial user was removed." };
  }
  revalidatePath("/admin/users");
  revalidatePath("/audit");
  return { success: `${parsed.data.displayName} was created successfully.` };
}

export async function updateUser(formData: FormData) {
  await requireRole(["administrator"]);
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success || isDemoMode) return;

  const admin = createAdminClient();
  const banDuration = parsed.data.status === "inactive" ? "876000h" : "none";
  const { error: authError } = await admin.auth.admin.updateUserById(parsed.data.userId, { ban_duration: banDuration });
  if (authError) throw new Error("Could not update the authentication account.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_user_profile", {
    p_user_id: parsed.data.userId,
    p_display_name: parsed.data.displayName,
    p_role: parsed.data.role,
    p_status: parsed.data.status,
    p_event_type: "USER_ROLE_CHANGED",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
  revalidatePath("/audit");
}
