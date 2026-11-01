-- Role helper: exact live export65. Branch guard: existing MB3 source script; live body absent from71.
CREATE OR REPLACE FUNCTION public.zezms_has_business_role(p_business_id uuid, p_roles text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.zezms_business_members m
    where m.business_id = p_business_id
      and m.user_id = auth.uid()
      and m.status = 'ACTIVE'
      and m.role = any(p_roles)
  );
$function$;

create or replace function public.zezms_mb3_lifecycle_branch_data_plane_guard()
returns trigger language plpgsql security definer set search_path to '' as $function$
declare v_legacy uuid; v_enabled boolean;
begin
  select id into v_legacy from public.zezms_branches where business_id=new.business_id and status='ACTIVE' order by is_primary desc,created_at asc limit 1;
  select coalesce((capabilities->>'branchDataPlaneEnabled')::boolean,false) into v_enabled from public.zezms_sync_state where owner_id=new.owner_id;
  if new.lifecycle_state='ACTIVE' and not coalesce(v_enabled,false) and new.branch_id is distinct from v_legacy then raise exception 'ZEZMS_BRANCH_DATA_PLANE_NOT_ACTIVE' using errcode='P0001'; end if;
  return new;
end $function$;
