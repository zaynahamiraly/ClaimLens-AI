import { FileCheck2 } from "lucide-react";
import { ClaimsTable } from "@/components/claims-table";
import { requireRole } from "@/lib/auth";
import { listClaims } from "@/lib/claims";

export default async function ReviewQueuePage() {
  const [viewer, claims] = await Promise.all([
    requireRole(["claims_officer", "supervisor", "administrator"]),
    listClaims("", 100, "REVIEW_REQUIRED"),
  ]);
  const visible = viewer.role === "claims_officer"
    ? claims.filter((claim) => !claim.assignedTo || claim.assignedTo === viewer.id)
    : claims;
  return <div className="content">
    <div className="title-row"><div><p className="kicker">Human-in-the-loop</p><h1>Review queue</h1><p>Claims ready for evidence-based human verification.</p></div><span className="role-summary"><FileCheck2 />{visible.length} ready</span></div>
    <section className="table-card"><div className="table-head"><div><h2>{viewer.role === "claims_officer" ? "Assigned or available" : "All review work"}</h2><p>Open a claim, assign ownership, then verify its evidence.</p></div></div><ClaimsTable claims={visible} /></section>
  </div>;
}
