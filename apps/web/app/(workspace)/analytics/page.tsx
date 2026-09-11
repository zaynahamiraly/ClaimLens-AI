import type { CSSProperties } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock3, Gauge, RefreshCw, ScanText, Timer, TrendingUp } from "lucide-react";
import { getAnalyticsSupplement } from "@/lib/analytics";
import { requireRole } from "@/lib/auth";
import { listClaims } from "@/lib/claims";
import { formatMauritiusDate, formatMauritiusDateTime } from "@/lib/date";
import type { ClaimDTO, ClaimStatus } from "@/lib/types";

const DAY_MS = 86_400_000;
const COMPLETED_STATUSES = new Set<ClaimStatus>(["VERIFIED", "APPROVED", "REJECTED", "PAYMENT_PENDING", "PAID"]);
const statusOrder: ClaimStatus[] = ["PROCESSING", "UPLOADED", "REVIEW_REQUIRED", "VERIFIED", "APPROVED", "PAYMENT_PENDING", "PAID", "REJECTED", "PROCESSING_FAILED"];
const ranges = [
  { value: "today", label: "Today", days: 1 },
  { value: "7d", label: "7 days", days: 7 },
  { value: "30d", label: "30 days", days: 30 },
  { value: "90d", label: "90 days", days: 90 },
  { value: "all", label: "All time", days: null },
] as const;

type AnalyticsSearch = { range?: string; from?: string; to?: string };

function dateKey(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Indian/Mauritius", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function localStart(value: string) {
  return new Date(`${value}T00:00:00+04:00`);
}

function validDate(value?: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(localStart(value).getTime()) ? value : undefined;
}

function numericAmount(claim: ClaimDTO) {
  const value = Number(claim.amount.replace(/^[A-Z]{3}\s+/, "").replaceAll(",", ""));
  return Number.isFinite(value) ? value : null;
}

function percentage(part: number, total: number) {
  return total ? Math.round((part / total) * 100) : 0;
}

function comparison(current: number, previous: number) {
  if (!previous) return current ? "New activity in this period" : "No change from the previous period";
  const difference = Math.round(((current - previous) / previous) * 100);
  return `${difference >= 0 ? "+" : ""}${difference}% from the previous period`;
}

