import Link from "next/link";
import { ArrowRight, CalendarDays, FileCheck2, FileText, ShieldCheck, UserRoundCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { getClaimAudit } from "@/lib/audit";
import { requireViewer } from "@/lib/auth";
import { getClaim, getClaimDocument } from "@/lib/claims";
import { canAssign, canReview } from "@/lib/permissions";
import { listClaimsOfficers } from "@/lib/users";
import { StatusPill } from "@/components/status-pill";
import { assignClaim } from "../actions";

export default async function ClaimDetailPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const [viewer, claim] = await Promise.all([requireViewer(), getClaim(reference)]);
  if (!claim) notFound();

  const staff = canReview(viewer.role);
  const [document, events, officers] = await Promise.all([
    getClaimDocument(claim.id),
    getClaimAudit(claim.id),
    staff ? listClaimsOfficers() : Promise.resolve([]),
  ]);
  const mayReview = staff && (viewer.role !== "claims_officer" || claim.assignedTo === viewer.id);
  const assignAction = assignClaim.bind(null, claim.reference);

  return <div className="content">
    <div className="title-row"><div><Link className="back" href="/claims">← Claims</Link><p className="kicker">Claim details</p><h1>{claim.reference}</h1><p>{claim.patientName} · {claim.providerName}</p></div><div className="title-actions"><StatusPill status={claim.status} />{mayReview ? <Link className="primary" href={`/claims/${claim.reference}/review`}><FileCheck2 />Open review</Link> : null}</div></div>
    <section className="detail-grid">
      <article className="detail-card"><FileText /><div><span>Claim amount</span><strong>{claim.amount}</strong><small>{document?.name ?? "Document processing pending"}</small></div>{document ? <a className="secondary" href={document.signedUrl} target="_blank" rel="noreferrer">Open document</a> : null}</article>
      <article className="detail-card"><UserRoundCheck /><div><span>Ownership</span><strong>{claim.clientName ?? "Staff-created claim"}</strong><small>Assigned to: {claim.assignedOfficerName ?? "Unassigned"}</small></div></article>
      <article className="detail-card"><CalendarDays /><div><span>Submitted</span><strong>{new Intl.DateTimeFormat("en-MU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(claim.createdAt))}</strong><small>{claim.warningCount} validation warnings</small></div></article>
    </section>
    {staff && !claim.assignedTo ? <section className="assignment-card"><div><ShieldCheck /><span><b>This claim is unassigned.</b><small>An officer must be assigned before officer verification.</small></span></div>{viewer.role === "claims_officer" ? <form action={assignAction}><button className="primary" type="submit">Assign to me <ArrowRight /></button></form> : null}</section> : null}
    {canAssign(viewer.role) ? <section className="assignment-card"><div><UserRoundCheck /><span><b>Assign claims officer</b><small>Supervisors and administrators control workload ownership.</small></span></div><form action={assignAction} className="assignment-form"><select name="assignee" defaultValue={claim.assignedTo ?? ""} required><option value="" disabled>Select officer</option>{officers.map((officer) => <option key={officer.id} value={officer.id}>{officer.displayName}</option>)}</select><button className="secondary" type="submit">Save assignment</button></form></section> : null}
    <section className="table-card"><div className="table-head"><div><h2>Audit history</h2><p>Immutable business events visible to your role.</p></div></div><div className="timeline">{events.length ? events.map((event) => <div key={event.id}><i /><span><b>{event.eventType.replaceAll("_", " ")}</b><small>{event.actorName} · {new Intl.DateTimeFormat("en-MU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.createdAt))}</small></span></div>) : <p>No audit events yet.</p>}</div></section>
  </div>;
}
