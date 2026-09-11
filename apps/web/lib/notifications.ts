import "server-only";

import { isDemoMode } from "@/lib/config";
import { DEMO_NOTIFICATIONS } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";
import type { NotificationDTO, NotificationType } from "@/lib/types";

type NotificationRow = {
  id: string;
  notification_type: NotificationType;
  title: string;
  message: string;
  claim_reference: string | null;
  read_at: string | null;
  created_at: string;
};

export async function listNotifications(): Promise<NotificationDTO[]> {
  if (isDemoMode) return DEMO_NOTIFICATIONS;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id,notification_type,title,message,claim_reference,read_at,created_at")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return [];
    console.error("[listNotifications] unable to load notifications", { error: error.message });
    return [];
  }

  return (data as NotificationRow[]).map((row) => ({
    id: row.id,
    type: row.notification_type,
    title: row.title,
    message: row.message,
    claimReference: row.claim_reference,
    readAt: row.read_at,
    createdAt: row.created_at,
  }));
}
