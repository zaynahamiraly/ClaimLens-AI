import { AlertTriangle, CheckCircle2, Clock3, Gauge } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { listClaims } from "@/lib/claims";

export default async function AnalyticsPage() {
  const [, claims] = await Promise.all([
    requireRole(["supervisor", "administrator"]),
    listClaims("", 500),
  ]);
  const processing = claims.filter((claim) => claim.status === "PROCESSING" || claim.status === "UPLOADED").length;
  const review = claims.filter((claim) => claim.status === "REVIEW_REQUIRED").length;
  const verified = claims.filter((claim) => claim.status === "VERIFIED").length;
  const approved = claims.filter((claim) => ["APPROVED", "PAYMENT_PENDING", "PAID"].includes(claim.status)).length;
  const failed = claims.filter((claim) => claim.status === "PROCESSING_FAILED").length;
  const assigned = claims.filter((claim) => claim.assignedTo).length;
  const assignmentRate = claims.length ? Math.round((assigned / claims.length) * 100) : 0;
  return <div className="content">
    <div className="title-row"><div><p className="kicker">Operations intelligence</p><h1>Analytics</h1><p>Role-protected workload measures derived from live claims.</p></div></div>
    <section className="metrics">
      <article><div className="metric-icon blue"><Clock3 /></div><span>Processing</span><strong>{processing}</strong><small>Claims currently in the pipeline</small></article>
      <article><div className="metric-icon amber"><AlertTriangle /></div><span>Review backlog</span><strong>{review}</strong><small>Awaiting accountable human review</small></article>
      <article><div className="metric-icon green"><CheckCircle2 /></div><span>Decision pipeline</span><strong>{verified}</strong><small>{approved} approved or in settlement</small></article>
      <article><div className="metric-icon violet"><Gauge /></div><span>Assignment rate</span><strong>{assignmentRate}%</strong><small>{failed} processing failures</small></article>
    </section>
    <section className="table-card analytics-note"><h2>Research analytics remain evidence-driven</h2><p>Field accuracy, confidence calibration, OCR errors, and Pipeline A/B comparisons will appear only after frozen evaluation data exists. Operational counts above are live; no research statistic is invented.</p></section>
  </div>;
}
