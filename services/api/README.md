# ClaimLens AI FastAPI mobile gateway

This service is the server-side boundary for the Flutter client. It reuses Supabase Auth, PostgreSQL/RLS, private Storage, and the existing `confirm_claim` RPC. OCR and extraction run here, never on the phone.

## Local setup

From the repository root:

```powershell
Copy-Item services\api\.env.example services\api\.env
Set-Location services\api
..\..\.venv\Scripts\python -m pip install -r requirements-dev.txt
..\..\.venv\Scripts\python -m uvicorn app.main:app --reload
```

Fill the copied `.env` with the same Supabase project URL/publishable key used by the web app and its server-only secret key. A real `.env` is ignored by Git.

Install [Tesseract OCR](https://github.com/tesseract-ocr/tesseract) on Windows and either add it to `PATH` or set `TESSERACT_CMD`. Digital PDF and DOCX text extraction works without the executable, but scanned PDFs and images require it.

Open `http://127.0.0.1:8000/docs` for the interactive API contract.

## Docker

The Docker image includes English and French Tesseract language data:

```powershell
docker build -t claimlens-api services/api
docker run --env-file services/api/.env -p 8000:8000 claimlens-api
```

The first command builds the OCR-capable image; the second starts it with local environment values. Use a managed secret store rather than an env file in production.

## Tests

```powershell
Set-Location services\api
..\..\.venv\Scripts\python -m pytest -q
```

The current tests cover service health, authentication protection, file signatures, document classification, currency/amount parsing, and receipt total ranking. Live Supabase login/upload tests require a configured disposable test account and are intentionally not run against production users.
