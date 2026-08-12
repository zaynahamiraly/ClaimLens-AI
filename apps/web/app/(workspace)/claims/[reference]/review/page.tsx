import Link from "next/link";
import { CheckCircle2, FileText } from "lucide-react";
import { notFound } from "next/navigation";
import { ReviewWorkspace } from "@/components/review-workspace";
import { StatusPill } from "@/components/status-pill";
import { getClaim, getClaimDocument } from "@/lib/claims";
import { verifyClaim } from "../../actions";

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<{ verified?: string }>;
}) {
  const { reference } = await params;
  const claim = await getClaim(reference);
  if (!claim) notFound();

  const [{ verified }, document] = await Promise.all([
    searchParams,
    getClaimDocument(claim.id),
  ]);
  const isGoldenDemo = reference === "CLM-2026-000142";
  const isVerified = claim.status === "VERIFIED" || verified === "1";
  const verificationDisabled = isVerified || claim.status === "PROCESSING" || claim.status === "UPLOADED";
  const verificationAction = verifyClaim.bind(null, claim.reference);

  return (
    <div className="review">
      <div className="review-top">
        <div>
          <Link className="back" href="/claims">← Claims queue</Link>
          <h1>{claim.reference}</h1>
          <p>{claim.patientName} · {claim.providerName}</p>
        </div>
        <div>
          <StatusPill status={isVerified ? "VERIFIED" : claim.status} />
          <form action={verificationAction}>
            <button className="primary" type="submit" disabled={verificationDisabled}>
              {isVerified ? <><CheckCircle2 />Verified</> : "Verify claim"}
            </button>
          </form>
        </div>
      </div>
      {isGoldenDemo ? (
        <ReviewWorkspace />
      ) : (
        <div className="pending-review">
          <FileText />
          <h2>{document?.name ?? "Documents received"}</h2>
          <p>
            {claim.status === "PROCESSING" || claim.status === "UPLOADED"
              ? "The document pipeline has not produced reviewable fields yet. Verification remains disabled."
              : "No structured field evidence is available for this claim."}
          </p>
          {document ? <a className="secondary" href={document.signedUrl} target="_blank" rel="noreferrer">Open private document</a> : null}
        </div>
      )}
    </div>
  );
}
