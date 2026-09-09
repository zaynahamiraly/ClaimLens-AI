import Link from "next/link";
import { FileText } from "lucide-react";
import { notFound } from "next/navigation";
import { ReviewWorkspace } from "@/components/review-workspace";
import { VerificationControls } from "@/components/verification-controls";
import { MissingIdentityForm } from "@/components/missing-identity-form";
import { getClaim, getClaimDocuments, getClaimExtractedFields } from "@/lib/claims";
import { requireRole } from "@/lib/auth";
import { correctClaimIdentity, verifyClaim } from "../../actions";

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
  const verificationDisabled = isVerified || claim.status === "PROCESSING" || claim.status === "UPLOADED"
    || patientMissing || providerMissing || amountMissing
    || (viewer.role === "claims_officer" && claim.assignedTo !== viewer.id);
  const verificationAction = verifyClaim.bind(null, claim.reference);
  const correctionAction = correctClaimIdentity.bind(null, claim.reference);

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
      {(patientMissing || providerMissing || amountMissing) && claim.status === "REVIEW_REQUIRED" ? <MissingIdentityForm action={correctionAction} patientMissing={patientMissing} providerMissing={providerMissing} amountMissing={amountMissing} /> : null}
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
