from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation


@dataclass(frozen=True)
class TextDocument:
    document_id: str
    text: str
    method: str = "pdf_text"
    source_confidence: float = 1.0


@dataclass(frozen=True)
class ExtractedValue:
    field_name: str
    raw_value: str
    normalized_value: str
    confidence: float
    extraction_method: str
    document_id: str
    page_number: int = 1


DOCUMENT_RULES = (
    ("PHARMACY_RECEIPT", re.compile(r"\b(pharmacy|chemist|dispensary)\b[\s\S]{0,500}\b(receipt|total|paid|amount)\b", re.I), .91, True),
    ("INVOICE", re.compile(r"\b(invoice|facture|bill)\b", re.I), .94, True),
    ("RECEIPT", re.compile(r"\b(receipt|received\s+with\s+thanks|paid)\b", re.I), .92, True),
    ("PRESCRIPTION", re.compile(r"\b(prescription|rx|prescribed)\b", re.I), .88, False),
    ("MEDICAL_CERTIFICATE", re.compile(r"\bmedical\s+certificate|unfit\s+for\s+work|sick\s+leave\b", re.I), .94, False),
    ("CLAIM_FORM", re.compile(r"\bclaim\s+(?:form|number|details)|policy\s+number|amount\s+claimed\b", re.I), .89, False),
    ("MEDICAL_MEMO", re.compile(r"\b(medical\s+(?:memo|report|note)|treatment\s+note|consultation)\b", re.I), .82, True),
)

FIELD_SPECS = (
    ("patient_name", ("Patient / Patient(e)", "Patient name", "Patient(e)", "Patient", "Received with thanks from", "Mr/Mrs/Miss", "Name"), .96, False),
    ("member_number", ("Member number", "Membership number", "Insurance Member ID"), .94, False),
    ("provider_name", ("Provider name", "Provider", "Facility"), .90, False),
    ("invoice_number", ("No. facture / Invoice No.", "Invoice number", "Invoice no.", "Receipt No.", "No."), .95, False),
    ("service_date", ("Service date", "Date of service", "Treatment Date", "Date"), .91, False),
    ("invoice_total", ("Invoice total", "Total amount", "Grand total", "Total"), .93, True),
    ("claimed_amount", ("Claimed amount", "Claim amount", "Amount claimed", "Invoice total", "Grand total", "Total"), .92, True),
)

MONEY_PATTERN = re.compile(
    r"(?:(?:\b(?:MUR|USD|EUR|GBP|UGX|KES|TZS)|Rs\.?|Shs\.?)\s*(?:\d{1,3}(?:[ ,]\d{3})+|\d+)(?:\.\d{1,2})?|(?:\d{1,3}(?:[ ,]\d{3})+|\d+)\.\d{1,2}(?:\s+(?:MUR|USD|EUR|GBP|UGX|KES|TZS)\b)?)",
    re.I,
)
TOTAL_CONTEXT = re.compile(r"\b(total|payable|due|reimburs(?:e|ement)|claim(?:ed)?|net\s+amount|settlement|sum\s+of\s+shillings)\b", re.I)
NON_AMOUNT_CONTEXT = re.compile(r"\b(date|reference|member|policy|phone|fax|balance)\b", re.I)


def classify_document(text: str) -> tuple[str, float, bool]:
    for document_type, pattern, confidence, payable in DOCUMENT_RULES:
        if pattern.search(text):
            return document_type, confidence, payable
    return "SUPPORTING_DOCUMENT", .55, False


def normalize_money(raw: str | None) -> str | None:
    if not raw:
        return None
    match = re.search(r"(?:MUR|Rs\.?|UGX|KES|TZS|Shs\.?)?\s*([0-9][0-9, ]*(?:\.\d{1,2})?)", raw, re.I)
    if not match:
        return None
    try:
        amount = Decimal(match.group(1).replace(",", "").replace(" ", ""))
    except InvalidOperation:
        return None
    return f"{amount:.2f}" if amount >= 0 else None


