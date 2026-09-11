import { AlertTriangle, CheckCircle2, Clock3, Gauge } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { listClaims } from "@/lib/claims";
import type { ClaimStatus } from "@/lib/types";

const statusOrder: ClaimStatus[] = ["PROCESSING", "UPLOADED", "REVIEW_REQUIRED", "VERIFIED", "APPROVED", "PAYMENT_PENDING", "PAID", "REJECTED", "PROCESSING_FAILED"];

function numericAmount(formattedAmount: string) {
  const value = Number(formattedAmount.replace(/^[A-Z]{3}\s+/, "").replaceAll(",", ""));
  return Number.isFinite(value) ? value : null;
}

export default async function AnalyticsPage() {
  const [viewer, allClaims] = await Promise.all([
    requireRole(["claims_officer", "supervisor", "administrator"]),
    listClaims("", 500),
  ]);
  const isOfficer = viewer.role === "claims_officer";
  const claims = isOfficer ? allClaims.filter((claim) => claim.assignedTo === viewer.id) : allClaims;
  const available = isOfficer ? allClaims.filter((claim) => !claim.assignedTo && claim.status === "REVIEW_REQUIRED").length : 0;
  const processing = claims.filter((claim) => claim.status === "PROCESSING" || claim.status === "UPLOADED").length;
  const review = claims.filter((claim) => claim.status === "REVIEW_REQUIRED").length;
  const completed = claims.filter((claim) => ["VERIFIED", "APPROVED", "REJECTED", "PAYMENT_PENDING", "PAID"].includes(claim.status)).length;
  const failed = claims.filter((claim) => claim.status === "PROCESSING_FAILED").length;
  const completionRate = claims.length ? Math.round((completed / claims.length) * 100) : 0;
  const failureRate = claims.length ? Math.round((failed / claims.length) * 100) : 0;
  const totals = new Map<string, number>();
  for (const claim of claims) {
    const amount = numericAmount(claim.amount);
    if (amount !== null) totals.set(claim.currency, (totals.get(claim.currency) ?? 0) + amount);
  }
  const statusCounts = statusOrder.map((status) => ({ status, count: claims.filter((claim) => claim.status === status).length })).filter((row) => row.count > 0);

  return <div className="content">
    <div className="title-row"><div><p className="kicker">Operations intelligence</p><h1>{isOfficer ? "My analytics" : "Claims analytics"}</h1><p>{isOfficer ? "Live measures for claims assigned to you. Organisation-wide data remains restricted." : "Organisation-wide workload measures derived from live claims."}</p></div><span className="role-summary">{claims.length} claims in scope</span></div>
    <section className="metrics">
      <article><div className="metric-icon blue"><Clock3 /></div><span>Processing</span><strong>{processing}</strong><small>{isOfficer && available ? `${available} unassigned claims are available` : "Claims awaiting document completion"}</small></article>
      <article><div className="metric-icon amber"><AlertTriangle /></div><span>Review backlog</span><strong>{review}</strong><small>Evidence packages requiring action</small></article>
      <article><div className="metric-icon green"><CheckCircle2 /></div><span>Completed workflow</span><strong>{completed}</strong><small>{completionRate}% of claims in scope</small></article>
      <article><div className="metric-icon violet"><Gauge /></div><span>Processing failure rate</span><strong>{failureRate}%</strong><small>{failed} controlled processing failures</small></article>
    </section>
    <div className="analytics-grid">
      <section className="table-card analytics-breakdown"><div className="table-head"><div><h2>Status distribution</h2><p>Current workflow position for every claim in scope</p></div></div><div>{statusCounts.length ? statusCounts.map((row) => <article key={row.status}><span>{row.status.replaceAll("_", " ")}</span><div><i style={{ width: `${claims.length ? Math.max(4, Math.round((row.count / claims.length) * 100)) : 0}%` }} /></div><b>{row.count}</b></article>) : <p className="analytics-empty">No claims are available for this view.</p>}</div></section>
      <section className="table-card analytics-totals"><div className="table-head"><div><h2>Claimed value</h2><p>Amounts are kept separate by currency</p></div></div><div>{totals.size ? [...totals.entries()].map(([currency, amount]) => <article key={currency}><span>{currency}</span><strong>{amount.toLocaleString("en-MU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></article>) : <p className="analytics-empty">No confirmed monetary values yet.</p>}</div></section>
    </div>
    <section className="table-card analytics-note"><h2>How to read this page</h2><p>Claims Officers see only their assigned workload. Supervisors and Administrators see organisation-wide figures. Values come from the live claim records; different currencies are never added together and no research statistic is invented.</p></section>
  </div>;
}
