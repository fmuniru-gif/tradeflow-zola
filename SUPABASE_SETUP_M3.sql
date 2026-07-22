-- =============================================================
-- ZEZMS Cloud Sync M3 — Supabase database setup
-- Run this entire file once in Supabase Dashboard > SQL Editor.
-- =============================================================

create table if not exists public.zezms_sync_state (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);

alter table public.zezms_sync_state enable row level security;
alter table public.zezms_sync_state replica identity full;

-- Remove old copies so this script can be safely re-run.
drop policy if exists "ZEZMS owner can read sync state" on public.zezms_sync_state;
drop policy if exists "ZEZMS owner can insert sync state" on public.zezms_sync_state;
drop policy if exists "ZEZMS owner can update sync state" on public.zezms_sync_state;
drop policy if exists "ZEZMS owner can delete sync state" on public.zezms_sync_state;

create policy "ZEZMS owner can read sync state"
on public.zezms_sync_state
for select
to authenticated
using ((select auth.uid()) = owner_id);

create policy "ZEZMS owner can insert sync state"
on public.zezms_sync_state
for insert
to authenticated
with check ((select auth.uid()) = owner_id);

create policy "ZEZMS owner can update sync state"
on public.zezms_sync_state
for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy "ZEZMS owner can delete sync state"
on public.zezms_sync_state
for delete
to authenticated
using ((select auth.uid()) = owner_id);

revoke all on table public.zezms_sync_state from anon;
grant select, insert, update, delete on table public.zezms_sync_state to authenticated;

-- Atomic revision-checked upload. This prevents one device from
-- silently overwriting a newer cloud revision created by another device.
create or replace function public.zezms_sync_push(
  p_payload jsonb,
  p_expected_revision bigint,
  p_device_id text
)
returns table (
  owner_id uuid,
  revision bigint,
  updated_at timestamptz,
  updated_by text
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_current public.zezms_sync_state%rowtype;
begin
  if v_uid is null then
    raise exception 'ZEZMS_AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  select s.*
  into v_current
  from public.zezms_sync_state as s
  where s.owner_id = v_uid
  for update;

  if not found then
    if coalesce(p_expected_revision, 0) <> 0 then
      raise exception 'ZEZMS_SYNC_CONFLICT: cloud record was created by another device'
        using errcode = 'P0001';
    end if;

    insert into public.zezms_sync_state as s (
      owner_id, payload, revision, updated_at, updated_by
    ) values (
      v_uid, coalesce(p_payload, '{}'::jsonb), 1, now(), coalesce(p_device_id, '')
    );
  else
    if v_current.revision <> coalesce(p_expected_revision, 0) then
      raise exception 'ZEZMS_SYNC_CONFLICT: expected revision %, cloud revision %',
        coalesce(p_expected_revision, 0), v_current.revision
        using errcode = 'P0001';
    end if;

    update public.zezms_sync_state as s
    set payload = coalesce(p_payload, '{}'::jsonb),
        revision = s.revision + 1,
        updated_at = now(),
        updated_by = coalesce(p_device_id, '')
    where s.owner_id = v_uid;
  end if;

  return query
  select s.owner_id, s.revision, s.updated_at, s.updated_by
  from public.zezms_sync_state as s
  where s.owner_id = v_uid;
end;
$$;

revoke all on function public.zezms_sync_push(jsonb, bigint, text) from public;
revoke all on function public.zezms_sync_push(jsonb, bigint, text) from anon;
grant execute on function public.zezms_sync_push(jsonb, bigint, text) to authenticated;

-- Add the table to Supabase Realtime only when it is not already present.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'zezms_sync_state'
  ) then
    alter publication supabase_realtime add table public.zezms_sync_state;
  end if;
end $$;

-- Optional verification query:
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename = 'zezms_sync_state';
