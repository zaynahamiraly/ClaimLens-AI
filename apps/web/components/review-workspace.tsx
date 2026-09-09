"use client";

import { useState } from "react";
import { AlertTriangle, ChevronRight, FileText, ShieldCheck, Sparkles } from "lucide-react";
import type { ClaimDocumentDTO } from "@/lib/claims";

type ReviewField = { label: string; value: string; confidence: number; source: string };

const demoFields: ReviewField[] = [
  { label: "Patient name", value: "Aisha Raman", confidence: 0.99, source: "invoice.pdf, page 1" },
  { label: "Member number", value: "MEM10001", confidence: 0.98, source: "invoice.pdf, page 1" },
  { label: "Provider", value: "Harbour Medical Centre", confidence: 0.99, source: "invoice.pdf, page 1" },
  { label: "Invoice number", value: "INV-8522", confidence: 0.96, source: "invoice.pdf, page 1" },
  { label: "Service date", value: "12 Jul 2026", confidence: 0.97, source: "invoice.pdf, page 1" },
  { label: "Invoice total", value: "MUR 4,580.00", confidence: 0.94, source: "invoice.pdf, page 1" },
];

export function ReviewWorkspace({ fields = demoFields, documents = [], verified = false }: { fields?: ReviewField[]; documents?: ClaimDocumentDTO[]; verified?: boolean }) {
  const [selected, setSelected] = useState(Math.max(fields.length - 1, 0));
  const [activeDocument, setActiveDocument] = useState(0);
  const selectedField = fields[selected];
  const document = documents[activeDocument];
  const documentName = document?.name ?? "invoice.pdf";
  const selectField = (index: number) => {
    setSelected(index);
    const matchingDocument = documents.findIndex((entry) => fields[index]?.source.startsWith(`${entry.name},`));
    if (matchingDocument >= 0) setActiveDocument(matchingDocument);
  };
  return <div className="review-grid">
    <section className="document">
      <div className="doc-toolbar"><div><FileText /> {documentName}</div><span>{documents.length ? `${activeDocument + 1} of ${documents.length}` : "Private evidence document"}</span></div>
      {documents.length > 1 ? <div className="review-document-tabs">{documents.map((entry, index) => <button type="button" key={entry.id} className={index === activeDocument ? "active" : ""} onClick={() => setActiveDocument(index)}>{entry.name}</button>)}</div> : null}
      <div className="paper">{document ? <>
        <FileText /><h2>{documentName}</h2>
        <p>The source document is stored privately in Supabase. Open it beside the extracted fields to verify every value.</p>
        <a className="secondary" href={document.signedUrl} target="_blank" rel="noreferrer">Open source document</a>
      </> : <>
        <div className="paper-brand">Harbour Medical Centre<small>Synthetic Tax Invoice</small></div>
        <div className="paper-row"><b>Invoice number</b><span>INV-8522</span></div>
        <div className="paper-row"><b>Invoice date</b><span>14/07/2026</span></div>
        <div className="paper-row"><b>Patient</b><span>Aisha Raman</span></div>
        <div className="invoice-lines"><b>Description <span>Amount (MUR)</span></b><p>Medical consultation <span>1,500.00</span></p><p>Laboratory tests <span>3,080.00</span></p></div>
        <div className={selected === 5 ? "highlight" : "total"}><b>Invoice total</b><strong>MUR 4,580.00</strong></div>
        <small className="service">Service date: 12 July 2026</small>
      </>}</div>
    </section>
    <section className="extraction">
      <div className="extract-head"><div><span className="kicker">Pipeline A · completed</span><h2>Extracted fields</h2></div><span className="score"><Sparkles />{fields.length}</span></div>
      <div className="alert">{verified ? <ShieldCheck /> : <AlertTriangle />}<div><b>{verified ? "Verification completed" : "Human verification required"}</b><p>{verified ? "The evidence passed verification and is ready for a supervisor decision." : "Compare each prediction with the private source document before verification."}</p></div></div>
      <div className="field-list">{fields.map((field, index) => <button type="button" key={field.label} className={selected === index ? "selected" : ""} onClick={() => selectField(index)}><div><span>{field.label}</span><b>{field.value}</b></div><small>{Math.round(field.confidence * 100)}%<ChevronRight /></small></button>)}</div>
      {selectedField ? <div className="evidence"><ShieldCheck /><div><b>Evidence linked</b><p>Selected value was extracted from {selectedField.source}. The original prediction remains preserved.</p></div></div> : null}
    </section>
  </div>;
}
