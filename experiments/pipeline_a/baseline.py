"""Pipeline A: deterministic PDF text extraction plus regular expressions."""

from __future__ import annotations

import re
import time
from datetime import datetime
from decimal import Decimal
from pathlib import Path

import pymupdf


def pdf_text(path: Path) -> str:
    with pymupdf.open(path) as document:
        return "\n".join(page.get_text("text") for page in document)


def after_label(text: str, label: str) -> str | None:
    match = re.search(rf"(?im)^{re.escape(label)}\s*\n([^\n]+)", text)
    return match.group(1).strip() if match else None


def normalise_money(value: str | None) -> str | None:
    if value is None:
        return None
    match = re.search(r"(?:MUR|Rs)?\s*([0-9][0-9,]*\.\d{2})", value, re.IGNORECASE)
    return f"{Decimal(match.group(1).replace(',', '')):.2f}" if match else None


def normalise_date(value: str | None) -> str | None:
    if value is None:
        return None
    for pattern in ("%d/%m/%Y", "%d %B %Y"):
        try:
            return datetime.strptime(value.strip(), pattern).date().isoformat()
        except ValueError:
            continue
    return None


def source(document_id: str, raw_text: str | None) -> list[dict[str, object]]:
    return [] if raw_text is None else [{"document_id": document_id, "page": 1, "raw_text": raw_text}]


def predicted(value, method: str, sources: list[dict[str, object]]) -> dict[str, object]:
    return {"value": value, "method": method, "sources": sources}


def run(case_directory: Path) -> dict[str, object]:
    started = time.perf_counter()
    form = pdf_text(case_directory / "claim_form.pdf")
    invoice = pdf_text(case_directory / "invoice.pdf")
    receipt = pdf_text(case_directory / "receipt.pdf")

    claim_reference = after_label(form, "Claim reference")
    member_number = after_label(form, "Member number")
    patient_name = after_label(form, "Patient name")
    provider_name = invoice.splitlines()[0].strip() if invoice.splitlines() else None
    invoice_number = after_label(invoice, "Invoice number")
    invoice_date_raw = after_label(invoice, "Invoice date")
    service_date_match = re.search(r"(?im)^Service date:\s*([^\n]+)", invoice)
    service_date_raw = service_date_match.group(1).strip() if service_date_match else None
    claimed_raw = after_label(form, "Claimed amount")
    invoice_total_raw = after_label(invoice, "Invoice total")
    receipt_amount_raw = after_label(receipt, "Amount paid")
    currency_match = re.search(r"\b(MUR)\b", form)
    descriptions = [item for item in ("Medical consultation", "Laboratory tests") if item in invoice]

    fields = {
        "claim_reference": predicted(claim_reference, "label_rule", source("form-1", claim_reference)),
        "member_number": predicted(member_number, "label_rule", source("form-1", member_number)),
        "patient_name": predicted(patient_name, "label_rule", source("form-1", patient_name)),
        "provider_name": predicted(provider_name, "first_line_rule", source("invoice-1", provider_name)),
        "invoice_number": predicted(invoice_number, "label_rule", source("invoice-1", invoice_number)),
        "invoice_date": predicted(normalise_date(invoice_date_raw), "date_rule", source("invoice-1", invoice_date_raw)),
        "service_date": predicted(normalise_date(service_date_raw), "date_rule", source("invoice-1", service_date_raw)),
        "claimed_amount": predicted(normalise_money(claimed_raw), "money_rule", source("form-1", claimed_raw)),
        "invoice_total": predicted(normalise_money(invoice_total_raw), "money_rule", source("invoice-1", invoice_total_raw)),
        "receipt_amount": predicted(normalise_money(receipt_amount_raw), "money_rule", source("receipt-1", receipt_amount_raw)),
        "currency": predicted(currency_match.group(1) if currency_match else None, "currency_rule", source("form-1", currency_match.group(1) if currency_match else None)),
        "service_description": predicted(descriptions or None, "known_description_rule", [{"document_id": "invoice-1", "page": 1, "raw_text": item} for item in descriptions]),
    }
    return {
        "case_id": case_directory.name,
        "pipeline": "A",
        "pipeline_version": "1.0.0",
        "fields": fields,
        "processing_time_ms": round((time.perf_counter() - started) * 1000, 3),
    }
