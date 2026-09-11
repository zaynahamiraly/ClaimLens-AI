"use client";

import { useActionState, useState } from "react";
import { AlertTriangle, FileText, Save } from "lucide-react";
import type { IdentityCorrectionState } from "@/app/(workspace)/claims/actions";
import type { ClaimDocumentDTO } from "@/lib/claims";

const initialState: IdentityCorrectionState = {};
const currencies = ["MUR", "UGX", "KES", "TZS", "USD", "EUR", "GBP"];

export function MissingIdentityForm({ action, patientValue, providerValue, documents }: {
  action: (state: IdentityCorrectionState, formData: FormData) => Promise<IdentityCorrectionState>;
  patientValue: string;
  providerValue: string;
  documents: ClaimDocumentDTO[];
}) {
  const [state, submitAction, pending] = useActionState(action, initialState);
  const [included, setIncluded] = useState(() => Object.fromEntries(documents.map((document) => [document.id, document.includeInTotal])));
  const [amounts, setAmounts] = useState(() => Object.fromEntries(documents.map((document) => [document.id, document.amount?.toFixed(2) ?? ""])));
  const [selectedCurrencies, setSelectedCurrencies] = useState(() => Object.fromEntries(documents.map((document) => [document.id, document.currency ?? ""])));
  const selected = documents.filter((document) => included[document.id]);
  const currencySet = new Set(selected.map((document) => selectedCurrencies[document.id]));
  const total = selected.reduce((sum, document) => sum + (Number(amounts[document.id]) || 0), 0);
  const valid = selected.length > 0 && selected.every((document) => Number(amounts[document.id]) > 0 && selectedCurrencies[document.id]) && currencySet.size === 1;

  return <section className="missing-identity"><div><AlertTriangle /><span><b>Confirm or correct the complete claim package</b><small>Original OCR predictions remain in the audit evidence. These reviewed values determine the claim total.</small></span></div><form action={submitAction}>
    <div className="review-identity-fields"><label>Patient name<input name="patientName" defaultValue={patientValue} minLength={2} maxLength={120} required /></label><label>Provider, clinic, or pharmacy<input name="providerName" defaultValue={providerValue} minLength={2} maxLength={160} required /></label></div>
    <div className="review-document-values">{documents.map((document) => <article key={document.id} className={included[document.id] ? "included" : ""}>
      <div><FileText /><span><b>{document.name}</b><small>{document.documentType.replaceAll("_", " ").toLowerCase()} · {document.amountConfidence == null ? "manual review" : `${Math.round(document.amountConfidence * 100)}% OCR confidence`}</small></span></div>
      <label className="include-toggle"><input name={`include-${document.id}`} type="checkbox" checked={included[document.id]} onChange={(event) => setIncluded((current) => ({ ...current, [document.id]: event.target.checked }))} /> Count this expense</label>
      <select aria-label={`Currency for ${document.name}`} name={`currency-${document.id}`} value={selectedCurrencies[document.id]} onChange={(event) => setSelectedCurrencies((current) => ({ ...current, [document.id]: event.target.value }))} disabled={!included[document.id]} required={included[document.id]}><option value="" disabled>Currency</option>{currencies.map((currency) => <option key={currency}>{currency}</option>)}</select>
      <input aria-label={`Amount for ${document.name}`} name={`amount-${document.id}`} value={amounts[document.id]} onChange={(event) => setAmounts((current) => ({ ...current, [document.id]: event.target.value }))} type="number" min="0.01" step="0.01" placeholder="0.00" disabled={!included[document.id]} required={included[document.id]} />
    </article>)}</div>
    {currencySet.size > 1 ? <small className="workflow-error" role="alert">Different currencies must be handled as separate claims.</small> : null}
    <div className="review-correction-footer"><span>Corrected total <b>{currencySet.size === 1 && !currencySet.has("") ? [...currencySet][0] : "—"} {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></span><button className="secondary" type="submit" disabled={pending || !valid}><Save />{pending ? "Saving…" : "Save all corrections"}</button></div>
    {state.error ? <small className="workflow-error" role="alert">{state.error}</small> : null}{state.success ? <small className="success-text" role="status">Corrections saved and the claim total recalculated.</small> : null}
  </form></section>;
}
