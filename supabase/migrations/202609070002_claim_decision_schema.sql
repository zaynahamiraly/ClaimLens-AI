alter type public.claim_status add value if not exists 'APPROVED';
alter type public.claim_status add value if not exists 'REJECTED';
alter type public.claim_status add value if not exists 'PAYMENT_PENDING';
alter type public.claim_status add value if not exists 'PAID';

create table public.claim_decisions (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null unique references public.claims(id) on delete cascade,
  decided_by uuid not null references auth.users(id),
  outcome text not null check (outcome in ('APPROVED','REJECTED')),
  approved_amount numeric(12,2) check (approved_amount is null or approved_amount > 0),
  notes text not null check (char_length(trim(notes)) between 5 and 2000),
  decided_at timestamptz not null default now(),
  check (
    (outcome = 'APPROVED' and approved_amount is not null)
    or (outcome <> 'APPROVED' and approved_amount is null)
  )
);

create index claim_decisions_decided_at_idx on public.claim_decisions(decided_at desc);

alter table public.claim_decisions enable row level security;

create policy "Role based claim decision read"
on public.claim_decisions for select to authenticated
using (private.can_access_claim(claim_id));

revoke all on public.claim_decisions from anon;
grant select on public.claim_decisions to authenticated;

alter table public.audit_events drop constraint if exists audit_events_event_type_check;
alter table public.audit_events add constraint audit_events_event_type_check check (event_type in (
  'CLAIM_CREATED','CLAIM_ASSIGNED','DOCUMENT_UPLOADED','PROCESSING_STARTED','PROCESSING_COMPLETED',
  'PROCESSING_FAILED','FIELD_CORRECTED','REVIEW_STARTED','CLAIM_VERIFIED',
  'CLAIM_APPROVED','CLAIM_REJECTED','CLAIM_PAYMENT_PENDING','CLAIM_PAID',
  'USER_CREATED','USER_ROLE_CHANGED','USER_STATUS_CHANGED'
));
