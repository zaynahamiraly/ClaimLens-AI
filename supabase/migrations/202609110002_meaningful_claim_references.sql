create sequence if not exists public.claim_reference_seq start with 1 increment by 1;

create or replace function private.generate_claim_reference()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select 'CLM-'
    || to_char(current_timestamp at time zone 'Indian/Mauritius', 'YYYYMMDD')
    || '-'
    || lpad(nextval('public.claim_reference_seq')::text, 6, '0')
$$;

alter table public.claims
  alter column reference set default private.generate_claim_reference();

revoke all on sequence public.claim_reference_seq from public, anon, authenticated;
