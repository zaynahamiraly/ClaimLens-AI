# Flutter migration architecture

## Repository finding

The repository inspection found that the original production application was not using a Python SQLAlchemy/Alembic API. The working source of truth was:

- `apps/web`: Next.js production frontend and server actions;
- `supabase/migrations`: PostgreSQL schema, RLS, roles, audit events, private storage metadata, and transactional RPC functions;
- `apps/web/workflows/claim-processing.ts`: deployed TypeScript document workflow;
- `apps/web/lib/local-ocr.ts`: Tesseract.js/PDF OCR path;
- `apps/web/lib/extraction-rules.ts`: deterministic document classification and field rules;
- `experiments/pipeline_a`: Python research baseline;
- `services/api`: a FastAPI health-check foundation only.

There were no SQLAlchemy models, Alembic migrations, FastAPI login/claims routes, PaddleOCR implementation, or spaCy pipeline to preserve. ClaimLens therefore keeps Supabase PostgreSQL as the one authoritative database and expands the existing FastAPI service into a thin mobile gateway instead of inventing a second schema.

## Resulting runtime

```text
Flutter mobile app
  -> FastAPI JSON/multipart API
      -> Supabase Auth (login/refresh/logout)
      -> Supabase PostgreSQL REST/RPC under existing RLS
      -> private Supabase Storage
      -> PyMuPDF/DOCX text extraction
      -> OpenCV preprocessing + Tesseract OCR
      -> transparent Regex/rule field extraction
      -> existing confirm_claim PostgreSQL transaction
```

The web application remains in `apps/web` and can continue operating as the deployed prototype. The mobile implementation does not delete, move, or silently fork its data model.

## Trust boundaries

1. Flutter stores only access/refresh tokens in platform secure storage.
2. Flutter never receives the Supabase server secret.
3. FastAPI validates the access token with Supabase Auth and loads the active profile.
4. Ordinary reads/writes use the user's JWT, so existing RLS applies.
5. The server secret is used only by the processing worker for tables that clients cannot directly mutate.
6. Claim confirmation calls the existing `confirm_claim` RPC, which checks ownership, every document, positive values, one currency, and the guarded 85% automation rule in one transaction.

## API contract

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/v1/health` | Service health |
| `POST` | `/api/v1/auth/login` | Supabase password sign-in |
| `POST` | `/api/v1/auth/refresh` | Refresh an expired access token |
| `POST` | `/api/v1/auth/logout` | Revoke the session |
| `GET` | `/api/v1/profile` | Active user's profile and role |
| `GET` | `/api/v1/claims/dashboard` | Live role-scoped counts and recent claims |
| `GET` | `/api/v1/claims` | Role-scoped list with search/status filters |
| `POST` | `/api/v1/claims` | Create a claim and upload all documents |
| `GET` | `/api/v1/claims/{reference}` | Claim, documents, extracted fields, signed URLs, audit |
| `POST` | `/api/v1/claims/{reference}/process` | Run server-side extraction for every document |
| `POST` | `/api/v1/claims/{reference}/confirm` | Confirm values through the PostgreSQL RPC |

## Extraction behavior

- Digital PDFs use embedded text through PyMuPDF.
- Scanned PDFs render pages before OCR.
- PNG/JPEG input is decoded and preprocessed with OpenCV (grayscale, denoising, adaptive thresholding), then read with Tesseract.
- DOCX paragraphs and tables are read with `python-docx`.
- Classification and field extraction are a Python port of the already implemented transparent TypeScript rules.
- Each document keeps its own type, fields, amount, currency, confidence, extraction status, and notes.
- SHA-256-identical files are marked as duplicates and excluded from the proposed total.
- No invoice is mandatory. Receipts, pharmacy documents, medical memos, prescriptions, certificates, claim forms, and supporting evidence remain valid package members.
- The client chooses payable documents and corrects values. PostgreSQL calculates the final multi-document total.

## Dissertation explanation

Provider was selected because the state graph is small and easy to explain: `AuthProvider` owns session/user state and `ClaimsProvider` owns dashboard/list state. Network logic is centralized in services. Screens render state and collect human corrections; they do not implement OCR or business rules.

The confidence shown in Flutter is evidence-level extraction confidence. It is not presented as a calibrated probability of claim correctness. The existing database function allows automatic verification only when all required identity/date/amount checks exceed 85%, agree across documents, and the client has not altered them.

## Known boundaries

- Flutter SDK was unavailable on the implementation machine, so `flutter analyze`, `flutter test`, and native Android/iOS runner generation must be completed on a Flutter workstation.
- Tesseract is a separate system executable. `pytesseract` requires it on `PATH` or in `TESSERACT_CMD`.
- The supplied FastAPI Dockerfile installs English and French Tesseract data for a reproducible server deployment.
- Handwriting remains difficult for local Tesseract. Manual confirmation is deliberately available for every field.
- The existing web workflow remains independent; do not process the same newly created claim from web and mobile simultaneously.
- This is an academic prototype. Use synthetic/de-identified documents unless an approved health-data governance arrangement exists.
