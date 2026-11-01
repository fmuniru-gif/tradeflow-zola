-- Disposable PostgreSQL contract fixture, not a production migration.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO authenticated,anon;
CREATE TABLE public.zezms_sync_state(owner_id uuid PRIMARY KEY, protocol_version text, minimum_client_generation int, rules_hash text, identity_registry_hash text, capabilities jsonb DEFAULT '{}', revision bigint DEFAULT 0, updated_at timestamptz, updated_by text, sync_mode text);
CREATE TABLE public.zezms_sync_operations(seq bigserial PRIMARY KEY,owner_id uuid NOT NULL,business_id uuid,branch_id uuid,op_id text NOT NULL,device_id text,device_seq bigint,kind text,payload jsonb,client_created_at timestamptz,created_at timestamptz DEFAULT now(),UNIQUE(owner_id,op_id));
CREATE TABLE public.zezms_sync_counters(owner_id uuid,collection text,entity_key text,field_name text,value numeric,updated_at timestamptz,PRIMARY KEY(owner_id,collection,entity_key,field_name));
CREATE TABLE public.zezms_branches(id uuid PRIMARY KEY,business_id uuid,status text,is_primary boolean,created_at timestamptz DEFAULT now());
CREATE TABLE public.zezms_device_lifecycle(id uuid PRIMARY KEY,device_id text,owner_id uuid,business_id uuid,branch_id uuid,device_user_id uuid,lifecycle_state text,revision bigint);
CREATE TABLE public.zezms_business_devices(business_id uuid,device_id text,user_id uuid,revoked_at timestamptz);
CREATE TABLE public.zezms_device_access(business_id uuid,device_id text,device_user_id uuid,status text,revoked_at timestamptz);
CREATE TABLE public.zezms_sync_checkpoints(owner_id uuid,checkpoint_id text,checkpoint_cursor bigint,protocol_version text,rules_hash text,identity_registry_hash text,payload jsonb,payload_hash text,collection_fingerprints jsonb,created_by_device text,created_at timestamptz,superseded_at timestamptz,business_id uuid,branch_id uuid,scope_type text,minimum_client_generation int,PRIMARY KEY(owner_id,checkpoint_id));
ALTER TABLE public.zezms_sync_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.zezms_sync_operations FOR SELECT TO authenticated USING(owner_id=auth.uid());
GRANT SELECT ON public.zezms_sync_operations TO authenticated;
