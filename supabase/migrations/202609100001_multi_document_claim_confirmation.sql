-- Preserve document-level OCR evidence and require the client to confirm a package
-- before it enters the staff review workflow.

alter table public.claim_documents
  drop constraint if exists claim_documents_document_type_check;

alter table public.claim_documents
  add constraint claim_documents_document_type_check check (document_type in (
    'CLAIM_FORM','INVOICE','RECEIPT','PHARMACY_RECEIPT','MEDICAL_MEMO',
    'PRESCRIPTION','MEDICAL_CERTIFICATE','SUPPORTING_DOCUMENT','UNKNOWN'
  )),
  add column if not exists extracted_amount numeric(12,2),
  add column if not exists extracted_currency char(3),
  add column if not exists confirmed_amount numeric(12,2),
  add column if not exists confirmed_currency char(3),
  add column if not exists amount_confidence numeric(5,4) check (amount_confidence between 0 and 1),
  add column if not exists include_in_total boolean not null default false,
  add column if not exists duplicate_of uuid references public.claim_documents(id) on delete set null,
  add column if not exists extraction_status text not null default 'PENDING'
    check (extraction_status in ('PENDING','COMPLETED','NEEDS_CONFIRMATION','FAILED')),
  add column if not exists extraction_notes text check (char_length(extraction_notes) <= 500),
  add column if not exists extracted_at timestamptz;

alter table public.claim_extracted_fields
  drop constraint if exists claim_extracted_fields_claim_id_field_name_key;

create unique index if not exists claim_extracted_fields_document_field_idx
  on public.claim_extracted_fields(claim_id, document_id, field_name)
  where document_id is not null;

drop policy if exists "Clients confirm own claim documents" on public.claim_documents;
create policy "Clients confirm own claim documents"
on public.claim_documents for update to authenticated
using (
  private.is_active_user()
  and exists (
    select 1 from public.claims c
    where c.id = claim_id
      and c.status = 'UPLOADED'
      and c.client_id = (select auth.uid())
  )
)
with check (
  private.is_active_user()
  and exists (
    select 1 from public.claims c
    where c.id = claim_id
      and c.status = 'UPLOADED'
      and c.client_id = (select auth.uid())
  )
);

drop policy if exists "Clients confirm own extracted claims" on public.claims;
create policy "Clients confirm own extracted claims"
on public.claims for update to authenticated
using (
  private.is_active_user()
  and private.current_role() = 'client'
  and client_id = (select auth.uid())
  and status = 'UPLOADED'
)
with check (
  private.is_active_user()
  and private.current_role() = 'client'
  and client_id = (select auth.uid())
  and status in ('REVIEW_REQUIRED','VERIFIED')
);

grant update on public.claim_documents to authenticated;

alter table public.audit_events drop constraint if exists audit_events_event_type_check;
alter table public.audit_events add constraint audit_events_event_type_check check (event_type in (
  'CLAIM_CREATED','CLAIM_SUBMITTED','CLAIM_ASSIGNED','DOCUMENT_UPLOADED','PROCESSING_STARTED','PROCESSING_COMPLETED',
  'PROCESSING_FAILED','FIELD_CORRECTED','REVIEW_STARTED','CLAIM_VERIFIED',
  'CLAIM_APPROVED','CLAIM_REJECTED','CLAIM_PAYMENT_PENDING','CLAIM_PAID',
  'USER_CREATED','USER_ROLE_CHANGED','USER_STATUS_CHANGED','USER_PASSWORD_RESET','USER_DELETED'
));

