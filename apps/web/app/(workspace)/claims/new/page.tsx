import Link from "next/link";
import { ClaimForm } from "./claim-form";

export const maxDuration = 300;

export default async function NewClaimPage() {
  return <div className="content narrow-content"><div className="title-row"><div><p className="kicker">New package</p><h1>Create a claim</h1><p>Upload a synthetic claim package for secure processing.</p></div><Link className="secondary" href="/claims">Cancel</Link></div><ClaimForm /></div>;
}
