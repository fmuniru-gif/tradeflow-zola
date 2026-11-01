'use strict';
// Requires an isolated PostgreSQL server. No production URLs/credentials accepted.
const {test}=require('node:test'),assert=require('node:assert/strict'),{execFileSync,spawn}=require('node:child_process');
const {scenario,ioFor,ids,copy,fixture}=require('./m43-reconciliation-fixture.cjs'),tool=require('../diagnostics/m43-correction-reconciliation/coordinator.js');
if(process.env.PGHOST!=='127.0.0.1'||process.env.PGDATABASE!=='tradeflow_synthetic')throw Error('ISOLATED_POSTGRES_REQUIRED');
const q=v=>"'"+String(v).replace(/'/g,"''")+"'",j=v=>q(JSON.stringify(v))+'::jsonb';
function sql(s){return execFileSync('psql',['-X','-qAt','-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();}
function as(user,s){return `SET ROLE authenticated; SET request.jwt.claim.sub=${q(user)}; ${s}`;}
function rpc(e,op=e.operation){return `SELECT row_to_json(t) FROM public.zezms_m43_deliver_preserved_correction(${q(e.evidence_id)},${j(op)}) t;`;}
function ordinary(op){return `SELECT row_to_json(t) FROM public.zezms_ops_push(${j([op])}) t;`;}
function asyncSQL(s){return new Promise(resolve=>{const p=spawn('psql',['-X','-qAt','-v','ON_ERROR_STOP=1']),out=[],err=[];p.stdout.on('data',v=>out.push(v));p.stderr.on('data',v=>err.push(v));p.on('close',code=>resolve({code,out:Buffer.concat(out).toString(),error:Buffer.concat(err).toString()}));p.stdin.end(s);});}
const fingerprint=()=>sql("SELECT jsonb_build_object('stock',(SELECT jsonb_agg(jsonb_build_array(owner_id,entity_key,value) ORDER BY owner_id,entity_key) FROM public.zezms_sync_counters),'ops',(SELECT count(*) FROM public.zezms_sync_operations),'receipts',(SELECT count(*) FROM public.zezms_m43_correction_receipts),'revision',(SELECT sum(revision) FROM public.zezms_sync_state));");
const schema71=require('./m43-schema-71.cjs');
function seed(stockFields){
 const s=scenario(stockFields),e=s.evidence,op=e.operation;
 sql(`DROP TRIGGER IF EXISTS synthetic_abort ON public.zezms_sync_operations;DROP FUNCTION IF EXISTS public.synthetic_abort();TRUNCATE public.zezms_m43_correction_receipts,public.zezms_m43_reconciliation_evidence,public.zezms_sync_operations,public.zezms_sync_checkpoints,public.zezms_sync_counters,public.zezms_sync_state,public.zezms_branches,public.zezms_device_lifecycle,public.zezms_business_devices,public.zezms_device_access RESTART IDENTITY CASCADE;

 INSERT INTO auth.users(id) VALUES(${q(ids.owner)}),(${q(ids.other)}),(${q('77777777-7777-4777-8777-777777777777')}) ON CONFLICT DO NOTHING;
 INSERT INTO public.zezms_businesses(id) VALUES(${q(ids.business)}) ON CONFLICT DO NOTHING;
 DELETE FROM public.zezms_business_members;INSERT INTO public.zezms_business_members VALUES(${q(ids.business)},${q(ids.owner)},'ACTIVE','OWNER'),(${q(ids.business)},${q(ids.other)},'ACTIVE','ADMIN');
 ${schema71.insert('zezms_sync_state',{owner_id:ids.owner,protocol_version:'M4/3',minimum_client_generation:31800,rules_hash:op.rulesHash,identity_registry_hash:op.identityRegistryHash,capabilities:{},payload:{},sync_mode:'operations'})}
 ${schema71.insert('zezms_branches',{id:ids.branch,business_id:ids.business,name:'Synthetic branch',code:'SYNTHETIC',status:'ACTIVE',is_primary:true})}
 ${schema71.insert('zezms_device_lifecycle',{id:ids.life,device_id:e.device_id,owner_id:ids.owner,business_id:ids.business,branch_id:ids.branch,device_user_id:ids.other,lifecycle_state:'ACTIVE',enrollment_mode:'INITIAL',revision:1})}
 ${schema71.insert('zezms_business_devices',{id:'88888888-8888-4888-8888-888888888888',business_id:ids.business,device_id:e.device_id,user_id:ids.owner})}
 ${schema71.insert('zezms_device_access',{id:'99999999-9999-4999-8999-999999999999',business_id:ids.business,owner_id:ids.owner,branch_id:ids.branch,device_id:e.device_id,device_user_id:ids.other,status:'ACTIVE'})}
 ${schema71.insert('zezms_sync_operations',{seq:3957,owner_id:ids.owner,business_id:ids.business,branch_id:ids.branch,op_id:'synthetic-anchor',device_id:'synthetic-peer',device_seq:0,kind:'DATABASE_CHANGE',payload:{patches:[]}})}
 SELECT setval(pg_get_serial_sequence('public.zezms_sync_operations','seq'),3957);
 INSERT INTO public.zezms_sync_counters VALUES(${q(ids.owner)},'stockRows','L1','rStock',2,now()),(${q(ids.owner)},'stockRows','L2','rStock',134,now()),(${q(ids.owner)},'cashBalances','Others','value',999,now());
 ${schema71.insert('zezms_sync_checkpoints',{owner_id:ids.owner,checkpoint_id:'synthetic-checkpoint',checkpoint_cursor:1267,protocol_version:'M4/3',payload:s.before,business_id:ids.business,branch_id:ids.branch,rules_hash:op.rulesHash,identity_registry_hash:op.identityRegistryHash,payload_hash:'SYNTHETIC',collection_fingerprints:{}})}

 `);
 const bound={...e,expected_head:3957,expected_revision:0,checkpoint_id:'synthetic-checkpoint',checkpoint_cursor:1267,checkpoint_sha256:'pending',history_count:1,history_sha256:'pending',archived_coverage_complete:true,approved_by:ids.owner,review_reference:'SYNTHETIC independent verifier binding',expires_at:'2099-01-01T00:00:00Z'};
 const vals=Object.values(bound).map(v=>v&&typeof v==='object'?j(v):typeof v==='boolean'?String(v):typeof v==='number'?String(v):q(v));
 sql(`INSERT INTO public.zezms_m43_reconciliation_evidence(${Object.keys(bound).join(',')}) VALUES(${vals.join(',')});
 UPDATE public.zezms_m43_reconciliation_evidence SET checkpoint_sha256=(SELECT encode(sha256(convert_to(payload::text,'UTF8')),'hex') FROM public.zezms_sync_checkpoints WHERE checkpoint_id='synthetic-checkpoint'),history_sha256=(SELECT encode(sha256(convert_to(jsonb_agg(jsonb_build_array(seq,op_id,payload) ORDER BY seq)::text,'UTF8')),'hex') FROM public.zezms_sync_operations WHERE owner_id=${q(ids.owner)});`);
 return s;
}
test('actual PostgreSQL M4/3 hash equals the authoritative embedded JS, including UTF-16, numeric keys and metadata; M4/4 remains unchanged',()=>{
 const s=scenario();const values=[{},[],{a:1},s.evidence.operation,{z:'é中😀\n\t"\\',a:[null,true,false,-0,0.25,12.345678,1e-6,9007199254740991]}, {'10':'ten','2':'two','01':'text','4294967295':'not index','😀':1,'\uffff':2}, {a:{payloadHash:'omit',attempts:3,keep:'yes'},lastError:'omit'}];
 for(const v of values)assert.equal(sql(`SELECT public.zezms_m43_payload_hash(${j(v)});`),s.f.sync._test.deterministicHash(v));
 assert.equal(sql("SELECT public.zezms_mb3_payload_hash('{}');"),'04c2ca07b5901a25');
 assert.equal(sql(`SELECT public.zezms_m43_payload_hash(${j({small:1e-7})});`),s.f.sync._test.deterministicHash({small:1e-7}));
 assert.throws(()=>sql("SELECT public.zezms_m43_payload_hash('{\"notJs\":0.123456789012345678901}');"),/NUMBER_NOT_JS_WIRE/);
});
test('same ID/payload returns original receipt after lost ACK, restart, expired binding and a later head',()=>{
 const s=seed(),e=s.evidence,first=JSON.parse(sql(as(ids.owner,rpc(e))));
 sql(`UPDATE public.zezms_m43_reconciliation_evidence SET expires_at='2000-01-01';UPDATE public.zezms_sync_state SET revision=revision+1;`);
 assert.deepEqual(JSON.parse(sql(as(ids.owner,rpc(e)))),first);assert.equal(sql("SELECT value FROM public.zezms_sync_counters WHERE entity_key='L1';"),'0');
 assert.equal(sql('SELECT count(*) FROM public.zezms_m43_correction_receipts;'),'1');
});
test('checkpoint-only historical correction backfill blocks delayed originals; ambiguous history aborts',()=>{
 const fs=require('node:fs'),source=fs.readFileSync(require('node:path').join(__dirname,'../migrations/20261101_m43_preserved_correction.sql'),'utf8');
 const backfill=source.match(/DO \$\$\nDECLARE r record;[\s\S]*?END \$\$;/)[0],s=seed();
 sql(`UPDATE public.zezms_sync_checkpoints SET payload=jsonb_set(payload,'{stockCorrections}',${j([s.evidence.audit])});${backfill}`);
 const before=fingerprint();assert.throws(()=>sql(as(ids.owner,ordinary(s.originalOperation))),/CORRECTION_ALREADY_ACCEPTED/);assert.equal(fingerprint(),before);
 assert.throws(()=>sql(`BEGIN;UPDATE public.zezms_sync_checkpoints SET payload=jsonb_set(payload,'{stockCorrections,0,quantity}','999');${backfill}ROLLBACK;`),/HISTORY_CORRECTION_CONFLICT/);
 assert.equal(fingerprint(),before);
});
test('same ID changed payload is never ACKed through either special or normal upload',()=>{
 const s=seed(),e=s.evidence;sql(as(ids.owner,rpc(e)));const before=fingerprint(),bad=copy(e.operation);bad.reason='changed';bad.payloadHash=s.f.sync._test.deterministicHash(bad);
 assert.throws(()=>sql(as(ids.owner,rpc(e,bad))),/BOUND_OPERATION_MISMATCH/);assert.throws(()=>sql(as(ids.owner,ordinary(bad))),/ACK_PAYLOAD_CONFLICT/);assert.equal(fingerprint(),before);
});
test('delayed original different ID and a second compensating ID cannot apply the correction twice',()=>{
 const s=seed();sql(as(ids.owner,rpc(s.evidence)));const before=fingerprint();
 for(const op of [s.originalOperation,{...s.evidence.operation,opId:'another-new-id'}]){
  op.payloadHash=s.f.sync._test.deterministicHash(op);assert.throws(()=>sql(as(ids.owner,ordinary(op))),/CORRECTION_ALREADY_ACCEPTED/);
 }
 assert.equal(fingerprint(),before);
});
test('concurrent sessions delivering the same ID return one receipt; different IDs/original compete for one correction',async()=>{
 let s=seed(),e=s.evidence;let results=await Promise.all([asyncSQL(as(ids.owner,rpc(e))),asyncSQL(as(ids.owner,rpc(e)))]);
 assert.ok(results.every(r=>r.code===0));assert.equal(results[0].out,results[1].out);assert.equal(sql('SELECT count(*) FROM public.zezms_m43_correction_receipts;'),'1');
 s=seed();e=s.evidence;results=await Promise.all([asyncSQL(as(ids.owner,rpc(e))),asyncSQL(as(ids.owner,ordinary(s.originalOperation)))]);
 assert.equal(results.filter(r=>r.code===0).length,1);assert.equal(sql("SELECT value FROM public.zezms_sync_counters WHERE entity_key='L1';"),'0');assert.equal(sql('SELECT count(*) FROM public.zezms_m43_correction_receipts;'),'1');
});
test('concurrent unrelated operation serializes under the owner lock; stale evidence rejects without partial stock changes',async()=>{
 const s=seed(),unrelated={...copy(s.evidence.operation),opId:'unrelated-concurrent',kind:'DATABASE_CHANGE',patches:[]};unrelated.payloadHash=s.f.sync._test.deterministicHash(unrelated);
 const first=asyncSQL(as(ids.owner,`SET application_name='synthetic-owner-lock-holder';BEGIN;${ordinary(unrelated)}SELECT pg_sleep(2);COMMIT;`));
 const deadline=Date.now()+5000;while(sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='synthetic-owner-lock-holder' AND wait_event='PgSleep';")!=='1'){if(Date.now()>deadline)throw Error('SYNTHETIC_LOCK_BARRIER_TIMEOUT');await new Promise(r=>setTimeout(r,20));}
 const second=asyncSQL(as(ids.owner,rpc(s.evidence)));const [a,b]=await Promise.all([first,second]);
 assert.equal(a.code,0,a.error);assert.notEqual(b.code,0);assert.match(b.error,/CLOUD_HEAD_CHANGED/);assert.equal(sql("SELECT value FROM public.zezms_sync_counters WHERE entity_key='L1';"),'2');assert.equal(sql('SELECT count(*) FROM public.zezms_m43_correction_receipts;'),'0');
});
test('wrong owner/staff, revoked device, wrong protocol/hash/rules and forbidden evidence writes reject',()=>{
 let s=seed();for(const user of [ids.other,'77777777-7777-4777-8777-777777777777'])assert.throws(()=>sql(as(user,rpc(s.evidence))),/EVIDENCE_UNAVAILABLE/);
 assert.throws(()=>sql(as(ids.owner,'DELETE FROM public.zezms_m43_reconciliation_evidence;')),/permission denied/);
 assert.throws(()=>sql("SET ROLE anon;SELECT * FROM public.zezms_m43_deliver_preserved_correction(NULL,NULL);"),/permission denied/);
 for(const [mutation,code] of [["UPDATE public.zezms_business_devices SET revoked_at=now()",/DEVICE_NOT_ACTIVE/],["UPDATE public.zezms_device_lifecycle SET lifecycle_state='REVOKED'",/DEVICE_NOT_ACTIVE/],["UPDATE public.zezms_sync_state SET protocol_version='M4/4'",/M43_PROTOCOL/],["UPDATE public.zezms_sync_state SET rules_hash='wrong'",/BOUND_OPERATION_MISMATCH/],["UPDATE public.zezms_sync_state SET identity_registry_hash='wrong'",/BOUND_OPERATION_MISMATCH/]]){s=seed();sql(mutation);const before=fingerprint();assert.throws(()=>sql(as(ids.owner,rpc(s.evidence))),code);assert.equal(fingerprint(),before);}
});
test('changed head, archived coverage, checkpoint/layer/product, missing/changed counter and malformed patches reject atomically',()=>{
 for(const [mutation,code] of [
  ["UPDATE public.zezms_sync_state SET revision=1",/CLOUD_HEAD_CHANGED/],
  ["UPDATE public.zezms_sync_checkpoints SET payload=jsonb_set(payload,'{stockRows,0,productId}','\"different\"')",/CHECKPOINT_UNPROVEN/],
  ["UPDATE public.zezms_m43_reconciliation_evidence SET operational_month=10",/INDEPENDENT_AUDIT_BINDING/],
  ["UPDATE public.zezms_m43_reconciliation_evidence SET product=jsonb_set(product,'{id}','\"different\"')",/INDEPENDENT_AUDIT_BINDING/],
  ["UPDATE public.zezms_sync_counters SET value=1 WHERE entity_key='L1'",/STOCK_BEFORE_CHANGED/],
  ["DELETE FROM public.zezms_sync_counters WHERE entity_key='L1'",/STOCK_BEFORE_CHANGED/],
  ["UPDATE public.zezms_m43_reconciliation_evidence SET audit=jsonb_set(audit,'{createdAt}','\"different\"')",/PATCH_SET/],
  ["UPDATE public.zezms_m43_reconciliation_evidence SET operation=jsonb_set(operation,'{patches,0,changes,0,before}','1')",/BOUND_OPERATION_MISMATCH/]
 ]){const s=seed();sql(mutation);const before=fingerprint();assert.throws(()=>sql(as(ids.owner,rpc(s.evidence))),code);assert.equal(fingerprint(),before);}
 const s=seed();assert.throws(()=>sql('UPDATE public.zezms_m43_reconciliation_evidence SET archived_coverage_complete=false;'),/check constraint/);
 for(const kind of ['extra','insert-layer','wrong-hash']){const op=copy(s.evidence.operation);if(kind==='extra')op.patches.push({action:'root-set',root:'cashBalances',value:{}});if(kind==='insert-layer')op.patches[0].action='insert';op.payloadHash=kind==='wrong-hash'?'wrong':s.f.sync._test.deterministicHash(op);sql(`UPDATE public.zezms_m43_reconciliation_evidence SET operation=${j(op)};`);assert.throws(()=>sql(as(ids.owner,rpc(s.evidence,op))),kind==='wrong-hash'?/BOUND_OPERATION_MISMATCH/:/PATCH_SET/);}
});
test('exception after counter mutation rolls back counter, operation and receipt together',()=>{
 const s=seed();sql("CREATE FUNCTION public.synthetic_abort() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'SYNTHETIC_ABORT_AFTER_INSERT';END$$;CREATE TRIGGER synthetic_abort AFTER INSERT ON public.zezms_sync_operations FOR EACH ROW EXECUTE FUNCTION public.synthetic_abort();");
 const before=fingerprint();assert.throws(()=>sql(as(ids.owner,rpc(s.evidence))),/SYNTHETIC_ABORT_AFTER_INSERT/);assert.equal(fingerprint(),before);sql('DROP TRIGGER synthetic_abort ON public.zezms_sync_operations;DROP FUNCTION public.synthetic_abort();');
});
test('real PostgreSQL acceptance plus Main restart/lost ACK and receive-only Shop/Camon converge exactly once',async()=>{
 const s=seed(),beforeMain=s.f.store.get(tool.keys.DB),beforePeer=copy(s.before);
 const net={rpc:async(id,op)=>JSON.parse(sql(as(ids.owner,rpc({...s.evidence,evidence_id:id},op)))),readback:async(op,cid)=>JSON.parse(sql(as(ids.owner,`SELECT row_to_json(t) FROM (SELECT o.owner_id,o.op_id,o.seq,o.payload,(SELECT row_to_json(r) FROM public.zezms_m43_correction_receipts r WHERE r.owner_id=o.owner_id AND r.correction_id=${q(cid)}) receipt FROM public.zezms_sync_operations o WHERE o.op_id=${q(op)}) t;`)))};
 await tool.create(ioFor(s.f,net)).stage(s.evidence);s.f=fixture('synthetic-main',{raw:Object.fromEntries(s.f.store)});
 const lose=ioFor(s.f,net),send=lose.rpc;lose.rpc=async(...args)=>{await send(...args);throw Error('SYNTHETIC_LOST_ACK');};await assert.rejects(()=>tool.create(lose).deliver(),/LOST_ACK/);
 s.f=fixture('synthetic-main',{raw:Object.fromEntries(s.f.store)});await tool.create(ioFor(s.f,net)).deliver();
 const row=await net.readback(s.evidence.operation.opId,s.evidence.correction_id);assert.equal(row.receipt.payload.payloadHash,s.evidence.operation.payloadHash);assert.equal(s.f.store.get(tool.keys.DB),beforeMain);
 for(const device of ['synthetic-shop','synthetic-camon']){const peer=fixture(device,{database:copy(beforePeer)});peer.sync._test.applyOperation(copy(row.payload));peer.sync._test.applyOperation(copy(row.payload));assert.equal(peer.c.DB.stockRows[0].rStock,0);assert.deepEqual(copy(peer.c.DB.stockCorrections),[s.evidence.audit]);for(const key of Object.keys(beforePeer).filter(k=>!['stockRows','stockCorrections'].includes(k)))assert.deepEqual(copy(peer.c.DB[key]),beforePeer[key]);assert.deepEqual(copy(peer.c.DB.stockRows[1]),beforePeer.stockRows[1]);}
 assert.equal(sql("SELECT value FROM public.zezms_sync_counters WHERE entity_key='L2';"),'134');assert.equal(sql("SELECT value FROM public.zezms_sync_counters WHERE collection='cashBalances';"),'999');
 console.log('POSTGRES_THREE_DEVICE_PASS one-receipt same-ID/hash Main-unchanged peers-zero unrelated-preserved');
});

test('export71 reconstruction preserves all130 column types/nullability,44 constraints,15 policies and4 trigger attachments',()=>{
 const report=schema71.report,tables=report.table_security.map(t=>t.table),list=tables.map(q).join(',');
 const columns=JSON.parse(sql(`SELECT jsonb_agg(jsonb_build_object('table',table_name,'column',column_name,'type',data_type,'nullable',is_nullable) ORDER BY table_name,column_name) FROM information_schema.columns WHERE table_schema='public' AND table_name IN(${list});`));
 const sorted=a=>[...a].sort((x,y)=>(x.table+'/'+(x.column||x.name)).localeCompare(y.table+'/'+(y.column||y.name)));
 assert.deepEqual(sorted(columns),sorted(report.columns));
 const constraints=JSON.parse(sql(`SELECT jsonb_agg(jsonb_build_object('table',r.relname,'name',c.conname,'definition',pg_get_constraintdef(c.oid)) ORDER BY r.relname,c.conname) FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid WHERE r.relname IN(${list}) AND c.connamespace='public'::regnamespace;`));
 assert.deepEqual(sorted(constraints),sorted(report.constraints));
 const policies=JSON.parse(sql(`SELECT jsonb_agg(jsonb_build_object('table',tablename,'name',policyname,'roles',roles,'command',cmd,'using',qual,'with_check',with_check) ORDER BY tablename,policyname) FROM pg_policies WHERE schemaname='public' AND tablename IN(${list});`));
 assert.deepEqual(sorted(policies),sorted(report.policies));
 const security=JSON.parse(sql(`SELECT jsonb_agg(jsonb_build_object('table',r.relname,'rls_enabled',r.relrowsecurity,'rls_forced',r.relforcerowsecurity,'triggers',coalesce((SELECT jsonb_agg(pg_get_triggerdef(t.oid) ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgrelid=r.oid AND NOT t.tgisinternal AND t.tgname<>'zezms_m43_correction_guard'),'[]')) ORDER BY r.relname) FROM pg_class r WHERE r.relnamespace='public'::regnamespace AND r.relname IN(${list});`));
 const normalize=a=>a.map(r=>({...r,triggers:r.triggers.map(t=>t.replace(/\s+/g,' ').trim()).sort()})).sort((a,b)=>a.table.localeCompare(b.table));
 assert.deepEqual(normalize(security),normalize(report.table_security));
 console.log('SCHEMA71_CATALOG_PASS columns130 constraints44 policies15 existingTriggers4');
});

test('private resolver ACL and broad default grants preserve effective Owner-only RPC and evidence isolation',()=>{
 const s=seed();
 assert.equal(sql("SELECT has_function_privilege('authenticated','public.zezms_m5a4_resolve_device(text,text[])','EXECUTE');"),'f');
 assert.throws(()=>sql(as(ids.owner,`SELECT * FROM public.zezms_m5a4_resolve_device(${q(s.evidence.device_id)},ARRAY['ACTIVE']);`)),/permission denied/);
 assert.equal(sql("SELECT has_function_privilege('anon','public.zezms_m43_deliver_preserved_correction(uuid,jsonb)','EXECUTE');"),'f');
 assert.equal(sql("SELECT has_function_privilege('authenticated','public.zezms_m43_deliver_preserved_correction(uuid,jsonb)','EXECUTE');"),'t');
 assert.equal(sql("SELECT has_function_privilege('authenticated','public.zezms_m43_correction_guard()','EXECUTE');"),'f');
 assert.equal(sql("SELECT has_function_privilege('anon','public.zezms_ops_push(jsonb)','EXECUTE');"),'f');
 for(const table of ['zezms_m43_reconciliation_evidence','zezms_m43_correction_receipts']){
  assert.equal(sql(`SELECT has_table_privilege('anon',${q('public.'+table)},'SELECT');`),'f');
  for(const privilege of ['INSERT','UPDATE','DELETE'])assert.equal(sql(`SELECT has_table_privilege('authenticated',${q('public.'+table)},${q(privilege)});`),'f');
  assert.equal(sql(as(ids.other,`SELECT count(*) FROM public.${table};`)),'0');
 }
 assert.equal(sql("SELECT bool_and(prosecdef AND pg_get_userbyid(proowner)='postgres' AND proconfig @> ARRAY['search_path=\"\"']) FROM pg_proc WHERE oid IN('public.zezms_m43_deliver_preserved_correction(uuid,jsonb)'::regprocedure,'public.zezms_ops_push(jsonb)'::regprocedure);"),'t');
 // Definer calls the private resolver; granting clients resolver access is unnecessary.
 sql(as(ids.owner,rpc(s.evidence)));assert.equal(sql(as(ids.owner,'SELECT count(*) FROM public.zezms_m43_correction_receipts;')),'1');
});

test('inactive, removed or ADMIN-only membership cannot use an old Owner enrollment to deliver',()=>{
 for(const mutation of ["UPDATE public.zezms_business_members SET status='INACTIVE' WHERE role='OWNER'","UPDATE public.zezms_business_members SET role='ADMIN' WHERE role='OWNER'","DELETE FROM public.zezms_business_members WHERE role='OWNER'"]){
  const s=seed();sql(mutation);const before=fingerprint();
  // The original private resolver still recognizes the enrolled auth UID.
  assert.equal(sql(`SET ROLE postgres;SET request.jwt.claim.sub=${q(ids.owner)};SELECT count(*) FROM public.zezms_m5a4_resolve_device(${q(s.evidence.device_id)},ARRAY['ACTIVE']);`),'1');
  assert.throws(()=>sql(as(ids.owner,rpc(s.evidence))),/ACTIVE_OWNER_REQUIRED/);assert.equal(fingerprint(),before);
 }
});

test('existing FK/check/unique constraints and lifecycle triggers remain enforced and do not modify delivery records',()=>{
 const s=seed(),before=sql("SELECT jsonb_build_array((SELECT jsonb_agg(t ORDER BY id) FROM public.zezms_device_lifecycle t),(SELECT jsonb_agg(t ORDER BY id) FROM public.zezms_business_devices t),(SELECT jsonb_agg(t ORDER BY id) FROM public.zezms_branches t));");
 assert.throws(()=>sql("UPDATE public.zezms_device_access SET status='INVALID';"),/status_check/);
 assert.throws(()=>sql("UPDATE public.zezms_device_lifecycle SET enrollment_mode='INVALID';"),/enrollment_mode_check/);
 assert.throws(()=>sql("UPDATE public.zezms_sync_operations SET business_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';"),/business_fk/);
 sql(schema71.insert('zezms_branches',{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',business_id:ids.business,name:'Synthetic secondary',code:'SECONDARY',status:'ACTIVE',is_primary:false}));
 assert.throws(()=>sql("UPDATE public.zezms_device_lifecycle SET branch_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';"),/BRANCH_DATA_PLANE_NOT_ACTIVE/);
 sql("DELETE FROM public.zezms_branches WHERE code='SECONDARY';");sql(as(ids.owner,rpc(s.evidence)));
 assert.equal(sql("SELECT jsonb_build_array((SELECT jsonb_agg(t ORDER BY id) FROM public.zezms_device_lifecycle t),(SELECT jsonb_agg(t ORDER BY id) FROM public.zezms_business_devices t),(SELECT jsonb_agg(t ORDER BY id) FROM public.zezms_branches t));"),before);
});

test('actual correction producer with existing floating-point layer fields now passes JS/PostgreSQL hash parity without rounding records',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const old=execFileSync('git',['show','7973e4a0c16856d536f25c84c8a3f90b08df17c6:migrations/20261101_m43_preserved_correction.sql'],{cwd:path.resolve(__dirname,'..'),encoding:'utf8'}).replace(/\r\n/g,'\n');
 const prior=old.match(/CREATE FUNCTION public\.zezms_m43_canonical[\s\S]*?END \$\$;/)[0].replaceAll('zezms_m43_canonical','synthetic_prior_m43_canonical');sql(prior);
 const s=seed({aPrice:10/3,profit:0.30000000000000004,disc:1e-7}),before=s.f.store.get(tool.keys.DB);
 try{assert.throws(()=>sql(`SELECT public.synthetic_prior_m43_canonical(${j(s.evidence.operation)});`),/NUMBER_UNSUPPORTED/);}finally{sql('DROP FUNCTION public.synthetic_prior_m43_canonical(jsonb);');}
 assert.equal(sql(`SELECT public.zezms_m43_payload_hash(${j(s.evidence.operation)});`),s.evidence.operation.payloadHash);
 sql(as(ids.owner,rpc(s.evidence)));assert.equal(s.f.store.get(tool.keys.DB),before);
 const numbers=[0,-0,0.30000000000000004,10/3,1e-7,1e-6,1e20,1e21,1e23,1000000000000000100,Number.MIN_VALUE,Number.MAX_VALUE,Number.EPSILON];
 let state=0x12345678;const next=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;};
 for(let i=0;i<256;i++){const b=Buffer.alloc(8);b.writeUInt32LE(next(),0);b.writeUInt32LE(next(),4);const n=b.readDoubleLE();if(Number.isFinite(n))numbers.push(n);}
 const hashes=JSON.parse(sql(`SELECT jsonb_agg(public.zezms_m43_payload_hash(jsonb_build_object('n',value)) ORDER BY ordinality) FROM jsonb_array_elements(${j(numbers)}) WITH ORDINALITY;`));
 hashes.forEach((hash,i)=>assert.equal(hash,s.f.sync._test.deterministicHash({n:numbers[i]}),'number '+numbers[i]));
 assert.throws(()=>sql("SELECT public.zezms_m43_payload_hash('{\"notJs\":0.123456789012345678901}');"),/NUMBER_NOT_JS_WIRE/);
 assert.equal(sql("SELECT public.zezms_mb3_payload_hash('{}');"),'04c2ca07b5901a25');
 console.log('SCHEMA71_NUMERIC_PASS source-produced-correction unchanged-layer '+numbers.length+' finite-number-vectors');
});

test('whole migration backfills historical operations and superseded checkpoints, and rolls back ambiguity or wrong migration owner',()=>{
 const fs=require('node:fs'),path=require('node:path'),base=path.resolve(__dirname,'..'),source=file=>fs.readFileSync(path.join(base,file),'utf8');
 const migration=source('migrations/20261101_m43_preserved_correction.sql');
 const inDB=(name,text)=>execFileSync('psql',['-X','-qAt','-v','ON_ERROR_STOP=1'],{input:text,encoding:'utf8',env:{...process.env,PGDATABASE:name},stdio:['pipe','pipe','pipe']}).trim();
 for(const mode of ['compatible','duplicate','missing-id','wrong-owner']){
  const name='tradeflow_synthetic_history_'+mode.replaceAll('-','_'),s=scenario();sql('CREATE DATABASE '+name+';');
  try{
   inDB(name,schema71.ddl()+source('tests/fixtures/m43-server-export.sql')+source('tests/fixtures/m43-schema-71-permissions.sql'));
   const audit=copy(s.evidence.audit),op=copy(s.originalOperation);if(mode==='missing-id'){delete audit.correctionId;op.patches[1].value=audit;}
   let seedSql=`SET ROLE postgres;INSERT INTO auth.users VALUES(${q(ids.owner)});INSERT INTO public.zezms_businesses VALUES(${q(ids.business)});`;
   seedSql+=schema71.insert('zezms_branches',{id:ids.branch,business_id:ids.business,name:'Historical',code:'HIST',status:'ACTIVE',is_primary:true});
   for(const [cp,cursor,superseded] of [['old',1267,'2026-10-31T00:00:00Z'],['new',2000,null]])seedSql+=schema71.insert('zezms_sync_checkpoints',{owner_id:ids.owner,checkpoint_id:cp,checkpoint_cursor:cursor,protocol_version:'M4/3',payload:{stockCorrections:mode==='missing-id'?[]:[audit]},payload_hash:'SYNTHETIC',business_id:ids.business,branch_id:ids.branch,superseded_at:superseded});
   seedSql+=schema71.insert('zezms_sync_operations',{seq:1900,owner_id:ids.owner,business_id:ids.business,branch_id:ids.branch,op_id:op.opId,device_id:op.deviceId,device_seq:op.deviceSeq,kind:op.kind,payload:op});
   if(mode==='duplicate')seedSql+=schema71.insert('zezms_sync_operations',{seq:1901,owner_id:ids.owner,business_id:ids.business,branch_id:ids.branch,op_id:'different-original-id',device_id:op.deviceId,device_seq:999,kind:op.kind,payload:{...op,opId:'different-original-id'}});
   inDB(name,seedSql);
   const oldHash=inDB(name,"SELECT md5(prosrc) FROM pg_proc WHERE oid='public.zezms_ops_push(jsonb)'::regprocedure;");
   if(mode==='compatible'){
    inDB(name,'SET ROLE postgres;'+migration);
    const receipt=JSON.parse(inDB(name,'SELECT row_to_json(r) FROM public.zezms_m43_correction_receipts r;'));
    assert.equal(receipt.op_id,op.opId);assert.equal(Number(receipt.server_seq),1900);assert.deepEqual(receipt.audit,audit);assert.deepEqual(receipt.payload,op);
    assert.equal(inDB(name,'SELECT count(*) FROM public.zezms_sync_checkpoints;'),'2');assert.equal(inDB(name,'SELECT count(*) FROM public.zezms_sync_operations;'),'1');
   }else{
    assert.throws(()=>inDB(name,(mode==='wrong-owner'?'RESET ROLE;':'SET ROLE postgres;')+migration),mode==='wrong-owner'?/MIGRATION_RPC_OWNER_REQUIRED/:mode==='missing-id'?/HISTORY_IDENTITY_UNPROVEN/:/HISTORY_CORRECTION_CONFLICT/);
    assert.equal(inDB(name,"SELECT to_regclass('public.zezms_m43_correction_receipts') IS NULL;"),'t');
    assert.equal(inDB(name,"SELECT md5(prosrc) FROM pg_proc WHERE oid='public.zezms_ops_push(jsonb)'::regprocedure;"),oldHash);
   }
  }finally{sql('DROP DATABASE '+name+';');}
 }
 console.log('SCHEMA71_WHOLE_MIGRATION_PASS retained-and-superseded-history atomic-failure-rollback owner-pin');
});
