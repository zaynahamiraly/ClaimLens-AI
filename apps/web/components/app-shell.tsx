"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ChevronRight, CircleUserRound, FileCheck2, FileText, LayoutDashboard, LogOut, Menu, Search, ShieldCheck, Sparkles, UserCog, X } from "lucide-react";
import { signOut } from "@/app/actions";
import { NotificationCenter } from "@/components/notification-center";
import { ROLE_LABELS } from "@/lib/permissions";
import type { NotificationDTO, ViewerDTO } from "@/lib/types";

function navigation(viewer: ViewerDTO) {
  if (viewer.role === "client") return [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/claims", label: "My claims", icon: FileText },
    { href: "/claims/new", label: "Submit claim", icon: FileCheck2 },
  ];
  const links = [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/claims", label: "Claims queue", icon: FileText },
    { href: "/review-queue", label: "Review queue", icon: FileCheck2 },
    { href: "/analytics", label: "Analytics", icon: Activity },
    { href: "/audit", label: "Audit trail", icon: ShieldCheck },
  ];
  if (viewer.role === "administrator") links.push({ href: "/admin/users", label: "User access", icon: UserCog });
  return links;
}

export function AppShell({ viewer, initialNotifications, realtimeEnabled, children }: { viewer: ViewerDTO; initialNotifications: NotificationDTO[]; realtimeEnabled: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobile, setMobile] = useState(false);
  const links = navigation(viewer);
  const section = pathname.startsWith("/admin") ? "Administration" : pathname.startsWith("/analytics") ? "Analytics" : pathname.startsWith("/audit") ? "Audit trail" : pathname.startsWith("/review-queue") ? "Review queue" : pathname.startsWith("/claims/") && pathname.endsWith("/review") ? "AI Review" : pathname.startsWith("/claims") ? "Claims" : "Overview";
  const initials = viewer.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  return <div className="app-shell">
    <aside className={mobile ? "sidebar open" : "sidebar"}>
      <div className="brand"><span><Sparkles size={19} /></span>ClaimLens <b>AI</b><button aria-label="Close navigation" className="side-close" onClick={() => setMobile(false)}><X /></button></div>
      <nav><p>Workspace</p>{links.map(({ href, label, icon: Icon }) => { const base = href.split("?")[0]; const active = pathname === base || (base === "/claims" && pathname.startsWith("/claims") && !href.includes("status=")); return <Link key={href} href={href} className={active ? "active" : ""} onClick={() => setMobile(false)}><Icon />{label}</Link>; })}</nav>
      <div className="side-bottom"><div className="system"><span /><div><b>Application operational</b><small>Role policies active</small></div></div><div className="profile"><CircleUserRound /><div><b>{viewer.displayName}</b><small>{ROLE_LABELS[viewer.role]}</small></div><ChevronRight /></div></div>
    </aside>
    <main className="workspace"><header><button aria-label="Open navigation" className="menu" onClick={() => setMobile(true)}><Menu /></button><div><span className="crumb">Workspace /</span> {section}</div><div className="header-actions"><Link className="icon-btn" href="/claims" aria-label="Search claims"><Search /></Link><NotificationCenter viewerId={viewer.id} initialNotifications={initialNotifications} realtimeEnabled={realtimeEnabled} /><span className="avatar" title={viewer.email}>{initials}</span><form action={signOut}><button className="icon-btn" type="submit" title="Sign out" aria-label="Sign out"><LogOut /></button></form></div></header>{children}</main>
  </div>;
}
