# ClaimLens Web Deployment

The web application is a Next.js 16 project in `apps/web`. Production fails closed when Supabase is not configured. Synthetic demo data is available only when demo mode is explicitly enabled.

## 1. Supabase

1. Create a Supabase project.
2. Open SQL Editor and run these migrations in order:
   - `supabase/migrations/202608120001_web_mvp.sql`
   - `supabase/migrations/202608120002_production_hardening.sql`
   - `supabase/migrations/202608130001_role_based_access.sql`
3. In Authentication, create the first user. The role migration makes the first existing user the administrator; later sign-ups default to client.
4. Copy the project URL, publishable key, and server secret key from Project Settings > API.

The migrations create role-scoped claims, profiles, assignments, document and audit metadata, atomic human verification, a private `claim-documents` bucket, file constraints, indexes, and row-level security policies. The supported roles are client, claims officer, supervisor, and administrator. Do not expose the secret key to the browser.

## 2. Vercel

1. Import `zaynahamiraly/ClaimLens-AI` in Vercel.
2. Set Root Directory to `apps/web`.
3. Keep the detected Next.js build settings.
4. Add these public variables to Production, Preview, and Development:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `NEXT_PUBLIC_SITE_URL` (the canonical production URL)
   - `NEXT_PUBLIC_DEMO_MODE=false`
5. Add `SUPABASE_SECRET_KEY` as a sensitive server-only Production variable. It is required for administrator account provisioning and must never use a `NEXT_PUBLIC_` prefix.
6. Deploy.

In Supabase Authentication > URL Configuration, set the Site URL to the canonical production URL and allow the exact `/auth/callback` URL. Email confirmation is required for public client registration.

With both public Supabase variables, login, claims, and private uploads use Supabase. Without them, production displays a setup-required state instead of exposing a demo workspace.

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

The role-based web release demonstrates the operational workflow and Pipeline A results. Running OCR in the cloud remains a separate worker integration; newly uploaded live claims enter `PROCESSING` and do not pretend to have completed AI results.
