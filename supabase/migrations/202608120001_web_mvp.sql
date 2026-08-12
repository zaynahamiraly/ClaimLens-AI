create extension if not exists pgcrypto;

create type public.claim_status as enum ('UPLOADED','PROCESSING','REVIEW_REQUIRED','VERIFIED','PROCESSING_FAILED');
create table public.claims (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,
  created_by uuid not null references auth.users(id),
  patient_name text not null,
  provider_name text not null,
  claimed_amount numeric(12,2),
  currency char(3) not null default 'MUR',
  status public.claim_status not null default 'UPLOADED',
  warning_count integer not null default 0 check (warning_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index claims_created_by_idx on public.claims(created_by);
create index claims_created_at_idx on public.claims(created_at desc);

create table public.claim_documents (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id),
  document_type text not null check (document_type in ('CLAIM_FORM','INVOICE','RECEIPT','SUPPORTING_DOCUMENT','UNKNOWN')),
  original_name text not null,
  storage_path text unique not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now()
);
create index claim_documents_claim_id_idx on public.claim_documents(claim_id);

alter table public.claims enable row level security;
alter table public.claim_documents enable row level security;
create policy "Users read own claims" on public.claims for select to authenticated using (created_by = (select auth.uid()));
create policy "Users create own claims" on public.claims for insert to authenticated with check (created_by = (select auth.uid()));
create policy "Users update own claims" on public.claims for update to authenticated using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));
create policy "Users read own claim documents" on public.claim_documents for select to authenticated using (uploaded_by = (select auth.uid()));
create policy "Users create own claim documents" on public.claim_documents for insert to authenticated with check (uploaded_by = (select auth.uid()) and exists (select 1 from public.claims c where c.id = claim_id and c.created_by = (select auth.uid())));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('claim-documents','claim-documents',false,10485760,array['application/pdf','image/png','image/jpeg'])
on conflict (id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
create policy "Users upload to own folder" on storage.objects for insert to authenticated with check (bucket_id='claim-documents' and (storage.foldername(name))[1]=(select auth.uid()::text));
create policy "Users read own files" on storage.objects for select to authenticated using (bucket_id='claim-documents' and owner_id=(select auth.uid()::text));
