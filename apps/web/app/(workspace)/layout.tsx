import { AppShell } from "@/components/app-shell";
import { requireViewer } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { listNotifications } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  const notifications = await listNotifications();
  return <AppShell viewer={viewer} initialNotifications={notifications} realtimeEnabled={!isDemoMode}>{children}</AppShell>;
}
