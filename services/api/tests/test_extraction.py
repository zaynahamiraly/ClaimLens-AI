from app.extraction import TextDocument, classify_document, detected_currency, extract_fields, normalize_money
from app.routers.claims import valid_signature


def test_invoice_fields_are_extracted_from_document_content() -> None:
    text = """Vacoa Family Practice
FACTURE / INVOICE
Patient name: Loic Dookun
Date: 21/03/2025
TOTAL: Rs 620.00
"""
    fields, amount, currency, warnings = extract_fields(TextDocument("doc-1", text))

    values = {field.field_name: field.normalized_value for field in fields}
    assert values["patient_name"] == "Loic Dookun"
    assert amount == "620.00"
    assert currency == "MUR"
    assert warnings == 0


def test_receipt_ranking_uses_total_context_not_reference_number() -> None:
    text = """HOLISTIC MEDICAL CENTRE
RECEIPT No. 10137
Date: 10/04/2026
Balance: 300000
Shs. 650000
Total Shs. 650000
Kayunga District Uganda
"""
    _, amount, currency, _ = extract_fields(TextDocument("doc-2", text, method="ocr", source_confidence=.8))

    assert amount == "650000.00"
    assert currency == "UGX"


def test_classification_and_money_normalisation_are_not_filename_based() -> None:
    assert classify_document("Prescription\nRx amoxicillin")[0] == "PRESCRIPTION"
    assert normalize_money("MUR 3,040.50") == "3040.50"
    assert detected_currency("Total USD 50.00") == "USD"


def test_upload_signature_validation_rejects_spoofed_files() -> None:
    assert valid_signature(b"%PDF-1.7 example", "application/pdf")
    assert not valid_signature(b"not really a pdf", "application/pdf")
