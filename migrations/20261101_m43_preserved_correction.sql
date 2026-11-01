-- REVIEW ONLY. No private identifiers/data. No automatic evidence provisioning.
-- Requires the exact exported production RPC; migration is one transaction.
BEGIN;
DO $owner$
BEGIN
 IF current_user IS DISTINCT FROM (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.zezms_ops_push(jsonb)'::regprocedure) THEN
  RAISE EXCEPTION 'M43_MIGRATION_RPC_OWNER_REQUIRED';
 END IF;
END $owner$;
LOCK TABLE public.zezms_sync_operations IN SHARE ROW EXCLUSIVE MODE;

-- JS consumes UTF-16 code units, not UTF-8 bytes.
CREATE FUNCTION public.zezms_m43_utf16(t text) RETURNS integer[]
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path='' AS $$
DECLARE a integer[]:='{}'; n integer; i integer;
BEGIN
 FOR i IN 1..char_length(t) LOOP
  n:=ascii(substr(t,i,1));
  IF n>65535 THEN a:=a||ARRAY[55296+(n-65536)/1024,56320+(n-65536)%1024];
  ELSE a:=array_append(a,n); END IF;
 END LOOP;
 RETURN a;
END $$;

CREATE FUNCTION public.zezms_m43_array_index(k text) RETURNS bigint
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path='' AS $$
BEGIN
 IF k ~ '^(0|[1-9][0-9]{0,9})$' THEN
  IF k::bigint<4294967295 THEN RETURN k::bigint; END IF;
 END IF;
 RETURN NULL;
END $$;

-- PostgreSQL's shortest float representation, formatted with JS's decimal /
-- exponent thresholds. Exact numeric comparison rejects non-JS wire values;
-- this never rounds a business value or silently accepts a competing hash.
CREATE FUNCTION public.zezms_m43_number(n numeric) RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path='' SET extra_float_digits=3 AS $$
DECLARE f double precision; plain text; digits text; integer_part text; fractional_part text; exponent integer; result text; sign text:='';
BEGIN
 BEGIN f:=n::double precision;
 EXCEPTION WHEN numeric_value_out_of_range THEN RAISE EXCEPTION 'M43_HASH_NUMBER_UNSUPPORTED'; END;
 IF f=0 THEN IF n<>0 THEN RAISE EXCEPTION 'M43_HASH_NUMBER_UNSUPPORTED'; END IF; RETURN '0'; END IF;
 plain:=trim_scale(abs(f)::text::numeric)::text;
 IF f<0 THEN sign:='-'; END IF;
 IF abs(f)>=0.000001 AND abs(f)<1e21 THEN result:=sign||plain;
 ELSE
  integer_part:=split_part(plain,'.',1); fractional_part:=split_part(plain,'.',2);
  IF integer_part<>'0' THEN exponent:=length(integer_part)-1;digits:=integer_part||fractional_part;
  ELSE exponent:=-1-(length(fractional_part)-length(ltrim(fractional_part,'0')));digits:=ltrim(fractional_part,'0'); END IF;
  digits:=rtrim(digits,'0');
  result:=sign||substr(digits,1,1)||CASE WHEN length(digits)>1 THEN '.'||substr(digits,2) ELSE '' END||'e'||CASE WHEN exponent>=0 THEN '+' ELSE '' END||exponent::text;
 END IF;
 IF n IS DISTINCT FROM result::numeric THEN RAISE EXCEPTION 'M43_HASH_NUMBER_NOT_JS_WIRE'; END IF;
 RETURN result;
END $$;

-- Matches the unmodified client's canonicalization; unsupported non-JS JSON
-- numbers fail closed rather than being rounded or silently normalized.
CREATE FUNCTION public.zezms_m43_canonical(v jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE t text:=jsonb_typeof(v); out text; n numeric; k text;
BEGIN
 IF v IS NULL OR t='null' THEN RETURN 'null'; END IF;
 IF t='array' THEN
  SELECT '['||coalesce(string_agg(public.zezms_m43_canonical(value),',' ORDER BY ordinality),'')||']'
   INTO out FROM jsonb_array_elements(v) WITH ORDINALITY; RETURN out;
 ELSIF t='object' THEN
  SELECT '{'||coalesce(string_agg(to_jsonb(key)::text||':'||public.zezms_m43_canonical(value),',' ORDER BY
   CASE WHEN public.zezms_m43_array_index(key) IS NULL THEN 1 ELSE 0 END,
   public.zezms_m43_array_index(key),
   public.zezms_m43_utf16(key)),'')||'}' INTO out FROM jsonb_each(v)
   WHERE key NOT IN ('payloadHash','outboxState','attempts','lastAttempt','lastError','_legacyPayload');
  RETURN out;
 ELSIF t='number' THEN
  RETURN public.zezms_m43_number(v::text::numeric);
 END IF;
 RETURN v::text;
END $$;
CREATE FUNCTION public.zezms_m43_payload_hash(v jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE hi bigint:=3421674724; lo bigint:=2216829733; x bigint; nxt bigint; u integer;
BEGIN
 FOREACH u IN ARRAY public.zezms_m43_utf16(public.zezms_m43_canonical(v)) LOOP
  x:=lo # u; nxt:=mod(x*435,4294967296);
  hi:=mod(hi*435+(x*256+nxt)/4294967296,4294967296); lo:=nxt;
 END LOOP;
 RETURN lpad(to_hex(hi),8,'0')||lpad(to_hex(lo),8,'0');
END $$;

CREATE TABLE public.zezms_m43_correction_receipts(
 owner_id uuid NOT NULL,correction_id text NOT NULL,op_id text,server_seq bigint,
 audit jsonb NOT NULL,payload jsonb,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,correction_id));
ALTER TABLE public.zezms_m43_correction_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zezms_m43_correction_receipts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.zezms_m43_correction_receipts TO authenticated;
CREATE POLICY owner_read ON public.zezms_m43_correction_receipts FOR SELECT TO authenticated USING(owner_id=auth.uid());

-- Backfill ALL available checkpoints, including superseded ones, then operations.
-- Conflicting/ambiguous historical correction identities abort the migration.
DO $$
DECLARE r record; old public.zezms_m43_correction_receipts%rowtype;
BEGIN
 FOR r IN
  SELECT c.owner_id,a->>'correctionId' cid,a audit,NULL::text oid,c.checkpoint_cursor seq,NULL::jsonb payload
  FROM public.zezms_sync_checkpoints c CROSS JOIN LATERAL jsonb_array_elements(coalesce(c.payload->'stockCorrections','[]')) a
  UNION ALL
  SELECT o.owner_id,p->'value'->>'correctionId',p->'value',o.op_id,o.seq,o.payload
  FROM public.zezms_sync_operations o CROSS JOIN LATERAL jsonb_array_elements(coalesce(o.payload->'patches','[]')) p
  WHERE p->>'action'='insert' AND p->>'collection'='stockCorrections'
 LOOP
  IF coalesce(r.cid,'')='' THEN RAISE EXCEPTION 'M43_HISTORY_IDENTITY_UNPROVEN'; END IF;
  SELECT * INTO old FROM public.zezms_m43_correction_receipts WHERE owner_id=r.owner_id AND correction_id=r.cid;
  IF FOUND AND (old.audit IS DISTINCT FROM r.audit OR
    (old.op_id IS NOT NULL AND r.oid IS NOT NULL AND old.op_id<>r.oid)) THEN
   RAISE EXCEPTION 'M43_HISTORY_CORRECTION_CONFLICT';
  END IF;
  INSERT INTO public.zezms_m43_correction_receipts(owner_id,correction_id,op_id,server_seq,audit,payload)
   VALUES(r.owner_id,r.cid,r.oid,r.seq,r.audit,r.payload)
   ON CONFLICT(owner_id,correction_id) DO UPDATE SET
    op_id=coalesce(zezms_m43_correction_receipts.op_id,excluded.op_id),
    server_seq=CASE WHEN excluded.op_id IS NOT NULL THEN excluded.server_seq ELSE zezms_m43_correction_receipts.server_seq END,
    payload=coalesce(zezms_m43_correction_receipts.payload,excluded.payload);
 END LOOP;
END $$;

CREATE FUNCTION public.zezms_m43_correction_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p jsonb; cid text;
BEGIN
 -- Every insertion path takes the same owner lock. A duplicate exception rolls
 -- back earlier counter changes in the calling transaction, including old RPCs.
 PERFORM 1 FROM public.zezms_sync_state WHERE owner_id=NEW.owner_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'M43_OWNER_STATE_MISSING'; END IF;
 FOR p IN SELECT value FROM jsonb_array_elements(coalesce(NEW.payload->'patches','[]')) LOOP
  IF p->>'action'='insert' AND p->>'collection'='stockCorrections' THEN
   cid:=p->'value'->>'correctionId';
   IF coalesce(cid,'')='' OR p->>'key' IS DISTINCT FROM cid THEN RAISE EXCEPTION 'M43_CORRECTION_IDENTITY'; END IF;
   IF NEW.payload->>'protocolVersion'='M4/3' AND
    NEW.payload->>'payloadHash' IS DISTINCT FROM public.zezms_m43_payload_hash(NEW.payload) THEN RAISE EXCEPTION 'M43_HASH_MISMATCH'; END IF;
   INSERT INTO public.zezms_m43_correction_receipts(owner_id,correction_id,op_id,server_seq,audit,payload,created_at)
    VALUES(NEW.owner_id,cid,NEW.op_id,NEW.seq,p->'value',NEW.payload,NEW.created_at);
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.zezms_m43_correction_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER zezms_m43_correction_guard BEFORE INSERT ON public.zezms_sync_operations
 FOR EACH ROW EXECUTE FUNCTION public.zezms_m43_correction_guard();

-- Filled ONLY by a separately approved trusted verifier/DB administrator.
-- The delivering Owner has no INSERT/UPDATE/DELETE or provisioning RPC.
-- Binding attests archived coverage and a complete projection at one owner head;
-- its stock/product/audit data are independent of the incoming operation.
CREATE TABLE public.zezms_m43_reconciliation_evidence(
 evidence_id uuid PRIMARY KEY,owner_id uuid NOT NULL,business_id uuid NOT NULL,branch_id uuid,
 device_id text NOT NULL,correction_id text NOT NULL,operation jsonb NOT NULL,
 audit jsonb NOT NULL,stock_before jsonb NOT NULL,product jsonb NOT NULL,
 operational_year int NOT NULL,operational_month int NOT NULL CHECK(operational_month BETWEEN 1 AND 12),
 expected_head bigint NOT NULL,expected_revision bigint NOT NULL,
 checkpoint_id text NOT NULL,checkpoint_cursor bigint NOT NULL,checkpoint_sha256 text NOT NULL,
 history_count bigint NOT NULL,history_sha256 text NOT NULL,
 archived_coverage_complete boolean NOT NULL CHECK(archived_coverage_complete),
 approved_by uuid NOT NULL,review_reference text NOT NULL CHECK(length(review_reference)>0),expires_at timestamptz NOT NULL,
 UNIQUE(owner_id,correction_id));
ALTER TABLE public.zezms_m43_reconciliation_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zezms_m43_reconciliation_evidence FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.zezms_m43_reconciliation_evidence TO authenticated;
CREATE POLICY owner_read ON public.zezms_m43_reconciliation_evidence FOR SELECT TO authenticated USING(owner_id=auth.uid());

CREATE FUNCTION public.zezms_m43_deliver_preserved_correction(p_evidence_id uuid,p_operation jsonb)
RETURNS TABLE(op_id text,server_seq bigint,created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.zezms_m43_reconciliation_evidence%rowtype; scope record;
 s public.zezms_sync_state%rowtype; prior public.zezms_m43_correction_receipts%rowtype;
 accepted public.zezms_sync_operations%rowtype; got record; patch jsonb; expected jsonb; allocation jsonb;
 head bigint; count_ops bigint; digest_ops text; stock numeric; checkpoint public.zezms_sync_checkpoints%rowtype;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'M43_AUTH_REQUIRED'; END IF;
 SELECT * INTO e FROM public.zezms_m43_reconciliation_evidence WHERE evidence_id=p_evidence_id AND owner_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'M43_EVIDENCE_UNAVAILABLE'; END IF;
 IF NOT public.zezms_has_business_role(e.business_id,ARRAY['OWNER']) THEN RAISE EXCEPTION 'M43_ACTIVE_OWNER_REQUIRED'; END IF;
 SELECT * INTO scope FROM public.zezms_m5a4_resolve_device(p_operation->>'deviceId',ARRAY['ACTIVE']);
 IF scope.owner_id IS DISTINCT FROM auth.uid() OR scope.business_id IS DISTINCT FROM e.business_id
  OR scope.branch_id IS DISTINCT FROM e.branch_id OR p_operation->>'deviceId' IS DISTINCT FROM e.device_id THEN RAISE EXCEPTION 'M43_OWNER_SCOPE'; END IF;
 SELECT * INTO s FROM public.zezms_sync_state WHERE owner_id=e.owner_id FOR UPDATE;
 IF NOT FOUND OR s.protocol_version IS DISTINCT FROM 'M4/3' THEN RAISE EXCEPTION 'M43_PROTOCOL'; END IF;
 PERFORM 1 FROM public.zezms_device_lifecycle WHERE id=scope.lifecycle_id AND lifecycle_state='ACTIVE' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'M43_DEVICE_REVOKED'; END IF;
 PERFORM 1 FROM public.zezms_business_devices WHERE business_id=e.business_id AND device_id=e.device_id AND user_id=e.owner_id AND revoked_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'M43_DEVICE_REVOKED'; END IF;
 IF p_operation IS DISTINCT FROM e.operation OR coalesce(p_operation->>'opId','')='' OR p_operation->>'protocolVersion' IS DISTINCT FROM 'M4/3'
  OR p_operation->>'kind' IS DISTINCT FROM 'STOCK_CORRECTION_UPSERT'
  OR p_operation ? 'businessId' OR p_operation ? 'branchId'
  OR p_operation->>'originDeviceId' IS DISTINCT FROM e.device_id
  OR coalesce((p_operation->>'deviceSeq')::bigint,0)<=0
  OR p_operation->>'rulesHash' IS DISTINCT FROM s.rules_hash
  OR p_operation->>'identityRegistryHash' IS DISTINCT FROM s.identity_registry_hash
  OR coalesce((p_operation->>'clientGeneration')::int,0)<s.minimum_client_generation
  OR p_operation->>'payloadHash' IS DISTINCT FROM public.zezms_m43_payload_hash(p_operation)
 THEN RAISE EXCEPTION 'M43_BOUND_OPERATION_MISMATCH'; END IF;

 -- Same-ID recovery precedes stale-head/expiry checks, but never authorization,
 -- protocol, exact payload/hash or matching durable receipt validation.
 SELECT o.* INTO accepted FROM public.zezms_sync_operations o WHERE o.owner_id=e.owner_id AND o.op_id=p_operation->>'opId';
 IF FOUND THEN
  SELECT * INTO prior FROM public.zezms_m43_correction_receipts WHERE owner_id=e.owner_id AND correction_id=e.correction_id;
  IF accepted.payload IS DISTINCT FROM p_operation OR prior.payload IS DISTINCT FROM p_operation
   OR prior.op_id IS DISTINCT FROM accepted.op_id OR prior.server_seq IS DISTINCT FROM accepted.seq
   OR prior.audit IS DISTINCT FROM e.audit THEN RAISE EXCEPTION 'M43_ACK_PAYLOAD_CONFLICT'; END IF;
  RETURN QUERY SELECT accepted.op_id,accepted.seq,accepted.created_at; RETURN;
 END IF;
 IF e.expires_at<=clock_timestamp() OR NOT e.archived_coverage_complete OR e.approved_by<>e.owner_id THEN RAISE EXCEPTION 'M43_EVIDENCE_EXPIRED'; END IF;
 SELECT greatest(coalesce(max(seq),0),e.checkpoint_cursor),count(*),
  encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_array(o.seq,o.op_id,o.payload) ORDER BY o.seq),'[]')::text,'UTF8')),'hex')
  INTO head,count_ops,digest_ops FROM public.zezms_sync_operations o WHERE o.owner_id=e.owner_id;
 IF head<>e.expected_head OR s.revision<>e.expected_revision OR count_ops<>e.history_count OR digest_ops<>e.history_sha256 THEN RAISE EXCEPTION 'M43_CLOUD_HEAD_CHANGED'; END IF;
 SELECT * INTO checkpoint FROM public.zezms_sync_checkpoints WHERE owner_id=e.owner_id AND checkpoint_id=e.checkpoint_id FOR SHARE;
 IF NOT FOUND OR checkpoint.checkpoint_cursor<>e.checkpoint_cursor OR checkpoint.business_id IS DISTINCT FROM e.business_id
  OR checkpoint.checkpoint_cursor>head OR checkpoint.protocol_version<>'M4/3'
  OR encode(sha256(convert_to(checkpoint.payload::text,'UTF8')),'hex')<>e.checkpoint_sha256 THEN RAISE EXCEPTION 'M43_CHECKPOINT_UNPROVEN'; END IF;
 IF EXISTS(SELECT 1 FROM public.zezms_m43_correction_receipts WHERE owner_id=e.owner_id AND correction_id=e.correction_id)
  OR EXISTS(SELECT 1 FROM public.zezms_sync_checkpoints c CROSS JOIN LATERAL jsonb_array_elements(coalesce(c.payload->'stockCorrections','[]')) a WHERE c.owner_id=e.owner_id AND a->>'correctionId'=e.correction_id)
 THEN RAISE EXCEPTION 'M43_CORRECTION_ALREADY_ACCEPTED'; END IF;
 allocation:=e.audit->'allocations'->0;
 IF coalesce(e.product->>'id','')='' OR coalesce(e.audit->>'createdAt','')='' OR e.audit->>'correctionId' IS DISTINCT FROM e.correction_id OR e.audit->>'productId' IS DISTINCT FROM e.product->>'id'
  OR e.stock_before->>'productId' IS DISTINCT FROM e.product->>'id' OR coalesce(e.stock_before->>'id','')=''
  OR (e.stock_before->>'rStock')::numeric IS DISTINCT FROM 2
  OR (e.stock_before->>'year')::int IS DISTINCT FROM e.operational_year OR (e.stock_before->>'month')::int IS DISTINCT FROM e.operational_month
  OR e.audit->>'status' IS DISTINCT FROM 'Completed' OR e.audit->>'reversalOf' IS DISTINCT FROM ''
  OR e.audit->>'correctionType' IS DISTINCT FROM 'Quantity Decrease' OR e.audit->>'reason' IS DISTINCT FROM 'Physical Count Adjustment'
  OR (e.audit->>'beforeQty')::numeric IS DISTINCT FROM 2 OR (e.audit->>'afterQty')::numeric IS DISTINCT FROM 0 OR (e.audit->>'quantity')::numeric IS DISTINCT FROM 2
  OR jsonb_array_length(e.audit->'allocations') IS DISTINCT FROM 1
  OR allocation->>'stockRowId' IS DISTINCT FROM e.stock_before->>'id'
  OR (allocation->>'beforeRStock')::numeric IS DISTINCT FROM 2 OR (allocation->>'afterRStock')::numeric IS DISTINCT FROM 0
  OR (allocation->>'quantity')::numeric IS DISTINCT FROM 2 OR (allocation->>'unitCost')::numeric IS DISTINCT FROM (e.stock_before->>'uCost')::numeric
  OR e.audit->'adjustmentTxnIds' IS DISTINCT FROM jsonb_build_array(e.stock_before->>'id')
 THEN RAISE EXCEPTION 'M43_INDEPENDENT_AUDIT_BINDING'; END IF;
 expected:=jsonb_build_array(
  jsonb_build_object('action','update','collection','stockRows','key',e.stock_before->>'id',
   'changes',jsonb_build_array(jsonb_build_object('field','rStock','mode','delta','value',-2,'before',2)),
   'fallback',jsonb_set(e.stock_before,'{rStock}','0')),
  jsonb_build_object('action','insert','collection','stockCorrections','key',e.correction_id,'value',e.audit));
 IF p_operation->'patches' IS DISTINCT FROM expected THEN RAISE EXCEPTION 'M43_PATCH_SET'; END IF;
 SELECT value INTO stock FROM public.zezms_sync_counters WHERE owner_id=e.owner_id AND collection='stockRows'
  AND entity_key=e.stock_before->>'id' AND field_name='rStock' FOR UPDATE;
 IF NOT FOUND OR stock IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'M43_STOCK_BEFORE_CHANGED'; END IF;
 SELECT * INTO got FROM public.zezms_ops_push(jsonb_build_array(p_operation));
 SELECT * INTO prior FROM public.zezms_m43_correction_receipts WHERE owner_id=e.owner_id AND correction_id=e.correction_id;
 SELECT value INTO stock FROM public.zezms_sync_counters WHERE owner_id=e.owner_id AND collection='stockRows' AND entity_key=e.stock_before->>'id' AND field_name='rStock';
 IF stock IS DISTINCT FROM 0 OR prior.server_seq IS DISTINCT FROM got.server_seq OR prior.payload IS DISTINCT FROM p_operation THEN RAISE EXCEPTION 'M43_POSTCONDITION'; END IF;
 RETURN QUERY SELECT got.op_id,got.server_seq,got.created_at;
