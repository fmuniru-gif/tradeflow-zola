-- REVIEW ONLY. Unexecuted proposed server correction; separate approval required.
-- Based on read-only production pg_get_functiondef export, query (65).
-- Before any execution, independently save the current function definition and
-- verify the normalized guard hash in the live production SQL editor.
-- The transaction changes only this resolver. Existing ACL/signature remain.

begin;

do $guard$
declare
  current_definition text := pg_get_functiondef(to_regprocedure('public.zezms_m5a4_resolve_device(text,text[])'));
begin
  if current_definition is null or
     md5(regexp_replace(current_definition,'[[:space:]]+','','g')) <> 'a22b23a190733d202c97335aa9646700' then
    raise exception 'R70V_RESOLVE_DEVICE_DEFINITION_DRIFT: stop and review current production function';
  end if;
end
$guard$;

create or replace function public.zezms_m5a4_resolve_device(p_device_id text, p_allowed_states text[] default array['ACTIVE'::text])
returns table(lifecycle_id uuid, owner_id uuid, business_id uuid, branch_id uuid, device_user_id uuid, lifecycle_state text, revision bigint)
language plpgsql security definer set search_path to '' as $function$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception 'ZEZMS_AUTH_REQUIRED' using errcode='P0001'; end if;
  if coalesce(btrim(p_device_id),'')='' then raise exception 'ZEZMS_DEVICE_ID_REQUIRED' using errcode='P0001'; end if;
  return query
  select l.id,l.owner_id,l.business_id,l.branch_id,l.device_user_id,l.lifecycle_state,l.revision
  from public.zezms_device_lifecycle l
  where l.device_id=btrim(p_device_id) and l.lifecycle_state=any(p_allowed_states)
    and not exists (
      select 1 from public.zezms_device_access revoked_access
      where revoked_access.business_id=l.business_id
        and revoked_access.device_id=l.device_id
        and (revoked_access.status='REVOKED' or revoked_access.revoked_at is not null)
    )
    and (
      (l.device_user_id=v_uid and exists (
        select 1 from public.zezms_device_access a
        where a.business_id=l.business_id and a.device_id=l.device_id
          and a.device_user_id=v_uid and a.status='ACTIVE' and a.revoked_at is null
      ))
      or (l.owner_id=v_uid
        and not exists (
          select 1 from public.zezms_device_access owner_access
          where owner_access.business_id=l.business_id and owner_access.device_id=l.device_id
        )
        and exists (
          select 1 from public.zezms_business_devices d
          where d.business_id=l.business_id and d.device_id=l.device_id
            and d.user_id=v_uid and d.revoked_at is null
        ))
    )
  limit 1;
  if not found then raise exception 'ZEZMS_DEVICE_NOT_ACTIVE_OR_BOUND' using errcode='P0001'; end if;
end $function$;

commit;

-- Rollback after separately approved execution: restore the independently
-- saved pre-change pg_get_functiondef text under a new guarded transaction.
-- Do not copy an older repository definition over an unreviewed live function.
