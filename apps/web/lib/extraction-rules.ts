export type TextDocument = { documentId: string; text: string; method?: "pdf_text" | "docx_text" | "ocr"; sourceConfidence?: number };

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
    const pattern = new RegExp(`(?:^|\\n)\\s*${escaped(label)}\\s*(?::|-|\\.{2,})?\\s*(?:\\n\\s*)?([^\\n]+)`, "im");
    const value = pattern.exec(text)?.[1]?.trim();
    if (value) return value;
  }
  return null;
}

function providerFromHeading(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const documentTitle = lines.findIndex((line) => /\b(invoice|facture|receipt|claim\s+form|medical\s+certificate)\b/i.test(line));
  const heading = lines.slice(0, documentTitle > 0 ? documentTitle : Math.min(lines.length, 6));
  return heading.find((line) =>
    line.length >= 3
    && line.length <= 120
    && /[a-z]{3}/i.test(line)
    && !/\b(address|street|road|tel|phone|fax|email|brn|date|patient|member|invoice)\b/i.test(line)
    && !/^\d/.test(line)
  ) ?? null;
}

function money(raw: string | null) {
  if (!raw) return null;
  const match = raw.match(/(?:MUR|Rs\.?|UGX|KES|TZS|Shs\.?)?\s*([0-9][0-9, ]*(?:\.\d{1,2})?)/i);
  if (!match) return null;
  const normalized = match[1].replace(/[ ,]/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? amount.toFixed(2) : null;
}

function detectedCurrency(text: string) {
  const labelled = text.match(/\bcurrenc(?:y|ies)\b\s*(?::|-)?\s*([A-Z]{3})/i);
  if (labelled?.[1]) return labelled[1].toUpperCase();
  if (/\bRs\.?\s*\d/i.test(text)) return "MUR";
  if (/\bShs\.?\s*\d/i.test(text)) {
    if (/\b(Uganda|Kampala|Kayunga)\b|\+?256\b/i.test(text)) return "UGX";
    if (/\b(Kenya|Nairobi)\b|\+?254\b/i.test(text)) return "KES";
    if (/\b(Tanzania|Dar\s+es\s+Salaam)\b|\+?255\b/i.test(text)) return "TZS";
  }
  const nextToAmount = text.match(/(?:\b(MUR|USD|EUR|GBP|UGX|KES|TZS)\s+[0-9][0-9, ]*(?:\.\d{1,2})?\b|\b[0-9][0-9, ]*(?:\.\d{1,2})?\s+(MUR|USD|EUR|GBP|UGX|KES|TZS)\b)/i);
  return (nextToAmount?.[1] ?? nextToAmount?.[2])?.toUpperCase() ?? null;
}

type MonetaryCandidate = {
  rawValue: string;
  normalizedValue: string;
  score: number;
  documentId: string;
};

const totalContext = /\b(total|payable|due|reimburs(?:e|ement)|claim(?:ed)?|net\s+amount|settlement|sum\s+of\s+shillings)\b/i;
const nonAmountContext = /\b(date|reference|member|policy|phone|fax|balance)\b/i;
const monetaryValue = /(?:(?:\b(?:MUR|USD|EUR|GBP|UGX|KES|TZS)|Rs\.?|Shs\.?)\s*(?:\d{1,3}(?:[ ,]\d{3})+|\d+)(?:\.\d{1,2})?|(?:\d{1,3}(?:[ ,]\d{3})+|\d+)\.\d{1,2}(?:\s+(?:MUR|USD|EUR|GBP|UGX|KES|TZS)\b)?)/gi;

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
    { name: "patient_name", labels: ["Patient / Patient(e)", "Patient name", "Patient(e)", "Patient", "Received with thanks from", "Mr/Mrs/Miss", "Name"], normalise: (value: string | null) => value, confidence: 0.96 },
    { name: "member_number", labels: ["Member number", "Membership number", "Insurance Member ID"], normalise: (value: string | null) => value, confidence: 0.94 },
    { name: "provider_name", labels: ["Provider name", "Provider", "Facility"], normalise: (value: string | null) => value, confidence: 0.90 },
    { name: "invoice_number", labels: ["No. facture / Invoice No.", "Invoice number", "Invoice no.", "Receipt No.", "No."], normalise: (value: string | null) => value, confidence: 0.95 },
    { name: "service_date", labels: ["Service date", "Date of service", "Treatment Date", "Date"], normalise: (value: string | null) => value, confidence: 0.91 },
    { name: "invoice_total", labels: ["Invoice total", "Total amount", "Grand total", "Total"], normalise: money, confidence: 0.93 },
    { name: "claimed_amount", labels: ["Claimed amount", "Claim amount", "Amount claimed", "Invoice total", "Grand total", "Total"], normalise: money, confidence: 0.92 },
  ];
  const fields: RuleExtractedField[] = [];
  let conflictCount = 0;
  for (const spec of specs) {
    const candidates = texts.flatMap((entry) => {
      const rawValue = afterLabel(entry.text, spec.labels);
      const normalizedValue = spec.normalise(rawValue);
      return rawValue && normalizedValue ? [{ entry, rawValue, normalizedValue }] : [];
    });
    const selected = candidates[0];
    if (selected) {
      const confidence = selected.entry.sourceConfidence == null
        ? spec.confidence
        : Math.min(spec.confidence, selected.entry.sourceConfidence);
      fields.push({ fieldName: spec.name, rawValue: selected.rawValue, normalizedValue: selected.normalizedValue, confidence, method: `${selected.entry.method ?? "pdf_text"}_label_rule`, documentId: selected.entry.documentId, pageNumber: 1 });
      const distinctValues = new Set(candidates.map((candidate) => candidate.normalizedValue.trim().toLocaleLowerCase()));
      if (distinctValues.size > 1) conflictCount += 1;
    }
  }
  if (!fields.some((field) => field.fieldName === "provider_name")) {
    const candidates = texts.flatMap((entry) => {
      const rawValue = providerFromHeading(entry.text);
      return rawValue ? [{ entry, rawValue }] : [];
    });
    const selected = candidates[0];
    if (selected) {
      fields.push({
        fieldName: "provider_name",
        rawValue: selected.rawValue,
        normalizedValue: selected.rawValue,
        confidence: Math.min(0.88, selected.entry.sourceConfidence ?? 1),
        method: `${selected.entry.method ?? "pdf_text"}_heading_rule`,
        documentId: selected.entry.documentId,
        pageNumber: 1,
      });
      const distinctValues = new Set(candidates.map((candidate) => candidate.rawValue.trim().toLocaleLowerCase()));
      if (distinctValues.size > 1) conflictCount += 1;
    }
  }
  if (!fields.some((field) => field.fieldName === "claimed_amount")) {
    const candidate = rankedMonetaryCandidates(texts)[0];
    if (candidate && candidate.score >= 4) {
      fields.push({
        fieldName: "claimed_amount",
        rawValue: candidate.rawValue,
        normalizedValue: candidate.normalizedValue,
        confidence: Math.min(
          0.94,
          0.70 + candidate.score * 0.02,
          texts.find((entry) => entry.documentId === candidate.documentId)?.sourceConfidence ?? 1,
        ),
        method: `${texts.find((entry) => entry.documentId === candidate.documentId)?.method ?? "pdf_text"}_ranked_monetary_candidate`,
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
    warningCount: conflictCount + (claimedAmount && invoiceTotal && claimedAmount !== invoiceTotal ? 1 : 0),
  };
}
