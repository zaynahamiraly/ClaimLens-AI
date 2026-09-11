import Link from "next/link";
import { AlertCircle, ArrowRight, CalendarDays, CircleDollarSign, FileCheck2, FileQuestion, FileText, MessageSquareMore, RefreshCw, ShieldCheck, UserRoundCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { getClaimAudit } from "@/lib/audit";
import { requireViewer } from "@/lib/auth";
import { getClaim, getClaimDecision, getClaimDocuments, getClaimExtractedFields, getClaimInformationRequests, getClaimProcessing } from "@/lib/claims";
import { canAssign, canReview } from "@/lib/permissions";
import { listClaimsOfficers } from "@/lib/users";
import { StatusPill } from "@/components/status-pill";
import { ProcessingAutoRefresh } from "@/components/processing-auto-refresh";
import { ClaimDecisionForm, SettlementControls } from "@/components/claim-workflow-controls";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { ClaimConfirmationForm } from "@/components/claim-confirmation-form";
import { AdditionalInformationRequestForm, AdditionalInformationResponseForm } from "@/components/additional-information-forms";
import { formatMauritiusDate, formatMauritiusDateTime } from "@/lib/date";
import { advanceClaimSettlement, assignClaim, confirmClaim, decideClaim, requestAdditionalInformation, retryClaimProcessing, submitAdditionalInformation } from "../actions";

export const maxDuration = 300;

export default async function ClaimDetailPage({ params, searchParams }: { params: Promise<{ reference: string }>; searchParams: Promise<{ submitted?: string; information?: string }> }) {
  const { reference } = await params;
  const [viewer, claim, query] = await Promise.all([requireViewer(), getClaim(reference), searchParams]);
  if (!claim) notFound();

  const staff = canReview(viewer.role);
  const [documents, events, officers, processing, decision, extractedFields, informationRequests] = await Promise.all([
    getClaimDocuments(claim.id),
    getClaimAudit(claim.id),
    staff ? listClaimsOfficers() : Promise.resolve([]),
    getClaimProcessing(claim.id),
    getClaimDecision(claim.id),
    getClaimExtractedFields(claim.id),
    getClaimInformationRequests(claim.id),
  ]);
  const mayReview = staff && (viewer.role !== "claims_officer" || claim.assignedTo === viewer.id);
  const reviewAvailable = mayReview && (claim.status === "REVIEW_REQUIRED" || claim.status === "VERIFIED");
  const assignAction = assignClaim.bind(null, claim.reference);
  const processAction = retryClaimProcessing.bind(null, claim.reference);
  const decisionAction = decideClaim.bind(null, claim.reference);
  const settlementAction = advanceClaimSettlement.bind(null, claim.reference);
  const processingActive = processing?.status === "QUEUED" || processing?.status === "RUNNING";
  const processingUnavailable = processing?.status === "UNAVAILABLE";
  const extractedReady = claim.status === "UPLOADED" && processing?.status === "COMPLETED";
  const awaitingConfirmation = viewer.role === "client" && extractedReady;
  const canStartProcessing = ["UPLOADED", "PROCESSING", "PROCESSING_FAILED", "INFORMATION_RECEIVED"].includes(claim.status) && !processingActive && !processingUnavailable && !extractedReady;
  const extractedByName = new Map(extractedFields.sort((left, right) => left.confidence - right.confidence).map((field) => [field.fieldName, field]));
  const confirmationAction = confirmClaim.bind(null, claim.reference);
  const informationRequestAction = requestAdditionalInformation.bind(null, claim.reference);
  const openInformationRequest = informationRequests.find((request) => request.status === "OPEN");
  const informationResponseAction = openInformationRequest
    ? submitAdditionalInformation.bind(null, claim.reference, openInformationRequest.id)
    : null;
  const confidenceRows = [
    ["patient_name", "Patient"],
    ["provider_name", "Provider"],
    ["claimed_amount", "Claimed amount"],
    ["invoice_number", "Invoice number"],
    ["service_date", "Service date"],
  ].map(([name, label]) => {
    const field = extractedByName.get(name);
    const humanValue = name === "patient_name" && claim.patientName !== "Pending extraction"
      ? claim.patientName
      : name === "provider_name" && claim.providerName !== "Pending extraction"
        ? claim.providerName
        : null;
    return { name, label, field, humanValue };
  });

  return <div className="content">
    <ProcessingAutoRefresh active={processingActive} />
    {query.submitted === "1" ? <p className="success-banner" role="status">Claim submitted successfully. High-confidence packages are verified automatically; all others are in the staff review queue.</p> : null}
    {query.information === "received" ? <p className="success-banner" role="status">Additional information received. New documents are being processed before the claim returns to its assigned Claims Officer.</p> : null}
    <div className="title-row"><div><Link className="back" href="/claims">← Claims</Link><p className="kicker">Claim details</p><h1>{claim.reference}</h1><p>{claim.patientName} · {claim.providerName}</p></div><div className="title-actions"><StatusPill status={claim.status} />{reviewAvailable ? <Link className="primary" href={`/claims/${claim.reference}/review`}><FileCheck2 />Open review</Link> : null}</div></div>
    <section className="detail-grid">
      <article className="detail-card"><FileText /><div><span>Claim amount</span><strong>{claim.amount}</strong><small>{documents.length ? `${documents.length} document${documents.length === 1 ? "" : "s"} received` : "Document processing pending"}</small></div></article>
      <article className="detail-card"><UserRoundCheck /><div><span>Ownership</span><strong>{claim.clientName ?? "Staff-created claim"}</strong><small>Assigned to: {claim.assignedOfficerName ?? "Unassigned"}</small></div></article>
      <article className="detail-card"><CalendarDays /><div><span>Submitted</span><strong>{formatMauritiusDateTime(claim.createdAt)}</strong><small>{claim.warningCount} validation warnings</small></div></article>
    </section>
    <section className="confidence-panel"><div className="confidence-heading"><div><p className="kicker">Document intelligence</p><h2>Extracted information and confidence</h2></div><small>Values come from OCR or are clearly marked as human-provided.</small></div><div className="confidence-grid">{confidenceRows.map(({ name, label, field, humanValue }) => <article key={name} className={field || humanValue ? "" : "missing"}><span>{label}</span><strong>{field?.value ?? humanValue ?? (processingActive ? "Processing…" : "Information required")}</strong><small>{field ? `${Math.round(field.confidence * 100)}% confidence · ${field.documentName ?? "Claim document"}` : humanValue ? "Human provided · OCR confidence unavailable" : processingActive ? "OCR is checking the documents" : "Not confidently detected"}</small></article>)}</div></section>
    {viewer.role === "client" && openInformationRequest && informationResponseAction ? <section className="information-action-card"><div className="information-action-heading"><FileQuestion /><div><p className="kicker">Action required</p><h2>{openInformationRequest.reason}</h2><p>{openInformationRequest.questions}</p></div>{openInformationRequest.responseDeadline ? <span>Respond by {formatMauritiusDate(openInformationRequest.responseDeadline)}</span> : null}</div>{openInformationRequest.requiredDocuments.length ? <div className="requested-document-list"><b>Requested supporting documents</b><ul>{openInformationRequest.requiredDocuments.map((document) => <li key={document}>{document}</li>)}</ul></div> : null}<AdditionalInformationResponseForm action={informationResponseAction} /></section> : null}
    {staff && openInformationRequest ? <section className="information-waiting"><FileQuestion /><div><b>Waiting for additional information from the client</b><p>{openInformationRequest.questions}</p>{openInformationRequest.responseDeadline ? <small>Requested by {openInformationRequest.requestedBy} · response due {formatMauritiusDate(openInformationRequest.responseDeadline)}</small> : <small>Requested by {openInformationRequest.requestedBy}</small>}</div></section> : null}
    {staff && mayReview && claim.clientId && claim.status === "REVIEW_REQUIRED" && !openInformationRequest ? <AdditionalInformationRequestForm action={informationRequestAction} /> : null}
    {awaitingConfirmation ? <ClaimConfirmationForm action={confirmationAction} documents={documents} patientName={claim.patientName} providerName={claim.providerName} /> : null}
    {viewer.role !== "client" && extractedReady ? <section className="assignment-card"><div><AlertCircle /><span><b>Awaiting client confirmation.</b><small>The extracted names and per-document amounts must be confirmed before staff review begins.</small></span></div></section> : null}
    {documents.length ? <section className="claim-documents"><h2>Uploaded documents ({documents.length})</h2><div className="claim-document-list">{documents.map((document) => <a key={document.id} href={document.signedUrl} target="_blank" rel="noreferrer"><FileText />{document.name}</a>)}</div></section> : null}
    {decision ? <section className="decision-summary"><CircleDollarSign /><div><span>Claim decision</span><strong>{decision.outcome.replaceAll("_", " ")}</strong><p>{decision.notes}</p><small>{decision.approvedAmount ? `Approved amount: ${decision.approvedAmount} · ` : ""}{formatMauritiusDateTime(decision.decidedAt)}</small></div></section> : null}
    {(viewer.role === "supervisor" || viewer.role === "administrator") && claim.status === "VERIFIED" ? <ClaimDecisionForm action={decisionAction} /> : null}
    {(viewer.role === "supervisor" || viewer.role === "administrator") && (claim.status === "APPROVED" || claim.status === "PAYMENT_PENDING") ? <SettlementControls action={settlementAction} status={claim.status} /> : null}
    {["UPLOADED", "PROCESSING", "PROCESSING_FAILED", "INFORMATION_RECEIVED"].includes(claim.status) && !extractedReady ? <section className="assignment-card"><div>{processing?.status === "FAILED" || processingUnavailable || claim.status === "PROCESSING_FAILED" ? <AlertCircle /> : <RefreshCw />}<span><b>{processingUnavailable ? "Processing setup is incomplete." : processingActive ? "Document processing is running." : processing?.status === "FAILED" ? "Document processing failed." : "This claim needs document processing."}</b><small>{processing?.lastError ?? (processingActive ? "Background processing will continue even if you close this page." : "Start document processing to produce reviewable fields.")}</small></span></div><form action={processAction}><PendingSubmitButton className="primary" disabled={!canStartProcessing} pendingLabel="Starting…"><RefreshCw />{processingUnavailable ? "Migration required" : processingActive ? "Processing…" : processing?.status === "FAILED" ? "Retry processing" : "Start processing"}</PendingSubmitButton></form></section> : null}
    {staff && !claim.assignedTo && !["UPLOADED", "PROCESSING", "PROCESSING_FAILED"].includes(claim.status) ? <section className="assignment-card"><div><ShieldCheck /><span><b>This claim is unassigned.</b><small>An officer must be assigned before officer verification.</small></span></div>{viewer.role === "claims_officer" ? <form action={assignAction}><PendingSubmitButton className="primary" pendingLabel="Assigning…">Assign to me <ArrowRight /></PendingSubmitButton></form> : null}</section> : null}
    {canAssign(viewer.role) && !["UPLOADED", "PROCESSING", "PROCESSING_FAILED"].includes(claim.status) ? <section className="assignment-card"><div><UserRoundCheck /><span><b>Assign claims officer</b><small>Supervisors and administrators control workload ownership.</small></span></div><form action={assignAction} className="assignment-form"><select name="assignee" defaultValue={claim.assignedTo ?? ""} required><option value="" disabled>Select officer</option>{officers.map((officer) => <option key={officer.id} value={officer.id}>{officer.displayName}</option>)}</select><PendingSubmitButton className="secondary" pendingLabel="Saving…">Save assignment</PendingSubmitButton></form></section> : null}
    {informationRequests.length ? <section className="table-card information-history"><div className="table-head"><div><h2>Additional information history</h2><p>Requests and client responses remain attached to this claim.</p></div></div><div>{informationRequests.map((request) => <article key={request.id}><FileQuestion /><div><span><b>{request.reason}</b><small>{request.status.replaceAll("_", " ")} · requested by {request.requestedBy} on {formatMauritiusDateTime(request.requestedAt)}</small></span><p>{request.questions}</p>{request.responseText !== null ? <blockquote><MessageSquareMore />{request.responseText || "Documents supplied without a written response."}</blockquote> : null}{request.internalNote ? <aside><b>Internal note</b>{request.internalNote}</aside> : null}{documents.some((document) => document.informationRequestId === request.id) ? <div className="claim-document-list">{documents.filter((document) => document.informationRequestId === request.id).map((document) => <a key={document.id} href={document.signedUrl} target="_blank" rel="noreferrer"><FileText />{document.name}</a>)}</div> : null}</div></article>)}</div></section> : null}
    <section className="table-card"><div className="table-head"><div><h2>Audit history</h2><p>Immutable business events visible to your role.</p></div></div><div className="timeline">{events.length ? events.map((event) => <div key={event.id}><i /><span><b>{event.eventType.replaceAll("_", " ")}</b><small>{event.actorName} · {formatMauritiusDateTime(event.createdAt)}</small>{event.detail ? <small>{event.detail}</small> : null}</span></div>) : <p>No audit events yet.</p>}</div></section>
  </div>;
}
