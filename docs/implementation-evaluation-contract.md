# ClaimLens AI Implementation and Evaluation Contract

Status: Baseline v1.0

Date frozen: 2026-08-11

Change policy: Changes require a documented amendment explaining the reason and effect on comparability. The locked final test set must never be used for tuning.

## 1. Dissertation objective

ClaimLens AI will test whether a traceable, quality-aware, hybrid document-processing pipeline improves structured field extraction and human review support for synthetic health-insurance claim packages compared with a simpler OCR-and-rules baseline.

The contribution is the combined workflow: document-quality assessment, OCR, hybrid extraction, normalisation, cross-document validation, evidence localisation, human correction, and audit history. It is not the invention of OCR or NLP.

## 2. Minimum successful deliverable

A user can create a claim, privately upload a synthetic claim form/invoice/receipt package, process it, review extracted fields with source evidence, see selected validation warnings, correct predictions without destroying them, verify the claim, and inspect its audit history.

The research system can run Pipelines A and B on the same frozen test cases and automatically report extraction, validation, evidence-localisation, latency, and failure metrics.

## 3. Scope

### Required

- Authentication and minimal role enforcement
- Claim creation and private document upload
- Original-document preservation
- OCR output with page and bounding-box provenance
- Structured extraction and deterministic normalisation
- Selected cross-document validations
- Evidence-linked review and correction history
- Audit events and human verification
- Reproducible Pipeline A/B evaluation
- Automated tests for critical workflows and scoring

### Deferred unless required scope is stable

- Document VLM / Pipeline C
- Correction-driven retraining
- Advanced analytics and administration
- Production-scale Celery/Redis deployment
- Sophisticated classification, heavy concurrency, and disaster-recovery implementation

## 4. Claim package

Each evaluated package contains one `CLAIM_FORM`, one `INVOICE`, one `RECEIPT`, and zero or more `SUPPORTING_DOCUMENT` files. Only synthetic personal and medical information may be included.

## 5. Ground-truth fields

The machine-readable authority is `datasets/schemas/ground-truth.schema.json`.

| Field | Required | Cardinality | Primary source | Canonical form |
|---|---:|---:|---|---|
| `claim_reference` | yes | one | claim form | uppercase string |
| `member_number` | yes | one | claim form | uppercase alphanumeric string |
| `patient_name` | yes | one | claim form | trimmed display string |
| `provider_name` | yes | one | invoice | trimmed display string |
| `invoice_number` | yes | one | invoice | uppercase string |
| `invoice_date` | yes | one | invoice | ISO `YYYY-MM-DD` |
| `service_date` | yes | one | invoice | ISO `YYYY-MM-DD` |
| `claimed_amount` | yes | one | claim form | decimal string with two places |
| `invoice_total` | yes | one | invoice | decimal string with two places |
| `receipt_amount` | yes | one | receipt | decimal string with two places |
| `currency` | yes | one | financial documents | ISO 4217 code; initially `MUR` |
| `service_description` | no | many | invoice | ordered trimmed strings |

An absent optional field is `null`. An illegible required field retains its true generated value and is marked in case metadata. Monetary values are strings to avoid floating-point ambiguity.

## 6. Pipeline definitions

### Pipeline A — baseline

Usable PDF text-layer extraction, otherwise one fixed OCR configuration; regex and deterministic rules; canonical normalisation. No adaptive preprocessing, layout model, statistical NER, or VLM.

### Pipeline B — proposed

Quality assessment; recorded adaptive preprocessing; text-layer extraction or layout-aware OCR; rules plus contextual NLP; normalisation; cross-document validation; evidence localisation; and review-routing signals.

Pipeline B may reuse deterministic components from A. Every run records component/model versions. Both definitions freeze before final evaluation.

### Pipeline C — optional

Pipeline B plus a selective document-VLM fallback for predefined difficult or low-confidence cases. It is not a minimum deliverable.

## 7. Evaluation protocol

### Primary outcome

Macro-averaged exact-match accuracy across required fields on the locked test set, comparing B with A on identical claim packages.

### Secondary outcomes

- Per-field exact-match accuracy
- Micro/macro precision, recall, and F1
- OCR character and word error rates where transcription exists
- Validation precision, recall, F1, and false-positive rate
- Evidence-localisation success rate
- Processing latency and failure rate
- UAT correction rate and review duration
- Reliability bins and, where supported, Brier score for confidence calibration

### Matching rules

- Identifiers: exact after declared deterministic normalisation.
- Dates: exact ISO-date match.
- Money: exact decimal equality after parsing and two-decimal quantisation; currency scored separately.
- Names: primary score exact after Unicode normalisation, whitespace collapse, and case folding. Fuzzy analysis is secondary and must state its threshold.
- Multi-value fields: set precision/recall/F1; order ignored unless explicitly evaluated.
- Missing prediction for present truth: false negative.
- Prediction for absent optional truth: false positive.
- Correctly absent optional values are tracked separately and do not inflate recall.

No scoring rule changes after final-test evaluation begins.

## 8. Dataset and leakage controls

Dataset v1 includes multiple providers, layouts, fonts, date/amount formats, and digital/scanned documents. Controlled degradation parameters must be recorded.

Split by template/provider family, not just file. Near-duplicate templates cannot cross into the final test set. Each case has a stable ID, version, split, source manifest, and ground truth.

Fix the sample-size target after a pilot measures cost, but before the final benchmark. Use at least 30 independent locked test packages with every evaluated condition represented. This minimum supports descriptive comparison but does not guarantee strong statistical power.

## 9. Statistical analysis

Comparisons are paired because both pipelines process the same cases. Report effect sizes and 95% bootstrap confidence intervals over claim packages. Pre-register an appropriate paired test before unlocking the test set. Do not generalise synthetic prototype results to clinical or insurer-wide performance.

## 10. Evidence and validation

Evidence succeeds when it identifies the correct page and source region. Freeze an Intersection-over-Union threshold, or a documented text-span adjudication rubric, during the pilot.

Initial validation rules:

- claimed amount versus invoice total;
- invoice total versus receipt amount;
- patient/member identity consistency;
- service date not later than invoice date;
- currency consistency.

The validation set contains consistent and deliberately inconsistent packages; every injected inconsistency has an expected warning in ground truth.

## 11. Human-study guardrails

Before UAT, record participant count, tasks, consent, captured data, exclusions, and ethics requirements. Use synthetic documents only. Do not present an uncontrolled timing exercise as causal proof.

## 12. Freeze points

1. Pilot: schema, annotation guide, pipelines, scoring.
2. Dataset: test IDs, hashes, truth, split manifest.
3. Evaluation: commit, dependencies, models, configuration, seeds, scripts.
4. Release: dissertation/demo tag and archived result bundle.

Amendments go in `docs/contract-amendments.md` with date, rationale, comparability impact, and rerun decision.
