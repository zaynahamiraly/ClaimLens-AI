"use client";

import { useActionState } from "react";
import { AlertTriangle, Save } from "lucide-react";
import type { IdentityCorrectionState } from "@/app/(workspace)/claims/actions";

const initialState: IdentityCorrectionState = {};

export function MissingIdentityForm({
  action,
  patientValue,
  providerValue,
  amountValue,
  currency,
}: {
  action: (state: IdentityCorrectionState, formData: FormData) => Promise<IdentityCorrectionState>;
  patientValue: string;
  providerValue: string;
  amountValue: string;
  currency: string;
}) {
  const [state, submitAction, pending] = useActionState(action, initialState);
  return <section className="missing-identity"><div><AlertTriangle /><span><b>Confirm or correct extracted information</b><small>Compare low-confidence predictions with the source receipt before verification.</small></span></div><form action={submitAction}><label>Patient name<input name="patientName" defaultValue={patientValue} minLength={2} maxLength={120} required /></label><label>Provider name<input name="providerName" defaultValue={providerValue} minLength={2} maxLength={160} required /></label><label>Claimed amount<input name="claimedAmount" defaultValue={amountValue} type="number" min="0.01" step="0.01" required /></label><label>Currency<select name="claimedCurrency" defaultValue={currency} required><option value="MUR">MUR</option><option value="UGX">UGX</option><option value="KES">KES</option><option value="TZS">TZS</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option></select></label><button className="secondary" type="submit" disabled={pending}><Save />{pending ? "Saving…" : "Save corrections"}</button>{state.error ? <small className="workflow-error" role="alert">{state.error}</small> : null}{state.success ? <small className="success-text" role="status">Saved as human-provided information.</small> : null}</form></section>;
}
