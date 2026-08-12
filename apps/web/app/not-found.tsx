import Link from "next/link";

export default function NotFound() {
  return <main className="fatal-state"><h1>Claim not found</h1><p>The claim does not exist or you do not have access to it.</p><Link className="primary" href="/claims">Return to claims</Link></main>;
}
