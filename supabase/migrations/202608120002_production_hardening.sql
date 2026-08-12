create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  event_type text not null check (event_type in (
    'CLAIM_CREATED','DOCUMENT_UPLOADED','PROCESSING_STARTED','PROCESSING_COMPLETED',
    'PROCESSING_FAILED','FIELD_CORRECTED','REVIEW_STARTED','CLAIM_VERIFIED'
  )),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.claim_reviews (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id),
  status text not null check (status in ('IN_PROGRESS','VERIFIED','REJECTED')),
  comments text check (char_length(comments) <= 2000),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists claims_status_created_at_idx on public.claims(status, created_at desc);
create index if not exists audit_events_claim_created_at_idx on public.audit_events(claim_id, created_at desc);
create index if not exists claim_reviews_claim_created_at_idx on public.claim_reviews(claim_id, created_at desc);

alter table public.audit_events enable row level security;
alter table public.claim_reviews enable row level security;

create policy "Users read audit for own claims"
on public.audit_events for select to authenticated
using (exists (
  select 1 from public.claims c
  where c.id = claim_id and c.created_by = (select auth.uid())
));

create policy "Users append audit for own claims"
on public.audit_events for insert to authenticated
with check (
  actor_id = (select auth.uid()) and exists (
    select 1 from public.claims c
    where c.id = claim_id and c.created_by = (select auth.uid())
  )
);

create policy "Users read reviews for own claims"
on public.claim_reviews for select to authenticated
using (exists (
  select 1 from public.claims c
  where c.id = claim_id and c.created_by = (select auth.uid())
));

create policy "Users create reviews for own claims"
on public.claim_reviews for insert to authenticated
with check (
  reviewer_id = (select auth.uid()) and exists (
    select 1 from public.claims c
    where c.id = claim_id and c.created_by = (select auth.uid())
  )
);

create policy "Users delete incomplete own claims"
on public.claims for delete to authenticated
using (
  created_by = (select auth.uid())
  and status in ('UPLOADED','PROCESSING','PROCESSING_FAILED')
);

create policy "Users delete own stored files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'claim-documents'
  and owner_id = (select auth.uid()::text)
);

revoke all on public.claims, public.claim_documents, public.audit_events, public.claim_reviews from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.claims to authenticated;
grant select, insert on public.claim_documents to authenticated;
grant select, insert on public.audit_events to authenticated;
grant select, insert on public.claim_reviews to authenticated;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists claims_set_updated_at on public.claims;
create trigger claims_set_updated_at
before update on public.claims
for each row execute function private.set_updated_at();

create or replace function public.verify_claim(p_reference text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_claim_id uuid;
  v_reviewer_id uuid := auth.uid();
begin
  if v_reviewer_id is null then
    raise exception 'Authentication required';
  end if;

  update public.claims
  set status = 'VERIFIED'
  where reference = p_reference
    and created_by = v_reviewer_id
    and status = 'REVIEW_REQUIRED'
  returning id into v_claim_id;

  if v_claim_id is null then
    raise exception 'Claim is not available for verification';
  end if;

  insert into public.claim_reviews (claim_id, reviewer_id, status, finished_at)
  values (v_claim_id, v_reviewer_id, 'VERIFIED', now());

  insert into public.audit_events (claim_id, actor_id, event_type)
  values (v_claim_id, v_reviewer_id, 'CLAIM_VERIFIED');
end;
$$;

revoke all on function public.verify_claim(text) from public, anon;
grant execute on function public.verify_claim(text) to authenticated;
