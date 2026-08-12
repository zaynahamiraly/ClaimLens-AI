"use client";

import { useActionState } from "react";
import { ArrowRight, FileText, Upload } from "lucide-react";
import { createClaim, type ClaimFormState } from "../actions";

const initialState: ClaimFormState = {};

export function ClaimForm() {
  const [state, action, pending] = useActionState(createClaim, initialState);
  return <form action={action} className="claim-form-card">
    <div className="form-grid">
      <label htmlFor="patientName">Patient name<input id="patientName" name="patientName" placeholder="Synthetic patient name" minLength={2} maxLength={120} required /></label>
      <label htmlFor="providerName">Provider<input id="providerName" name="providerName" placeholder="Medical provider" minLength={2} maxLength={160} required /></label>
    </div>
    {state.fieldErrors?.patientName ? <p className="auth-error">{state.fieldErrors.patientName[0]}</p> : null}
    {state.fieldErrors?.providerName ? <p className="auth-error">{state.fieldErrors.providerName[0]}</p> : null}
    <label className="drop"><Upload /><b>Select claim documents</b><span>1–3 PDF, PNG, or JPEG files · maximum 6 MB each</span><input name="documents" multiple type="file" accept="application/pdf,image/png,image/jpeg" required /></label>
    {state.error ? <p className="auth-error" role="alert">{state.error}</p> : null}
    <div className="upload-guidance"><FileText /><p><b>Use synthetic data only.</b><br />Files are stored in a private, owner-scoped Supabase bucket.</p></div>
    <div className="modal-actions"><button className="primary" type="submit" disabled={pending}>{pending ? "Creating claim…" : "Create & process"}<ArrowRight /></button></div>
  </form>;
}
