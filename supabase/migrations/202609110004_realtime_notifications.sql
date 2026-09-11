create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  claim_id uuid references public.claims(id) on delete cascade,
  claim_reference text,
  source_event_id uuid references public.audit_events(id) on delete cascade,
  notification_type text not null check (notification_type in ('ACTION_REQUIRED','WORKFLOW_UPDATE','SUCCESS','WARNING')),
  title text not null check (char_length(trim(title)) between 2 and 160),
  message text not null check (char_length(trim(message)) between 2 and 1000),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (recipient_id, source_event_id)
);

create index notifications_recipient_unread_idx
  on public.notifications(recipient_id, created_at desc)
  where read_at is null;
create index notifications_recipient_created_idx
  on public.notifications(recipient_id, created_at desc);

alter table public.notifications enable row level security;

create policy "Users read own notifications"
on public.notifications for select to authenticated
using (
  recipient_id = (select auth.uid())
  and private.is_active_user()
);

revoke all on public.notifications from anon;
revoke insert, update, delete on public.notifications from authenticated;
grant select on public.notifications to authenticated;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications
  set read_at = coalesce(read_at, now())
  where id = p_notification_id
    and recipient_id = auth.uid();
$$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.notifications
  set read_at = now()
  where recipient_id = auth.uid()
    and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_notification_read(uuid) from public, anon;
revoke all on function public.mark_all_notifications_read() from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;

create or replace function private.create_notifications_from_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim public.claims%rowtype;
  v_deadline date;
begin
  if new.claim_id is null then
    return new;
  end if;

  select c.* into v_claim
  from public.claims c
  where c.id = new.claim_id;
  if v_claim.id is null then
    return new;
  end if;

  if new.event_type = 'INFORMATION_REQUESTED' and v_claim.client_id is not null then
    select r.response_deadline into v_deadline
    from public.claim_information_requests r
    where r.id::text = new.metadata->>'request_id';

    insert into public.notifications (
      recipient_id, claim_id, claim_reference, source_event_id,
      notification_type, title, message
    ) values (
      v_claim.client_id, v_claim.id, v_claim.reference, new.id,
      'ACTION_REQUIRED', 'Additional information required',
      case
        when v_deadline is not null then 'A Claims Officer needs more information for this claim. Please respond by ' || to_char(v_deadline, 'DD Mon YYYY') || '.'
        else 'A Claims Officer needs more information or supporting documents for this claim.'
      end
    ) on conflict (recipient_id, source_event_id) do nothing;

  elsif new.event_type = 'INFORMATION_RECEIVED' then
    insert into public.notifications (
      recipient_id, claim_id, claim_reference, source_event_id,
      notification_type, title, message
    )
    select recipient_id, v_claim.id, v_claim.reference, new.id,
      'ACTION_REQUIRED', 'Client response received',
      'The client has answered the information request. Review the response and supporting documents.'
    from (
      select v_claim.assigned_to as recipient_id
      union
      select r.requested_by
      from public.claim_information_requests r
      where r.id::text = new.metadata->>'request_id'
      union
      select p.id
      from public.profiles p
      where p.role in ('supervisor','administrator') and p.status = 'active'
    ) recipients
    where recipient_id is not null and recipient_id is distinct from new.actor_id
    on conflict (recipient_id, source_event_id) do nothing;

  elsif new.event_type = 'CLAIM_ASSIGNED' and v_claim.assigned_to is not null then
    insert into public.notifications (
      recipient_id, claim_id, claim_reference, source_event_id,
      notification_type, title, message
    ) values (
      v_claim.assigned_to, v_claim.id, v_claim.reference, new.id,
      'ACTION_REQUIRED', 'New claim assigned',
      'This claim has been assigned to you and is ready for your attention.'
    ) on conflict (recipient_id, source_event_id) do nothing;

  elsif new.event_type = 'PROCESSING_FAILED' then
    insert into public.notifications (
      recipient_id, claim_id, claim_reference, source_event_id,
      notification_type, title, message
    )
    select p.id, v_claim.id, v_claim.reference, new.id,
      'WARNING', 'Document processing failed',
      'Document processing needs attention. Open the claim to review the safe error and retry options.'
    from public.profiles p
    where p.status = 'active'
      and (p.id = v_claim.assigned_to or p.role = 'administrator')
      and p.id is distinct from new.actor_id
    on conflict (recipient_id, source_event_id) do nothing;

  elsif new.event_type = 'CLAIM_VERIFIED' then
    insert into public.notifications (
      recipient_id, claim_id, claim_reference, source_event_id,
      notification_type, title, message
    )
    select p.id, v_claim.id, v_claim.reference, new.id,
      'ACTION_REQUIRED', 'Claim ready for decision',
      'The evidence has been verified and is ready for an approval or rejection decision.'
    from public.profiles p
    where p.status = 'active'
      and p.role in ('supervisor','administrator')
      and p.id is distinct from new.actor_id
    on conflict (recipient_id, source_event_id) do nothing;

  elsif new.event_type in ('CLAIM_APPROVED','CLAIM_REJECTED','CLAIM_PAYMENT_PENDING','CLAIM_PAID')
    and v_claim.client_id is not null then
    insert into public.notifications (
      recipient_id, claim_id, claim_reference, source_event_id,
      notification_type, title, message
    ) values (
      v_claim.client_id, v_claim.id, v_claim.reference, new.id,
      case when new.event_type in ('CLAIM_APPROVED','CLAIM_PAID') then 'SUCCESS' else 'WORKFLOW_UPDATE' end,
      case new.event_type
        when 'CLAIM_APPROVED' then 'Claim approved'
        when 'CLAIM_REJECTED' then 'Claim decision available'
        when 'CLAIM_PAYMENT_PENDING' then 'Payment is being prepared'
        else 'Claim payment completed'
      end,
      case new.event_type
        when 'CLAIM_APPROVED' then 'Your claim has been approved. Open it to review the decision details.'
        when 'CLAIM_REJECTED' then 'A decision has been recorded for your claim. Open it to review the explanation.'
        when 'CLAIM_PAYMENT_PENDING' then 'Your approved claim has moved to payment processing.'
        else 'Payment for your approved claim has been recorded as complete.'
      end
    ) on conflict (recipient_id, source_event_id) do nothing;
  end if;

  return new;
end;
$$;

create trigger audit_event_create_notifications
after insert on public.audit_events
for each row execute function private.create_notifications_from_audit_event();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end;
$$;
