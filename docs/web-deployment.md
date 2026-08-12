# ClaimLens Web Deployment

The web application is a Next.js 16 project in `apps/web`. It runs immediately in demo mode and uses Supabase when its public connection variables are configured.

## 1. Supabase

1. Create a Supabase project.
2. Open SQL Editor and run `supabase/migrations/202608120001_web_mvp.sql`.
3. In Authentication, create the claims-officer user (email/password).
4. Copy the project URL and publishable key from Project Settings → API.

The migration creates owner-scoped claims, document metadata, a private `claim-documents` bucket, file constraints, indexes, and row-level security policies. Do not expose a service-role key to the browser.

## 2. Vercel

1. Import `shuaib3011/ClaimLens-AI` in Vercel.
2. Set Root Directory to `apps/web`.
3. Keep the detected Next.js build settings.
4. Add these variables to Production, Preview, and Development:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
5. Deploy.

Without both variables, the application intentionally loads its synthetic demo workspace. With both variables, login, claims, and private uploads use Supabase.

## 3. Local verification

```powershell
cd apps\web
Copy-Item .env.example .env.local
# Replace the placeholder values in .env.local
npm install
npm run lint
npm run build
npm run dev
```

The current web MVP demonstrates the operational workflow and Pipeline A results. Running OCR in the cloud remains a separate worker integration; newly uploaded live claims enter `PROCESSING` and do not pretend to have completed AI results.
