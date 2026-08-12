import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { ClaimsTable } from "@/components/claims-table";
import { listClaims } from "@/lib/claims";

export default async function ClaimsPage({ searchParams }: { searchParams: Promise<{ q?: string; created?: string }> }) {
  const { q = "", created } = await searchParams;
  const claims = await listClaims(q);

  return <div className="content">
    <div className="title-row"><div><p className="kicker">Claim management</p><h1>Claims</h1><p>Track, process and review every claim package.</p></div><Link className="primary" href="/claims/new"><Plus />New claim</Link></div>
    {created === "1" ? <div className="success-banner" role="status">Claim created. Documents are queued for processing.</div> : null}
    <section className="table-card"><div className="table-head"><div><h2>All claims</h2><p>{claims.length} claims in this workspace</p></div><form className="search" action="/claims"><Search /><input aria-label="Search claims" name="q" placeholder="Search claims..." defaultValue={q} /></form></div><ClaimsTable claims={claims} /></section>
  </div>;
}
