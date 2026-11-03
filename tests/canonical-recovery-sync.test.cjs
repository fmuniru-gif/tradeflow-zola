const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
const source=fs.readFileSync(require('node:path').join(__dirname,'../js/canonical-recovery-sync.js'),'utf8');
const hash=o=>crypto.createHash('sha256').update(JSON.stringify(o,(k,v)=>k==='payloadHash'?undefined:v)).digest('hex');
const marker={id:'MONTH-ROLLOVER-202610-TO-202611',sourceYear:2026,sourceMonth:10,targetYear:2026,targetMonth:11};
function fixture(options={}){
 const op={opId:'AUTO-'+marker.id,deviceId:'main',kind:'MONTH_ROLLOVER',patches:[{action:'insert',collection:'monthRollovers',value:marker}]};op.payloadHash=hash(op);
 const memory=new Map([['q',JSON.stringify([op])]]),db={sentinel:'business-data'},registry={sentinel:42};let pushes=0;
 const ctx={console,Date,JSON,Object,Array,String,Number,Promise,Map,Set,queue:[op],state:{deviceId:'main',liveSyncEnabled:false},failedOperations:[],pushTimer:null,pushInFlight:false,pullInFlight:false,QUEUE_KEY:'q',APPLY_JOURNAL_KEY:'j',
  localStorage:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>{if(options.failKey===k||(options.failArchive&&k==='zezms_canonical_recovery_preparation_v1'))throw Error('synthetic quota failure');memory.set(k,v);},removeItem:k=>memory.delete(k)},
  requireLocalOwner:()=>{if(options.staff)throw Error('Owner required');},serializeSync:fn=>Promise.resolve().then(fn),
  clone:x=>JSON.parse(JSON.stringify(x)),currentSyncOwnerId:()=>'owner',wireOperation:x=>x,deterministicHash:hash,
  r70aRolloverDescriptor:x=>x.kind==='MONTH_ROLLOVER'?{rolloverId:marker.id}:null,
  r70aValidateAuthoritativeRollover:()=>({local:{rolloverId:marker.id}}),
  r70aFindAuthoritativeRollover:async()=>options.noAuthority?null:{local:{rolloverId:marker.id},row:{op_id:op.opId,seq:7,device_id:'healthy'}},
  r67hDesired:()=>false,r67hManualPause(){},clearTimeout(){},markRolloverAnnounced:()=>{},setState:p=>Object.assign(ctx.state,p),
  ZEZMS:{canonicalRestore:{getState:()=>({executing:true})}},
  pushOne:()=>{pushes++;throw Error('forbidden upload');},getDatabase:()=>db,appliedOperations:registry};
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(source,ctx);
 return {ctx,memory,db,registry,pushes:()=>pushes};
}
test('preserves exact rollover before removing it, without upload, inverse, or acknowledgement',async()=>{
 const f=fixture(),before=JSON.stringify(f.ctx.queue),database=JSON.stringify(f.db),registry=JSON.stringify(f.registry);
 await f.ctx.prepareCanonicalRecovery('synthetic-safety.json');
 assert.equal(f.memory.get('q'),'[]');assert.equal(f.ctx.queue.length,0);
 const prep=JSON.parse(f.memory.get('zezms_canonical_recovery_preparation_v1'));
 assert.equal(JSON.stringify(prep.operations),before);assert.equal(prep.originalQueueRaw,before);
 assert.equal(JSON.stringify(f.db),database);assert.equal(JSON.stringify(f.registry),registry);assert.equal(f.pushes(),0);
 const again=await f.ctx.prepareCanonicalRecovery('synthetic-safety.json');assert.equal(again.pending,true);
 f.memory.set('zezms_canonical_restore_pending_v1','synthetic-verification-lock');
 f.ctx.completeCanonicalRecoveryPreparation();assert.equal(f.memory.has('zezms_canonical_recovery_preparation_v1'),false);
 assert.equal(f.memory.get(prep.archiveKey),JSON.stringify(prep));
});
for(const option of ['staff','noAuthority','failArchive'])test(option+' leaves the original queue intact',async()=>{
 const f=fixture({[option]:true}),before=f.memory.get('q');
 await assert.rejects(f.ctx.prepareCanonicalRecovery('synthetic-safety.json'));
 assert.equal(f.memory.get('q'),before);assert.equal(f.ctx.queue.length,1);assert.equal(f.pushes(),0);
});
test('a durable queue failure retains its recovery evidence and does not alter runtime queue',async()=>{
 const f=fixture({failKey:'q'});await assert.rejects(f.ctx.prepareCanonicalRecovery('synthetic-safety.json'));
 assert.ok(f.memory.has('zezms_canonical_recovery_preparation_v1'));assert.equal(f.ctx.queue.length,1);
});
test('no unique cloud history or ordinary business operation can be classified as superseded',()=>{
 const f=fixture();assert.throws(()=>f.ctx.inspectCanonicalRecoveryQueue({operations:[]}));
 f.ctx.queue[0].kind='SALE_OUT';assert.throws(()=>f.ctx.inspectCanonicalRecoveryQueue({operations:[]}));
});
test('corrupt preparation holds recovery rather than becoming an empty queue',()=>{
 const f=fixture();f.memory.set('zezms_canonical_recovery_preparation_v1','malformed');
 assert.equal(f.ctx.canonicalRecoveryPreparationSummary().invalid,true);
 assert.throws(()=>f.ctx.completeCanonicalRecoveryPreparation());assert.equal(f.ctx.queue.length,1);
});
test('preparation cannot complete without the separate post-replacement verification lock',async()=>{
 const f=fixture();await f.ctx.prepareCanonicalRecovery('synthetic-safety.json');
 assert.throws(()=>f.ctx.completeCanonicalRecoveryPreparation());assert.ok(f.memory.has('zezms_canonical_recovery_preparation_v1'));
});
// Exercise the unchanged production authority validator and authenticated lookup,
// rather than allowing a stubbed winner to stand in for those safety checks.
const cloudSource=Buffer.from(fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8').match(/const CLOUD_B64="([^"]+)";/)[1],'base64').toString();
const nativeAuthority=cloudSource.slice(cloudSource.indexOf('  function r70aRolloverDescriptor('),cloudSource.indexOf('  async function r70aAdoptAuthoritativeRollover('));
function authorityFixture(change){
 const f=fixture(),op=f.ctx.queue[0];Object.assign(op,{protocolVersion:'M4/3',clientGeneration:4,rulesHash:'synthetic-rules',identityRegistryHash:'synthetic-registry'});op.payloadHash=hash(op);f.memory.set('q',JSON.stringify([op]));
 const payload=structuredClone(op);payload.deviceId='healthy';payload.payloadHash=hash(payload);
 const row={owner_id:'owner',op_id:op.opId,device_id:'healthy',seq:7,created_at:'2026-11-03T00:00:00Z',kind:op.kind,payload};
 Object.assign(f.ctx,{PROTOCOL_VERSION:'M4/3',CLIENT_GENERATION:4,SYNC_RULES_HASH:'synthetic-rules',IDENTITY_REGISTRY_HASH:'synthetic-registry',OPERATIONS_TABLE:'synthetic_operations',
  rolloverIdFromOperation:o=>o.patches[0].value.id,r70aError:(code,message)=>Error(code+': '+message)});
 const lookups=[];f.ctx.client={from(table){assert.equal(table,'synthetic_operations');return {select(){return this;},eq(k,v){lookups.push([k,v]);return this;},async maybeSingle(){return {data:row,error:null};}};}};
 vm.runInContext(nativeAuthority,f.ctx);if(change)change(f,row);
 return {...f,row,lookups};
}
test('native Cloud authority validation permits only a genuine other-device rollover winner',async()=>{
 const f=authorityFixture();const plan=f.ctx.inspectCanonicalRecoveryQueue({ownerId:'owner',operations:[f.row]});assert.equal(plan.count,1);
 await f.ctx.prepareCanonicalRecovery('synthetic-safety.json');assert.equal(f.ctx.queue.length,0);
 assert.deepEqual(f.lookups,[['owner_id','owner'],['op_id',f.row.op_id]]);
});
for(const [name,change]of Object.entries({
 'other owner':(f,r)=>r.owner_id='stranger',
 'same device':(f,r)=>r.device_id='main',
 'mismatched operation':(f,r)=>r.op_id='unrelated',
 'invalid sequence':(f,r)=>r.seq=0,
 'missing timestamp':(f,r)=>delete r.created_at,
 'tampered payload':(f,r)=>r.payload.deviceId='tampered',
 'old protocol':(f,r)=>{r.payload.protocolVersion='M4/2';r.payload.payloadHash=hash(r.payload);},
 'wrong rules':(f,r)=>{r.payload.rulesHash='wrong';r.payload.payloadHash=hash(r.payload);},
 'wrong identity registry':(f,r)=>{r.payload.identityRegistryHash='wrong';r.payload.payloadHash=hash(r.payload);},
 'invalid rollover marker':(f,r)=>{r.payload.patches[0].value.targetMonth=12;r.payload.payloadHash=hash(r.payload);},
 'ordinary local sale':(f,r)=>{f.ctx.queue[0].kind='SALE_OUT';f.ctx.queue[0].payloadHash=hash(f.ctx.queue[0]);f.memory.set('q',JSON.stringify(f.ctx.queue));}
}))test('native '+name+' cannot remove an operation',async()=>{
 const f=authorityFixture(change),before=f.memory.get('q');
 assert.throws(()=>f.ctx.inspectCanonicalRecoveryQueue({ownerId:'owner',operations:[f.row]}));
 await assert.rejects(f.ctx.prepareCanonicalRecovery('synthetic-safety.json'));
 assert.equal(f.memory.get('q'),before);assert.equal(f.ctx.queue.length,1);assert.equal(f.pushes(),0);
});
test('an interrupted durable queue write can resume with exactly the preserved evidence',async()=>{
 const options={failKey:'q'},f=fixture(options);await assert.rejects(f.ctx.prepareCanonicalRecovery('synthetic-safety.json'));
 const evidence=f.memory.get('zezms_canonical_recovery_preparation_v1');options.failKey=null;
 await f.ctx.prepareCanonicalRecovery('synthetic-safety.json');assert.equal(f.ctx.queue.length,0);
 assert.equal(f.memory.get('zezms_canonical_recovery_preparation_v1'),evidence);
});
