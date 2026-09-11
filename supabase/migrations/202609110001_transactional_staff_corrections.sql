create or replace function public.correct_claim_package(
  p_reference text,
  p_patient_name text,
  p_provider_name text,
  p_documents jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.app_role := private.current_role();
  v_claim_id uuid;
  v_assigned_to uuid;
  v_document_count integer;
  v_total numeric(12,2);
  v_currency char(3);
  v_previous_patient text;
  v_previous_provider text;
  v_previous_amount numeric(12,2);
  v_previous_currency char(3);
begin
  if v_role not in ('claims_officer', 'supervisor', 'administrator') then
    raise exception 'Staff review permission required';
  end if;
  if char_length(trim(p_patient_name)) < 2 or char_length(trim(p_provider_name)) < 2 then
    raise exception 'Patient and provider are required';
  end if;

  select c.id, c.assigned_to, c.patient_name, c.provider_name, c.claimed_amount, c.currency
  into v_claim_id, v_assigned_to, v_previous_patient, v_previous_provider, v_previous_amount, v_previous_currency
  from public.claims c
  where c.reference = p_reference and c.status = 'REVIEW_REQUIRED'
  for update;

  if v_claim_id is null then raise exception 'Claim is not available for correction'; end if;
  if v_role = 'claims_officer' and v_assigned_to is distinct from v_actor then
    raise exception 'Assign this claim to yourself before correcting it';
  end if;

  select count(*) into v_document_count from public.claim_documents d where d.claim_id = v_claim_id;
  if jsonb_typeof(p_documents) <> 'array' or jsonb_array_length(p_documents) <> v_document_count
    or (select count(distinct item->>'id') from jsonb_array_elements(p_documents) item) <> v_document_count then
    raise exception 'Review every uploaded document';
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
      include_in_total = (item->>'include')::boolean,
      extraction_status = case when (item->>'include')::boolean then 'COMPLETED' else d.extraction_status end
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

  update public.claims set
    patient_name = trim(p_patient_name), provider_name = trim(p_provider_name),
    claimed_amount = v_total, currency = v_currency
  where id = v_claim_id;

  insert into public.audit_events (claim_id, actor_id, event_type, metadata)
  values (v_claim_id, v_actor, 'FIELD_CORRECTED', jsonb_build_object(
    'field_name', 'claim_package',
    'previous_value', jsonb_build_object('patient_name', v_previous_patient, 'provider_name', v_previous_provider, 'amount', v_previous_amount, 'currency', v_previous_currency),
    'corrected_value', jsonb_build_object('patient_name', trim(p_patient_name), 'provider_name', trim(p_provider_name), 'amount', v_total, 'currency', v_currency),
    'document_count', v_document_count,
    'source', 'human_review'
  ));
end;
$$;

revoke all on function public.correct_claim_package(text, text, text, jsonb) from public, anon;
grant execute on function public.correct_claim_package(text, text, text, jsonb) to authenticated;
