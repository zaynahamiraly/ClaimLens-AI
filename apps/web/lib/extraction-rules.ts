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
  const labelled = text.match(/\bcurrenc(?:y|ies)\b\s*(?::|-)?\s*([A-Z]{3})\b/i);
  if (labelled?.[1]) return labelled[1].toUpperCase();
  const nextToAmount = text.match(/(?:\b([A-Z]{3})\s+[0-9][0-9, ]*\.\d{2}\b|\b[0-9][0-9, ]*\.\d{2}\s+([A-Z]{3})\b)/);
  return (nextToAmount?.[1] ?? nextToAmount?.[2])?.toUpperCase() ?? null;
}

type MonetaryCandidate = {
  rawValue: string;
  normalizedValue: string;
  score: number;
  documentId: string;
};

const totalContext = /\b(total|payable|due|reimburs(?:e|ement)|claim(?:ed)?|net\s+amount|settlement)\b/i;
const nonAmountContext = /\b(date|reference|member|policy|phone|fax)\b/i;
const monetaryValue = /(?:\b[A-Z]{3}\s+)?(?:\d{1,3}(?:[ ,]\d{3})+|\d+)\.\d{2}(?:\s+[A-Z]{3}\b)?/g;

function rankedMonetaryCandidates(texts: TextDocument[]): MonetaryCandidate[] {
  const candidates: MonetaryCandidate[] = [];
  for (const entry of texts) {
    const lines = entry.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      for (const match of line.matchAll(monetaryValue)) {
        const rawValue = match[0].trim();
        const normalizedValue = money(rawValue);
        if (!normalizedValue) continue;
        const context = lines.slice(Math.max(0, index - 2), Math.min(lines.length, index + 2)).join(" ");
        let score = 2;
        if (totalContext.test(context)) score += 5;
        if (/\btotal\b/i.test(context)) score += 3;
        if (/\b[A-Z]{3}\b/.test(rawValue)) score += 2;
        if (index >= Math.floor(lines.length * 0.6)) score += 1;
        if (nonAmountContext.test(context) && !totalContext.test(context)) score -= 4;
        candidates.push({ rawValue, normalizedValue, score, documentId: entry.documentId });
      }
    }
  }
  const largest = Math.max(...candidates.map((candidate) => Number(candidate.normalizedValue)));
  return candidates
    .map((candidate) => ({ ...candidate, score: candidate.score + (Number(candidate.normalizedValue) === largest ? 2 : 0) }))
    .sort((left, right) => right.score - left.score || Number(right.normalizedValue) - Number(left.normalizedValue));
}

export function extractClaimFields(texts: TextDocument[]) {
  const specs = [
    { name: "patient_name", labels: ["Patient name", "Patient"], normalise: (value: string | null) => value, confidence: 0.96 },
    { name: "member_number", labels: ["Member number", "Membership number", "Insurance Member ID"], normalise: (value: string | null) => value, confidence: 0.94 },
    { name: "provider_name", labels: ["Provider name", "Provider", "Facility"], normalise: (value: string | null) => value, confidence: 0.90 },
    { name: "invoice_number", labels: ["Invoice number", "Invoice no"], normalise: (value: string | null) => value, confidence: 0.95 },
    { name: "service_date", labels: ["Service date", "Date of service", "Treatment Date"], normalise: (value: string | null) => value, confidence: 0.91 },
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
  if (!fields.some((field) => field.fieldName === "claimed_amount")) {
    const candidate = rankedMonetaryCandidates(texts)[0];
    if (candidate && candidate.score >= 4) {
      fields.push({
        fieldName: "claimed_amount",
        rawValue: candidate.rawValue,
        normalizedValue: candidate.normalizedValue,
        confidence: Math.min(0.94, 0.70 + candidate.score * 0.02),
        method: "ranked_monetary_candidate",
        documentId: candidate.documentId,
        pageNumber: 1,
      });
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