create or replace function public.confirm_claim(
  p_reference text,
  p_patient_name text,
  p_provider_name text,
  p_documents jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_claim_id uuid;
  v_document_count integer;
  v_total numeric(12,2);
  v_currency char(3);
  v_high_confidence boolean;
  v_status public.claim_status;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if char_length(trim(p_patient_name)) < 2 or char_length(trim(p_provider_name)) < 2 then
    raise exception 'Patient and provider are required';
  end if;

  select c.id into v_claim_id
  from public.claims c
  where c.reference = p_reference
    and c.client_id = v_actor
    and c.status = 'UPLOADED'
  for update;
  if v_claim_id is null then raise exception 'Claim is not available for confirmation'; end if;

  select count(*) into v_document_count from public.claim_documents d where d.claim_id = v_claim_id;
  if jsonb_typeof(p_documents) <> 'array' or jsonb_array_length(p_documents) <> v_document_count
    or (select count(distinct item->>'id') from jsonb_array_elements(p_documents) item) <> v_document_count then
    raise exception 'Confirm every uploaded document';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_documents) item
    where not exists (
      select 1 from public.claim_documents d
      where d.id = (item->>'id')::uuid and d.claim_id = v_claim_id
    )
  ) then raise exception 'Invalid claim document'; end if;

  update public.claim_documents d
  set confirmed_amount = case when (item->>'include')::boolean then (item->>'amount')::numeric else null end,
      confirmed_currency = case when (item->>'include')::boolean then upper(item->>'currency')::char(3) else null end,
      include_in_total = (item->>'include')::boolean
  from jsonb_array_elements(p_documents) item
  where d.id = (item->>'id')::uuid and d.claim_id = v_claim_id;

  if not exists (
    select 1 from public.claim_documents d
    where d.claim_id = v_claim_id and d.include_in_total and d.confirmed_amount > 0
  ) then raise exception 'Include at least one document with a valid amount'; end if;
  if exists (
    select 1 from public.claim_documents d
    where d.claim_id = v_claim_id and d.include_in_total
      and (d.confirmed_amount is null or d.confirmed_amount <= 0 or d.confirmed_currency is null)
  ) then raise exception 'Every included document needs an amount and currency'; end if;
  if (select count(distinct d.confirmed_currency) from public.claim_documents d where d.claim_id = v_claim_id and d.include_in_total) <> 1 then
    raise exception 'A claim cannot combine different currencies';
  end if;

  select sum(d.confirmed_amount), min(d.confirmed_currency)
  into v_total, v_currency
  from public.claim_documents d where d.claim_id = v_claim_id and d.include_in_total;

  select
    not exists (
      select 1 from public.claim_documents d
      where d.claim_id = v_claim_id and d.include_in_total
        and (d.duplicate_of is not null or d.amount_confidence <= 0.85
          or d.extracted_amount is distinct from d.confirmed_amount
          or d.extracted_currency is distinct from d.confirmed_currency)
    )
    and exists (
      select 1 from public.claim_extracted_fields f
      where f.claim_id = v_claim_id and f.field_name = 'patient_name'
        and f.confidence > 0.85 and lower(trim(f.normalized_value)) = lower(trim(p_patient_name))
    )
    and (select count(distinct lower(trim(f.normalized_value))) from public.claim_extracted_fields f where f.claim_id = v_claim_id and f.field_name = 'patient_name') = 1
    and (select count(distinct lower(trim(f.normalized_value))) from public.claim_extracted_fields f where f.claim_id = v_claim_id and f.field_name = 'provider_name') = 1
    and exists (
      select 1 from public.claim_extracted_fields f
      where f.claim_id = v_claim_id and f.field_name = 'provider_name'
        and f.confidence > 0.85 and lower(trim(f.normalized_value)) = lower(trim(p_provider_name))
    )
    and exists (
      select 1 from public.claim_extracted_fields f
      where f.claim_id = v_claim_id and f.field_name = 'service_date' and f.confidence > 0.85
    )
  into v_high_confidence;

  v_status := case when v_high_confidence then 'VERIFIED'::public.claim_status else 'REVIEW_REQUIRED'::public.claim_status end;
  update public.claims set
    patient_name = trim(p_patient_name), provider_name = trim(p_provider_name),
    claimed_amount = v_total, currency = v_currency, status = v_status
  where id = v_claim_id;

  insert into public.audit_events (claim_id, actor_id, event_type, metadata)
  values (v_claim_id, v_actor, 'CLAIM_SUBMITTED', jsonb_build_object(
    'document_count', v_document_count, 'claimed_amount', v_total,
    'currency', v_currency, 'auto_verified', v_high_confidence
  ));
  if v_high_confidence then
    insert into public.audit_events (claim_id, actor_id, event_type, metadata)
    values (v_claim_id, v_actor, 'CLAIM_VERIFIED', jsonb_build_object('auto_verified', true, 'threshold', 0.85));
  end if;
  return v_status::text;
end;
$$;

revoke all on function public.confirm_claim(text, text, text, jsonb) from public, anon;
grant execute on function public.confirm_claim(text, text, text, jsonb) to authenticated;
