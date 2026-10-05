-- ZEZMS TradeFlow v3.31.8 / r70H
-- Source only. Do NOT execute automatically. This narrowly scoped control-plane
-- patch is required for owner-authorized active-device selection and for the
-- normal authenticated presence path to persist current version metadata.
-- It creates no lifecycle, pairing, business operation or business-data row.

begin;

create or replace function public.zezms_m5a4_recovery_active_fleet(p_business_id uuid)
returns jsonb language plpgsql SECURITY DEFINER set search_path to '' as $function$
declare v_actor uuid:=auth.uid(); v_result jsonb;
begin
  if v_actor is null then raise exception 'ZEZMS_AUTH_REQUIRED' using errcode='P0001'; end if;
  if p_business_id is null or not public.zezms_has_business_role(p_business_id,array['OWNER','ADMIN']) then raise exception 'ZEZMS_PERMISSION_DENIED' using errcode='P0001'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'lifecycle_id',life.id,'owner_id',life.owner_id,'business_id',life.business_id,
    'branch_id',life.branch_id,'branch_name',branch.name,'branch_code',branch.code,
    'device_id',life.device_id,'device_name',life.device_name,'device_user_id',coalesce(access_row.device_user_id,life.device_user_id,device_row.user_id),'pairing_id',life.pairing_id,
    'lifecycle_state',life.lifecycle_state,'enrollment_mode',life.enrollment_mode,
    'mode',case when access_row.device_user_id is not null then 'PAIRED' else 'OWNER' end,
    'app_version',coalesce(device_row.app_version,life.app_version,''),
    'last_seen_at',coalesce(device_row.last_seen_at,life.updated_at),
    'platform',coalesce(device_row.platform,life.platform,'')
  ) order by coalesce(device_row.last_seen_at,life.updated_at) desc),'[]'::jsonb) into v_result
  from public.zezms_device_lifecycle life
  join public.zezms_business_devices device_row on device_row.business_id=life.business_id and device_row.device_id=life.device_id and device_row.revoked_at is null
  left join public.zezms_device_access access_row on access_row.business_id=life.business_id and access_row.device_id=life.device_id and access_row.status='ACTIVE' and access_row.revoked_at is null
  left join public.zezms_branches branch on branch.id=life.branch_id and branch.business_id=life.business_id and branch.status='ACTIVE'
  where life.business_id=p_business_id and life.lifecycle_state='ACTIVE'
    and (access_row.device_user_id is not null or device_row.user_id=life.owner_id);
  return v_result;
end $function$;

/* Self-binding is intentionally narrower than the Owner fleet reader: it has
   no caller-controlled device or lifecycle argument and returns at most the
   one ACTIVE PAIRED record which already belongs to auth.uid(). */
create or replace function public.zezms_m5a4_my_active_device_binding()
returns jsonb language plpgsql SECURITY DEFINER set search_path to '' as $function$
declare v_actor uuid:=auth.uid(); v_count integer:=0; v_result jsonb;
begin
  if v_actor is null then raise exception 'ZEZMS_AUTH_REQUIRED' using errcode='P0001'; end if;
  select count(*) into v_count
  from public.zezms_device_access access_row
  join public.zezms_device_lifecycle life on life.business_id=access_row.business_id and life.device_id=access_row.device_id
  join public.zezms_business_devices device_row on device_row.business_id=life.business_id and device_row.device_id=life.device_id
  join public.zezms_businesses business on business.id=life.business_id and business.status='ACTIVE'
  join public.zezms_branches branch on branch.id=life.branch_id and branch.business_id=life.business_id and branch.status='ACTIVE'
  where access_row.device_user_id=v_actor and access_row.status='ACTIVE' and access_row.revoked_at is null
    and life.lifecycle_state='ACTIVE' and life.device_user_id=v_actor
    and device_row.revoked_at is null and device_row.user_id=v_actor
    and access_row.owner_id=life.owner_id and access_row.branch_id=life.branch_id;
  if v_count=0 then raise exception 'ZEZMS_ACTIVE_DEVICE_SELF_BINDING_NOT_FOUND' using errcode='P0001'; end if;
  if v_count<>1 then raise exception 'ZEZMS_ACTIVE_DEVICE_SELF_BINDING_AMBIGUOUS' using errcode='P0001'; end if;
  select jsonb_build_object(
    'lifecycle_id',life.id,'owner_id',life.owner_id,'business_id',life.business_id,
    'branch_id',life.branch_id,'branch_name',branch.name,'branch_code',branch.code,
    'device_id',life.device_id,'device_name',life.device_name,'device_user_id',access_row.device_user_id,
    'pairing_id',life.pairing_id,'lifecycle_state',life.lifecycle_state,'device_status',life.lifecycle_state,
    'mode','PAIRED','app_version',coalesce(device_row.app_version,life.app_version,''),
    'last_seen_at',coalesce(device_row.last_seen_at,life.updated_at)
  ) into v_result
  from public.zezms_device_access access_row
  join public.zezms_device_lifecycle life on life.business_id=access_row.business_id and life.device_id=access_row.device_id
  join public.zezms_business_devices device_row on device_row.business_id=life.business_id and device_row.device_id=life.device_id
  join public.zezms_businesses business on business.id=life.business_id and business.status='ACTIVE'
  join public.zezms_branches branch on branch.id=life.branch_id and branch.business_id=life.business_id and branch.status='ACTIVE'
  where access_row.device_user_id=v_actor and access_row.status='ACTIVE' and access_row.revoked_at is null
    and life.lifecycle_state='ACTIVE' and life.device_user_id=v_actor
    and device_row.revoked_at is null and device_row.user_id=v_actor
    and access_row.owner_id=life.owner_id and access_row.branch_id=life.branch_id;
  return v_result;
