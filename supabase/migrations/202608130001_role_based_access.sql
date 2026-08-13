create type public.app_role as enum ('client', 'claims_officer', 'supervisor', 'administrator');
create type public.profile_status as enum ('active', 'inactive');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 120),
  role public.app_role not null default 'client',
  status public.profile_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.profiles (id, display_name, role)
select
  u.id,
  coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''), split_part(coalesce(u.email, 'ClaimLens user'), '@', 1)),
  case
    when row_number() over (order by u.created_at, u.id) = 1 then 'administrator'::public.app_role
    when u.raw_app_meta_data ->> 'role' in ('client', 'claims_officer', 'supervisor', 'administrator')
      then (u.raw_app_meta_data ->> 'role')::public.app_role
    else 'client'::public.app_role
  end
from auth.users u
on conflict (id) do nothing;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(coalesce(new.email, 'ClaimLens user'), '@', 1)),
    'client'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists auth_user_profile_created on auth.users;
create trigger auth_user_profile_created
after insert on auth.users
for each row execute function private.handle_new_user();

create or replace function private.set_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_profile_updated_at();

alter table public.claims
  add column client_id uuid references public.profiles(id) on delete restrict,
  add column assigned_to uuid references public.profiles(id) on delete set null;

create index claims_client_id_idx on public.claims(client_id);
create index claims_assigned_to_status_idx on public.claims(assigned_to, status, created_at desc);

alter table public.audit_events alter column claim_id drop not null;
alter table public.audit_events add column subject_user_id uuid references auth.users(id) on delete set null;
alter table public.audit_events drop constraint if exists audit_events_event_type_check;
alter table public.audit_events add constraint audit_events_event_type_check check (event_type in (
  'CLAIM_CREATED','CLAIM_ASSIGNED','DOCUMENT_UPLOADED','PROCESSING_STARTED','PROCESSING_COMPLETED',
  'PROCESSING_FAILED','FIELD_CORRECTED','REVIEW_STARTED','CLAIM_VERIFIED',
  'USER_CREATED','USER_ROLE_CHANGED','USER_STATUS_CHANGED'
));
alter table public.audit_events add constraint audit_events_subject_check
  check (claim_id is not null or subject_user_id is not null);
create index audit_events_subject_user_idx on public.audit_events(subject_user_id, created_at desc);

alter table public.profiles enable row level security;

create or replace function private.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p
  where p.id = auth.uid() and p.status = 'active'
$$;

create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'active'
  )
$$;

create or replace function private.can_access_claim(p_claim_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.claims c
    where c.id = p_claim_id
      and private.is_active_user()
      and (
        private.current_role() in ('administrator', 'supervisor', 'claims_officer')
        or (private.current_role() = 'client' and (c.client_id = auth.uid() or c.created_by = auth.uid()))
      )
  )
$$;

grant usage on schema private to authenticated;
grant execute on function private.current_role() to authenticated;
grant execute on function private.is_active_user() to authenticated;
grant execute on function private.can_access_claim(uuid) to authenticated;

create policy "Users read permitted profiles"
on public.profiles for select to authenticated
using (
  private.is_active_user()
  and (id = (select auth.uid()) or private.current_role() in ('administrator', 'supervisor', 'claims_officer'))
);

drop policy if exists "Users read own claims" on public.claims;
drop policy if exists "Users create own claims" on public.claims;
drop policy if exists "Users update own claims" on public.claims;
drop policy if exists "Users delete incomplete own claims" on public.claims;

create policy "Role based claim read"
on public.claims for select to authenticated
using (
  private.is_active_user()
  and (
    private.current_role() in ('administrator', 'supervisor', 'claims_officer')
    or (private.current_role() = 'client' and (client_id = (select auth.uid()) or created_by = (select auth.uid())))
  )
);

create policy "Role based claim create"
on public.claims for insert to authenticated
with check (
  private.is_active_user()
  and created_by = (select auth.uid())
  and (
    private.current_role() in ('administrator', 'supervisor', 'claims_officer')
    or (private.current_role() = 'client' and client_id = (select auth.uid()))
  )
);

create policy "Assigned staff update claims"
on public.claims for update to authenticated
using (
  private.is_active_user()
  and (
    private.current_role() in ('administrator', 'supervisor')
    or (private.current_role() = 'claims_officer' and assigned_to = (select auth.uid()))
  )
)
with check (
  private.is_active_user()
  and (
    private.current_role() in ('administrator', 'supervisor')
    or (private.current_role() = 'claims_officer' and assigned_to = (select auth.uid()))
  )
);

create policy "Delete incomplete permitted claims"
on public.claims for delete to authenticated
using (
  private.is_active_user()
  and status in ('UPLOADED','PROCESSING','PROCESSING_FAILED')
  and (created_by = (select auth.uid()) or private.current_role() = 'administrator')
);

drop policy if exists "Users read own claim documents" on public.claim_documents;
drop policy if exists "Users create own claim documents" on public.claim_documents;

create policy "Role based document read"
on public.claim_documents for select to authenticated
using (private.can_access_claim(claim_id));

create policy "Role based document create"
on public.claim_documents for insert to authenticated
with check (
  private.is_active_user()
  and uploaded_by = (select auth.uid())
  and private.can_access_claim(claim_id)
);

