-- =====================================================================
-- ZEZMS Cloud Sync M4 — Transaction-Level Merging Upgrade
-- Run this entire file ONCE in Supabase Dashboard > SQL Editor.
-- It upgrades the existing M3 project without deleting the M3 snapshot.
-- =====================================================================

-- Extend the existing M3 snapshot table so it can act as a compact
-- baseline for new devices. All later changes are stored as operations.
alter table public.zezms_sync_state
  add column if not exists operation_cursor bigint not null default 0,
  add column if not exists sync_mode text not null default 'snapshot';

-- Append-only, idempotent transaction operation log.
create table if not exists public.zezms_sync_operations (
  seq bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  op_id text not null,
  device_id text not null,
  device_seq bigint not null default 0,
  kind text not null default 'DATABASE_CHANGE',
  payload jsonb not null,
  client_created_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_id, op_id)
);

create index if not exists zezms_sync_operations_owner_seq_idx
  on public.zezms_sync_operations (owner_id, seq);

alter table public.zezms_sync_operations enable row level security;
alter table public.zezms_sync_operations replica identity full;

drop policy if exists "ZEZMS owner can read operations" on public.zezms_sync_operations;
drop policy if exists "ZEZMS owner can insert operations" on public.zezms_sync_operations;

create policy "ZEZMS owner can read operations"
on public.zezms_sync_operations
for select
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

-- Inserts are accepted only through the validated security-definer RPC below.
revoke all on table public.zezms_sync_operations from anon;
revoke all on table public.zezms_sync_operations from authenticated;
grant select on table public.zezms_sync_operations to authenticated;

-- Server-side counters protect shared stock and cash from concurrent
-- deductions that would make an available balance negative.
create table if not exists public.zezms_sync_counters (
  owner_id uuid not null references auth.users(id) on delete cascade,
  collection text not null,
  entity_key text not null,
  field_name text not null,
  value numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (owner_id, collection, entity_key, field_name)
);

alter table public.zezms_sync_counters enable row level security;

drop policy if exists "ZEZMS owner can read counters" on public.zezms_sync_counters;
create policy "ZEZMS owner can read counters"
on public.zezms_sync_counters
for select
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

revoke all on table public.zezms_sync_counters from anon;
grant select on table public.zezms_sync_counters to authenticated;