end $function$;

create or replace function public.zezms_m5a4_owner_relink_active_device(p_business_id uuid,p_lifecycle_id uuid)
returns jsonb language plpgsql SECURITY DEFINER set search_path to '' as $function$
declare v_actor uuid:=auth.uid(); v_life public.zezms_device_lifecycle%rowtype; v_access public.zezms_device_access%rowtype; v_branch record; v_has_access boolean:=false; v_has_paired boolean:=false;
begin
  if v_actor is null then raise exception 'ZEZMS_AUTH_REQUIRED' using errcode='P0001'; end if;
  if coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then raise exception 'ZEZMS_AAL2_REQUIRED' using errcode='P0001'; end if;
  if p_business_id is null or p_lifecycle_id is null or not public.zezms_has_business_role(p_business_id,array['OWNER','ADMIN']) then raise exception 'ZEZMS_PERMISSION_DENIED' using errcode='P0001'; end if;
  select * into v_life from public.zezms_device_lifecycle life where life.id=p_lifecycle_id and life.business_id=p_business_id for update;
  if not found then raise exception 'ZEZMS_ACTIVE_DEVICE_BINDING_NOT_FOUND' using errcode='P0001'; end if;
  if v_life.lifecycle_state in ('RETIRED','REVOKED') then raise exception 'ZEZMS_ACTIVE_DEVICE_RELINK_REJECTED' using errcode='P0001'; end if;
  if v_life.lifecycle_state<>'ACTIVE' then raise exception 'ZEZMS_ACTIVE_DEVICE_NOT_ACTIVE' using errcode='P0001'; end if;
  if not exists(select 1 from public.zezms_businesses business where business.id=v_life.business_id and business.status='ACTIVE') then raise exception 'ZEZMS_ACTIVE_DEVICE_BUSINESS_UNVERIFIED' using errcode='P0001'; end if;
  select branch.id,branch.name,branch.code into v_branch from public.zezms_branches branch where branch.id=v_life.branch_id and branch.business_id=v_life.business_id and branch.status='ACTIVE';
  if not found then raise exception 'ZEZMS_ACTIVE_DEVICE_BRANCH_UNVERIFIED' using errcode='P0001'; end if;
  if not exists(select 1 from public.zezms_business_devices device_row where device_row.business_id=v_life.business_id and device_row.device_id=v_life.device_id and device_row.revoked_at is null) then raise exception 'ZEZMS_ACTIVE_DEVICE_REGISTER_NOT_FOUND' using errcode='P0001'; end if;
  select * into v_access from public.zezms_device_access access_row where access_row.business_id=v_life.business_id and access_row.device_id=v_life.device_id and access_row.status='ACTIVE' and access_row.revoked_at is null for update;
  v_has_access:=found;
  v_has_paired:=v_has_access and v_access.device_user_id is not null;
  if v_has_access and (v_access.owner_id is distinct from v_life.owner_id or v_access.branch_id is distinct from v_life.branch_id) then raise exception 'ZEZMS_ACTIVE_DEVICE_BINDING_MISMATCH' using errcode='P0001'; end if;
  if not v_has_paired and not exists(select 1 from public.zezms_business_devices device_row where device_row.business_id=v_life.business_id and device_row.device_id=v_life.device_id and device_row.user_id=v_life.owner_id and device_row.revoked_at is null) then raise exception 'ZEZMS_ACTIVE_DEVICE_ACCESS_NOT_FOUND' using errcode='P0001'; end if;
  return jsonb_build_object('lifecycle_id',v_life.id,'owner_id',v_life.owner_id,'business_id',v_life.business_id,'branch_id',v_life.branch_id,'branch_name',v_branch.name,'branch_code',v_branch.code,'device_id',v_life.device_id,'device_name',v_life.device_name,'device_user_id',case when v_has_paired then v_access.device_user_id else v_life.device_user_id end,'pairing_id',v_life.pairing_id,'lifecycle_state',v_life.lifecycle_state,'device_status',v_life.lifecycle_state,'mode',case when v_has_paired then 'PAIRED' else 'OWNER' end);
