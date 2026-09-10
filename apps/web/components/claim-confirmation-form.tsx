"use client";

import { useActionState, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText } from "lucide-react";
import type { ClaimDocumentDTO } from "@/lib/claims";
import type { ClaimConfirmationState } from "@/app/(workspace)/claims/actions";

const initialState: ClaimConfirmationState = {};
const currencies = ["MUR", "UGX", "KES", "TZS", "USD", "EUR", "GBP"];

function readableType(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/^./, (character) => character.toUpperCase());
}

export function ClaimConfirmationForm({
  action,
  documents,
  patientName,
  providerName,
}: {
  action: (state: ClaimConfirmationState, formData: FormData) => Promise<ClaimConfirmationState>;
  documents: ClaimDocumentDTO[];
  patientName: string;
  providerName: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [included, setIncluded] = useState(() => Object.fromEntries(documents.map((document) => [document.id, document.includeInTotal])));
  const [amounts, setAmounts] = useState(() => Object.fromEntries(documents.map((document) => [document.id, document.amount?.toFixed(2) ?? ""])));
  const [selectedCurrencies, setSelectedCurrencies] = useState(() => Object.fromEntries(documents.map((document) => [document.id, document.currency ?? ""])));
  const total = documents.reduce((sum, document) => included[document.id] ? sum + (Number(amounts[document.id]) || 0) : sum, 0);
  const activeCurrencies = new Set(documents.filter((document) => included[document.id]).map((document) => selectedCurrencies[document.id]));
  const canSubmit = documents.some((document) => included[document.id] && Number(amounts[document.id]) > 0)
    && activeCurrencies.size === 1 && !activeCurrencies.has("");

  return <form action={formAction} className="confirmation-card">
    <div className="confirmation-heading"><div><p className="kicker">Client confirmation</p><h2>Check what OCR found before submitting</h2><p>Invoices are optional. Include every document that represents a medical expense and exclude supporting evidence or duplicates.</p></div><CheckCircle2 /></div>
    <div className="confirmation-identity">
      <label>Patient name<input name="patientName" defaultValue={patientName === "Pending extraction" ? "" : patientName} placeholder="Enter if OCR could not read it" required minLength={2} /></label>
      <label>Provider, clinic, or pharmacy<input name="providerName" defaultValue={providerName === "Pending extraction" ? "" : providerName} placeholder="Enter if OCR could not read it" required minLength={2} /></label>
    </div>
    <div className="document-confirmation-list">
      {documents.map((document) => <article key={document.id} className={included[document.id] ? "included" : ""}>
        <div className="document-confirmation-title"><FileText /><div><b>{document.name}</b><small>{readableType(document.documentType)} · {document.amountConfidence == null ? "Amount not detected" : `${Math.round(document.amountConfidence * 100)}% amount confidence`}</small></div></div>
        <label className="include-toggle"><input name={`include-${document.id}`} type="checkbox" checked={included[document.id]} onChange={(event) => setIncluded((current) => ({ ...current, [document.id]: event.target.checked }))} /> Include in claim total</label>
        <div className="amount-row"><select name={`currency-${document.id}`} value={selectedCurrencies[document.id]} onChange={(event) => setSelectedCurrencies((current) => ({ ...current, [document.id]: event.target.value }))} disabled={!included[document.id]} required={included[document.id]}><option value="" disabled>Currency</option>{currencies.map((currency) => <option key={currency}>{currency}</option>)}</select><input name={`amount-${document.id}`} inputMode="decimal" value={amounts[document.id]} onChange={(event) => setAmounts((current) => ({ ...current, [document.id]: event.target.value }))} placeholder="0.00" disabled={!included[document.id]} required={included[document.id]} /></div>
        {document.notes ? <p className="document-note"><AlertTriangle />{document.notes}</p> : null}
      </article>)}
    </div>
    {activeCurrencies.size > 1 ? <p className="auth-error" role="alert">Separate documents with different currencies into different claims.</p> : null}
    {state.error ? <p className="auth-error" role="alert">{state.error}</p> : null}
    <div className="confirmation-total"><span>Confirmed claim total</span><strong>{activeCurrencies.size === 1 && !activeCurrencies.has("") ? [...activeCurrencies][0] : "—"} {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong><button className="primary" type="submit" disabled={pending || !canSubmit}>{pending ? "Submitting…" : "Confirm and submit claim"}</button></div>
  </form>;
}
