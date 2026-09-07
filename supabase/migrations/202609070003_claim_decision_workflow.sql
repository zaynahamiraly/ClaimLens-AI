create or replace function public.decide_claim(
  p_reference text,
  p_outcome text,
  p_notes text,
  p_approved_amount numeric default null
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
  v_claimed_amount numeric;
  v_outcome text := upper(trim(p_outcome));
begin
  if v_role not in ('administrator', 'supervisor') then
    raise exception 'Supervisor or administrator permission required';
  end if;
  if v_outcome not in ('APPROVED', 'REJECTED') then
    raise exception 'Invalid claim decision';
  end if;
  if p_notes is null or char_length(trim(p_notes)) < 5 or char_length(trim(p_notes)) > 2000 then
    raise exception 'Decision notes must contain between 5 and 2000 characters';
  end if;

  select id, claimed_amount into v_claim_id, v_claimed_amount
  from public.claims
  where reference = p_reference and status = 'VERIFIED'
  for update;

  if v_claim_id is null then
    raise exception 'Only a verified claim can receive a decision';
  end if;
  if v_outcome = 'APPROVED' and (
    p_approved_amount is null
    or p_approved_amount <= 0
    or (v_claimed_amount is not null and p_approved_amount > v_claimed_amount)
  ) then
    raise exception 'Approved amount must be positive and no greater than the claimed amount';
  end if;

  insert into public.claim_decisions (claim_id, decided_by, outcome, approved_amount, notes)
  values (
    v_claim_id,
    v_actor,
    v_outcome,
    case when v_outcome = 'APPROVED' then p_approved_amount else null end,
    trim(p_notes)
  );

  update public.claims
  set status = v_outcome::public.claim_status
  where id = v_claim_id;

  insert into public.audit_events (claim_id, actor_id, event_type, metadata)
  values (
    v_claim_id,
    v_actor,
    case when v_outcome = 'APPROVED' then 'CLAIM_APPROVED' else 'CLAIM_REJECTED' end,
    jsonb_build_object(
      'outcome', v_outcome,
      'approved_amount', case when v_outcome = 'APPROVED' then p_approved_amount else null end,
      'notes', trim(p_notes)
    )
  );
end;
$$;

create or replace function public.advance_claim_settlement(p_reference text, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.app_role := private.current_role();
  v_claim_id uuid;
  v_current_status public.claim_status;
  v_target text := upper(trim(p_status));
begin
  if v_role not in ('administrator', 'supervisor') then
    raise exception 'Supervisor or administrator permission required';
  end if;
  if v_target not in ('PAYMENT_PENDING', 'PAID') then
    raise exception 'Invalid settlement status';
  end if;

  select id, status into v_claim_id, v_current_status
  from public.claims
  where reference = p_reference
  for update;

  if v_claim_id is null
    or (v_target = 'PAYMENT_PENDING' and v_current_status <> 'APPROVED')
    or (v_target = 'PAID' and v_current_status <> 'PAYMENT_PENDING') then
    raise exception 'Invalid settlement transition';
  end if;

  update public.claims
  set status = v_target::public.claim_status
  where id = v_claim_id;

  insert into public.audit_events (claim_id, actor_id, event_type, metadata)
  values (
    v_claim_id,
    v_actor,
    case when v_target = 'PAYMENT_PENDING' then 'CLAIM_PAYMENT_PENDING' else 'CLAIM_PAID' end,
    jsonb_build_object('status', v_target)
  );
end;
$$;

revoke all on function public.decide_claim(text, text, text, numeric) from public, anon;
revoke all on function public.advance_claim_settlement(text, text) from public, anon;
grant execute on function public.decide_claim(text, text, text, numeric) to authenticated;
grant execute on function public.advance_claim_settlement(text, text) to authenticated;

-- All status changes now pass through validated functions. The workflow uses the
-- server-only secret key and therefore does not require a direct user UPDATE grant.
alter function public.verify_claim(text) security definer;
revoke update on public.claims from authenticated;