end $function$;

/* r70H's paired relink uses this self-contained replacement for the optional,
   undeployed r70G reconnect RPC. It changes only the existing identity binding. */
create or replace function public.zezms_m5a4_owner_rebind_paired_active_device(p_business_id uuid,p_lifecycle_id uuid,p_new_device_user_id uuid)
returns jsonb language plpgsql SECURITY DEFINER set search_path to '' as $function$
declare v_actor uuid:=auth.uid(); v_life public.zezms_device_lifecycle%rowtype; v_access public.zezms_device_access%rowtype; v_device public.zezms_business_devices%rowtype; v_target_is_anonymous boolean:=false;
begin
  if v_actor is null then raise exception 'ZEZMS_AUTH_REQUIRED' using errcode='P0001'; end if;
  if coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then raise exception 'ZEZMS_AAL2_REQUIRED' using errcode='P0001'; end if;
  if p_business_id is null or p_lifecycle_id is null or p_new_device_user_id is null or not public.zezms_has_business_role(p_business_id,array['OWNER','ADMIN']) then raise exception 'ZEZMS_PERMISSION_DENIED' using errcode='P0001'; end if;
  select (coalesce(user_row.raw_app_meta_data->>'provider','')='anonymous' or coalesce(user_row.raw_app_meta_data->'providers' ? 'anonymous',false) or lower(coalesce(user_row.raw_user_meta_data->>'is_anonymous','false'))='true') into v_target_is_anonymous from auth.users user_row where user_row.id=p_new_device_user_id;
  if not coalesce(v_target_is_anonymous,false) then raise exception 'ZEZMS_REBIND_ANONYMOUS_IDENTITY_REQUIRED' using errcode='P0001'; end if;
  select * into v_life from public.zezms_device_lifecycle life where life.id=p_lifecycle_id and life.business_id=p_business_id for update;
  if not found then raise exception 'ZEZMS_ACTIVE_DEVICE_BINDING_NOT_FOUND' using errcode='P0001'; end if;
  if v_life.lifecycle_state in ('RETIRED','REVOKED') then raise exception 'ZEZMS_ACTIVE_DEVICE_RELINK_REJECTED' using errcode='P0001'; end if;
  if v_life.lifecycle_state<>'ACTIVE' then raise exception 'ZEZMS_ACTIVE_DEVICE_NOT_ACTIVE' using errcode='P0001'; end if;
  select * into v_access from public.zezms_device_access access_row where access_row.business_id=v_life.business_id and access_row.device_id=v_life.device_id and access_row.status='ACTIVE' and access_row.revoked_at is null for update;
  if not found then raise exception 'ZEZMS_ACTIVE_DEVICE_ACCESS_NOT_FOUND' using errcode='P0001'; end if;
  if v_access.owner_id is distinct from v_life.owner_id or v_access.branch_id is distinct from v_life.branch_id then raise exception 'ZEZMS_ACTIVE_DEVICE_BINDING_MISMATCH' using errcode='P0001'; end if;
  select * into v_device from public.zezms_business_devices device_row where device_row.business_id=v_life.business_id and device_row.device_id=v_life.device_id and device_row.revoked_at is null for update;
  if not found then raise exception 'ZEZMS_ACTIVE_DEVICE_REGISTER_NOT_FOUND' using errcode='P0001'; end if;
  if v_life.device_user_id is distinct from v_access.device_user_id or v_device.user_id is distinct from v_access.device_user_id then raise exception 'ZEZMS_ACTIVE_DEVICE_BINDING_MISMATCH' using errcode='P0001'; end if;
  if v_access.device_user_id=p_new_device_user_id then return jsonb_build_object('lifecycle_id',v_life.id,'owner_id',v_life.owner_id,'business_id',v_life.business_id,'branch_id',v_life.branch_id,'device_id',v_life.device_id,'device_name',v_life.device_name,'device_user_id',v_access.device_user_id,'pairing_id',v_life.pairing_id,'lifecycle_state',v_life.lifecycle_state,'device_status',v_life.lifecycle_state,'mode','PAIRED','rebound',false); end if;
  if exists(select 1 from public.zezms_device_access other_access where other_access.device_user_id=p_new_device_user_id and other_access.status='ACTIVE' and other_access.revoked_at is null and (other_access.business_id<>v_life.business_id or other_access.device_id<>v_life.device_id)) then raise exception 'ZEZMS_DEVICE_IDENTITY_ALREADY_BOUND' using errcode='P0001'; end if;
  update public.zezms_device_access as access_row set device_user_id=p_new_device_user_id,updated_at=pg_catalog.now(),last_seen_at=pg_catalog.now() where access_row.business_id=v_life.business_id and access_row.device_id=v_life.device_id and access_row.status='ACTIVE' and access_row.revoked_at is null;
  update public.zezms_business_devices as device_row set user_id=p_new_device_user_id,updated_at=pg_catalog.now(),last_seen_at=pg_catalog.now() where device_row.business_id=v_life.business_id and device_row.device_id=v_life.device_id and device_row.revoked_at is null;
  update public.zezms_device_lifecycle as life set device_user_id=p_new_device_user_id,revision=life.revision+1,updated_at=pg_catalog.now() where life.id=v_life.id and life.business_id=v_life.business_id and life.device_id=v_life.device_id and life.lifecycle_state='ACTIVE';
  insert into public.zezms_business_audit_events(business_id,actor_user_id,device_id,event_type,entity_type,entity_id,payload) values(v_life.business_id,v_actor,v_life.device_id,'ACTIVE_DEVICE_PAIRED_REBOUND','DEVICE_LIFECYCLE',v_life.id::text,jsonb_build_object('previous_device_user_id',v_access.device_user_id,'new_device_user_id',p_new_device_user_id,'r70h',true));
  return jsonb_build_object('lifecycle_id',v_life.id,'owner_id',v_life.owner_id,'business_id',v_life.business_id,'branch_id',v_life.branch_id,'device_id',v_life.device_id,'device_name',v_life.device_name,'device_user_id',p_new_device_user_id,'pairing_id',v_life.pairing_id,'lifecycle_state',v_life.lifecycle_state,'device_status',v_life.lifecycle_state,'mode','PAIRED','rebound',true);
