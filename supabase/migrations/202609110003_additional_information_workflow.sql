alter type public.claim_status add value if not exists 'INFORMATION_REQUIRED';
alter type public.claim_status add value if not exists 'INFORMATION_RECEIVED';

create table public.claim_information_requests (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  requested_by uuid not null references auth.users(id),
  reason text not null check (char_length(trim(reason)) between 5 and 500),
  questions text not null check (char_length(trim(questions)) between 5 and 2000),
  required_documents text[] not null default '{}',
  response_deadline date,
  status text not null default 'OPEN' check (status in ('OPEN','RESPONDED','COMPLETED','CANCELLED')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  completed_at timestamptz
);

create unique index claim_information_one_open_idx
  on public.claim_information_requests(claim_id)
  where status = 'OPEN';
create index claim_information_claim_created_idx
  on public.claim_information_requests(claim_id, created_at desc);
create index claim_information_status_deadline_idx
  on public.claim_information_requests(status, response_deadline)
  where status = 'OPEN';

create table public.claim_information_responses (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.claim_information_requests(id) on delete cascade,
  submitted_by uuid not null references auth.users(id),
  response_text text not null default '' check (char_length(response_text) <= 2000),
  created_at timestamptz not null default now()
);

create table public.claim_information_internal_notes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.claim_information_requests(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  note text not null check (char_length(trim(note)) between 2 and 2000),
  created_at timestamptz not null default now()
);

alter table public.claim_documents
  add column information_request_id uuid references public.claim_information_requests(id) on delete set null;
create index claim_documents_information_request_idx
  on public.claim_documents(information_request_id)
  where information_request_id is not null;

create or replace function private.check_information_document_claim()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.information_request_id is not null and not exists (
    select 1 from public.claim_information_requests r
    where r.id = new.information_request_id and r.claim_id = new.claim_id
  ) then
    raise exception 'Information request does not belong to this claim';
  end if;
  return new;
end;
$$;

create trigger claim_documents_check_information_request
before insert or update of information_request_id, claim_id on public.claim_documents
for each row execute function private.check_information_document_claim();

alter table public.claim_information_requests enable row level security;
alter table public.claim_information_responses enable row level security;
alter table public.claim_information_internal_notes enable row level security;

create policy "Permitted users read information requests"
on public.claim_information_requests for select to authenticated
using (private.can_access_claim(claim_id));

create policy "Permitted users read information responses"
on public.claim_information_responses for select to authenticated
using (exists (
  select 1 from public.claim_information_requests r
  where r.id = request_id and private.can_access_claim(r.claim_id)
));

create policy "Staff read internal information notes"
on public.claim_information_internal_notes for select to authenticated
using (
  private.current_role() in ('claims_officer','supervisor','administrator')
  and exists (
    select 1 from public.claim_information_requests r
    where r.id = request_id and private.can_access_claim(r.claim_id)
  )
);

revoke all on public.claim_information_requests, public.claim_information_responses, public.claim_information_internal_notes from anon;
revoke insert, update, delete on public.claim_information_requests, public.claim_information_responses, public.claim_information_internal_notes from authenticated;
grant select on public.claim_information_requests, public.claim_information_responses to authenticated;
grant select on public.claim_information_internal_notes to authenticated;

create or replace function public.request_claim_information(
  p_reference text,
  p_reason text,
  p_questions text,
  p_required_documents text[] default '{}',
  p_response_deadline date default null,
  p_internal_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.app_role := private.current_role();
  v_claim public.claims%rowtype;
  v_request_id uuid;
begin
  if v_role not in ('claims_officer','supervisor','administrator') then
    raise exception 'Staff permission required';
  end if;
  if char_length(trim(p_reason)) not between 5 and 500
    or char_length(trim(p_questions)) not between 5 and 2000 then
    raise exception 'Enter a clear reason and request';
  end if;
  if p_response_deadline is not null
    and p_response_deadline < (now() at time zone 'Indian/Mauritius')::date then
    raise exception 'Response deadline cannot be in the past';
  end if;

  select c.* into v_claim from public.claims c
  where c.reference = p_reference
  for update;
  if v_claim.id is null or v_claim.client_id is null then
    raise exception 'A client-owned claim is required';
  end if;
  if v_claim.status <> 'REVIEW_REQUIRED'::public.claim_status then
    raise exception 'Additional information may only be requested during review';
  end if;
  if v_role = 'claims_officer' and v_claim.assigned_to is distinct from v_actor then
    raise exception 'Only the assigned Claims Officer may request information';
  end if;
  if exists (select 1 from public.claim_information_requests r where r.claim_id = v_claim.id and r.status = 'OPEN') then
    raise exception 'An information request is already open';
  end if;

  insert into public.claim_information_requests (
    claim_id, requested_by, reason, questions, required_documents, response_deadline
  ) values (
    v_claim.id, v_actor, trim(p_reason), trim(p_questions), coalesce(p_required_documents, '{}'), p_response_deadline
  ) returning id into v_request_id;

  if nullif(trim(coalesce(p_internal_note, '')), '') is not null then
    insert into public.claim_information_internal_notes (request_id, author_id, note)
    values (v_request_id, v_actor, trim(p_internal_note));
  end if;

  update public.claims
  set status = 'INFORMATION_REQUIRED'::public.claim_status
  where id = v_claim.id;

  insert into public.audit_events (claim_id, actor_id, event_type, metadata)
  values (
    v_claim.id,
    v_actor,
    'INFORMATION_REQUESTED',
    jsonb_build_object(
      'request_id', v_request_id,
      'reason', trim(p_reason),
      'required_documents', coalesce(p_required_documents, '{}'),
      'response_deadline', p_response_deadline
    )
  );
  return v_request_id;
end;
$$;

create or replace function public.submit_claim_information(
  p_reference text,
  p_request_id uuid,
  p_response_text text,
  p_document_count integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_request public.claim_information_requests%rowtype;
  v_claim public.claims%rowtype;
  v_actual_documents integer;
begin
  if private.current_role() <> 'client' then
    raise exception 'Client permission required';
  end if;
  select r.* into v_request from public.claim_information_requests r
  where r.id = p_request_id
  for update;
  if v_request.id is null or v_request.status <> 'OPEN' then
    raise exception 'This information request is no longer open';
  end if;
  select c.* into v_claim from public.claims c
  where c.id = v_request.claim_id and c.reference = p_reference
  for update;
  if v_claim.id is null or v_claim.client_id is distinct from v_actor
    or v_claim.status <> 'INFORMATION_REQUIRED'::public.claim_status then
    raise exception 'This claim is not available for your response';
  end if;
  select count(*) into v_actual_documents from public.claim_documents d
  where d.claim_id = v_claim.id
    and d.information_request_id = v_request.id
    and d.uploaded_by = v_actor;
  if v_actual_documents <> greatest(coalesce(p_document_count, 0), 0) then
    raise exception 'The uploaded document count does not match';
  end if;
  if v_actual_documents = 0 and char_length(trim(coalesce(p_response_text, ''))) < 2 then
    raise exception 'Provide an answer or at least one document';
  end if;
  if char_length(coalesce(p_response_text, '')) > 2000 then
    raise exception 'Response is too long';
  end if;

  insert into public.claim_information_responses (request_id, submitted_by, response_text)
  values (v_request.id, v_actor, trim(coalesce(p_response_text, '')));
  update public.claim_information_requests
  set status = case when v_actual_documents = 0 then 'COMPLETED' else 'RESPONDED' end,
      responded_at = now(),
      completed_at = case when v_actual_documents = 0 then now() else null end
  where id = v_request.id;
  update public.claims
  set status = case
    when v_actual_documents = 0 then 'REVIEW_REQUIRED'::public.claim_status
    else 'INFORMATION_RECEIVED'::public.claim_status
  end
  where id = v_claim.id;
  insert into public.audit_events (claim_id, actor_id, event_type, metadata)
  values (
    v_claim.id,
    v_actor,
    'INFORMATION_RECEIVED',
    jsonb_build_object('request_id', v_request.id, 'document_count', v_actual_documents)
  );
  if v_actual_documents = 0 then
    insert into public.audit_events (claim_id, actor_id, event_type, metadata)
    values (
      v_claim.id,
      v_actor,
      'INFORMATION_PROCESSED',
      jsonb_build_object('request_id', v_request.id, 'returned_to_review', true)
    );
  end if;
end;
$$;

alter table public.audit_events drop constraint if exists audit_events_event_type_check;
alter table public.audit_events add constraint audit_events_event_type_check check (event_type in (
  'CLAIM_CREATED','CLAIM_SUBMITTED','CLAIM_ASSIGNED','DOCUMENT_UPLOADED','PROCESSING_STARTED','PROCESSING_COMPLETED',
  'PROCESSING_FAILED','FIELD_CORRECTED','REVIEW_STARTED','CLAIM_VERIFIED',
  'CLAIM_APPROVED','CLAIM_REJECTED','CLAIM_PAYMENT_PENDING','CLAIM_PAID',
  'INFORMATION_REQUESTED','INFORMATION_RECEIVED','INFORMATION_PROCESSED',
  'USER_CREATED','USER_ROLE_CHANGED','USER_STATUS_CHANGED','USER_PASSWORD_RESET','USER_DELETED'
));

revoke all on function public.request_claim_information(text, text, text, text[], date, text) from public, anon;
revoke all on function public.submit_claim_information(text, uuid, text, integer) from public, anon;
grant execute on function public.request_claim_information(text, text, text, text[], date, text) to authenticated;
grant execute on function public.submit_claim_information(text, uuid, text, integer) to authenticated;
