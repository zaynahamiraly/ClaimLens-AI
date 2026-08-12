"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("[ClaimLens UI]", error); }, [error]);
  return <main className="fatal-state"><h1>Something went wrong</h1><p>The request could not be completed. No claim was automatically verified.</p><button className="primary" onClick={reset}>Try again</button></main>;
}
