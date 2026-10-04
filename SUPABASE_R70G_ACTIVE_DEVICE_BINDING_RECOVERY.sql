-- ZEZMS TradeFlow v3.31.7 / r70G
-- Active-device binding recovery only.  Do not run until the r70G static
-- application is deployed and the Owner intentionally authorizes reconnect.
-- This file does not alter M4/3 operations, checkpoints, branch data-plane,
-- or any business collection.

begin;

create or replace function public.zezms_m5a4_reconnect_active_device(
  p_device_id text,
  p_new_device_user_id uuid
)
returns table(
  lifecycle_id uuid,
  owner_id uuid,
  business_id uuid,
  branch_id uuid,
  device_id text,
  pairing_id uuid,
  lifecycle_state text,
  device_status text,
  device_user_id uuid,
  revision bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_life public.zezms_device_lifecycle%rowtype;
  v_access public.zezms_device_access%rowtype;
  v_target_is_anonymous boolean := false;
begin
  if v_actor is null then
    raise exception 'ZEZMS_AUTH_REQUIRED' using errcode='P0001';
  end if;
  if coalesce(auth.jwt()->>'aal','aal1') <> 'aal2' then
    raise exception 'ZEZMS_AAL2_REQUIRED' using errcode='P0001';
  end if;
  if coalesce(pg_catalog.btrim(p_device_id),'') = '' then
    raise exception 'ZEZMS_DEVICE_ID_REQUIRED' using errcode='P0001';
  end if;
  if p_new_device_user_id is null or p_new_device_user_id = v_actor then
    raise exception 'ZEZMS_RECONNECT_ANONYMOUS_IDENTITY_REQUIRED' using errcode='P0001';
  end if;

  /* Only a newly-created anonymous device identity may receive this existing
     binding. An Owner cannot attach another permanent account by ID. */
  select (
    coalesce(u.raw_app_meta_data->>'provider','') = 'anonymous'
    or coalesce(u.raw_app_meta_data->'providers' ? 'anonymous',false)
    or lower(coalesce(u.raw_user_meta_data->>'is_anonymous','false')) = 'true'
  ) into v_target_is_anonymous
  from auth.users u
  where u.id = p_new_device_user_id;
  if not coalesce(v_target_is_anonymous,false) then
    raise exception 'ZEZMS_RECONNECT_ANONYMOUS_IDENTITY_REQUIRED' using errcode='P0001';
  end if;

  select * into v_life
  from public.zezms_device_lifecycle life
  where life.device_id = pg_catalog.btrim(p_device_id)
  for update;
  if not found then
    raise exception 'ZEZMS_ACTIVE_DEVICE_BINDING_NOT_FOUND' using errcode='P0001';
  end if;
  if v_life.lifecycle_state in ('RETIRED','REVOKED') then
    raise exception 'ZEZMS_ACTIVE_DEVICE_RECONNECT_REJECTED' using errcode='P0001';
  end if;
  if v_life.lifecycle_state <> 'ACTIVE' then
    raise exception 'ZEZMS_ACTIVE_DEVICE_NOT_ACTIVE' using errcode='P0001';
  end if;
  if not public.zezms_has_business_role(v_life.business_id,array['OWNER','ADMIN']) then
    raise exception 'ZEZMS_PERMISSION_DENIED' using errcode='P0001';
  end if;
  if v_life.branch_id is null or not exists (
    select 1 from public.zezms_branches branch
    where branch.id=v_life.branch_id and branch.business_id=v_life.business_id and branch.status='ACTIVE'
  ) then
    raise exception 'ZEZMS_ACTIVE_DEVICE_BRANCH_UNVERIFIED' using errcode='P0001';
  end if;
  if not exists (
    select 1 from public.zezms_businesses business
    where business.id=v_life.business_id and business.status='ACTIVE'
  ) then
    raise exception 'ZEZMS_ACTIVE_DEVICE_BUSINESS_UNVERIFIED' using errcode='P0001';
  end if;

  select * into v_access
  from public.zezms_device_access access_row
  where access_row.business_id=v_life.business_id
    and access_row.device_id=v_life.device_id
    and access_row.status='ACTIVE'
    and access_row.revoked_at is null
  for update;
  if not found then
    raise exception 'ZEZMS_ACTIVE_DEVICE_ACCESS_NOT_FOUND' using errcode='P0001';
  end if;
  if v_access.owner_id is distinct from v_life.owner_id
     or v_access.branch_id is distinct from v_life.branch_id then
    raise exception 'ZEZMS_ACTIVE_DEVICE_BINDING_MISMATCH' using errcode='P0001';
  end if;
  if not exists (
    select 1 from public.zezms_business_devices device_row
    where device_row.business_id=v_life.business_id
      and device_row.device_id=v_life.device_id
      and device_row.revoked_at is null
  ) then
    raise exception 'ZEZMS_ACTIVE_DEVICE_REGISTER_NOT_FOUND' using errcode='P0001';
  end if;
  /* A repeated, already-completed Owner-approved reconnect is read-only.
     It must not create another audit event or advance the lifecycle revision. */
  if v_access.device_user_id=p_new_device_user_id
     and v_life.device_user_id=p_new_device_user_id
     and exists (
       select 1 from public.zezms_business_devices device_row
       where device_row.business_id=v_life.business_id
         and device_row.device_id=v_life.device_id
         and device_row.user_id=p_new_device_user_id
         and device_row.revoked_at is null
     ) then
    return query select v_life.id,v_life.owner_id,v_life.business_id,v_life.branch_id,
      v_life.device_id,v_life.pairing_id,v_life.lifecycle_state,v_life.lifecycle_state,
      v_life.device_user_id,v_life.revision;
    return;
  end if;
  if exists (
    select 1 from public.zezms_device_access other_access
    where other_access.device_user_id=p_new_device_user_id
      and other_access.status='ACTIVE'
      and other_access.revoked_at is null
      and (other_access.business_id<>v_life.business_id or other_access.device_id<>v_life.device_id)
  ) then
    raise exception 'ZEZMS_DEVICE_IDENTITY_ALREADY_BOUND' using errcode='P0001';
  end if;

  /* Existing lifecycle and device ID are retained. Only the authorized device
     identity/control-plane records change; no business row is written. */
  update public.zezms_device_access as access_row
     set device_user_id=p_new_device_user_id,
         updated_at=pg_catalog.now(),
         last_seen_at=pg_catalog.now(),
         metadata=coalesce(access_row.metadata,'{}'::jsonb)
           || jsonb_build_object('r70g_reconnected_at',pg_catalog.now(),'r70g_reconnected_by',v_actor)
   where access_row.business_id=v_life.business_id and access_row.device_id=v_life.device_id
     and access_row.status='ACTIVE' and access_row.revoked_at is null;

  update public.zezms_business_devices as device_row
     set user_id=p_new_device_user_id,
         updated_at=pg_catalog.now(),
         last_seen_at=pg_catalog.now(),
         metadata=coalesce(device_row.metadata,'{}'::jsonb)
           || jsonb_build_object('access_mode','PAIRED_ANONYMOUS','r70g_reconnected_at',pg_catalog.now())
   where device_row.business_id=v_life.business_id and device_row.device_id=v_life.device_id and device_row.revoked_at is null;

  update public.zezms_device_lifecycle as life
     set device_user_id=p_new_device_user_id,
         revision=life.revision+1,
         updated_at=pg_catalog.now()
   where life.id=v_life.id
   returning life.* into v_life;

  insert into public.zezms_business_audit_events(
    business_id,actor_user_id,device_id,event_type,entity_type,entity_id,payload
  ) values (
    v_life.business_id,v_actor,v_life.device_id,'ACTIVE_DEVICE_RECONNECTED',
    'DEVICE_LIFECYCLE',v_life.id::text,
    jsonb_build_object('previous_device_user_id',v_access.device_user_id,'new_device_user_id',p_new_device_user_id,'r70g',true)
  );

  return query select v_life.id,v_life.owner_id,v_life.business_id,v_life.branch_id,
    v_life.device_id,v_life.pairing_id,v_life.lifecycle_state,v_life.lifecycle_state,
    v_life.device_user_id,v_life.revision;
end
$function$;

revoke all on function public.zezms_m5a4_reconnect_active_device(text,uuid) from public,anon;
grant execute on function public.zezms_m5a4_reconnect_active_device(text,uuid) to authenticated,postgres,service_role;

commit;
