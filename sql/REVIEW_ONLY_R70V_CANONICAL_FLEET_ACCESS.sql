-- REVIEW ONLY. Do not execute during r70V review.
-- Source: read-only live pg_get_functiondef export (Supabase query 64).
-- The guard aborts if the current live function differs from that reviewed export.
-- CREATE OR REPLACE preserves the existing function ACL; this file changes no
-- tables, lifecycle rows, device access rows, or grants.
-- Before separate approval, save a fresh pg_get_functiondef result for rollback
-- and verify the current zezms_has_business_role and owner-device fallback.

begin;

do $guard$
declare
  live_definition text := pg_get_functiondef(to_regprocedure('public.zezms_m5a4_canonical_fleet_read(uuid)'));
begin
  if live_definition is null or
     md5(regexp_replace(live_definition,'[[:space:]]+','','g')) <> '284281eed143763a166f33ac755f9197' then
    raise exception 'R70V_CANONICAL_FLEET_DEFINITION_DRIFT: stop and review the current live definition';
  end if;
end
$guard$;

create or replace function public.zezms_m5a4_canonical_fleet_read(p_business_id uuid)
returns table(
  lifecycle_id uuid,
  device_id text,
  device_name text,
  enrollment_mode text,
  lifecycle_state text,
  revision bigint,
  replaces_lifecycle_id uuid,
  replacement_lifecycle_id uuid,
  lifecycle_retired_at timestamptz,
  lifecycle_revoked_at timestamptz,
  last_seen_at timestamptz,
  verified_cursor bigint,
  queue_count integer,
  failed_count integer,
  app_version text,
  branch_id uuid,
  branch_name text,
  branch_code text,
  device_access_status text,
  device_access_revoked_at timestamptz,
  registered_device_status text,
  registered_device_revoked_at timestamptz,
  authentication_eligible boolean
)
language plpgsql security definer set search_path to '' as $function$
begin
  if auth.uid() is null then
    raise exception 'ZEZMS_AUTH_REQUIRED' using errcode='P0001';
  end if;
  if p_business_id is null or not public.zezms_has_business_role(p_business_id,array['OWNER','ADMIN']) then
    raise exception 'ZEZMS_PERMISSION_DENIED' using errcode='P0001';
  end if;

  return query
  select
    life.id,
    life.device_id,
    life.device_name,
    life.enrollment_mode,
    life.lifecycle_state,
    life.revision,
    life.replaces_lifecycle_id,
    life.replacement_lifecycle_id,
    life.retired_at,
    life.revoked_at,
    coalesce(registered_row.last_seen_at,access_row.last_seen_at,life.updated_at),
    life.verified_cursor,
    life.queue_count,
    life.failed_count,
    coalesce(nullif(registered_row.app_version,''),life.app_version,''),
    life.branch_id,
    branch.name,
    branch.code,
    case
      when access_row.device_id is null then 'MISSING'
      when access_row.status='ACTIVE' and access_row.revoked_at is null then 'ACTIVE'
      when access_row.revoked_at is not null then 'REVOKED'
      else coalesce(nullif(access_row.status,''),'UNKNOWN')
    end,
    access_row.revoked_at,
    case
      when registered_row.device_id is null then 'MISSING'
      when registered_row.revoked_at is null then 'REGISTERED'
      else 'REVOKED'
    end,
    registered_row.revoked_at,
    (
      life.lifecycle_state='ACTIVE'
      and registered_row.device_id is not null
      and registered_row.revoked_at is null
      and not exists (
        select 1
        from public.zezms_device_access revoked_access
        where revoked_access.business_id=life.business_id
          and revoked_access.device_id=life.device_id
          and (revoked_access.status='REVOKED' or revoked_access.revoked_at is not null)
      )
      and (
        (access_row.status='ACTIVE' and access_row.revoked_at is null)
        or (access_row.device_id is null and registered_row.user_id=life.owner_id)
      )
    )
  from public.zezms_device_lifecycle life
  left join lateral (
    select access_candidate.*
    from public.zezms_device_access access_candidate
    where access_candidate.business_id=life.business_id
      and access_candidate.device_id=life.device_id
    order by
      (access_candidate.status='ACTIVE' and access_candidate.revoked_at is null) desc,
      access_candidate.updated_at desc nulls last
    limit 1
  ) access_row on true
  left join lateral (
    select device_candidate.*
    from public.zezms_business_devices device_candidate
    where device_candidate.business_id=life.business_id
      and device_candidate.device_id=life.device_id
    order by (device_candidate.revoked_at is null) desc,device_candidate.updated_at desc nulls last
    limit 1
  ) registered_row on true
  left join public.zezms_branches branch
    on branch.id=life.branch_id and branch.business_id=life.business_id
  where life.business_id=p_business_id
  order by coalesce(registered_row.last_seen_at,access_row.last_seen_at,life.updated_at) desc,life.id;
end
$function$;

commit;
