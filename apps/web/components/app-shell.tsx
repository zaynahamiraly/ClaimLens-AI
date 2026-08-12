"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ChevronRight, CircleUserRound, FileCheck2, FileText, LayoutDashboard, LogOut, Menu, Search, ShieldCheck, Sparkles, X } from "lucide-react";
import { signOut } from "@/app/actions";
import type { ViewerDTO } from "@/lib/types";

const links = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/claims", label: "Claims", icon: FileText },
  { href: "/claims/CLM-2026-000142/review", label: "Review queue", icon: FileCheck2 },
];

export function AppShell({ viewer, children }: { viewer: ViewerDTO; children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobile, setMobile] = useState(false);
  const section = pathname.startsWith("/claims/") && pathname.endsWith("/review") ? "AI Review" : pathname.startsWith("/claims") ? "Claims" : "Overview";
  const initials = viewer.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  return <div className="app-shell">
    <aside className={mobile ? "sidebar open" : "sidebar"}>
      <div className="brand"><span><Sparkles size={19} /></span>ClaimLens <b>AI</b><button aria-label="Close navigation" className="side-close" onClick={() => setMobile(false)}><X /></button></div>
      <nav><p>Workspace</p>{links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={pathname === href || (href === "/claims" && pathname === "/claims/new") ? "active" : ""} onClick={() => setMobile(false)}><Icon />{label}{label === "Review queue" ? <small className="warn">1</small> : null}</Link>)}<p>Intelligence</p><span className="disabled-nav"><Activity />Analytics</span><span className="disabled-nav"><ShieldCheck />Audit trail</span></nav>
      <div className="side-bottom"><div className="system"><span /><div><b>Application operational</b><small>Human review required</small></div></div><div className="profile"><CircleUserRound /><div><b>{viewer.displayName}</b><small>{viewer.role.replace("_", " ")}</small></div><ChevronRight /></div></div>
    </aside>
    <main className="workspace"><header><button aria-label="Open navigation" className="menu" onClick={() => setMobile(true)}><Menu /></button><div><span className="crumb">Workspace /</span> {section}</div><div className="header-actions"><Link className="icon-btn" href="/claims" aria-label="Search claims"><Search /></Link><span className="avatar" title={viewer.email}>{initials}</span><form action={signOut}><button className="icon-btn" type="submit" title="Sign out" aria-label="Sign out"><LogOut /></button></form></div></header>{children}</main>
  </div>;
}
