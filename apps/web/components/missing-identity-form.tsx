"use client";

import { useActionState } from "react";
import { AlertTriangle, Save } from "lucide-react";
import type { IdentityCorrectionState } from "@/app/(workspace)/claims/actions";

const initialState: IdentityCorrectionState = {};

export function MissingIdentityForm({
  action,
  patientMissing,
  providerMissing,
}: {
  action: (state: IdentityCorrectionState, formData: FormData) => Promise<IdentityCorrectionState>;
  patientMissing: boolean;
  providerMissing: boolean;
}) {
  const [state, submitAction, pending] = useActionState(action, initialState);
  return <section className="missing-identity"><div><AlertTriangle /><span><b>Information required</b><small>OCR could not confidently detect these values. Enter them from the source document before verification.</small></span></div><form action={submitAction}>{patientMissing ? <label>Patient name<input name="patientName" minLength={2} maxLength={120} required /></label> : null}{providerMissing ? <label>Provider name<input name="providerName" minLength={2} maxLength={160} required /></label> : null}<button className="secondary" type="submit" disabled={pending}><Save />{pending ? "Saving…" : "Save information"}</button>{state.error ? <small className="workflow-error" role="alert">{state.error}</small> : null}{state.success ? <small className="success-text" role="status">Saved as human-provided information.</small> : null}</form></section>;
}
