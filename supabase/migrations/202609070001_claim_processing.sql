create table public.claim_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  workflow_run_id text unique,
  status text not null default 'QUEUED' check (status in ('QUEUED','RUNNING','COMPLETED','FAILED')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text check (char_length(last_error) <= 1000),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index claim_processing_one_active_idx
on public.claim_processing_jobs(claim_id)
where status in ('QUEUED','RUNNING');
create index claim_processing_claim_created_idx on public.claim_processing_jobs(claim_id, created_at desc);

create table public.claim_extracted_fields (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  document_id uuid references public.claim_documents(id) on delete set null,
  field_name text not null check (char_length(field_name) between 1 and 80),
  raw_value text not null,
  normalized_value text not null,
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  extraction_method text not null,
  page_number integer not null default 1 check (page_number > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (claim_id, field_name)
);

alter table public.claim_processing_jobs enable row level security;
alter table public.claim_extracted_fields enable row level security;

create policy "Role based processing job read"
on public.claim_processing_jobs for select to authenticated
using (private.can_access_claim(claim_id));

create policy "Role based extracted field read"
on public.claim_extracted_fields for select to authenticated
using (private.can_access_claim(claim_id));

revoke all on public.claim_processing_jobs, public.claim_extracted_fields from anon;
grant select on public.claim_processing_jobs, public.claim_extracted_fields to authenticated;

create trigger claim_processing_jobs_set_updated_at
before update on public.claim_processing_jobs
for each row execute function private.set_updated_at();

create trigger claim_extracted_fields_set_updated_at
before update on public.claim_extracted_fields
for each row execute function private.set_updated_at();
