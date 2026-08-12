"use client";

import { useState } from "react";
import { AlertTriangle, ChevronRight, FileText, ShieldCheck, Sparkles } from "lucide-react";

const fields = [
  ["Patient name", "Aisha Raman", "99%"], ["Member number", "MEM10001", "98%"],
  ["Provider", "Harbour Medical Centre", "99%"], ["Invoice number", "INV-8522", "96%"],
  ["Service date", "12 Jul 2026", "97%"], ["Invoice total", "MUR 4,580.00", "94%"],
];

export function ReviewWorkspace() {
  const [selected, setSelected] = useState(5);
  return <div className="review-grid"><section className="document"><div className="doc-toolbar"><div><FileText /> invoice.pdf</div><span>Page 1 of 1 · 100%</span></div><div className="paper"><div className="paper-brand">Harbour Medical Centre<small>Synthetic Tax Invoice</small></div><div className="paper-row"><b>Invoice number</b><span>INV-8522</span></div><div className="paper-row"><b>Invoice date</b><span>14/07/2026</span></div><div className="paper-row"><b>Patient</b><span>Aisha Raman</span></div><div className="invoice-lines"><b>Description <span>Amount (MUR)</span></b><p>Medical consultation <span>1,500.00</span></p><p>Laboratory tests <span>3,080.00</span></p></div><div className={selected === 5 ? "highlight" : "total"}><b>Invoice total</b><strong>MUR 4,580.00</strong></div><small className="service">Service date: 12 July 2026</small></div></section><section className="extraction"><div className="extract-head"><div><span className="kicker">Pipeline A · completed in 40ms</span><h2>Extracted fields</h2></div><span className="score"><Sparkles />12/12</span></div><div className="alert"><AlertTriangle /><div><b>Cross-document check</b><p>Receipt amount needs human confirmation.</p></div></div><div className="field-list">{fields.map((field, index) => <button type="button" key={field[0]} className={selected === index ? "selected" : ""} onClick={() => setSelected(index)}><div><span>{field[0]}</span><b>{field[1]}</b></div><small>{field[2]}<ChevronRight /></small></button>)}</div><div className="evidence"><ShieldCheck /><div><b>Evidence linked</b><p>Selected value is located on invoice.pdf, page 1. The original prediction remains preserved.</p></div></div></section></div>;
}
