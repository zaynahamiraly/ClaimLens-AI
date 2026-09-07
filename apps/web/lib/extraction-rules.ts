export type TextDocument = { documentId: string; text: string };

export type RuleExtractedField = {
  fieldName: string;
  rawValue: string;
  normalizedValue: string;
  confidence: number;
  method: string;
  documentId: string;
  pageNumber: number;
};

function escaped(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function afterLabel(text: string, labels: string[]) {
  for (const label of labels) {
    const pattern = new RegExp(`(?:^|\\n)\\s*${escaped(label)}\\s*(?::|-)?\\s*(?:\\n\\s*)?([^\\n]+)`, "im");
    const value = pattern.exec(text)?.[1]?.trim();
    if (value) return value;
  }
  return null;
}

function money(raw: string | null) {
  if (!raw) return null;
  const match = raw.match(/(?:MUR|Rs\.?|USD|EUR|GBP)?\s*([0-9][0-9, ]*(?:\.\d{2})?)/i);
  if (!match) return null;
  const normalized = match[1].replace(/[ ,]/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? amount.toFixed(2) : null;
}

function detectedCurrency(text: string) {
  const match = text.match(/\b(MUR|USD|EUR|GBP)\b/i);
  return match?.[1]?.toUpperCase() ?? "MUR";
}

export function extractClaimFields(texts: TextDocument[]) {
  const specs = [
    { name: "patient_name", labels: ["Patient name", "Patient"], normalise: (value: string | null) => value, confidence: 0.96 },
    { name: "member_number", labels: ["Member number", "Membership number"], normalise: (value: string | null) => value, confidence: 0.94 },
    { name: "provider_name", labels: ["Provider name", "Provider"], normalise: (value: string | null) => value, confidence: 0.90 },
    { name: "invoice_number", labels: ["Invoice number", "Invoice no"], normalise: (value: string | null) => value, confidence: 0.95 },
    { name: "service_date", labels: ["Service date", "Date of service"], normalise: (value: string | null) => value, confidence: 0.91 },
    { name: "invoice_total", labels: ["Invoice total", "Total amount", "Grand total"], normalise: money, confidence: 0.93 },
    { name: "claimed_amount", labels: ["Claimed amount", "Claim amount", "Amount claimed", "Invoice total", "Grand total"], normalise: money, confidence: 0.92 },
  ];
  const fields: RuleExtractedField[] = [];
  for (const spec of specs) {
    for (const entry of texts) {
      const rawValue = afterLabel(entry.text, spec.labels);
      const normalizedValue = spec.normalise(rawValue);
      if (rawValue && normalizedValue) {
        fields.push({ fieldName: spec.name, rawValue, normalizedValue, confidence: spec.confidence, method: "label_rule", documentId: entry.documentId, pageNumber: 1 });
        break;
      }
    }
  }
  const claimedAmount = fields.find((field) => field.fieldName === "claimed_amount")?.normalizedValue ?? null;
  const invoiceTotal = fields.find((field) => field.fieldName === "invoice_total")?.normalizedValue ?? null;
  return {
    fields,
    claimedAmount,
    currency: detectedCurrency(texts.map((entry) => entry.text).join("\n")),
    warningCount: claimedAmount && invoiceTotal && claimedAmount !== invoiceTotal ? 1 : 0,
  };
}
