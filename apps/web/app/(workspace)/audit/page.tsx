import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { listAuditEvents } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { formatMauritiusDateTime } from "@/lib/date";

export default async function AuditPage() {
  const [, events] = await Promise.all([
    requireRole(["claims_officer", "supervisor", "administrator"]),
    listAuditEvents(),
  ]);
  return <div className="content">
    <div className="title-row"><div><p className="kicker">Accountability</p><h1>Audit trail</h1><p>Trace claim, assignment, verification, and user-access events.</p></div><span className="role-summary"><ShieldCheck />Immutable event history</span></div>
    <section className="table-card"><div className="table-head"><div><h2>Recent events</h2><p>{events.length} events visible to your role</p></div></div><div className="table-scroll"><table><thead><tr><th>Event</th><th>Actor</th><th>Subject</th><th>Time</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td><b>{event.eventType.replaceAll("_", " ")}</b></td><td>{event.actorName}</td><td>{event.claimReference ? <Link href={`/claims/${event.claimReference}`}>{event.claimReference}</Link> : event.subjectName ?? "—"}</td><td>{formatMauritiusDateTime(event.createdAt)}</td></tr>)}</tbody></table>{events.length === 0 ? <div className="empty-state"><p>No audit events are available yet.</p></div> : null}</div></section>
  </div>;
}
