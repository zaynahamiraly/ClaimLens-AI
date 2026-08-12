import Link from "next/link";
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, Clock3, Plus, Sparkles } from "lucide-react";
import { ClaimsTable } from "@/components/claims-table";
import { listClaims } from "@/lib/claims";
import { requireViewer } from "@/lib/auth";

export default async function DashboardPage() {
  const [viewer, claims] = await Promise.all([requireViewer(), listClaims("", 6)]);
  const review = claims.filter((claim) => claim.status === "REVIEW_REQUIRED");
  const processing = claims.filter((claim) => claim.status === "PROCESSING" || claim.status === "UPLOADED");
  const verified = claims.filter((claim) => claim.status === "VERIFIED");
  const attention = review[0];

  return <div className="content">
    <div className="title-row"><div><p className="kicker">Operations overview</p><h1>Good morning, {viewer.displayName}.</h1><p>Here’s what needs your attention today.</p></div><Link className="primary" href="/claims/new"><Plus />New claim</Link></div>
    <section className="metrics">
      <article><div className="metric-icon amber"><AlertTriangle /></div><span>Review required</span><strong>{review.length}</strong><small><b>Action needed</b> before verification</small></article>
      <article><div className="metric-icon blue"><Clock3 /></div><span>In processing</span><strong>{processing.length}</strong><small>Queued for document analysis</small></article>
      <article><div className="metric-icon green"><CheckCircle2 /></div><span>Verified</span><strong>{verified.length}</strong><small>Human-confirmed claim packages</small></article>
      <article><div className="metric-icon violet"><Activity /></div><span>Pilot accuracy</span><strong>100%</strong><small>Golden dataset · <b>12/12</b></small></article>
    </section>
    {attention ? <Link className="attention" href={`/claims/${attention.reference}/review`}><div className="attention-icon"><Sparkles /></div><div><span>Ready for human review</span><h3>{attention.reference} · {attention.patientName}</h3><p>{attention.warningCount} validation warning needs attention. Source evidence is ready.</p></div><b>Review claim <ArrowRight /></b></Link> : null}
    <section className="table-card"><div className="table-head"><div><h2>Recent claims</h2><p>Latest activity across your workspace</p></div><Link className="secondary" href="/claims">View all</Link></div><ClaimsTable claims={claims} /></section>
  </div>;
}
