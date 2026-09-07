"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { StatusPill } from "@/components/status-pill";
import type { ClaimStatus, VerificationState } from "@/lib/types";

const initialState: VerificationState = {};

export function VerificationControls({
  action,
  disabled,
  initialVerified,
  status,
}: {
  action: (state: VerificationState, formData: FormData) => Promise<VerificationState>;
  disabled: boolean;
  initialVerified: boolean;
  status: ClaimStatus;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, initialState);
  const verified = initialVerified || state.success === true;

  useEffect(() => {
    if (state.success) router.refresh();
  }, [router, state.success]);

  return (
    <div className="verification-controls">
      <StatusPill status={verified ? "VERIFIED" : status} />
      <form action={formAction}>
        <button className="primary" type="submit" disabled={disabled || pending || verified}>
          {verified ? <><CheckCircle2 />Verified</> : pending ? "Verifying…" : "Verify claim"}
        </button>
      </form>
      {state.error ? <small className="verification-error" role="alert">{state.error}</small> : null}
    </div>
  );
}