def detected_currency(text: str) -> str | None:
    match = re.search(r"\bcurrenc(?:y|ies)\b\s*(?::|-)?\s*([A-Z]{3})", text, re.I)
    if match:
        return match.group(1).upper()
    if re.search(r"\bRs\.?\s*\d", text, re.I):
        return "MUR"
    if re.search(r"\bShs\.?\s*\d", text, re.I):
        if re.search(r"\b(Uganda|Kampala|Kayunga)\b|\+?256\b", text, re.I):
            return "UGX"
        if re.search(r"\b(Kenya|Nairobi)\b|\+?254\b", text, re.I):
            return "KES"
        if re.search(r"\b(Tanzania|Dar\s+es\s+Salaam)\b|\+?255\b", text, re.I):
            return "TZS"
    match = re.search(r"\b(MUR|USD|EUR|GBP|UGX|KES|TZS)\b", text, re.I)
    return match.group(1).upper() if match else None


def after_label(text: str, labels: tuple[str, ...]) -> str | None:
    for label in labels:
        pattern = re.compile(rf"(?:^|\n)\s*{re.escape(label)}\s*(?::|-|\.{{2,}})?\s*(?:\n\s*)?([^\n]+)", re.I | re.M)
        match = pattern.search(text)
        if match and match.group(1).strip():
            return match.group(1).strip()
    return None


def provider_from_heading(text: str) -> str | None:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    for line in lines:
        match = re.search(r"\bFor\s*:\s*(.+)$", line, re.I)
        if match:
            return match.group(1).strip()
    title_index = next((i for i, line in enumerate(lines) if re.search(r"\b(invoice|facture|receipt|claim\s+form|medical\s+certificate)\b", line, re.I)), min(len(lines), 6))
    excluded = re.compile(r"\b(address|street|road|tel|phone|fax|email|brn|date|patient|member|invoice|payment|cash|cheque|balance|thanks|sign)\b", re.I)
    return next((line for line in lines[:title_index] if 3 <= len(line) <= 120 and re.search(r"[a-z]{3}", line, re.I) and not excluded.search(line) and not line[0].isdigit()), None)


def ranked_amount(doc: TextDocument) -> tuple[str, str, int] | None:
    lines = [line.strip() for line in doc.text.splitlines() if line.strip()]
    values: list[tuple[str, str, int]] = []
    for index, line in enumerate(lines):
        for match in MONEY_PATTERN.finditer(line):
            raw = match.group(0).strip()
            normalized = normalize_money(raw)
            if not normalized:
                continue
            context = " ".join(lines[max(0, index - 2):index + 2])
            score = 2 + (5 if TOTAL_CONTEXT.search(context) else 0) + (3 if re.search(r"\btotal\b", context, re.I) else 0)
            score += 2 if re.search(r"\b[A-Z]{3}\b", raw) else 0
            score += 1 if index >= int(len(lines) * .6) else 0
            score -= 4 if NON_AMOUNT_CONTEXT.search(context) and not TOTAL_CONTEXT.search(context) else 0
            values.append((raw, normalized, score))
    if not values:
        return None
    largest = max(Decimal(item[1]) for item in values)
    values = [(raw, value, score + (2 if Decimal(value) == largest else 0)) for raw, value, score in values]
    return max(values, key=lambda item: (item[2], Decimal(item[1])))


def extract_fields(doc: TextDocument) -> tuple[list[ExtractedValue], str | None, str | None, int]:
    fields: list[ExtractedValue] = []
    for name, labels, confidence, monetary in FIELD_SPECS:
        raw = after_label(doc.text, labels)
        normalized = normalize_money(raw) if monetary else raw
        if raw and normalized:
            fields.append(ExtractedValue(name, raw, normalized, min(confidence, doc.source_confidence), f"{doc.method}_label_rule", doc.document_id))
    if not any(field.field_name == "provider_name" for field in fields):
        raw = provider_from_heading(doc.text)
        if raw:
            fields.append(ExtractedValue("provider_name", raw, raw, min(.88, doc.source_confidence), f"{doc.method}_heading_rule", doc.document_id))
    if not any(field.field_name == "claimed_amount" for field in fields):
        candidate = ranked_amount(doc)
        if candidate and candidate[2] >= 4:
            raw, normalized, score = candidate
            fields.append(ExtractedValue("claimed_amount", raw, normalized, min(.94, .70 + score * .02, doc.source_confidence), f"{doc.method}_ranked_monetary_candidate", doc.document_id))
    claimed = next((field.normalized_value for field in fields if field.field_name == "claimed_amount"), None)
    invoice = next((field.normalized_value for field in fields if field.field_name == "invoice_total"), None)
    warnings = 1 if claimed and invoice and claimed != invoice else 0
    return fields, claimed, detected_currency(doc.text), warnings
