const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const delivery=require('../tools/build-pr11-delivery.cjs'),{transformResiliencePerformance}=require('../tools/resilience-performance-transform.cjs');
function fixture(){const c={window:null,Intl,Date,AbortController,Promise,setTimeout,clearTimeout,Math,console};c.window=c;vm.createContext(c);for(const f of ['sync-resilience','desktop-presentation'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),c);return c;}
const hash=o=>crypto.createHash('sha256').update(JSON.stringify(o,(k,v)=>k==='payloadHash'?undefined:v)).digest('hex');
const operation={opId:'synthetic-operation',kind:'STOCK_CORRECTION_UPSERT',patches:[{action:'insert',collection:'stockCorrections',key:'SC1',value:{correctionId:'SC1',quantity:2}}]};
function row(op=operation){return {seq:21,op_id:op.opId,payload:structuredClone(op),created_at:'2026-11-03T00:00:00Z'};}
test('a committed operation with a lost response is recovered by exact read-back without a second POST',async()=>{
 const t=fixture().ZEZMS.syncResilience.create({sleep:async()=>{}});let sends=0,reads=0;
 const result=await t.push({operation,hash,send:async()=>{sends++;throw TypeError('Failed to fetch');},read:async()=>{reads++;return {data:row()};}});
 assert.equal(result.server_seq,21);assert.equal(sends,1);assert.equal(reads,1);
});
test('a transient failure before commit retries the exact same immutable operation after read-back',async()=>{
 const t=fixture().ZEZMS.syncResilience.create({sleep:async()=>{}});let sends=0,reads=0;const before=JSON.stringify(operation);
 await t.push({operation,hash,send:async()=>++sends===1?{error:{message:'service unavailable'},status:503}:{data:[{server_seq:21}]},read:async()=>({data:++reads===1?null:row()})});
 assert.equal(sends,2);assert.equal(reads,2);assert.equal(JSON.stringify(operation),before);
});
test('permanent stock/cash, authorization, identity and hash errors are not retried',async()=>{
 for(const message of ['ZEZMS_STOCK_CONFLICT','ZEZMS_CASH_CONFLICT','permission denied','JWT expired','ZEZMS_OPERATION_HASH_MISMATCH']){
  let sends=0,reads=0;const t=fixture().ZEZMS.syncResilience.create({sleep:async()=>{}});
  await assert.rejects(t.push({operation,hash,send:async()=>{sends++;return {error:{message}};},read:async()=>{reads++;return {data:null};}}));assert.equal(sends,1);assert.equal(reads,0);
 }
});
test('forged stored payload hashes cannot disguise different Cloud operation contents',async()=>{
 const t=fixture().ZEZMS.syncResilience.create({sleep:async()=>{}}),bad=row();bad.payload.kind='SALE_OUT';bad.payload.payloadHash=hash(operation);
 await assert.rejects(t.push({operation,hash,send:async()=>({data:[{server_seq:21}]}),read:async()=>({data:bad})}),/PAYLOAD_CONFLICT/);
});
test('missing, mismatched, unsafe and non-durable acknowledgements cannot drain the outbox',async()=>{
 for(const data of [null,{...row(),seq:22},{...row(),seq:0},{...row(),op_id:'other'}]){
  const t=fixture().ZEZMS.syncResilience.create({sleep:async()=>{}});await assert.rejects(t.push({operation,hash,send:async()=>({data:[{server_seq:21}]}),read:async()=>({data})}),/ACK_NOT_DURABLE/);
 }
});
test('timeouts abort requests and finish after bounded attempts; late responses cannot acknowledge a failed call',async()=>{
 const t=fixture().ZEZMS.syncResilience.create({timeout:10,sleep:async()=>{}});const signals=[];let sends=0;
 await assert.rejects(t.push({operation,hash,send:signal=>{sends++;signals.push(signal);return new Promise(()=>{});},read:async()=>({data:null})}),/timed out/);
 assert.equal(sends,3);assert.ok(signals.every(s=>s.aborted));
});
test('pause or changed device/owner context prevents another send after uncertain commit',async()=>{
 const t=fixture().ZEZMS.syncResilience.create({sleep:async()=>{}});let allowed=true,sends=0;
 await assert.rejects(t.push({operation,hash,allowed:()=>allowed,send:async()=>{sends++;allowed=false;throw TypeError('Failed to fetch');},read:async()=>({data:null})}),/RETRY_DEFERRED/);assert.equal(sends,1);
});
test('read retries are bounded and permanent errors fail immediately',async()=>{
 const t=fixture().ZEZMS.syncResilience.create({sleep:async()=>{}});let count=0;await assert.rejects(t.read(async()=>{count++;return {error:{message:'unavailable'},status:503};}));assert.equal(count,3);
 count=0;await assert.rejects(t.read(async()=>{count++;return {error:{message:'permission denied'},status:403};}));assert.equal(count,1);
});
test('an acknowledged upload with unavailable read-back stays unresolved without another POST',async()=>{
 const t=fixture().ZEZMS.syncResilience.create({sleep:async()=>{}});let sends=0,reads=0;
 await assert.rejects(t.push({operation,hash,send:async()=>{sends++;return {data:[{server_seq:21}]};},read:async()=>{reads++;return {error:{message:'Unavailable'},status:503};}}));assert.equal(sends,1);assert.equal(reads,3);
});
test('an owner/device change during a request cannot acknowledge an operation into a different sync context',async()=>{
 const t=fixture().ZEZMS.syncResilience.create({sleep:async()=>{}});let valid=true;
 await assert.rejects(t.push({operation,hash,contextValid:()=>valid,send:async()=>({data:[{server_seq:21}]}),read:async()=>{valid=false;return {data:row()};}}),/CONTEXT_CHANGED/);
});
test('the same durable verification protects ordinary inventory, cash, account and rollover operations',async()=>{
 for(const kind of ['SALE_OUT','STOCK_IN','CASH_MOVEMENT','ACCOUNT_TXN','MONTH_ROLLOVER']){const op={...operation,kind};const t=fixture().ZEZMS.syncResilience.create({sleep:async()=>{}});const result=await t.push({operation:op,hash,send:async()=>({data:[{server_seq:21}]}),read:async()=>({data:row(op)})});assert.equal(result.server_seq,21);}
});
test('operation pages reject repeats, regressions, malformed payloads and unsafe cursors while allowing global sequence gaps',()=>{
 const t=fixture().ZEZMS.syncResilience;assert.equal(t.operationPage([row(),{...row(),seq:29,op_id:'other',payload:{opId:'other'}}],20).length,2);
 for(const rows of [null,{},[row(),row()],[{...row(),seq:19}],[{...row(),seq:NaN}],[{...row(),seq:Number.MAX_SAFE_INTEGER+1}],[{...row(),payload:[]}],[{...row(),payload:{opId:'other'}}]])assert.throws(()=>t.operationPage(rows,20));
 assert.throws(()=>t.operationPage([],NaN));
});
test('the actual receive loop rejects a repeated second page before rebase, database writes or cursor advancement',async()=>{
 const html=delivery.assembledShell(delivery.assetBytes('index.html').toString()),native=html.slice(html.indexOf('  async function fetchOperationsAfter(cursor) {'),html.indexOf('  async function fetchAllOperationsAfter('))+html.slice(html.indexOf('  async function pullNowCore(silent) {'),html.indexOf('  function pullNow(silent) {'));
 const c=fixture();let reads=0,writes=0;const original={stockRows:[{id:'R1',rStock:12}]};
 Object.assign(c,{state:{initialized:true,cursor:20,deviceId:'synthetic-main'},session:{user:{id:'synthetic-owner'}},navigator:{onLine:true},pullInFlight:false,PULL_PAGE_SIZE:2,OPERATIONS_TABLE:'synthetic_operations',currentSyncOwnerId:()=> 'synthetic-owner',requireClient:()=>{},ZEZMS_M43_CAPABILITY_GUARD:async()=>{},setState:()=>{},handleError:()=>{},getDatabase:()=>original,rawSaveDatabase:()=>{writes++;},applyInverseOperation:()=>{writes++;},applyOperation:()=>{writes++;}});
 c.client={from(){return {select(){return this;},eq(){return this;},gt(){return this;},order(){return this;},limit(){return this;},abortSignal(){reads++;return Promise.resolve({data:[row(),{...row(),seq:22,op_id:'second',payload:{opId:'second'}}]});}};}};
 vm.runInContext(native,c);await assert.rejects(c.pullNowCore(true),/PAGE_INVALID/);assert.equal(reads,2);assert.equal(writes,0);assert.equal(c.state.cursor,20);assert.equal(original.stockRows[0].rStock,12);
});
test('correction replay allows lifecycle changes but rejects reused IDs with changed quantities, costs, products or allocations',()=>{
 const t=fixture().ZEZMS.syncResilience,a={correctionId:'SC1',productId:'P1',quantity:2,unitCost:5,allocations:[{stockRowId:'R1',quantity:2}],status:'Completed'};
 assert.equal(t.sameCorrection({...a,status:'Reversed',reversedAt:'now',reversedBy:'owner',reversalCorrectionId:'SC2'},a),true);
 for(const b of [{...a,quantity:3},{...a,unitCost:6},{...a,productId:'P2'},{...a,allocations:[]}])assert.throws(()=>t.sameCorrection(a,b),/ID_CONFLICT/);
});
test('cash indexes retain exact original first-match and blank-link semantics without stale snapshots',()=>{
 const p=fixture().ZEZMS.desktopPresentation,txns=[null,{id:'A',meta:{cashLogId:'C1'}},{id:'B',meta:{cashLogId:'C1'}},{id:'C',meta:{}}],expenses=[null,{id:'E1',cashLogId:'C1',meta:{cashLogId:'C2'}},{id:'E2',cashLogId:'C1'}];
 const links=p.cashLinks(txns,expenses);
 for(const id of ['C1','C2','','absent',undefined]){
  assert.equal(links.account(id),txns.find(t=>t&&t.meta&&String(t.meta.cashLogId||'')===String(id||''))||null);
  assert.equal(links.expense(id),expenses.find(e=>e&&(String(e.cashLogId||'')===String(id||'')||String(e.meta&&e.meta.cashLogId||'')===String(id||'')))||null);
 }
 txns.unshift({id:'NEW',meta:{cashLogId:'C1'}});assert.equal(p.cashLinks(txns,expenses).account('C1').id,'NEW');
});
test('Stock In product IDs keep original normalization and first-name-match rules, including historical rows without IDs',()=>{
 const products=[{id:' P1 ',name:' Television '},{id:'P2',name:'television'},{id:0,name:'Radio'},{id:null,name:''}],lookup=fixture().ZEZMS.desktopPresentation.productIds(products);
 for(const name of ['television',' TELEVISION ', 'Radio','missing','',undefined])for(const preferred of ['',null,undefined,0,' DIRECT ']){const direct=String(preferred==null?'':preferred).trim(),match=products.find(p=>String(p.name||'').trim().toLowerCase()===String(name||'').trim().toLowerCase());assert.equal(lookup(name,preferred),direct||(match?String(match.id==null?'':match.id).trim():''));}
});
test('date decoration and sorted histories retain exact native formatting, invalid-date behavior and stable order',()=>{
 const p=fixture().ZEZMS.desktopPresentation;
 for(const value of [0,'2026-11-03T11:30:15Z','invalid',null,undefined]){assert.equal(p.date(value,false),new Date(value).toLocaleString());assert.equal(p.date(value,true),new Date(value).toLocaleDateString());}
 for(const dates of [[1,3,2,3],[1,'invalid',2,0],['invalid',2,1],[0,0,0]]){const records=dates.map((date,id)=>({date,id})),before=JSON.stringify(records);assert.deepEqual(Array.from(p.newest(records,r=>r.date),r=>r.id),records.slice().sort((a,b)=>new Date(b.date)-new Date(a.date)).map(r=>r.id));assert.equal(JSON.stringify(records),before);}
});
test('assembled changes are exactly the reviewed transport/presentation transformation, with original business modules preserved',()=>{
 const index=delivery.assetBytes('index.html').toString(),base=delivery.assembledShell(index,{withoutResilience:true}),meta=base.match(/<meta name="zezms-delivery" content="[^"]+">/)[0];
 let expected=transformResiliencePerformance(base.replace(meta,''),delivery.assetBytes('js/sync-resilience.js').toString(),delivery.assetBytes('js/desktop-presentation.js').toString()).replace('</head>',meta+'</head>');
 assert.equal(delivery.sha(Buffer.from(delivery.assembledShell(index,{withoutDeviceCards:true}))),delivery.sha(Buffer.from(expected)));
 const prior=execFileSync('git',['show','5ffe6f432712efc170e86e7710806881953a50f4:index.html'],{maxBuffer:32*1024*1024}).toString();assert.equal(delivery.stripDelivery(index),delivery.stripDelivery(prior));
 assert.throws(()=>transformResiliencePerformance('<html></html>','',''),/MISSING/);
});
test('A5 and A4 watermarks fill both page dimensions without changing the header seal',()=>{
 const c=fixture();c.document={baseURI:'https://fixture.invalid/'};c.URL=URL;vm.runInContext(fs.readFileSync('js/document-branding.js','utf8'),c);
 for(const [width,height]of [[419.53,595.28],[595.28,419.53],[595,842],[842,595]])assert.equal(c.ZEZMS.documentBranding.pdfWatermark({width,height,watermark:{width:930,height:930}}),'q /GS1 gs '+width.toFixed(2)+' 0 0 '+height.toFixed(2)+' 0 0 cm /WM Do Q\n');
 assert.match(c.ZEZMS.documentBranding.headerHTML(),/object-fit:contain/);
});
