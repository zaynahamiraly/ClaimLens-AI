import type { ClaimStatus } from "@/lib/types";

const labels: Record<ClaimStatus, string> = {
  UPLOADED: "Uploaded", PROCESSING: "Processing", REVIEW_REQUIRED: "Review required",
  VERIFIED: "Verified", PROCESSING_FAILED: "Processing failed",
};

export function StatusPill({ status }: { status: ClaimStatus }) {
  const tone = status === "VERIFIED" ? "green" : status === "PROCESSING" || status === "UPLOADED" ? "blue" : "amber";
  return <span className={`status ${tone}`}><i />{labels[status]}</span>;
}
