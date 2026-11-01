const {test}=require('node:test'),assert=require('node:assert/strict');
const core=require('../diagnostics/m43-correction-reconciliation/preflight-core.js'),{packet,io,copy,pg}=require('./m43-preflight-fixture.cjs');
async function check(mutate,overrides){const p=await packet();mutate?.(p);const before=JSON.stringify(p),i=io(p,overrides);const r=await core.run(i);assert.equal(JSON.stringify(p),before,'preflight mutated its evidence');return {r,p,i};}
test('GO requires independent protected evidence, exact cloud2/Main0 and a proven nonblocking400; returns no private values',async()=>{
 const {r,p,i}=await check();assert.equal(r.status,'GO');assert.equal(r.authorizesExecution,false);assert.deepEqual(r.blockers,[]);assert.equal(r.http400[0].blocking,false);
 const text=JSON.stringify(r);for(const value of [p.data.evidence[0].correction_id,p.data.evidence[0].stock_before.id,p.data.evidence[0].product.id,'SYNTHETIC_ACCESS_TOKEN','SYNTHETIC_PUBLIC_KEY'])assert.ok(!text.includes(value));
 assert.ok(i.calls.every(c=>Object.hasOwn(core.PATHS,c.name)));assert.equal(i.calls.filter(c=>c.name==='operations').length,2);
});
test('no independent binding, archived proof or guard/original attestation means NO-GO despite matching totals',async()=>{
 for(const [edit,code] of [[p=>p.data.evidence=[],'INDEPENDENT_ORIGINAL_BINDING_MISSING'],[p=>p.data.evidence[0].archived_coverage_complete=false,'ARCHIVE_OR_HISTORY_PROOF_INSUFFICIENT'],[p=>p.data.evidence[0].review_reference='a plain unverified note','INDEPENDENT_GUARD_OR_ORIGINAL_PROOF_MISSING'],[p=>p.data.evidence[0].expires_at='2000-01-01','INDEPENDENT_BINDING_EXPIRED'],[p=>p.data.evidence[0].history_sha256='bad','ARCHIVE_OR_HISTORY_PROOF_INSUFFICIENT']])assert.ok((await check(edit)).r.blockers.includes(code));
});
test('missing API tables, protocol405 and capability400 are held without calling a writing endpoint',async()=>{
 for(const [name,status,code] of [['evidence',404,'INDEPENDENT_BINDING_UNAVAILABLE'],['receipts',403,'RECEIPT_GUARD_UNAVAILABLE'],['capability',405,'CAPABILITY_READONLY_PROOF_UNAVAILABLE'],['capability',400,'HTTP400_ON_DELIVERY_DEPENDENCY']]){
  const p=await packet(),base=io(p),calls=[];const r=await core.run({...base,read:async(n,params)=>{calls.push(n);return n===name?{ok:false,status}:base.read(n,params);}});assert.equal(r.status,'NO-GO');assert.ok(r.blockers.includes(code));assert.ok(!calls.includes('publish')&&!calls.includes('deliver'));
 }
});
test('invalid or ambiguous preserved local audit, layer, allocation and queue fail closed',async()=>{
 for(const edit of [d=>d.stockRows.shift(),d=>d.stockRows[0].rStock=1,d=>d.stockRows[0].productId='wrong',d=>d.stockCorrections.push(copy(d.stockCorrections[0])),d=>d.stockCorrections[0].allocations[0].beforeRStock=3]){
  const {r}=await check(p=>{const d=JSON.parse(p.raw.tradeflow_v321_zola);edit(d);p.raw.tradeflow_v321_zola=JSON.stringify(d);});assert.equal(r.status,'NO-GO');assert.ok(r.blockers.some(c=>/LOCAL_|ORIGINAL_/.test(c)));
 }
 const {r}=await check(p=>p.raw.zezms_cloud_sync_m4_queue='[{"kind":"unrelated"}]');assert.ok(r.blockers.includes('OUTBOX_NOT_EMPTY'));
});
test('cloud references in retained history, superseded checkpoint or receipt prevent redelivery',async()=>{
 for(const kind of ['history','checkpoint','receipt']){const {r}=await check(p=>{const e=p.data.evidence[0];if(kind==='receipt')p.data.receipts=[{op_id:'accepted'}];else if(kind==='checkpoint'){const c=copy(p.data.checkpoints[0]);c.checkpoint_id='superseded';c.superseded_at='2026-11-01';const d=JSON.parse(c.payload_text);d.stockCorrections=[e.audit];c.payload_text=pg(d);p.data.checkpoints.unshift(c);}else{const op=JSON.parse(p.data.operations[0].payload_text);op.patches=[{action:'insert',collection:'stockCorrections',key:e.correction_id,value:e.audit}];op.payloadHash=core.hash(op);p.data.operations[0].payload_text=pg(op);}});assert.ok(r.blockers.includes(kind==='receipt'?'CORRECTION_ALREADY_ACCEPTED':'CORRECTION_REFERENCED_IN_CLOUD'));}
});
test('target projection never fabricates a missing layer from fallback',async()=>{
 const {r}=await check(p=>{const d=JSON.parse(p.data.checkpoints[0].payload_text);d.stockRows.shift();p.data.checkpoints[0].payload_text=pg(d);const op=JSON.parse(p.data.operations[0].payload_text),e=p.data.evidence[0];op.patches=[{action:'update',collection:'stockRows',key:e.stock_before.id,fallback:e.stock_before,changes:[{field:'rStock',mode:'delta',value:0,before:2}]}];op.payloadHash=core.hash(op);p.data.operations[0].payload_text=pg(op);});assert.ok(r.blockers.includes('REPLAY_LAYER_MISSING'));
});
test('wrong owner, wire hash, unsafe numbers, duplicate history and count truncation are not certified',async()=>{
 for(const edit of [p=>p.data.operations[0].owner_id='wrong',p=>p.data.operations[0].payload_text=p.data.operations[0].payload_text.replace(/"payloadHash": "[a-f0-9]+"/,'"payloadHash": "bad"'),p=>p.data.operations.push(copy(p.data.operations[0])),p=>p.data.operations[0].payload_text=p.data.operations[0].payload_text.replace('31800','31800.00000000000001')]){assert.equal((await check(edit)).r.status,'NO-GO');}
 const p=await packet(),i=io(p);const r=await core.run({...i,read:async(n,q)=>{const r=await i.read(n,q);if(n==='operations'){r.count=2;r.data=q.offset?[]:r.data;}return r;}});assert.ok(r.blockers.includes('HISTORY_COVERAGE_UNPROVEN'));
});
test('current counter precision, before-state identity and approved envelope must match exactly',async()=>{
 for(const [edit,code]of [[p=>p.data.counter[0].value_text='2.0000000000000001','CLOUD_COUNTER_NOT_EXACTLY_TWO'],[p=>p.data.evidence[0].product_text='{"id":"wrong"}','INDEPENDENT_BINDING_MISMATCH'],[p=>{const op=JSON.parse(p.data.evidence[0].operation_text);op.patches.push({action:'root-set',root:'cashBalances',value:{}});op.payloadHash=core.hash(op);p.data.evidence[0].operation_text=pg(op);},'EXISTING_DELIVERY_ENVELOPE_NOT_BOUND']])assert.ok((await check(edit)).r.blockers.includes(code));
});
test('concurrent local or cloud changes hold instead of retrying or overwriting',async()=>{
 const p=await packet(),i=io(p);let captures=0;const r=await core.run({...i,capture:()=>{const c=copy(p.raw);if(captures++)c.zezms_cloud_sync_m4_queue='[{}]';return c;}});assert.ok(r.blockers.includes('LOCAL_CHANGED_DURING_PREFLIGHT'));
 let scans=0;const r2=await core.run({...i,read:async(n,q)=>{const x=await i.read(n,q);if(n==='state'&&scans++)x.data[0].revision++;return x;}});assert.ok(r2.blockers.includes('CLOUD_CHANGED_DURING_PREFLIGHT'));
});
test('unknown400s remain unclassified, absent400 evidence holds, and foreign-project traces are ignored',async()=>{
 assert.ok((await check(p=>p.observed=[])).r.blockers.includes('HTTP400_ENDPOINT_NOT_IDENTIFIED'));
 assert.ok((await check(p=>p.observed=[{url:p.origin+'/rest/v1/zezms_business_devices',status:400,method:'GET'}])).r.blockers.includes('HTTP400_BLOCKING_EFFECT_UNVERIFIED'));
 assert.ok((await check(p=>p.observed=[{url:'https://foreign.supabase.co/rest/v1/rpc/zezms_mb3_publish_protocol_readiness',status:400}])).r.blockers.includes('HTTP400_ENDPOINT_NOT_IDENTIFIED'));
});
test('unexpected exceptions cannot disclose record names, IDs or arbitrary server messages',async()=>{
 const p=await packet(),r=await core.run({...io(p),read:async()=>{throw Error('PRIVATE_CUSTOMER_SECRET');}});assert.ok(!JSON.stringify(r).includes('PRIVATE_CUSTOMER_SECRET'));assert.ok(r.blockers.includes('PREFLIGHT_READ_FAILED'));
});
test('PostgreSQL numeric text is preserved for evidence hashes while lossy numeric parses are rejected',()=>{
 assert.deepEqual(core.parsePg('{"n":2.000,"escaped":"12345\\n"}'),{n:2,escaped:'12345\n'});
 assert.throws(()=>core.parsePg('{"n":2.0000000000000001}'),/UNSAFE_NUMERIC_EVIDENCE/);assert.throws(()=>core.parsePg('{"__proto__":{}}'),/UNSAFE_CLOUD_SHAPE/);
});
test('legacy numeric layer identity follows existing M4/3 string keys without rewriting the stored layer',async()=>{
 const p=await packet({id:201}),before=p.raw.tradeflow_v321_zola,r=await core.run(io(p));assert.equal(r.status,'GO');assert.equal(p.raw.tradeflow_v321_zola,before);
});
test('branch authorization and the upload data-plane guard cannot be bypassed by a matching Owner ID',async()=>{
 assert.ok((await check(p=>p.data.capability[0].legacy_branch_id='different')).r.blockers.includes('BRANCH_DATA_PLANE_NOT_ENABLED'));
 assert.ok((await check(p=>p.data.branches[0].status='CLOSED')).r.blockers.includes('MAIN_BRANCH_SCOPE_UNVERIFIED'));
});
