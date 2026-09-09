import Link from "next/link";
import { AlertTriangle, ArrowRight, ChevronRight } from "lucide-react";
import { StatusPill } from "@/components/status-pill";
import { formatMauritiusDateTime } from "@/lib/date";
import type { ClaimDTO } from "@/lib/types";

export function ClaimsTable({ claims, showOwnership = true }: { claims: ClaimDTO[]; showOwnership?: boolean }) {
  return <div className="table-scroll"><table><thead><tr><th>Claim</th><th>Patient & provider</th>{showOwnership ? <th>Client / assignee</th> : null}<th>Amount</th><th>Status</th><th>Created</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>{claims.map((claim) => <tr key={claim.id}><td><b>{claim.reference}</b>{claim.warningCount > 0 ? <small className="warning-text"><AlertTriangle /> {claim.warningCount} warning</small> : null}</td><td><b>{claim.patientName}</b><small>{claim.providerName}</small></td>{showOwnership ? <td><b>{claim.clientName ?? "Staff-created"}</b><small>{claim.assignedOfficerName ?? "Unassigned"}</small></td> : null}<td><b>{claim.amount}</b></td><td><StatusPill status={claim.status} /></td><td>{formatMauritiusDateTime(claim.createdAt)}</td><td><Link className="row-link" aria-label={`Open ${claim.reference}`} href={`/claims/${claim.reference}`} prefetch><ChevronRight /></Link></td></tr>)}</tbody></table>{claims.length === 0 ? <div className="empty-state"><p>No claims found.</p><Link href="/claims/new">Create the first claim <ArrowRight /></Link></div> : null}</div>;
}
