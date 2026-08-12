import Link from "next/link";
import { AlertTriangle, ArrowRight, ChevronRight } from "lucide-react";
import { StatusPill } from "@/components/status-pill";
import type { ClaimDTO } from "@/lib/types";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-MU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Indian/Mauritius" }).format(new Date(value));
}

export function ClaimsTable({ claims }: { claims: ClaimDTO[] }) {
  return <div className="table-scroll"><table><thead><tr><th>Claim</th><th>Patient & provider</th><th>Amount</th><th>Status</th><th>Created</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>{claims.map((claim) => <tr key={claim.id}><td><b>{claim.reference}</b>{claim.warningCount > 0 ? <small className="warning-text"><AlertTriangle /> {claim.warningCount} warning</small> : null}</td><td><b>{claim.patientName}</b><small>{claim.providerName}</small></td><td><b>{claim.amount}</b></td><td><StatusPill status={claim.status} /></td><td>{formatDate(claim.createdAt)}</td><td><Link className="row-link" aria-label={`Open ${claim.reference}`} href={`/claims/${claim.reference}/review`}><ChevronRight /></Link></td></tr>)}</tbody></table>{claims.length === 0 ? <div className="empty-state"><p>No claims found.</p><Link href="/claims/new">Create the first claim <ArrowRight /></Link></div> : null}</div>;
}
