CREATE OR REPLACE FUNCTION public.zezms_ops_push(p_operations jsonb)
 RETURNS TABLE(op_id text, server_seq bigint, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_auth_uid uuid:=auth.uid(); r record; s public.zezms_sync_state%rowtype; o jsonb; p jsonb; c jsonb;
  v_existing public.zezms_sync_operations%rowtype; v_inserted public.zezms_sync_operations%rowtype;
  v_device text; v_op text; v_collection text; v_key text; v_expected text; v_identity jsonb;
  v_root text; v_root_key text; v_delta numeric; v_next numeric; v_initial numeric; v_legacy uuid;
begin
  if v_auth_uid is null then raise exception 'ZEZMS_AUTH_REQUIRED' using errcode='P0001'; end if;
  if p_operations is null or jsonb_typeof(p_operations)<>'array' or jsonb_array_length(p_operations)=0 then raise exception 'ZEZMS_INVALID_OPERATION_BATCH' using errcode='P0001'; end if;
  select coalesce(value->>'deviceId','') into v_device from jsonb_array_elements(p_operations) limit 1;
  if v_device='' or exists(select 1 from jsonb_array_elements(p_operations) x where coalesce(x.value->>'deviceId','')<>v_device) then raise exception 'ZEZMS_DEVICE_BATCH_MISMATCH' using errcode='P0001'; end if;
  select * into r from public.zezms_m5a4_resolve_device(v_device,array['ACTIVE']);
  if not found then raise exception 'ZEZMS_DEVICE_NOT_ACTIVE' using errcode='P0001'; end if;
  select * into s from public.zezms_sync_state where owner_id=r.owner_id for update;
  if not found or s.protocol_version not in ('M4/3','M4/4') then raise exception 'ZEZMS_SERVER_CAPABILITY_MISMATCH' using errcode='P0001'; end if;
  select br.id into v_legacy from public.zezms_branches br where br.business_id=r.business_id and br.status='ACTIVE' order by br.is_primary desc,br.created_at asc limit 1;
  if s.protocol_version='M4/4' and r.branch_id is null then raise exception 'ZEZMS_M44_BRANCH_REQUIRED' using errcode='P0001'; end if;
  if s.protocol_version='M4/4' and not exists(select 1 from public.zezms_branches b where b.id=r.branch_id and b.business_id=r.business_id and b.status='ACTIVE') then raise exception 'ZEZMS_M44_BRANCH_NOT_ACTIVE' using errcode='P0001'; end if;
  if coalesce((s.capabilities->>'branchDataPlaneEnabled')::boolean,false) is not true and r.branch_id is distinct from v_legacy then
    raise exception 'ZEZMS_BRANCH_DATA_PLANE_NOT_ACTIVE' using errcode='P0001'; end if;
  for o in select value from jsonb_array_elements(p_operations) loop
    v_op:=coalesce(o->>'opId',''); if v_op='' then raise exception 'ZEZMS_INVALID_OPERATION' using errcode='P0001'; end if;
    if coalesce(o->>'protocolVersion','')<>s.protocol_version then raise exception 'ZEZMS_CLIENT_PROTOCOL_MISMATCH' using errcode='P0001'; end if;
    if coalesce((o->>'clientGeneration')::integer,0)<s.minimum_client_generation then raise exception 'ZEZMS_CLIENT_VERSION_BLOCKED' using errcode='P0001'; end if;
    if coalesce(o->>'rulesHash','')<>s.rules_hash then raise exception 'ZEZMS_CLIENT_RULES_MISMATCH' using errcode='P0001'; end if;
    if coalesce(o->>'identityRegistryHash','')<>s.identity_registry_hash then raise exception 'ZEZMS_IDENTITY_REGISTRY_MISMATCH' using errcode='P0001'; end if;
    if s.protocol_version='M4/4' then
      if coalesce(o->>'businessId','')='' then raise exception 'ZEZMS_M44_BUSINESS_REQUIRED' using errcode='P0001'; end if;
      if coalesce(o->>'branchId','')='' then raise exception 'ZEZMS_M44_BRANCH_REQUIRED' using errcode='P0001'; end if;
      if (o->>'businessId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'ZEZMS_M44_BUSINESS_MISMATCH' using errcode='P0001'; end if;
      if (o->>'businessId')::uuid<>r.business_id then raise exception 'ZEZMS_M44_BUSINESS_MISMATCH' using errcode='P0001'; end if;
      if (o->>'branchId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'ZEZMS_M44_BRANCH_MISMATCH' using errcode='P0001'; end if;
      if (o->>'branchId')::uuid<>r.branch_id then raise exception 'ZEZMS_M44_BRANCH_MISMATCH' using errcode='P0001'; end if;
      if coalesce(o->>'payloadHash','')<>public.zezms_mb3_payload_hash(o) then raise exception 'ZEZMS_M44_PAYLOAD_HASH_MISMATCH' using errcode='P0001'; end if;
    elsif o ? 'businessId' or o ? 'branchId' then
      raise exception 'ZEZMS_M43_PAYLOAD_REWRITE_FORBIDDEN' using errcode='P0001';
    end if;
    select so.* into v_existing from public.zezms_sync_operations so where so.owner_id=r.owner_id and so.op_id=v_op;
    if found then op_id:=v_existing.op_id; server_seq:=v_existing.seq; created_at:=v_existing.created_at; return next; continue; end if;
    for p in select value from jsonb_array_elements(coalesce(o->'patches','[]'::jsonb)) loop
      v_collection:=coalesce(p->>'collection',''); v_key:=coalesce(p->>'key','');
      if v_collection<>'' and p->>'action' in ('insert','update','delete') then
        v_identity:=case when p ? 'value' then p->'value' when p ? 'fallback' then p->'fallback' when p ? 'before' then p->'before' else null end;
        v_expected:=public.zezms_m43_entity_key(v_collection,v_identity);
        if coalesce(v_expected,'')='' then raise exception 'ZEZMS_IDENTITY_REQUIRED' using errcode='P0001'; end if;
        if v_key<>v_expected then raise exception 'ZEZMS_IDENTITY_MISMATCH' using errcode='P0001'; end if;
      end if;
      if p->>'action'='insert' and v_collection='stockRows' then
        v_initial:=coalesce((p->'value'->>'rStock')::numeric,0); if v_initial<0 then raise exception 'ZEZMS_STOCK_CONFLICT' using errcode='P0001'; end if;
        if exists(select 1 from public.zezms_sync_counters where owner_id=r.owner_id and collection='stockRows' and entity_key=v_key and field_name='rStock') then raise exception 'ZEZMS_ID_CONFLICT' using errcode='P0001'; end if;
        insert into public.zezms_sync_counters(owner_id,collection,entity_key,field_name,value,updated_at) values(r.owner_id,'stockRows',v_key,'rStock',v_initial,now());
      elsif p->>'action'='update' and v_collection='stockRows' then
        for c in select value from jsonb_array_elements(coalesce(p->'changes','[]'::jsonb)) loop
          if c->>'field'='rStock' and c->>'mode'='delta' then
            update public.zezms_sync_counters set value=value+coalesce((c->>'value')::numeric,0),updated_at=now() where owner_id=r.owner_id and collection='stockRows' and entity_key=v_key and field_name='rStock' returning value into v_next;
            if not found then raise exception 'ZEZMS_COUNTER_MISSING' using errcode='P0001'; end if; if v_next<0 then raise exception 'ZEZMS_STOCK_CONFLICT' using errcode='P0001'; end if;
          end if;
        end loop;
      elsif p->>'action'='delete' and v_collection='stockRows' then
        delete from public.zezms_sync_counters where owner_id=r.owner_id and collection='stockRows' and entity_key=v_key;
      elsif p->>'action'='root-object' and p->>'root'='cashBalances' and p->>'mode'='delta' then
        v_root_key:=coalesce(p->>'key',''); v_delta:=coalesce((p->>'value')::numeric,0);
        update public.zezms_sync_counters set value=value+v_delta,updated_at=now() where owner_id=r.owner_id and collection='cashBalances' and entity_key=v_root_key and field_name='value' returning value into v_next;
        if not found then insert into public.zezms_sync_counters(owner_id,collection,entity_key,field_name,value,updated_at) values(r.owner_id,'cashBalances',v_root_key,'value',v_delta,now()) returning value into v_next; end if;
        if v_next<0 and v_root_key<>'Others' then raise exception 'ZEZMS_CASH_CONFLICT' using errcode='P0001'; end if;
      end if;
    end loop;
    insert into public.zezms_sync_operations(owner_id,business_id,branch_id,op_id,device_id,device_seq,kind,payload,client_created_at,created_at)
      values(r.owner_id,r.business_id,r.branch_id,v_op,v_device,coalesce((o->>'deviceSeq')::bigint,0),coalesce(o->>'kind','DATABASE_CHANGE'),o,nullif(o->>'createdAt','')::timestamptz,now()) returning * into v_inserted;
    update public.zezms_sync_state set revision=revision+1,updated_at=v_inserted.created_at,updated_by=v_device,sync_mode='operations' where owner_id=r.owner_id;
    op_id:=v_inserted.op_id; server_seq:=v_inserted.seq; created_at:=v_inserted.created_at; return next;
  end loop;
end $function$;

CREATE OR REPLACE FUNCTION public.zezms_m43_entity_key(p_collection text, p_record jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
begin
  if p_record is null or jsonb_typeof(p_record) <> 'object' then return ''; end if;
  case p_collection
    when 'products' then return coalesce(p_record->>'id', p_record->>'_syncId', '');
    when 'customers' then return coalesce(p_record->>'customerId', p_record->>'id', p_record->>'_syncId', '');
    when 'customerFollowups' then return coalesce(p_record->>'followupId', p_record->>'id', p_record->>'_syncId', '');
    when 'salesOpportunities' then return coalesce(p_record->>'opportunityId', p_record->>'id', p_record->>'_syncId', '');
    when 'quotations' then return coalesce(p_record->>'quotationId', p_record->>'id', p_record->>'_syncId', '');
    when 'stockRows' then return coalesce(p_record->>'id', p_record->>'_syncId', '');
    when 'stockCorrections' then return coalesce(p_record->>'correctionId', p_record->>'id', p_record->>'_syncId', '');
    when 'warranties' then return coalesce(p_record->>'warrantyId', p_record->>'id', p_record->>'_syncId', '');
    when 'warrantyClaims' then return coalesce(p_record->>'claimId', p_record->>'id', p_record->>'_syncId', '');
    when 'debtors' then return coalesce(p_record->>'id', p_record->>'_syncId', '');
    when 'creditors' then return coalesce(p_record->>'id', p_record->>'_syncId', '');
    when 'depositors' then return coalesce(p_record->>'id', p_record->>'_syncId', '');
    when 'sales' then return coalesce(p_record->>'id', p_record->>'receiptNo', p_record->>'_syncId', '');
    when 'receipts' then return coalesce(p_record->>'receiptNo', p_record->>'id', p_record->>'_syncId', '');
    when 'invoices' then return coalesce(p_record->>'id', p_record->>'invoiceNo', p_record->>'_syncId', '');
    when 'waybills' then return coalesce(p_record->>'id', p_record->>'waybillNo', p_record->>'_syncId', '');
    when 'purchaseOrders' then return coalesce(p_record->>'id', p_record->>'poNo', p_record->>'purchaseOrderNo', p_record->>'_syncId', '');
    when 'saleLines' then return coalesce(p_record->>'_syncId', p_record->>'id', '');
    when 'accountTxns' then return coalesce(p_record->>'id', p_record->>'_syncId', '');
    when 'cashLog' then return coalesce(p_record->>'id', p_record->>'_syncId', '');
    when 'expenses' then return coalesce(p_record->>'id', p_record->>'_syncId', '');
    when 'inventoryTxns' then return coalesce(p_record->>'id', p_record->>'_syncId', '');
    when 'undoLog' then return coalesce(p_record->>'id', p_record->>'_syncId', '');
    when 'debtorsMonthly' then return coalesce(p_record->>'_syncId', p_record->>'id', '');
    when 'creditorsMonthly' then return coalesce(p_record->>'_syncId', p_record->>'id', '');
    when 'depositorsMonthly' then return coalesce(p_record->>'_syncId', p_record->>'id', '');
    when 'kpiHistory' then return coalesce(p_record->>'_syncId', p_record->>'id', '');
    when 'monthRollovers' then return coalesce(p_record->>'id', p_record->>'_syncId', '');
    else return coalesce(p_record->>'_syncId', p_record->>'id', '');
  end case;
end;
$function$;

CREATE OR REPLACE FUNCTION public.zezms_m5a4_resolve_device(p_device_id text, p_allowed_states text[] DEFAULT ARRAY['ACTIVE'::text])
 RETURNS TABLE(lifecycle_id uuid, owner_id uuid, business_id uuid, branch_id uuid, device_user_id uuid, lifecycle_state text, revision bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception 'ZEZMS_AUTH_REQUIRED' using errcode='P0001'; end if;
  if coalesce(btrim(p_device_id),'')='' then raise exception 'ZEZMS_DEVICE_ID_REQUIRED' using errcode='P0001'; end if;
  return query
  select l.id,l.owner_id,l.business_id,l.branch_id,l.device_user_id,l.lifecycle_state,l.revision
  from public.zezms_device_lifecycle l
  where l.device_id=btrim(p_device_id) and l.lifecycle_state=any(p_allowed_states)
    and ((l.device_user_id=v_uid and exists(select 1 from public.zezms_device_access a where a.business_id=l.business_id and a.device_id=l.device_id and a.device_user_id=v_uid and a.status='ACTIVE' and a.revoked_at is null))
      or (l.owner_id=v_uid and exists(select 1 from public.zezms_business_devices d where d.business_id=l.business_id and d.device_id=l.device_id and d.user_id=v_uid and d.revoked_at is null)))
  limit 1;
  if not found then raise exception 'ZEZMS_DEVICE_NOT_ACTIVE_OR_BOUND' using errcode='P0001'; end if;
end $function$;

CREATE OR REPLACE FUNCTION public.zezms_mb3_payload_hash(p_value jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare v_text text:=public.zezms_mb3_canonical_json(p_value); v_bytes bytea:=convert_to(v_text,'UTF8');
  v_high numeric:=3421674724; v_low numeric:=2216829733; v_x bigint; v_product numeric; v_i integer;
begin
  for v_i in 0..greatest(octet_length(v_bytes)-1,-1) loop
    exit when octet_length(v_bytes)=0;
    v_x:=(v_low::bigint # get_byte(v_bytes,v_i));
    v_product:=v_x::numeric*435;
    v_low:=mod(v_product,4294967296);
    v_high:=mod(v_high*435+floor(v_product/4294967296),4294967296);
  end loop;
  return lpad(to_hex(v_high::bigint),8,'0')||lpad(to_hex(v_low::bigint),8,'0');
end $function$;

CREATE OR REPLACE FUNCTION public.zezms_mb3_canonical_json(p_value jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare v_type text; v_result text;
begin
  if p_value is null then return 'null'; end if;
  v_type:=jsonb_typeof(p_value);
  if v_type='array' then
    select '['||coalesce(string_agg(public.zezms_mb3_canonical_json(value),',' order by ordinality),'')||']'
      into v_result from jsonb_array_elements(p_value) with ordinality;
    return v_result;
  end if;
  if v_type='object' then
    select '{'||coalesce(string_agg(to_jsonb(key)::text||':'||public.zezms_mb3_canonical_json(value),',' order by key),'')||'}'
      into v_result
      from jsonb_each(p_value)
      where key not in ('payloadHash','outboxState','attempts','lastAttempt','lastError','_legacyPayload');
    return v_result;
  end if;
  return p_value::text;
end $function$;