end $function$;

create or replace function public.zezms_m5a4_record_device_presence(p_device_id text,p_device_name text default '',p_platform text default '',p_app_version text default '',p_owner_verified_lifecycle_id uuid default null)
returns boolean language plpgsql SECURITY DEFINER set search_path to '' as $function$
declare v_context record; v_name text:=nullif(left(btrim(coalesce(p_device_name,'')),160),''); v_platform text:=left(coalesce(p_platform,''),240); v_version text:=left(coalesce(p_app_version,''),80);
begin
  if auth.uid() is null then raise exception 'ZEZMS_AUTH_REQUIRED' using errcode='P0001'; end if;
  if coalesce(btrim(p_device_id),'')='' then raise exception 'ZEZMS_DEVICE_ID_REQUIRED' using errcode='P0001'; end if;
  if p_owner_verified_lifecycle_id is not null then
    if coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then raise exception 'ZEZMS_AAL2_REQUIRED' using errcode='P0001'; end if;
    select life.id as lifecycle_id,life.business_id,life.owner_id,life.branch_id into v_context from public.zezms_device_lifecycle life where life.id=p_owner_verified_lifecycle_id and life.device_id=btrim(p_device_id) and life.lifecycle_state='ACTIVE' for update;
    if not found or not public.zezms_has_business_role(v_context.business_id,array['OWNER','ADMIN']) then raise exception 'ZEZMS_DEVICE_NOT_ACTIVE_OR_BOUND' using errcode='P0001'; end if;
    if exists(select 1 from public.zezms_device_access access_row where access_row.business_id=v_context.business_id and access_row.device_id=btrim(p_device_id) and access_row.status='ACTIVE' and access_row.revoked_at is null and (access_row.owner_id is distinct from v_context.owner_id or access_row.branch_id is distinct from v_context.branch_id)) then raise exception 'ZEZMS_ACTIVE_DEVICE_BINDING_MISMATCH' using errcode='P0001'; end if;
    if not exists(select 1 from public.zezms_device_access access_row where access_row.business_id=v_context.business_id and access_row.device_id=btrim(p_device_id) and access_row.status='ACTIVE' and access_row.revoked_at is null) and not exists(select 1 from public.zezms_business_devices device_row where device_row.business_id=v_context.business_id and device_row.device_id=btrim(p_device_id) and device_row.user_id=v_context.owner_id and device_row.revoked_at is null) then raise exception 'ZEZMS_ACTIVE_DEVICE_ACCESS_NOT_FOUND' using errcode='P0001'; end if;
  else
    select * into v_context from public.zezms_m5a4_resolve_device(btrim(p_device_id),array['ACTIVE']);
    if not found then raise exception 'ZEZMS_DEVICE_NOT_ACTIVE_OR_BOUND' using errcode='P0001'; end if;
  end if;
  if not exists(select 1 from public.zezms_business_devices device_row where device_row.business_id=v_context.business_id and device_row.device_id=btrim(p_device_id) and device_row.revoked_at is null) then raise exception 'ZEZMS_ACTIVE_DEVICE_REGISTER_NOT_FOUND' using errcode='P0001'; end if;
  update public.zezms_device_access as access_row set device_name=coalesce(v_name,access_row.device_name),platform=v_platform,app_version=v_version,last_seen_at=pg_catalog.now(),updated_at=pg_catalog.now() where access_row.business_id=v_context.business_id and access_row.device_id=btrim(p_device_id) and access_row.status='ACTIVE' and access_row.revoked_at is null;
  update public.zezms_business_devices as device_row set device_name=coalesce(v_name,device_row.device_name),platform=v_platform,app_version=v_version,last_seen_at=pg_catalog.now(),updated_at=pg_catalog.now() where device_row.business_id=v_context.business_id and device_row.device_id=btrim(p_device_id) and device_row.revoked_at is null;
  update public.zezms_device_lifecycle as life set device_name=coalesce(v_name,life.device_name),platform=v_platform,app_version=v_version,updated_at=pg_catalog.now() where life.id=v_context.lifecycle_id and life.business_id=v_context.business_id and life.device_id=btrim(p_device_id) and life.lifecycle_state='ACTIVE';
  return true;
