import Link from "next/link";
import { FileText, UserRoundCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { ReviewWorkspace } from "@/components/review-workspace";
import { VerificationControls } from "@/components/verification-controls";
import { MissingIdentityForm } from "@/components/missing-identity-form";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { getClaim, getClaimDocuments, getClaimExtractedFields } from "@/lib/claims";
import { requireRole } from "@/lib/auth";
import { claimForReview, correctClaimIdentity, verifyClaim } from "../../actions";

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<{ verified?: string }>;
}) {
  const { reference } = await params;
  const [viewer, claim] = await Promise.all([
    requireRole(["claims_officer", "supervisor", "administrator"]),
    getClaim(reference),
  ]);
  if (!claim) notFound();

  const [{ verified }, documents, extractedFields] = await Promise.all([
    searchParams,
    getClaimDocuments(claim.id),
    getClaimExtractedFields(claim.id),
  ]);
  const isGoldenDemo = reference === "CLM-2026-000142";
  const isVerified = claim.status === "VERIFIED" || verified === "1";
  const patientMissing = claim.patientName === "Pending extraction";
  const providerMissing = claim.providerName === "Pending extraction";
  const amountMissing = claim.amount === "Pending extraction";
  const hasIncludedDocument = documents.some((document) => document.includeInTotal);
  const reviewDocuments = documents.map((document) => {
    const amountField = extractedFields.find((field) => field.documentId === document.id && (field.fieldName === "claimed_amount" || field.fieldName === "invoice_total"));
    const fallbackAmount = documents.length === 1 && !amountMissing ? Number(claim.amount.replace(/^[A-Z]{3}\s+/, "").replaceAll(",", "")) : null;
    const amount = document.amount ?? (amountField ? Number(amountField.value) : fallbackAmount);
    return { ...document, amount, currency: document.currency ?? (amount ? claim.currency : null), includeInTotal: hasIncludedDocument ? document.includeInTotal : Boolean(amount) };
  });
  const canCorrect = viewer.role !== "claims_officer" || claim.assignedTo === viewer.id;
  const verificationDisabled = isVerified || claim.status === "PROCESSING" || claim.status === "UPLOADED"
    || patientMissing || providerMissing || amountMissing
    || (viewer.role === "claims_officer" && claim.assignedTo !== viewer.id);
  const verificationAction = verifyClaim.bind(null, claim.reference);
  const correctionAction = correctClaimIdentity.bind(null, claim.reference);
  const claimAction = claimForReview.bind(null, claim.reference);

  return (
    <div className="review">
      <div className="review-top">
        <div>
          <Link className="back" href={`/claims/${claim.reference}`}>← Claim details</Link>
          <h1>{claim.reference}</h1>
          <p>{claim.patientName} · {claim.providerName}</p>
        </div>
        <VerificationControls
          action={verificationAction}
          disabled={verificationDisabled}
          initialVerified={isVerified}
          status={claim.status}
        />
      </div>
      {claim.status === "REVIEW_REQUIRED" && canCorrect ? <MissingIdentityForm action={correctionAction} patientValue={patientMissing ? "" : claim.patientName} providerValue={providerMissing ? "" : claim.providerName} documents={reviewDocuments} /> : null}
      {claim.status === "REVIEW_REQUIRED" && viewer.role === "claims_officer" && !canCorrect ? <section className="assignment-card review-assignment"><div><UserRoundCheck /><span><b>{claim.assignedTo ? "This claim belongs to another officer." : "Assign this claim before correcting it."}</b><small>{claim.assignedTo ? "Only the assigned officer, a supervisor, or an administrator may change reviewed evidence." : "Assignment protects the audit trail and prevents two officers from editing simultaneously."}</small></span></div>{!claim.assignedTo ? <form action={claimAction}><PendingSubmitButton className="primary" pendingLabel="Assigning…">Assign to me</PendingSubmitButton></form> : null}</section> : null}
      {isGoldenDemo || extractedFields.length ? (
        <ReviewWorkspace
          documents={documents}
          verified={isVerified}
          fields={isGoldenDemo ? undefined : extractedFields.map((field) => ({
            label: field.fieldName.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase()),
            value: field.value,
            confidence: field.confidence,
            source: `${field.documentName ?? "Claim document"}, page ${field.pageNumber}`,
          }))}
        />
      ) : (
        <div className="pending-review">
          <FileText />
          <h2>{documents.length ? `${documents.length} document${documents.length === 1 ? "" : "s"} received` : "Documents received"}</h2>
          <p>
            {claim.status === "PROCESSING" || claim.status === "UPLOADED"
              ? "The document pipeline has not produced reviewable fields yet. Verification remains disabled."
              : "No structured field evidence is available for this claim."}
          </p>
          {documents.length ? <div className="claim-document-list">{documents.map((document) => <a key={document.id} href={document.signedUrl} target="_blank" rel="noreferrer"><FileText />{document.name}</a>)}</div> : null}
        </div>
      )}
    </div>
  );
}