-- ---------------------------------------------------------------------
-- Bootstrap / compact baseline.
-- The main device calls this after all devices have been upgraded.
-- It stores one complete master snapshot and seeds guarded counters.
-- Existing operation rows are retained but the snapshot cursor makes
-- all older rows part of the compact baseline.
-- ---------------------------------------------------------------------
create or replace function public.zezms_ops_bootstrap(
  p_payload jsonb,
  p_device_id text
)
returns table (
  operation_cursor bigint,
  revision bigint,
  updated_at timestamptz,
  updated_by text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cursor bigint := 0;
  v_revision bigint := 1;
  v_now timestamptz := now();
  v_item jsonb;
  v_key text;
  v_wallet record;
begin
  if v_uid is null then
    raise exception 'ZEZMS_AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'ZEZMS_INVALID_MASTER' using errcode = 'P0001';
  end if;

  select coalesce(max(o.seq), 0)
    into v_cursor
  from public.zezms_sync_operations as o
  where o.owner_id = v_uid;

  insert into public.zezms_sync_state as s (
    owner_id, payload, revision, updated_at, updated_by,
    operation_cursor, sync_mode
  ) values (
    v_uid, p_payload, 1, v_now, coalesce(p_device_id, ''),
    v_cursor, 'operations'
  )
  on conflict (owner_id) do update
    set payload = excluded.payload,
        revision = s.revision + 1,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by,
        operation_cursor = excluded.operation_cursor,
        sync_mode = 'operations'
  returning s.revision into v_revision;

  delete from public.zezms_sync_counters as c where c.owner_id = v_uid;

  -- Seed remaining-stock counters for every FIFO stock row.
  for v_item in
    select value from jsonb_array_elements(coalesce(p_payload->'stockRows', '[]'::jsonb))
  loop
    v_key := coalesce(v_item->>'id', v_item->>'_syncId', '');
    if v_key <> '' then
      insert into public.zezms_sync_counters (
        owner_id, collection, entity_key, field_name, value, updated_at
      ) values (
        v_uid, 'stockRows', v_key, 'rStock',
        coalesce((v_item->>'rStock')::numeric, 0), v_now
      )
      on conflict (owner_id, collection, entity_key, field_name)
      do update set value = excluded.value, updated_at = excluded.updated_at;
    end if;
  end loop;

  -- Seed cash wallet counters so two devices cannot concurrently deduct
  -- more cash than is available in one wallet.
  for v_wallet in
    select key, value
    from jsonb_each_text(coalesce(p_payload->'cashBalances', '{}'::jsonb))
  loop
    insert into public.zezms_sync_counters (
      owner_id, collection, entity_key, field_name, value, updated_at
    ) values (
      v_uid, 'cashBalances', v_wallet.key, 'value',
      coalesce(v_wallet.value::numeric, 0), v_now
    )
    on conflict (owner_id, collection, entity_key, field_name)
    do update set value = excluded.value, updated_at = excluded.updated_at;
  end loop;

  return query select v_cursor, v_revision, v_now, coalesce(p_device_id, '');
end;
$$;

revoke all on function public.zezms_ops_bootstrap(jsonb, text) from public;
revoke all on function public.zezms_ops_bootstrap(jsonb, text) from anon;
grant execute on function public.zezms_ops_bootstrap(jsonb, text) to authenticated;

-- ---------------------------------------------------------------------
-- Idempotent atomic operation upload.
-- Each operation is accepted once. Stock and cash delta guards are
-- checked in the same database transaction before the operation is
-- inserted, preventing two devices from spending one balance twice.
-- ---------------------------------------------------------------------
create or replace function public.zezms_ops_push(
  p_operations jsonb
)
returns table (
  op_id text,
  server_seq bigint,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_operation jsonb;
  v_patch jsonb;
  v_change jsonb;
  v_existing public.zezms_sync_operations%rowtype;
  v_inserted public.zezms_sync_operations%rowtype;
  v_op_id text;
  v_device_id text;
  v_collection text;
  v_entity_key text;
  v_root text;
  v_root_key text;
  v_delta numeric;
  v_next numeric;
  v_initial numeric;
begin
  if v_uid is null then
    raise exception 'ZEZMS_AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  if p_operations is null or jsonb_typeof(p_operations) <> 'array' then
    raise exception 'ZEZMS_INVALID_OPERATION_BATCH' using errcode = 'P0001';
  end if;

  for v_operation in select value from jsonb_array_elements(p_operations)
  loop
    v_op_id := coalesce(v_operation->>'opId', '');
    v_device_id := coalesce(v_operation->>'deviceId', '');

    if v_op_id = '' or v_device_id = '' then
      raise exception 'ZEZMS_INVALID_OPERATION' using errcode = 'P0001';
    end if;

    select o.* into v_existing
    from public.zezms_sync_operations as o
    where o.owner_id = v_uid and o.op_id = v_op_id;

    if found then
      op_id := v_existing.op_id;
      server_seq := v_existing.seq;
      created_at := v_existing.created_at;
      return next;
      continue;
    end if;

    for v_patch in
      select value from jsonb_array_elements(coalesce(v_operation->'patches', '[]'::jsonb))
    loop
      v_collection := coalesce(v_patch->>'collection', '');
      v_entity_key := coalesce(v_patch->>'key', '');

      -- New stock row: seed its available-quantity guard.
      if v_patch->>'action' = 'insert' and v_collection = 'stockRows' then
        v_initial := coalesce((v_patch->'value'->>'rStock')::numeric, 0);
        if v_initial < 0 then
          raise exception 'ZEZMS_STOCK_CONFLICT: new stock row % has negative remaining quantity', v_entity_key
            using errcode = 'P0001';
        end if;
        select c.value into v_next
        from public.zezms_sync_counters as c
        where c.owner_id = v_uid
          and c.collection = 'stockRows'
          and c.entity_key = v_entity_key
          and c.field_name = 'rStock';
        if found then
          raise exception 'ZEZMS_ID_CONFLICT: stock row ID % already exists', v_entity_key
            using errcode = 'P0001';
        end if;
        insert into public.zezms_sync_counters (
          owner_id, collection, entity_key, field_name, value, updated_at
        ) values (
          v_uid, 'stockRows', v_entity_key, 'rStock', v_initial, now()
        );
      end if;

      -- Stock row update: apply the rStock delta atomically and reject
      -- the complete operation if it would produce negative stock.
      if v_patch->>'action' = 'update' and v_collection = 'stockRows' then
        for v_change in
          select value from jsonb_array_elements(coalesce(v_patch->'changes', '[]'::jsonb))
        loop
          if v_change->>'field' = 'rStock' and v_change->>'mode' = 'delta' then
            v_delta := coalesce((v_change->>'value')::numeric, 0);
            update public.zezms_sync_counters as c
              set value = c.value + v_delta,
                  updated_at = now()
              where c.owner_id = v_uid
                and c.collection = 'stockRows'
                and c.entity_key = v_entity_key
                and c.field_name = 'rStock'
              returning c.value into v_next;

            if not found then
              raise exception 'ZEZMS_COUNTER_MISSING: stock row %', v_entity_key
                using errcode = 'P0001';
            end if;
            if v_next < 0 then
              raise exception 'ZEZMS_STOCK_CONFLICT: stock row % has insufficient remaining quantity', v_entity_key
                using errcode = 'P0001';
            end if;
          end if;
        end loop;
      end if;

      if v_patch->>'action' = 'delete' and v_collection = 'stockRows' then
        delete from public.zezms_sync_counters as c
        where c.owner_id = v_uid
          and c.collection = 'stockRows'
          and c.entity_key = v_entity_key;
      end if;

      -- Cash wallet delta guard.
      if v_patch->>'action' = 'root-object'
         and v_patch->>'root' = 'cashBalances'
         and v_patch->>'mode' = 'delta' then
        v_root := 'cashBalances';
        v_root_key := coalesce(v_patch->>'key', '');
        v_delta := coalesce((v_patch->>'value')::numeric, 0);

        update public.zezms_sync_counters as c
          set value = c.value + v_delta,
              updated_at = now()
          where c.owner_id = v_uid
            and c.collection = v_root
            and c.entity_key = v_root_key
            and c.field_name = 'value'
          returning c.value into v_next;

        if not found then
          insert into public.zezms_sync_counters (
            owner_id, collection, entity_key, field_name, value, updated_at
          ) values (
            v_uid, v_root, v_root_key, 'value', v_delta, now()
          )
          returning value into v_next;
        end if;

        if v_next < 0 then
          raise exception 'ZEZMS_CASH_CONFLICT: wallet % has insufficient balance', v_root_key
            using errcode = 'P0001';
        end if;
      end if;
    end loop;

    insert into public.zezms_sync_operations as o (
      owner_id, op_id, device_id, device_seq, kind, payload,
      client_created_at, created_at
    ) values (
      v_uid,
      v_op_id,
      v_device_id,
      coalesce((v_operation->>'deviceSeq')::bigint, 0),
      coalesce(v_operation->>'kind', 'DATABASE_CHANGE'),
      v_operation,
      nullif(v_operation->>'createdAt', '')::timestamptz,
      now()
    )
    returning o.* into v_inserted;

    update public.zezms_sync_state as s
      set revision = s.revision + 1,
          updated_at = v_inserted.created_at,
          updated_by = v_device_id,
          sync_mode = 'operations'
      where s.owner_id = v_uid;

    op_id := v_inserted.op_id;
    server_seq := v_inserted.seq;
    created_at := v_inserted.created_at;
    return next;
  end loop;
end;
$$;

revoke all on function public.zezms_ops_push(jsonb) from public;
revoke all on function public.zezms_ops_push(jsonb) from anon;
grant execute on function public.zezms_ops_push(jsonb) to authenticated;

-- Add the operation log to Supabase Realtime if needed.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'zezms_sync_operations'
  ) then
    alter publication supabase_realtime add table public.zezms_sync_operations;
  end if;
end $$;

-- Verification: both M3 snapshot and M4 operation tables should appear.
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in ('zezms_sync_state', 'zezms_sync_operations')
order by tablename;
