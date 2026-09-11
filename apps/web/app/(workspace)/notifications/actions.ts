"use server";

import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

const notificationIdSchema = z.string().uuid();

export async function markNotificationRead(notificationId: string) {
  await requireViewer();
  if (isDemoMode) return { success: true };

  const parsed = notificationIdSchema.safeParse(notificationId);
  if (!parsed.success) return { success: false };
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_notification_read", { p_notification_id: parsed.data });
  if (error) console.error("[markNotificationRead] failed", { error: error.message });
  return { success: !error };
}

export async function markAllNotificationsRead() {
  await requireViewer();
  if (isDemoMode) return { success: true };

  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_all_notifications_read");
  if (error) console.error("[markAllNotificationsRead] failed", { error: error.message });
  return { success: !error };
}
