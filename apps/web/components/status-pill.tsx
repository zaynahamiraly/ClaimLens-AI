import type { ClaimStatus } from "@/lib/types";

const labels: Record<ClaimStatus, string> = {
  UPLOADED: "Awaiting confirmation", PROCESSING: "Processing", REVIEW_REQUIRED: "Review required",
  VERIFIED: "Verified", APPROVED: "Approved", REJECTED: "Rejected",
  PAYMENT_PENDING: "Payment pending", PAID: "Paid", PROCESSING_FAILED: "Processing failed",
};

export function StatusPill({ status }: { status: ClaimStatus }) {
  const tone = status === "REJECTED"
    ? "red"
    : status === "VERIFIED" || status === "APPROVED" || status === "PAID"
      ? "green"
      : status === "PROCESSING" || status === "UPLOADED" || status === "PAYMENT_PENDING"
        ? "blue"
        : "amber";
  return <span className={`status ${tone}`}><i />{labels[status]}</span>;
}
