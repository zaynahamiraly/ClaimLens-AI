"""Generate the first fully synthetic ClaimLens golden claim package."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
CASE_ID = "CLM-GOLD-001"
OUTPUT = ROOT / "datasets" / "golden" / CASE_ID
PAGE = pymupdf.paper_rect("a4")


def add_text(page: pymupdf.Page, point: tuple[float, float], text: str, *, size: float = 11, bold: bool = False) -> None:
    page.insert_text(point, text, fontsize=size, fontname="hebo" if bold else "helv", color=(0.08, 0.12, 0.18))


def add_header(page: pymupdf.Page, title: str, subtitle: str) -> None:
    page.draw_rect((40, 35, PAGE.width - 40, 105), color=(0.10, 0.31, 0.50), fill=(0.94, 0.97, 1.0), width=1)
    add_text(page, (58, 66), title, size=20, bold=True)
    add_text(page, (58, 88), subtitle, size=9)


def labelled(page: pymupdf.Page, y: float, label: str, value: str, *, x: float = 58, value_x: float = 220) -> None:
    add_text(page, (x, y), label, size=10, bold=True)
    add_text(page, (value_x, y), value, size=11)
    page.draw_line((x, y + 7), (PAGE.width - 58, y + 7), color=(0.80, 0.84, 0.88), width=0.5)


def save_document(filename: str, draw) -> Path:
    document = pymupdf.open()
    page = document.new_page(width=PAGE.width, height=PAGE.height)
    draw(page)
    document.set_metadata({"title": filename, "author": "ClaimLens AI synthetic dataset", "creator": "ClaimLens golden-data generator", "producer": "PyMuPDF", "creationDate": "D:20260811000000+04'00'", "modDate": "D:20260811000000+04'00'"})
    path = OUTPUT / filename
    document.save(path, garbage=4, deflate=True, no_new_id=True)
    document.close()
    return path


def draw_claim_form(page: pymupdf.Page) -> None:
    add_header(page, "Health Claim Form", "Synthetic research document — not a real insurance claim")
    labelled(page, 145, "Claim reference", CASE_ID)
    labelled(page, 185, "Member number", "MEM10001")
    labelled(page, 225, "Patient name", "Aisha Raman")
    labelled(page, 265, "Service date", "12/07/2026")
    labelled(page, 305, "Claimed amount", "MUR 4,580.00")
    labelled(page, 345, "Provider", "Harbour Medical Centre")
    add_text(page, (58, 415), "Declaration", size=12, bold=True)
    add_text(page, (58, 440), "I confirm that this synthetic claim package is used only for ClaimLens evaluation.", size=9)
    labelled(page, 500, "Synthetic claimant signature", "A. Raman")


def draw_invoice(page: pymupdf.Page) -> None:
    add_header(page, "Harbour Medical Centre", "Synthetic Tax Invoice")
    labelled(page, 145, "Invoice number", "INV-8522")
    labelled(page, 185, "Invoice date", "14/07/2026")
    labelled(page, 225, "Patient", "Aisha Raman")
    add_text(page, (58, 300), "Description", size=10, bold=True)
    add_text(page, (390, 300), "Amount (MUR)", size=10, bold=True)
    add_text(page, (58, 335), "Medical consultation", size=10)
    add_text(page, (420, 335), "1,500.00", size=10)
    add_text(page, (58, 370), "Laboratory tests", size=10)
    add_text(page, (420, 370), "3,080.00", size=10)
    page.draw_line((58, 395), (PAGE.width - 58, 395), color=(0.2, 0.3, 0.4), width=1)
    add_text(page, (330, 430), "Invoice total", size=12, bold=True)
    add_text(page, (430, 430), "MUR 4,580.00", size=12, bold=True)
    add_text(page, (58, 500), "Service date: 12 July 2026", size=10)


def draw_receipt(page: pymupdf.Page) -> None:
    add_header(page, "Harbour Medical Centre", "Synthetic Payment Receipt")
    labelled(page, 155, "Receipt number", "RCT-2901")
    labelled(page, 200, "Received from", "Aisha Raman")
    labelled(page, 245, "Invoice number", "INV-8522")
    labelled(page, 290, "Payment date", "14/07/2026")
    page.draw_rect((90, 360, PAGE.width - 90, 440), color=(0.10, 0.31, 0.50), fill=(0.94, 0.97, 1.0), width=1)
    add_text(page, (120, 395), "Amount paid", size=12, bold=True)
    add_text(page, (310, 410), "MUR 4,580.00", size=20, bold=True)
    add_text(page, (58, 510), "Payment method: Card", size=10)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(65536), b""):
            digest.update(block)
    return digest.hexdigest()


def evidence(filename: str, document_id: str, needle: str) -> dict[str, object]:
    with pymupdf.open(OUTPUT / filename) as document:
        page = document[0]
        matches = page.search_for(needle)
        if not matches:
            raise ValueError(f"Could not locate {needle!r} in {filename}")
        rect = matches[0]
        bbox = [round(rect.x0 / page.rect.width, 6), round(rect.y0 / page.rect.height, 6), round(rect.x1 / page.rect.width, 6), round(rect.y1 / page.rect.height, 6)]
    return {"document_id": document_id, "page": 1, "bbox": bbox, "raw_text": needle}


def field(value, *sources: dict[str, object]) -> dict[str, object]:
    return {"value": value, "sources": list(sources)}


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    paths = {
        "form-1": save_document("claim_form.pdf", draw_claim_form),
        "invoice-1": save_document("invoice.pdf", draw_invoice),
        "receipt-1": save_document("receipt.pdf", draw_receipt),
    }
    annotation = {
        "schema_version": "1.0",
        "dataset_version": "pilot-1",
        "case_id": CASE_ID,
        "split": "pilot",
        "template_family": "mauritius-clinic-a",
        "documents": [
            {"document_id": "form-1", "type": "CLAIM_FORM", "filename": "claim_form.pdf", "sha256": sha256(paths["form-1"]), "condition": "digital", "degradation": None},
            {"document_id": "invoice-1", "type": "INVOICE", "filename": "invoice.pdf", "sha256": sha256(paths["invoice-1"]), "condition": "digital", "degradation": None},
            {"document_id": "receipt-1", "type": "RECEIPT", "filename": "receipt.pdf", "sha256": sha256(paths["receipt-1"]), "condition": "digital", "degradation": None},
        ],
        "fields": {
            "claim_reference": field(CASE_ID, evidence("claim_form.pdf", "form-1", CASE_ID)),
            "member_number": field("MEM10001", evidence("claim_form.pdf", "form-1", "MEM10001")),
            "patient_name": field("Aisha Raman", evidence("claim_form.pdf", "form-1", "Aisha Raman")),
            "provider_name": field("Harbour Medical Centre", evidence("invoice.pdf", "invoice-1", "Harbour Medical Centre")),
            "invoice_number": field("INV-8522", evidence("invoice.pdf", "invoice-1", "INV-8522")),
            "invoice_date": field("2026-07-14", evidence("invoice.pdf", "invoice-1", "14/07/2026")),
            "service_date": field("2026-07-12", evidence("invoice.pdf", "invoice-1", "12 July 2026")),
            "claimed_amount": field("4580.00", evidence("claim_form.pdf", "form-1", "MUR 4,580.00")),
            "invoice_total": field("4580.00", evidence("invoice.pdf", "invoice-1", "MUR 4,580.00")),
            "receipt_amount": field("4580.00", evidence("receipt.pdf", "receipt-1", "MUR 4,580.00")),
            "currency": field("MUR", evidence("claim_form.pdf", "form-1", "MUR"), evidence("invoice.pdf", "invoice-1", "MUR"), evidence("receipt.pdf", "receipt-1", "MUR")),
            "service_description": field(["Medical consultation", "Laboratory tests"], evidence("invoice.pdf", "invoice-1", "Medical consultation"), evidence("invoice.pdf", "invoice-1", "Laboratory tests")),
        },
        "expected_validations": [
            {"rule_id": "CLAIMED_VS_INVOICE_AMOUNT", "expected_status": "PASS"},
            {"rule_id": "INVOICE_VS_RECEIPT_AMOUNT", "expected_status": "PASS"},
            {"rule_id": "IDENTITY_CONSISTENCY", "expected_status": "PASS"},
            {"rule_id": "SERVICE_VS_INVOICE_DATE", "expected_status": "PASS"},
            {"rule_id": "CURRENCY_CONSISTENCY", "expected_status": "PASS"},
        ],
    }
    (OUTPUT / "ground_truth.json").write_text(json.dumps(annotation, indent=2) + "\n", encoding="utf-8")
    print(f"Generated {CASE_ID} in {OUTPUT}")


if __name__ == "__main__":
    main()
