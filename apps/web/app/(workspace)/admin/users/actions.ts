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

const userIdSchema = z.uuid();
const deleteSchema = z.object({
  confirmEmail: z.email().trim().toLowerCase(),
});

export type UserActionState = { error?: string; success?: string };
export type UserSecurityState = { error?: string; success?: string; resetLink?: string };

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

export async function createPasswordResetLink(
  userId: string,
  _state: UserSecurityState,
): Promise<UserSecurityState> {
  void _state;
  await requireRole(["administrator"]);
  const parsedId = userIdSchema.safeParse(userId);
  if (!parsedId.success) return { error: "Invalid user account." };
  if (isDemoMode) return { error: "Password recovery links are unavailable in demo mode." };

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (!siteUrl) return { error: "NEXT_PUBLIC_SITE_URL must be configured before creating recovery links." };
  const admin = createAdminClient();
  const { data: target, error: targetError } = await admin.auth.admin.getUserById(parsedId.data);
  if (targetError || !target.user?.email || target.user.deleted_at) return { error: "That active authentication account could not be found." };

  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: target.user.email,
    options: { redirectTo: `${siteUrl}/update-password` },
  });
  if (error || !data.properties?.hashed_token) return { error: error?.message ?? "Could not create the password recovery link." };

  const recoveryUrl = new URL("/auth/recovery", siteUrl);
  recoveryUrl.searchParams.set("token_hash", data.properties.hashed_token);
  return {
    success: "A one-time recovery link was created. Send it to the user through a trusted private channel.",
    resetLink: recoveryUrl.toString(),
  };
}

export async function deleteUserAccount(
  userId: string,
  _state: UserSecurityState,
  formData: FormData,
): Promise<UserSecurityState> {
  void _state;
  const viewer = await requireRole(["administrator"]);
  const parsedId = userIdSchema.safeParse(userId);
  const parsedConfirmation = deleteSchema.safeParse({ confirmEmail: formData.get("confirmEmail") });
  if (!parsedId.success || !parsedConfirmation.success) return { error: "Enter the account email exactly to confirm deletion." };
  if (parsedId.data === viewer.id) return { error: "You cannot delete your own administrator account." };
  if (isDemoMode) return { success: "Demo account deletion was simulated." };

  const admin = createAdminClient();
  const { data: target, error: targetError } = await admin.auth.admin.getUserById(parsedId.data);
  const targetEmail = target.user?.email?.toLowerCase();
  if (targetError || !target.user || !targetEmail || target.user.deleted_at) return { error: "That active authentication account could not be found." };
  if (parsedConfirmation.data.confirmEmail !== targetEmail) return { error: "The confirmation email does not match this account." };

  const supabase = await createClient();
  const { data: profile, error: profileReadError } = await supabase
    .from("profiles")
    .select("display_name,role")
    .eq("id", parsedId.data)
    .maybeSingle();
  if (profileReadError || !profile) return { error: "The workspace profile could not be loaded." };

  const { error: disableError } = await supabase.rpc("admin_update_user_profile", {
    p_user_id: parsedId.data,
    p_display_name: profile.display_name,
    p_role: profile.role,
    p_status: "inactive",
    p_event_type: "USER_STATUS_CHANGED",
  });
  if (disableError) return { error: "The account could not be disabled before deletion." };

  const { error: deleteError } = await admin.auth.admin.deleteUser(parsedId.data, true);
  if (deleteError) {
    await supabase.rpc("admin_update_user_profile", {
      p_user_id: parsedId.data,
      p_display_name: profile.display_name,
      p_role: profile.role,
      p_status: "active",
      p_event_type: "USER_STATUS_CHANGED",
    });
    return { error: "Supabase could not delete the account. Its previous access state was restored." };
  }

  revalidatePath("/admin/users");
  revalidatePath("/audit");
  return { success: "The authentication account was deleted and its claim history was preserved." };
}
