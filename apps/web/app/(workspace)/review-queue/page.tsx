import { FileCheck2 } from "lucide-react";
import { ClaimsTable } from "@/components/claims-table";
import { requireRole } from "@/lib/auth";
import { listClaims } from "@/lib/claims";

export default async function ReviewQueuePage() {
  const [viewer, reviewClaims, verifiedClaims] = await Promise.all([
    requireRole(["claims_officer", "supervisor", "administrator"]),
    listClaims("", 100, ["REVIEW_REQUIRED", "INFORMATION_RECEIVED"]),
    listClaims("", 100, "VERIFIED"),
  ]);
  const visible = viewer.role === "claims_officer"
    ? reviewClaims.filter((claim) => !claim.assignedTo || claim.assignedTo === viewer.id)
    : [...verifiedClaims, ...reviewClaims];
  return <div className="content">
    <div className="title-row"><div><p className="kicker">Human-in-the-loop</p><h1>Review & decision queue</h1><p>Claims awaiting evidence verification or a supervisor decision.</p></div><span className="role-summary"><FileCheck2 />{visible.length} ready</span></div>
    <section className="table-card"><div className="table-head"><div><h2>{viewer.role === "claims_officer" ? "Assigned or available" : "Verification and decisions"}</h2><p>{viewer.role === "claims_officer" ? "Open an assigned claim and verify its evidence." : "Review-required claims need verification; verified claims need approval or rejection."}</p></div></div><ClaimsTable claims={visible} /></section>
  </div>;
}
