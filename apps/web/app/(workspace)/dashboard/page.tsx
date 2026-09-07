import Link from "next/link";
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, Clock3, Plus, Sparkles } from "lucide-react";
import { ClaimsTable } from "@/components/claims-table";
import { listClaims } from "@/lib/claims";
import { requireViewer } from "@/lib/auth";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const [viewer, claims, { denied }] = await Promise.all([requireViewer(), listClaims("", 6), searchParams]);
  const review = claims.filter((claim) => claim.status === "REVIEW_REQUIRED");
  const processing = claims.filter((claim) => claim.status === "PROCESSING" || claim.status === "UPLOADED");
  const verified = claims.filter((claim) => ["VERIFIED", "APPROVED", "REJECTED", "PAYMENT_PENDING", "PAID"].includes(claim.status));
  const isClient = viewer.role === "client";
  const managementAttention = claims.find((claim) => claim.status === "VERIFIED");
  const attention = isClient ? review[0] : managementAttention ?? review[0];
  const attentionHref = attention
    ? isClient || attention.status === "VERIFIED" ? `/claims/${attention.reference}` : `/claims/${attention.reference}/review`
    : "/claims";

  return <div className="content">
    <div className="title-row"><div><p className="kicker">{isClient ? "Client overview" : "Operations overview"}</p><h1>Welcome, {viewer.displayName}.</h1><p>{isClient ? "Track your submitted claims and provide documents securely." : "Here’s what needs attention across your permitted workspace."}</p></div><Link className="primary" href="/claims/new"><Plus />{isClient ? "Submit claim" : "New claim"}</Link></div>
    {denied === "1" ? <div className="auth-error" role="alert">Your role does not permit access to that area.</div> : null}
    <section className="metrics">
      <article><div className="metric-icon amber"><AlertTriangle /></div><span>{isClient ? "Needs attention" : "Review required"}</span><strong>{review.length}</strong><small><b>{isClient ? "Officer review" : "Action needed"}</b> before verification</small></article>
      <article><div className="metric-icon blue"><Clock3 /></div><span>In processing</span><strong>{processing.length}</strong><small>Queued for document analysis</small></article>
      <article><div className="metric-icon green"><CheckCircle2 /></div><span>Verified</span><strong>{verified.length}</strong><small>Human-confirmed claim packages</small></article>
      <article><div className="metric-icon violet"><Activity /></div><span>{isClient ? "Total submitted" : "Visible workload"}</span><strong>{claims.length}</strong><small>{isClient ? "Claims owned by your account" : "Role-scoped recent claims"}</small></article>
    </section>
    {attention ? <Link className="attention" href={attentionHref}><div className="attention-icon"><Sparkles /></div><div><span>{isClient ? "Claim update" : attention.status === "VERIFIED" ? "Decision required" : "Ready for human review"}</span><h3>{attention.reference} · {attention.patientName}</h3><p>{isClient ? "Your claim is awaiting an accountable human decision." : attention.status === "VERIFIED" ? "Evidence has been verified and is ready for a supervisor decision." : `${attention.warningCount} validation warning needs attention. Source evidence is ready.`}</p></div><b>{attention.status === "VERIFIED" ? "Decide claim" : isClient ? "View claim" : "Review claim"} <ArrowRight /></b></Link> : null}
    <section className="table-card"><div className="table-head"><div><h2>Recent claims</h2><p>Latest activity visible to your role</p></div><Link className="secondary" href="/claims">View all</Link></div><ClaimsTable claims={claims} showOwnership={!isClient} /></section>
  </div>;
}