END $$;
REVOKE ALL ON FUNCTION public.zezms_m43_deliver_preserved_correction(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.zezms_m43_deliver_preserved_correction(uuid,jsonb) TO authenticated;

-- Normal same-ID retries must not ACK a conflicting payload. The exact source
-- guard/replacement is appended by the source-pinned build step below.
DO $guard$
DECLARE def text; src text;
BEGIN
 SELECT p.prosrc,pg_get_functiondef(p.oid) INTO src,def FROM pg_proc p WHERE p.oid='public.zezms_ops_push(jsonb)'::regprocedure;
 IF md5(replace(src,E'\r\n',E'\n'))<>'0aa04134b88b546e0c6d8d12dc3d533f' THEN RAISE EXCEPTION 'M43_RPC_SOURCE_CHANGED'; END IF;
 EXECUTE replace(def,$old$if found then op_id:=v_existing.op_id; server_seq:=v_existing.seq; created_at:=v_existing.created_at; return next; continue; end if;$old$,$new$if found then if v_existing.payload is distinct from o then raise exception 'M43_ACK_PAYLOAD_CONFLICT' using errcode='P0001'; end if; op_id:=v_existing.op_id; server_seq:=v_existing.seq; created_at:=v_existing.created_at; return next; continue; end if;
    if exists(select 1 from jsonb_array_elements(coalesce(o->'patches','[]')) x join public.zezms_m43_correction_receipts cr on cr.owner_id=r.owner_id and cr.correction_id=x.value->'value'->>'correctionId' where x.value->>'action'='insert' and x.value->>'collection'='stockCorrections') then raise exception 'M43_CORRECTION_ALREADY_ACCEPTED'; end if;$new$);
END $guard$;
COMMIT;
