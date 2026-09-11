"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, Bell, CheckCheck, CircleCheck, FileQuestion, Info, X } from "lucide-react";
import { markAllNotificationsRead, markNotificationRead } from "@/app/(workspace)/notifications/actions";
import { formatMauritiusDateTime } from "@/lib/date";
import { createClient } from "@/lib/supabase/client";
import type { NotificationDTO, NotificationType } from "@/lib/types";

type RealtimeNotificationRow = {
  id: string;
  recipient_id: string;
  notification_type: NotificationType;
  title: string;
  message: string;
  claim_reference: string | null;
  read_at: string | null;
  created_at: string;
};

function renderNotificationIcon(type: NotificationType) {
  if (type === "ACTION_REQUIRED") return <FileQuestion />;
  if (type === "WARNING") return <AlertTriangle />;
  if (type === "SUCCESS") return <CircleCheck />;
  return <Info />;
}

function fromRealtimeRow(row: RealtimeNotificationRow): NotificationDTO {
  return {
    id: row.id,
    type: row.notification_type,
    title: row.title,
    message: row.message,
    claimReference: row.claim_reference,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

function notificationHref(notification: NotificationDTO) {
  return notification.claimReference
    ? `/claims/${encodeURIComponent(notification.claimReference)}`
    : "/dashboard";
}

export function NotificationCenter({
  viewerId,
  initialNotifications,
  realtimeEnabled,
}: {
  viewerId: string;
  initialNotifications: NotificationDTO[];
  realtimeEnabled: boolean;
}) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<NotificationDTO | null>(null);
  const [, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const unreadCount = notifications.filter((item) => !item.readAt).length;

  const readNotification = useCallback((notificationId: string) => {
    setNotifications((current) => current.map((item) =>
      item.id === notificationId && !item.readAt ? { ...item, readAt: new Date().toISOString() } : item,
    ));
    startTransition(async () => {
      const result = await markNotificationRead(notificationId);
      if (!result.success) setNotifications(initialNotifications);
    });
  }, [initialNotifications]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 8000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const latestUnread = initialNotifications.find((item) => !item.readAt);
    if (!latestUnread) return;
    const storageKey = `claimlens-notification-shown:${latestUnread.id}`;
    if (window.sessionStorage.getItem(storageKey)) return;
    const timer = window.setTimeout(() => {
      window.sessionStorage.setItem(storageKey, "1");
      setToast(latestUnread);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [initialNotifications]);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  useEffect(() => {
    if (!realtimeEnabled) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${viewerId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${viewerId}` },
        (payload) => {
          const incoming = fromRealtimeRow(payload.new as RealtimeNotificationRow);
          setNotifications((current) => [incoming, ...current.filter((item) => item.id !== incoming.id)].slice(0, 30));
          setToast(incoming);
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [realtimeEnabled, viewerId]);

  function readAll() {
    const previous = notifications;
    setNotifications((current) => current.map((item) => item.readAt ? item : { ...item, readAt: new Date().toISOString() }));
    startTransition(async () => {
      const result = await markAllNotificationsRead();
      if (!result.success) setNotifications(previous);
    });
  }

  return <>
    <div className="notification-center" ref={containerRef}>
      <button
        type="button"
        className="icon-btn notification-bell"
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        aria-controls="notification-panel"
        onClick={() => setOpen((value) => !value)}
      >
        <Bell />
        {unreadCount ? <span>{unreadCount > 99 ? "99+" : unreadCount}</span> : null}
      </button>
      {open ? <section className="notification-panel" id="notification-panel" aria-label="Notifications">
        <header>
          <div><h2>Notifications</h2><small>{unreadCount ? `${unreadCount} unread` : "You are up to date"}</small></div>
          {unreadCount ? <button type="button" onClick={readAll}><CheckCheck /> Mark all as read</button> : null}
        </header>
        <div className="notification-list">
          {notifications.length ? notifications.map((notification) => {
            return <Link
              key={notification.id}
              href={notificationHref(notification)}
              className={notification.readAt ? "notification-item" : "notification-item unread"}
              onClick={() => { readNotification(notification.id); setOpen(false); }}
            >
              <span className={`notification-type ${notification.type.toLowerCase()}`}>{renderNotificationIcon(notification.type)}</span>
              <span className="notification-copy">
                <b>{notification.title}</b>
                <small>{notification.message}</small>
                <time dateTime={notification.createdAt}>{formatMauritiusDateTime(notification.createdAt)}</time>
              </span>
              {!notification.readAt ? <i aria-label="Unread" /> : null}
            </Link>;
          }) : <div className="notification-empty"><Bell /><b>No notifications yet</b><small>New claim updates and requests will appear here.</small></div>}
        </div>
      </section> : null}
    </div>
    {toast ? <aside className={`notification-toast ${toast.type.toLowerCase()}`} role="status" aria-live="polite">
      {renderNotificationIcon(toast.type)}
      <div><b>{toast.title}</b><p>{toast.message}</p><Link href={notificationHref(toast)} onClick={() => { readNotification(toast.id); setToast(null); }}>View claim</Link></div>
      <button type="button" aria-label="Dismiss notification" onClick={() => setToast(null)}><X /></button>
    </aside> : null}
  </>;
}
