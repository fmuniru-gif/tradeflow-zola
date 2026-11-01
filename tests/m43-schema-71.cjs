'use strict';
// Metadata-only reconstruction. No production defaults/ACLs are inferred.
const fs=require('node:fs'),path=require('node:path');
const report=require('./fixtures/m43-production-schema-71.json');
const ident=s=>'"'+s.replace(/"/g,'""')+'"',quote=s=>"'"+String(s).replace(/'/g,"''")+"'";
function ddl(){
 const out=[`DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='postgres') THEN CREATE ROLE postgres SUPERUSER NOLOGIN; END IF; END$$;
 SET ROLE postgres; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 GRANT USAGE ON SCHEMA auth TO authenticated,anon;
 -- External FK targets / membership are synthetic dependencies, not exported DDL.
 CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE TABLE public.zezms_businesses(id uuid PRIMARY KEY);
 CREATE TABLE public.zezms_device_pairing_codes(id uuid PRIMARY KEY);
 CREATE TABLE public.zezms_business_members(business_id uuid,user_id uuid,status text,role text);
 CREATE SEQUENCE public.synthetic_operations_seq;
 `];
 for(const table of report.table_security.map(t=>t.table)){
  const columns=report.columns.filter(c=>c.table===table).map(c=>ident(c.column)+' '+c.type+(c.nullable==='NO'?' NOT NULL':''));
  out.push('CREATE TABLE public.'+ident(table)+'('+columns.join(',')+');');
 }
 // Export71 contains neither identity nor default expressions. This explicit
 // fixture sequence supplies only the missing mechanism required by ops_push.
 out.push('ALTER SEQUENCE public.synthetic_operations_seq OWNED BY public.zezms_sync_operations.seq; ALTER TABLE public.zezms_sync_operations ALTER COLUMN seq SET DEFAULT nextval(\'public.synthetic_operations_seq\');');
 for(const c of report.constraints)out.push('ALTER TABLE public.'+ident(c.table)+' ADD CONSTRAINT '+ident(c.name)+' '+c.definition+';');
 out.push(fs.readFileSync(path.join(__dirname,'fixtures/m43-schema-71-helper-source.sql'),'utf8'));
 out.push(`
 -- Three unexported helpers are TEST DOUBLES. Their live bodies/ACLs remain a
 -- blocker; policy expressions and trigger attachment DDL are exact export71.
 CREATE FUNCTION public.zezms_is_active_business_member(b uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$SELECT EXISTS(SELECT 1 FROM public.zezms_business_members m WHERE m.business_id=b AND m.user_id=auth.uid() AND m.status='ACTIVE')$$;
 CREATE FUNCTION public.zezms_m5a3_is_active_device_for_owner(o uuid,unused text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$SELECT EXISTS(SELECT 1 FROM public.zezms_device_lifecycle l JOIN public.zezms_device_access a ON a.business_id=l.business_id AND a.device_id=l.device_id WHERE l.owner_id=o AND l.lifecycle_state='ACTIVE' AND a.device_user_id=auth.uid() AND a.status='ACTIVE' AND a.revoked_at IS NULL)$$;
 CREATE FUNCTION public.zezms_set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.updated_at=now();RETURN NEW;END$$;
 REVOKE ALL ON FUNCTION public.zezms_has_business_role(uuid,text[]),public.zezms_is_active_business_member(uuid),public.zezms_m5a3_is_active_device_for_owner(uuid,text) FROM PUBLIC,anon;
 GRANT EXECUTE ON FUNCTION public.zezms_has_business_role(uuid,text[]),public.zezms_is_active_business_member(uuid),public.zezms_m5a3_is_active_device_for_owner(uuid,text) TO authenticated;
 REVOKE ALL ON FUNCTION public.zezms_mb3_lifecycle_branch_data_plane_guard() FROM PUBLIC,anon,authenticated;
 `);
 for(const t of report.table_security){
  out.push('ALTER TABLE public.'+ident(t.table)+(t.rls_enabled?' ENABLE':' DISABLE')+' ROW LEVEL SECURITY;');
  out.push('ALTER TABLE public.'+ident(t.table)+(t.rls_forced?' FORCE':' NO FORCE')+' ROW LEVEL SECURITY;');
  out.push(...t.triggers.map(t=>t+';'));
 }
 for(const p of report.policies)out.push('CREATE POLICY '+ident(p.name)+' ON public.'+ident(p.table)+' FOR '+p.command+' TO '+p.roles.map(ident).join(',')+(p.using?' USING ('+p.using+')':'')+(p.with_check?' WITH CHECK ('+p.with_check+')':'')+';');
 out.push(`-- Exercise RLS under a broad test-only grant profile; table ACLs are absent
 -- from71. This is not a claim about production effective grants.
 GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
 GRANT INSERT,UPDATE,DELETE ON public.zezms_sync_state TO authenticated;`);
 return out.join('\n')+'\n';
}
function values(table,overrides){
 const row={};for(const c of report.columns.filter(c=>c.table===table)){
  if(c.nullable==='YES')row[c.column]=null;
  else if(c.type==='text')row[c.column]='';
  else if(c.type==='boolean')row[c.column]=false;
  else if(c.type==='jsonb')row[c.column]={};
  else if(c.type==='timestamp with time zone')row[c.column]='2026-11-01T00:00:00Z';
  else if(c.type==='uuid')row[c.column]='99999999-9999-4999-8999-999999999999';
  else row[c.column]=0;
 }
 return {...row,...overrides};
}
function insert(table,overrides){const r=values(table,overrides),literal=v=>v===null?'NULL':typeof v==='object'?quote(JSON.stringify(v))+'::jsonb':typeof v==='number'||typeof v==='boolean'?String(v):quote(v);return 'INSERT INTO public.'+ident(table)+'('+Object.keys(r).map(ident).join(',')+') VALUES('+Object.values(r).map(literal).join(',')+');';}
module.exports={report,ddl,insert};
if(require.main===module)process.stdout.write(ddl());
