import Link from "next/link";
import { AlertCircle, ArrowRight, CalendarDays, CircleDollarSign, FileCheck2, FileText, RefreshCw, ShieldCheck, UserRoundCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { getClaimAudit } from "@/lib/audit";
import { requireViewer } from "@/lib/auth";
import { getClaim, getClaimDecision, getClaimDocuments, getClaimProcessing } from "@/lib/claims";
import { canAssign, canReview } from "@/lib/permissions";
import { listClaimsOfficers } from "@/lib/users";
import { StatusPill } from "@/components/status-pill";
import { ProcessingAutoRefresh } from "@/components/processing-auto-refresh";
import { ClaimDecisionForm, SettlementControls } from "@/components/claim-workflow-controls";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { formatMauritiusDateTime } from "@/lib/date";
import { advanceClaimSettlement, assignClaim, decideClaim, retryClaimProcessing } from "../actions";

export default async function ClaimDetailPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const [viewer, claim] = await Promise.all([requireViewer(), getClaim(reference)]);
  if (!claim) notFound();

  const staff = canReview(viewer.role);
  const [documents, events, officers, processing, decision] = await Promise.all([
    getClaimDocuments(claim.id),
    getClaimAudit(claim.id),
    staff ? listClaimsOfficers() : Promise.resolve([]),
    getClaimProcessing(claim.id),
    getClaimDecision(claim.id),
  ]);
  const mayReview = staff && (viewer.role !== "claims_officer" || claim.assignedTo === viewer.id);
  const assignAction = assignClaim.bind(null, claim.reference);
  const processAction = retryClaimProcessing.bind(null, claim.reference);
  const decisionAction = decideClaim.bind(null, claim.reference);
  const settlementAction = advanceClaimSettlement.bind(null, claim.reference);
  const processingActive = processing?.status === "QUEUED" || processing?.status === "RUNNING";
  const processingUnavailable = processing?.status === "UNAVAILABLE";
  const canStartProcessing = ["UPLOADED", "PROCESSING", "PROCESSING_FAILED"].includes(claim.status) && !processingActive && !processingUnavailable;

  return <div className="content">
    <ProcessingAutoRefresh active={processingActive} />
    <div className="title-row"><div><Link className="back" href="/claims">← Claims</Link><p className="kicker">Claim details</p><h1>{claim.reference}</h1><p>{claim.patientName} · {claim.providerName}</p></div><div className="title-actions"><StatusPill status={claim.status} />{mayReview ? <Link className="primary" href={`/claims/${claim.reference}/review`}><FileCheck2 />Open review</Link> : null}</div></div>
    <section className="detail-grid">
      <article className="detail-card"><FileText /><div><span>Claim amount</span><strong>{claim.amount}</strong><small>{documents.length ? `${documents.length} document${documents.length === 1 ? "" : "s"} received` : "Document processing pending"}</small></div></article>
      <article className="detail-card"><UserRoundCheck /><div><span>Ownership</span><strong>{claim.clientName ?? "Staff-created claim"}</strong><small>Assigned to: {claim.assignedOfficerName ?? "Unassigned"}</small></div></article>
      <article className="detail-card"><CalendarDays /><div><span>Submitted</span><strong>{formatMauritiusDateTime(claim.createdAt)}</strong><small>{claim.warningCount} validation warnings</small></div></article>
    </section>
    {documents.length ? <section className="claim-documents"><h2>Uploaded documents ({documents.length})</h2><div className="claim-document-list">{documents.map((document) => <a key={document.id} href={document.signedUrl} target="_blank" rel="noreferrer"><FileText />{document.name}</a>)}</div></section> : null}
    {decision ? <section className="decision-summary"><CircleDollarSign /><div><span>Claim decision</span><strong>{decision.outcome.replaceAll("_", " ")}</strong><p>{decision.notes}</p><small>{decision.approvedAmount ? `Approved amount: ${decision.approvedAmount} · ` : ""}{formatMauritiusDateTime(decision.decidedAt)}</small></div></section> : null}
    {(viewer.role === "supervisor" || viewer.role === "administrator") && claim.status === "VERIFIED" ? <ClaimDecisionForm action={decisionAction} /> : null}
    {(viewer.role === "supervisor" || viewer.role === "administrator") && (claim.status === "APPROVED" || claim.status === "PAYMENT_PENDING") ? <SettlementControls action={settlementAction} status={claim.status} /> : null}
    {["UPLOADED", "PROCESSING", "PROCESSING_FAILED"].includes(claim.status) ? <section className="assignment-card"><div>{processing?.status === "FAILED" || processingUnavailable || claim.status === "PROCESSING_FAILED" ? <AlertCircle /> : <RefreshCw />}<span><b>{processingUnavailable ? "Processing setup is incomplete." : processingActive ? "Document processing is running." : processing?.status === "FAILED" ? "Document processing failed." : "This claim needs document processing."}</b><small>{processing?.lastError ?? (processingActive ? "The durable workflow will continue even if you close this page." : "Start the extraction workflow to produce reviewable fields.")}</small></span></div><form action={processAction}><PendingSubmitButton className="primary" disabled={!canStartProcessing} pendingLabel="Starting…"><RefreshCw />{processingUnavailable ? "Migration required" : processingActive ? "Processing…" : processing?.status === "FAILED" ? "Retry processing" : "Start processing"}</PendingSubmitButton></form></section> : null}
    {staff && !claim.assignedTo ? <section className="assignment-card"><div><ShieldCheck /><span><b>This claim is unassigned.</b><small>An officer must be assigned before officer verification.</small></span></div>{viewer.role === "claims_officer" ? <form action={assignAction}><PendingSubmitButton className="primary" pendingLabel="Assigning…">Assign to me <ArrowRight /></PendingSubmitButton></form> : null}</section> : null}
    {canAssign(viewer.role) ? <section className="assignment-card"><div><UserRoundCheck /><span><b>Assign claims officer</b><small>Supervisors and administrators control workload ownership.</small></span></div><form action={assignAction} className="assignment-form"><select name="assignee" defaultValue={claim.assignedTo ?? ""} required><option value="" disabled>Select officer</option>{officers.map((officer) => <option key={officer.id} value={officer.id}>{officer.displayName}</option>)}</select><PendingSubmitButton className="secondary" pendingLabel="Saving…">Save assignment</PendingSubmitButton></form></section> : null}
    <section className="table-card"><div className="table-head"><div><h2>Audit history</h2><p>Immutable business events visible to your role.</p></div></div><div className="timeline">{events.length ? events.map((event) => <div key={event.id}><i /><span><b>{event.eventType.replaceAll("_", " ")}</b><small>{event.actorName} · {formatMauritiusDateTime(event.createdAt)}</small>{event.detail ? <small>{event.detail}</small> : null}</span></div>) : <p>No audit events yet.</p>}</div></section>
  </div>;
}