drop policy if exists "Users read audit for own claims" on public.audit_events;
drop policy if exists "Users append audit for own claims" on public.audit_events;

create policy "Role based audit read"
on public.audit_events for select to authenticated
using (
  private.is_active_user()
  and (
    (claim_id is not null and private.can_access_claim(claim_id))
    or (subject_user_id is not null and private.current_role() = 'administrator')
  )
);

create policy "Role based audit append"
on public.audit_events for insert to authenticated
with check (
  private.is_active_user()
  and actor_id = (select auth.uid())
  and claim_id is not null
  and private.can_access_claim(claim_id)
);

drop policy if exists "Users read reviews for own claims" on public.claim_reviews;
drop policy if exists "Users create reviews for own claims" on public.claim_reviews;

create policy "Role based review read"
on public.claim_reviews for select to authenticated
using (private.can_access_claim(claim_id));

create policy "Review staff create reviews"
on public.claim_reviews for insert to authenticated
with check (
  private.current_role() in ('administrator', 'supervisor', 'claims_officer')
  and reviewer_id = (select auth.uid())
  and private.can_access_claim(claim_id)
);

drop policy if exists "Users read own files" on storage.objects;
drop policy if exists "Users upload to own folder" on storage.objects;
drop policy if exists "Users delete own stored files" on storage.objects;

create policy "Role based stored file read"
on storage.objects for select to authenticated
using (
  bucket_id = 'claim-documents'
  and exists (
    select 1 from public.claim_documents d
    where d.storage_path = name and private.can_access_claim(d.claim_id)
  )
);

create policy "Users upload to own claim folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'claim-documents'
  and private.is_active_user()
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Users delete permitted stored files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'claim-documents'
  and (
    owner_id = (select auth.uid()::text)
    or private.current_role() = 'administrator'
  )
);

create or replace function public.verify_claim(p_reference text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_claim_id uuid;
  v_reviewer_id uuid := auth.uid();
  v_role public.app_role := private.current_role();
begin
  if v_role not in ('administrator', 'supervisor', 'claims_officer') then
    raise exception 'Insufficient permission';
  end if;

  update public.claims
  set status = 'VERIFIED'
  where reference = p_reference
    and status = 'REVIEW_REQUIRED'
    and (v_role in ('administrator', 'supervisor') or assigned_to = v_reviewer_id)
  returning id into v_claim_id;

  if v_claim_id is null then
    raise exception 'Claim is not assigned or available for verification';
  end if;

  insert into public.claim_reviews (claim_id, reviewer_id, status, finished_at)
  values (v_claim_id, v_reviewer_id, 'VERIFIED', now());

  insert into public.audit_events (claim_id, actor_id, event_type)
  values (v_claim_id, v_reviewer_id, 'CLAIM_VERIFIED');
end;
$$;

create or replace function public.assign_claim(p_reference text, p_assignee uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.app_role := private.current_role();
  v_assignee uuid := coalesce(p_assignee, auth.uid());
  v_claim_id uuid;
begin
  if v_role not in ('administrator', 'supervisor', 'claims_officer') then
    raise exception 'Insufficient permission';
  end if;
  if v_role = 'claims_officer' and v_assignee <> v_actor then
    raise exception 'Claims officers may only assign work to themselves';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = v_assignee and p.role = 'claims_officer' and p.status = 'active'
  ) then
    raise exception 'Assignee must be an active claims officer';
  end if;

  update public.claims
  set assigned_to = v_assignee
  where reference = p_reference
    and (v_role in ('administrator', 'supervisor') or assigned_to is null)
  returning id into v_claim_id;

  if v_claim_id is null then
    raise exception 'Claim is not available for assignment';
  end if;

  insert into public.audit_events (claim_id, actor_id, event_type, metadata)
  values (v_claim_id, v_actor, 'CLAIM_ASSIGNED', jsonb_build_object('assigned_to', v_assignee));
end;
$$;

create or replace function public.admin_update_user_profile(
  p_user_id uuid,
  p_display_name text,
  p_role public.app_role,
  p_status public.profile_status,
  p_event_type text default 'USER_ROLE_CHANGED'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if private.current_role() <> 'administrator' then
    raise exception 'Administrator permission required';
  end if;
  if p_user_id = v_actor and (p_status = 'inactive' or p_role <> 'administrator') then
    raise exception 'Administrators cannot remove their own administrator access';
  end if;
  update public.profiles
  set display_name = trim(p_display_name), role = p_role, status = p_status
  where id = p_user_id;
  if not found then raise exception 'User profile not found'; end if;

  insert into public.audit_events (subject_user_id, actor_id, event_type, metadata)
  values (
    p_user_id,
    v_actor,
    case when p_event_type in ('USER_CREATED','USER_ROLE_CHANGED','USER_STATUS_CHANGED') then p_event_type else 'USER_ROLE_CHANGED' end,
    jsonb_build_object('role', p_role, 'status', p_status)
  );
end;
$$;

revoke all on function public.assign_claim(text, uuid) from public, anon;
revoke all on function public.admin_update_user_profile(uuid, text, public.app_role, public.profile_status, text) from public, anon;
grant execute on function public.assign_claim(text, uuid) to authenticated;
grant execute on function public.admin_update_user_profile(uuid, text, public.app_role, public.profile_status, text) to authenticated;

revoke all on public.profiles from anon;
grant select on public.profiles to authenticated;
