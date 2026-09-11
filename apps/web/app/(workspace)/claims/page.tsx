import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { ClaimsTable } from "@/components/claims-table";
import { listClaims } from "@/lib/claims";
import { requireViewer } from "@/lib/auth";
import type { ClaimStatus } from "@/lib/types";

const statuses = new Set<ClaimStatus>([
  "UPLOADED", "PROCESSING", "REVIEW_REQUIRED", "VERIFIED", "APPROVED", "REJECTED",
  "PAYMENT_PENDING", "PAID", "PROCESSING_FAILED",
  "INFORMATION_REQUIRED", "INFORMATION_RECEIVED",
]);

const groupedStatuses = {
  processing: ["UPLOADED", "PROCESSING"],
  completed: ["VERIFIED", "APPROVED", "REJECTED", "PAYMENT_PENDING", "PAID"],
  review: ["REVIEW_REQUIRED", "INFORMATION_RECEIVED"],
} satisfies Record<string, ClaimStatus[]>;

function validDate(value?: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

export default async function ClaimsPage({ searchParams }: { searchParams: Promise<{ q?: string; created?: string; status?: string; view?: string; mine?: string; from?: string; to?: string }> }) {
  const [{ q = "", created, status, view, mine, from, to }, viewer] = await Promise.all([searchParams, requireViewer()]);
  const groupedView = view === "processing" || view === "completed" || view === "review" ? view : undefined;
  const statusFilter: ClaimStatus | ClaimStatus[] | undefined = groupedView
    ? groupedStatuses[groupedView]
    : statuses.has(status as ClaimStatus) ? status as ClaimStatus : undefined;
  const fromDate = validDate(from);
  const toDate = validDate(to);
  const createdFrom = fromDate ? new Date(`${fromDate}T00:00:00+04:00`).toISOString() : undefined;
  const createdBefore = toDate ? new Date(new Date(`${toDate}T00:00:00+04:00`).getTime() + 86_400_000).toISOString() : undefined;
  const claims = await listClaims(q, 100, statusFilter, mine === "1" ? viewer.id : undefined, createdFrom, createdBefore);
  const isClient = viewer.role === "client";

  return <div className="content">
    <div className="title-row"><div><p className="kicker">{isClient ? "Client portal" : "Claim management"}</p><h1>{isClient ? "My claims" : "Claims queue"}</h1><p>{isClient ? "Submit documents and follow each claim through human verification." : "Track, assign, process and review every permitted claim package."}</p></div><Link className="primary" href="/claims/new"><Plus />{isClient ? "Submit claim" : "New claim"}</Link></div>
    {created === "1" ? <div className="success-banner" role="status">Claim created. Documents are queued for processing.</div> : null}
    <section className="table-card"><div className="table-head"><div><h2>{groupedView ? `${groupedView[0].toUpperCase()}${groupedView.slice(1)} claims` : typeof statusFilter === "string" ? statusFilter.replaceAll("_", " ") : "All claims"}</h2><p>{claims.length} claims visible to your role</p></div><form className="search" action="/claims"><Search /><input aria-label="Search claims" name="q" placeholder="Search claims..." defaultValue={q} />{groupedView ? <input type="hidden" name="view" value={groupedView} /> : typeof statusFilter === "string" ? <input type="hidden" name="status" value={statusFilter} /> : null}{mine === "1" ? <input type="hidden" name="mine" value="1" /> : null}{fromDate ? <input type="hidden" name="from" value={fromDate} /> : null}{toDate ? <input type="hidden" name="to" value={toDate} /> : null}</form></div><ClaimsTable claims={claims} showOwnership={!isClient} /></section>
  </div>;
}