end $function$;

/* The M5A3 compatibility heartbeat already accepts p_app_version.  It used
   to discard that parameter after M5A4 validation; now that same validated
   call performs the one authoritative metadata refresh. */
create or replace function public.zezms_m5a3_device_context(p_device_id text,p_device_name text default '',p_platform text default '',p_app_version text default '')
returns table(owner_id uuid,business_id uuid,trading_name text,branch_id uuid,branch_name text,branch_code text,device_status text)
language plpgsql security definer set search_path to '' as $function$
declare v_context record;
begin
  select * into v_context from public.zezms_m5a4_device_context(p_device_id,array['BOOTSTRAPPING','VERIFYING','ACTIVE']);
  if upper(coalesce(v_context.lifecycle_state,v_context.device_status,''))='ACTIVE' then perform public.zezms_m5a4_record_device_presence(p_device_id,p_device_name,p_platform,p_app_version,null); end if;
  return query select v_context.owner_id,v_context.business_id,v_context.trading_name,v_context.branch_id,v_context.branch_name,v_context.branch_code,v_context.device_status;
end $function$;

revoke all on function public.zezms_m5a4_recovery_active_fleet(uuid) from public,anon;
revoke all on function public.zezms_m5a4_my_active_device_binding() from public,anon;
revoke all on function public.zezms_m5a4_owner_relink_active_device(uuid,uuid) from public,anon;
revoke all on function public.zezms_m5a4_owner_rebind_paired_active_device(uuid,uuid,uuid) from public,anon;
revoke all on function public.zezms_m5a4_record_device_presence(text,text,text,text,uuid) from public,anon;
revoke all on function public.zezms_m5a3_device_context(text,text,text,text) from public,anon;
grant execute on function public.zezms_m5a4_recovery_active_fleet(uuid) to authenticated,postgres,service_role;
grant execute on function public.zezms_m5a4_my_active_device_binding() to authenticated,postgres,service_role;
grant execute on function public.zezms_m5a4_owner_relink_active_device(uuid,uuid) to authenticated,postgres,service_role;
grant execute on function public.zezms_m5a4_owner_rebind_paired_active_device(uuid,uuid,uuid) to authenticated,postgres,service_role;
grant execute on function public.zezms_m5a4_record_device_presence(text,text,text,text,uuid) to authenticated,postgres,service_role;
grant execute on function public.zezms_m5a3_device_context(text,text,text,text) to authenticated,postgres,service_role;

commit;