function formatMinutes(milliseconds: number | null) {
  if (milliseconds === null) return "No completed runs";
  const minutes = Math.round(milliseconds / 60_000);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function claimsUrl(options: { status?: ClaimStatus; view?: "processing" | "completed"; mine: boolean; from?: string; to?: string }) {
  const query = new URLSearchParams();
  if (options.status) query.set("status", options.status);
  if (options.view) query.set("view", options.view);
  if (options.mine) query.set("mine", "1");
  if (options.from) query.set("from", options.from);
  if (options.to) query.set("to", options.to);
  return `/claims?${query.toString()}`;
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<AnalyticsSearch> }) {
  const [viewer, allClaims, query] = await Promise.all([
    requireRole(["claims_officer", "supervisor", "administrator"]),
    listClaims("", 1000),
    searchParams,
  ]);
  const isOfficer = viewer.role === "claims_officer";
  const scopedClaims = isOfficer ? allClaims.filter((claim) => claim.assignedTo === viewer.id) : allClaims;
  const today = dateKey(new Date());
  const selectedRange = ranges.find((item) => item.value === query.range)?.value ?? (query.range === "custom" ? "custom" : "30d");
  const preset = ranges.find((item) => item.value === selectedRange);
  const customFrom = validDate(query.from);
  const customTo = validDate(query.to);
  const customValid = selectedRange === "custom" && customFrom && customTo && localStart(customFrom) <= localStart(customTo);
  const rangeEnd = new Date(localStart(customValid ? customTo : today).getTime() + DAY_MS);
  const rangeStart = customValid
    ? localStart(customFrom)
    : preset?.days
      ? new Date(localStart(today).getTime() - (preset.days - 1) * DAY_MS)
      : null;
  const fromDate = rangeStart ? dateKey(rangeStart) : undefined;
  const toDate = dateKey(new Date(rangeEnd.getTime() - DAY_MS));
  const claims = scopedClaims.filter((claim) => {
    const created = new Date(claim.createdAt);
    return (!rangeStart || created >= rangeStart) && created < rangeEnd;
  });
  const previousClaims = rangeStart
    ? scopedClaims.filter((claim) => {
      const created = new Date(claim.createdAt);
      const duration = rangeEnd.getTime() - rangeStart.getTime();
      return created >= new Date(rangeStart.getTime() - duration) && created < rangeStart;
    })
    : [];
  const supplement = await getAnalyticsSupplement(scopedClaims.map((claim) => claim.id));
  const claimIds = new Set(claims.map((claim) => claim.id));
  const fields = supplement.fields.filter((field) => claimIds.has(field.claimId));
  const decisions = supplement.decisions.filter((decision) => claimIds.has(decision.claimId));
  const jobs = supplement.jobs.filter((job) => claimIds.has(job.claimId));
  const available = isOfficer ? allClaims.filter((claim) => !claim.assignedTo && claim.status === "REVIEW_REQUIRED").length : 0;
  const processing = claims.filter((claim) => claim.status === "PROCESSING" || claim.status === "UPLOADED").length;
  const review = claims.filter((claim) => claim.status === "REVIEW_REQUIRED").length;
  const completed = claims.filter((claim) => COMPLETED_STATUSES.has(claim.status)).length;
  const failed = claims.filter((claim) => claim.status === "PROCESSING_FAILED").length;
  const confidence = fields.length ? Math.round((fields.reduce((sum, field) => sum + field.confidence, 0) / fields.length) * 100) : null;
  const fieldConfidenceByClaim = new Map<string, number[]>();
  for (const field of fields) fieldConfidenceByClaim.set(field.claimId, [...(fieldConfidenceByClaim.get(field.claimId) ?? []), field.confidence]);
  const lowConfidenceClaims = [...fieldConfidenceByClaim.values()].filter((values) => values.some((value) => value < 0.85)).length;
  const highConfidenceClaims = [...fieldConfidenceByClaim.values()].filter((values) => values.every((value) => value >= 0.85)).length;
  const latestJobs = new Map<string, (typeof jobs)[number]>();
  for (const job of jobs) if (!latestJobs.has(job.claimId)) latestJobs.set(job.claimId, job);
  const completedDurations = [...latestJobs.values()].flatMap((job) => job.status === "COMPLETED" && job.startedAt && job.finishedAt
    ? [new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime()]
    : []);
  const averageDuration = completedDurations.length ? completedDurations.reduce((sum, duration) => sum + duration, 0) / completedDurations.length : null;

  const totals = new Map<string, { submitted: number; approved: number; paid: number }>();
  const claimsById = new Map(claims.map((claim) => [claim.id, claim]));
  for (const claim of claims) {
    const amount = numericAmount(claim);
    if (amount === null) continue;
    const row = totals.get(claim.currency) ?? { submitted: 0, approved: 0, paid: 0 };
    row.submitted += amount;
    totals.set(claim.currency, row);
  }
  for (const decision of decisions) {
    const claim = claimsById.get(decision.claimId);
    if (!claim || decision.approvedAmount === null) continue;
    const row = totals.get(claim.currency) ?? { submitted: 0, approved: 0, paid: 0 };
    row.approved += decision.approvedAmount;
    if (claim.status === "PAID") row.paid += decision.approvedAmount;
    totals.set(claim.currency, row);
  }

  const statusCounts = statusOrder.map((status) => ({ status, count: claims.filter((claim) => claim.status === status).length })).filter((row) => row.count > 0);
  const oldestClaimTime = scopedClaims.length ? Math.min(...scopedClaims.map((claim) => new Date(claim.createdAt).getTime())) : localStart(today).getTime();
  const trendStart = rangeStart ?? new Date(oldestClaimTime);
  const trendDuration = Math.max(DAY_MS, rangeEnd.getTime() - trendStart.getTime());
  const bucketCount = Math.min(12, Math.max(1, Math.ceil(trendDuration / DAY_MS)));
  const bucketSize = trendDuration / bucketCount;
  const trend = Array.from({ length: bucketCount }, (_, index) => {
    const start = new Date(trendStart.getTime() + index * bucketSize);
    const end = new Date(index === bucketCount - 1 ? rangeEnd : trendStart.getTime() + (index + 1) * bucketSize);
    return {
      label: formatMauritiusDate(start),
      received: scopedClaims.filter((claim) => new Date(claim.createdAt) >= start && new Date(claim.createdAt) < end).length,
      completed: supplement.events.filter((event) => event.eventType === "PROCESSING_COMPLETED" && new Date(event.createdAt) >= start && new Date(event.createdAt) < end).length,
    };
  });
  const trendMaximum = Math.max(1, ...trend.flatMap((point) => [point.received, point.completed]));
  const metricUrl = (options: { status?: ClaimStatus; view?: "processing" | "completed" }) => claimsUrl({ ...options, mine: isOfficer, from: fromDate, to: toDate });
  const currentUrl = selectedRange === "custom" && customValid
    ? `/analytics?range=custom&from=${customFrom}&to=${customTo}`
    : `/analytics?range=${selectedRange}`;

  return <div className="content analytics-page">
    <div className="title-row"><div><p className="kicker">Operations intelligence</p><h1>{isOfficer ? "My analytics" : "Claims analytics"}</h1><p>{isOfficer ? "Live measures for claims assigned to you." : "Organisation-wide workload, financial and document-intelligence measures."}</p></div><div className="analytics-title-actions"><span className="role-summary">{claims.length} claims in scope</span><Link className="secondary analytics-refresh" href={currentUrl}><RefreshCw />Refresh</Link></div></div>

    <section className="analytics-filters" aria-label="Analytics date range">
      <div className="analytics-presets">{ranges.map((range) => <Link key={range.value} className={selectedRange === range.value ? "active" : ""} href={`/analytics?range=${range.value}`}>{range.label}</Link>)}</div>
      <form action="/analytics" className="analytics-custom-range"><input type="hidden" name="range" value="custom" /><label>From<input aria-label="Analytics start date" type="date" name="from" defaultValue={customFrom ?? fromDate ?? today} max={today} /></label><label>To<input aria-label="Analytics end date" type="date" name="to" defaultValue={customTo ?? toDate} max={today} /></label><button className="secondary" type="submit">Apply</button></form>
      <small>Updated {formatMauritiusDateTime(new Date())} · Mauritius time</small>
    </section>

    <section className="metrics analytics-metrics">
      <Link aria-label={`View ${processing} processing claims`} href={metricUrl({ view: "processing" })}><article><div className="metric-icon blue"><Clock3 /></div><span>Processing</span><strong>{processing}</strong><small>{isOfficer && available ? `${available} unassigned claims available` : comparison(claims.length, previousClaims.length)}</small></article></Link>
      <Link aria-label={`View ${review} claims requiring review`} href={metricUrl({ status: "REVIEW_REQUIRED" })}><article><div className="metric-icon amber"><AlertTriangle /></div><span>Review backlog</span><strong>{review}</strong><small>{percentage(review, claims.length)}% of claims in this period</small></article></Link>
      <Link aria-label={`View ${completed} completed claims`} href={metricUrl({ view: "completed" })}><article><div className="metric-icon green"><CheckCircle2 /></div><span>Completed workflow</span><strong>{completed}</strong><small>{percentage(completed, claims.length)}% of claims in scope</small></article></Link>
      <Link aria-label={`View ${failed} failed claims`} href={metricUrl({ status: "PROCESSING_FAILED" })}><article><div className="metric-icon violet"><Gauge /></div><span>Processing failures</span><strong>{failed}</strong><small>{percentage(failed, claims.length)}% failure rate</small></article></Link>
    </section>

    <div className="analytics-grid analytics-main-grid">
      <section className="table-card analytics-trend"><div className="table-head"><div><h2>Claims and processing trend</h2><p>Received claims versus completed document-processing runs</p></div><div className="trend-legend"><span><i className="received" />Received</span><span><i className="completed" />Processed</span></div></div><div className="trend-chart">{trend.map((point) => <article key={`${point.label}-${point.received}-${point.completed}`}><div><i className="received" title={`${point.received} received`} style={{ "--bar-height": `${percentage(point.received, trendMaximum)}%` } as CSSProperties} /><i className="completed" title={`${point.completed} processed`} style={{ "--bar-height": `${percentage(point.completed, trendMaximum)}%` } as CSSProperties} /></div><small>{point.label}</small></article>)}</div></section>
      <section className="table-card analytics-quality"><div className="table-head"><div><h2>Document intelligence</h2><p>Measured from OCR fields and completed processing jobs</p></div></div><div className="quality-grid"><article><ScanText /><span>Average field confidence</span><strong>{confidence === null ? "No data" : `${confidence}%`}</strong></article><article><TrendingUp /><span>Claims at or above 85%</span><strong>{highConfidenceClaims}</strong></article><article><AlertTriangle /><span>Low-confidence claims</span><strong>{lowConfidenceClaims}</strong></article><article><Timer /><span>Average processing time</span><strong>{formatMinutes(averageDuration)}</strong></article></div></section>
    </div>

    <div className="analytics-grid">
      <section className="table-card analytics-breakdown"><div className="table-head"><div><h2>Status distribution</h2><p>Select a status to open the underlying claims</p></div></div><div>{statusCounts.length ? statusCounts.map((row) => <Link className="analytics-status-row" href={metricUrl({ status: row.status })} key={row.status}><span>{row.status.replaceAll("_", " ")}</span><div><i style={{ width: `${Math.max(4, percentage(row.count, claims.length))}%` }} /></div><b>{row.count}</b></Link>) : <p className="analytics-empty">No claims are available for this date range.</p>}</div></section>
      <section className="table-card analytics-totals"><div className="table-head"><div><h2>Financial position</h2><p>Submitted, approved and paid values by currency</p></div></div><div>{totals.size ? [...totals.entries()].map(([currency, amount]) => <article key={currency}><span>{currency}</span><div><small>Submitted</small><strong>{amount.submitted.toLocaleString("en-MU", { minimumFractionDigits: 2 })}</strong></div><div><small>Approved</small><strong>{amount.approved.toLocaleString("en-MU", { minimumFractionDigits: 2 })}</strong></div><div><small>Paid</small><strong>{amount.paid.toLocaleString("en-MU", { minimumFractionDigits: 2 })}</strong></div></article>) : <p className="analytics-empty">No confirmed monetary values in this date range.</p>}</div></section>
    </div>

    {!isOfficer ? <section className="table-card analytics-workload"><div className="table-head"><div><h2>Claims Officer workload</h2><p>Assignment and review position for the selected period</p></div></div><div className="table-scroll"><table><thead><tr><th>Claims Officer</th><th>Assigned</th><th>Processing</th><th>Review required</th><th>Completed</th></tr></thead><tbody>{supplement.officers.map((officer) => { const assigned = claims.filter((claim) => claim.assignedTo === officer.id); return <tr key={officer.id}><td><b>{officer.displayName}</b></td><td>{assigned.length}</td><td>{assigned.filter((claim) => claim.status === "PROCESSING" || claim.status === "UPLOADED").length}</td><td>{assigned.filter((claim) => claim.status === "REVIEW_REQUIRED").length}</td><td>{assigned.filter((claim) => COMPLETED_STATUSES.has(claim.status)).length}</td></tr>; })}</tbody></table>{supplement.officers.length === 0 ? <p className="analytics-empty analytics-table-empty">No active Claims Officers found.</p> : null}</div></section> : null}

    <section className="table-card analytics-note"><h2>How to read this page</h2><p>Analytics are calculated from live claim records and follow your access level. Claims Officers see their assigned workload, while Supervisors and Administrators see organisation-wide results. Monetary values are reported separately by currency. Select any metric or status to view the claims behind it.</p></section>
  </div>;
}
