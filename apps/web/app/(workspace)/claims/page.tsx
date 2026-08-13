import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { ClaimsTable } from "@/components/claims-table";
import { listClaims } from "@/lib/claims";
import { requireViewer } from "@/lib/auth";
import type { ClaimStatus } from "@/lib/types";

const statuses = new Set<ClaimStatus>(["UPLOADED", "PROCESSING", "REVIEW_REQUIRED", "VERIFIED", "PROCESSING_FAILED"]);

export default async function ClaimsPage({ searchParams }: { searchParams: Promise<{ q?: string; created?: string; status?: string; mine?: string }> }) {
  const [{ q = "", created, status, mine }, viewer] = await Promise.all([searchParams, requireViewer()]);
  const statusFilter = statuses.has(status as ClaimStatus) ? status as ClaimStatus : undefined;
  const claims = await listClaims(q, 50, statusFilter, mine === "1" ? viewer.id : undefined);
  const isClient = viewer.role === "client";

  return <div className="content">
    <div className="title-row"><div><p className="kicker">{isClient ? "Client portal" : "Claim management"}</p><h1>{isClient ? "My claims" : "Claims queue"}</h1><p>{isClient ? "Submit documents and follow each claim through human verification." : "Track, assign, process and review every permitted claim package."}</p></div><Link className="primary" href="/claims/new"><Plus />{isClient ? "Submit claim" : "New claim"}</Link></div>
    {created === "1" ? <div className="success-banner" role="status">Claim created. Documents are queued for processing.</div> : null}
    <section className="table-card"><div className="table-head"><div><h2>{statusFilter ? statusFilter.replaceAll("_", " ") : "All claims"}</h2><p>{claims.length} claims visible to your role</p></div><form className="search" action="/claims"><Search /><input aria-label="Search claims" name="q" placeholder="Search claims..." defaultValue={q} />{statusFilter ? <input type="hidden" name="status" value={statusFilter} /> : null}</form></div><ClaimsTable claims={claims} showOwnership={!isClient} /></section>
  </div>;
}
