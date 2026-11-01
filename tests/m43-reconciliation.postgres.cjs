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
function seed(){
 const s=scenario(),e=s.evidence,op=e.operation;
 sql(`DROP TRIGGER IF EXISTS synthetic_abort ON public.zezms_sync_operations;DROP FUNCTION IF EXISTS public.synthetic_abort();TRUNCATE public.zezms_m43_correction_receipts,public.zezms_m43_reconciliation_evidence,public.zezms_sync_operations,public.zezms_sync_checkpoints,public.zezms_sync_counters,public.zezms_sync_state,public.zezms_branches,public.zezms_device_lifecycle,public.zezms_business_devices,public.zezms_device_access RESTART IDENTITY;
 INSERT INTO public.zezms_sync_state(owner_id,protocol_version,minimum_client_generation,rules_hash,identity_registry_hash) VALUES(${q(ids.owner)},'M4/3',31800,${q(op.rulesHash)},${q(op.identityRegistryHash)});
 INSERT INTO public.zezms_branches(id,business_id,status,is_primary) VALUES(${q(ids.branch)},${q(ids.business)},'ACTIVE',true);
 INSERT INTO public.zezms_device_lifecycle VALUES(${q(ids.life)},${q(e.device_id)},${q(ids.owner)},${q(ids.business)},${q(ids.branch)},${q(ids.other)},'ACTIVE',1);
 INSERT INTO public.zezms_business_devices VALUES(${q(ids.business)},${q(e.device_id)},${q(ids.owner)},NULL);
 INSERT INTO public.zezms_device_access VALUES(${q(ids.business)},${q(e.device_id)},${q(ids.other)},'ACTIVE',NULL);
 INSERT INTO public.zezms_sync_operations(seq,owner_id,business_id,branch_id,op_id,device_id,kind,payload) VALUES(3957,${q(ids.owner)},${q(ids.business)},${q(ids.branch)},'synthetic-anchor','synthetic-peer','DATABASE_CHANGE',${j({patches:[]})});
 SELECT setval(pg_get_serial_sequence('public.zezms_sync_operations','seq'),3957);
 INSERT INTO public.zezms_sync_counters VALUES(${q(ids.owner)},'stockRows','L1','rStock',2,now()),(${q(ids.owner)},'stockRows','L2','rStock',134,now()),(${q(ids.owner)},'cashBalances','Others','value',999,now());
 INSERT INTO public.zezms_sync_checkpoints(owner_id,checkpoint_id,checkpoint_cursor,protocol_version,payload,business_id,branch_id) VALUES(${q(ids.owner)},'synthetic-checkpoint',1267,'M4/3',${j(s.before)},${q(ids.business)},${q(ids.branch)});
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
 assert.throws(()=>sql(`SELECT public.zezms_m43_payload_hash(${j({unsafe:1e-7})});`),/NUMBER_UNSUPPORTED/);
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
