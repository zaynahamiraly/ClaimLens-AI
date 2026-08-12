# ClaimLens Web Deployment

The web application is a Next.js 16 project in `apps/web`. Production fails closed when Supabase is not configured. Synthetic demo data is available only when demo mode is explicitly enabled.

## 1. Supabase

1. Create a Supabase project.
2. Open SQL Editor and run these migrations in order:
   - `supabase/migrations/202608120001_web_mvp.sql`
   - `supabase/migrations/202608120002_production_hardening.sql`
3. In Authentication, create the claims-officer user (email/password).
4. Copy the project URL and publishable key from Project Settings → API.

The migrations create owner-scoped claims, document and audit metadata, atomic human verification, a private `claim-documents` bucket, file constraints, indexes, and row-level security policies. Do not expose a service-role key to the browser.

## 2. Vercel

1. Import `shuaib3011/ClaimLens-AI` in Vercel.
2. Set Root Directory to `apps/web`.
3. Keep the detected Next.js build settings.
4. Add these variables to Production, Preview, and Development:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `NEXT_PUBLIC_DEMO_MODE=false`
5. Deploy.

With both Supabase variables, login, claims, and private uploads use Supabase. Without them, production displays a setup-required state instead of exposing a demo workspace.

## 3. Local verification

```powershell
cd apps\web
Copy-Item .env.example .env.local
# Replace the placeholder values in .env.local
npm install
npm run check
npm run dev
```

For a synthetic local walkthrough without Supabase, set `NEXT_PUBLIC_DEMO_MODE=true` in `.env.local`. Never enable it in Production.

The current web MVP demonstrates the operational workflow and Pipeline A results. Running OCR in the cloud remains a separate worker integration; newly uploaded live claims enter `PROCESSING` and do not pretend to have completed AI results.
