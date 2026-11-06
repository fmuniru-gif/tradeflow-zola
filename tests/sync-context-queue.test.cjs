const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const delivery=require('../tools/build-pr11-delivery.cjs');
let assembled;
function source(start,end){assembled ||= delivery.assembledShell(delivery.assetBytes('index.html').toString());const a=assembled.indexOf(start),b=assembled.indexOf(end,a);assert.ok(a>=0&&b>a,start);return assembled.slice(a,b);}
function fixture(){
 const c={window:null,console,AbortController,setTimeout,clearTimeout,Promise,Math,
  state:{initialized:true,deviceId:'synthetic-device',deviceAccessMode:'PAIRED',syncOwnerId:'synthetic-owner',businessId:'synthetic-business',branchId:'synthetic-branch',supabaseUrl:'https://synthetic.invalid',publishableKey:'synthetic-key',deviceAccessStatus:'ACTIVE'},
  session:{user:{id:'synthetic-paired-user'}},client:{},requireClient(){},currentSyncOwnerId(){return c.state.syncOwnerId;},PULL_PAGE_SIZE:100,OPERATIONS_TABLE:'synthetic_ops',SNAPSHOT_TABLE:'synthetic_master'};
 c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync('js/sync-resilience.js','utf8'),c);return c;
}
function scope(c){return c.ZEZMS.syncResilience.captureContext(()=>({client:c.client,session:c.session,state:c.state,ownerId:c.currentSyncOwnerId()}));}
const tick=()=>new Promise(setImmediate);
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
test('every other assembled business, security, recovery, presentation and print byte matches production',()=>{
 const {execFileSync}=require('node:child_process'),{withoutContextQueue}=require('./sync-context-proof.cjs');
 const previous=execFileSync('git',['show','135a3cd44c59d9177a9af3cdd9b41535089f8fcd:index.html'],{maxBuffer:32*1024*1024}).toString();
 assert.equal(withoutContextQueue(delivery.assembledShell(delivery.assetBytes('index.html').toString())),withoutContextQueue(delivery.assembledShell(previous)));
});

test('Cloud context snapshots reject changed authority, configuration, client and initialization',()=>{
 for(const change of [c=>c.client={},c=>c.session=null,c=>c.session.user.id='other',
  ...['deviceId','deviceAccessMode','syncOwnerId','businessId','branchId','supabaseUrl','publishableKey','deviceAccessStatus','lifecycleState'].map(key=>c=>c.state[key]='changed'),c=>c.state.initialized=false]){
  const c=fixture(),s=scope(c);assert.equal(s.valid(),true);change(c);assert.equal(s.valid(),false);
 }
});
test('normal token refresh and status/cursor updates preserve the same authenticated Cloud context',()=>{
 const c=fixture(),s=scope(c);c.session={user:{id:'synthetic-paired-user'},access_token:'synthetic-refreshed'};c.state={...c.state,status:'syncing',cursor:23,lastPullAt:'later'};assert.equal(s.valid(),true);
});
test('a read cannot return a stale response or retry into a replacement context',async()=>{
 const c=fixture(),s=scope(c),pending=deferred();let requests=0,sleeps=0;
 const result=c.ZEZMS.syncResilience.create({sleep:async()=>sleeps++}).read(()=>{requests++;return pending.promise;},{contextValid:s.valid});
 const rejected=assert.rejects(result,/SYNC_CONTEXT_CHANGED/);await tick();c.client={};pending.resolve({data:{old:true}});await rejected;assert.equal(requests,1);assert.equal(sleeps,0);
});
test('context changes during backoff stop before another request; an initially invalid context sends nothing',async()=>{
 const c=fixture(),s=scope(c);let requests=0;
 const transport=c.ZEZMS.syncResilience.create({sleep:async()=>{c.state.branchId='other';}});
 await assert.rejects(transport.read(async()=>{requests++;return {error:{message:'Unavailable'},status:503};},{contextValid:s.valid}),/SYNC_CONTEXT_CHANGED/);assert.equal(requests,1);
 requests=0;await assert.rejects(transport.read(async()=>{requests++;return {data:null};},{contextValid:()=>false}),/SYNC_CONTEXT_CHANGED/);assert.equal(requests,0);
});
test('checkpoint authority cannot cross an owner change during its request',async()=>{
 const c=fixture(),pending=deferred();c.client={rpc(){return {abortSignal(){return pending.promise;}};}};
 vm.runInContext(source('  async function fetchM43Checkpoint() {','  async function fetchCloudAuditBundle() {'),c);
 const result=c.fetchM43Checkpoint(),rejected=assert.rejects(result,/SYNC_CONTEXT_CHANGED/);await tick();c.state.syncOwnerId='other-owner';pending.resolve({data:[{checkpoint_cursor:21}]});await rejected;
});
test('an unavailable checkpoint function retains the existing explicit compatibility fallback',async()=>{
 const c=fixture();c.client={rpc(){return {abortSignal:async()=>({error:{message:'Could not find the function in the schema cache'}})};}};
 vm.runInContext(source('  async function fetchM43Checkpoint() {','  async function fetchCloudAuditBundle() {'),c);assert.equal(await c.fetchM43Checkpoint(),null);
});
for(const [name,start,end,response]of [
 ['operations','  async function fetchOperationsAfter(cursor) {','  async function fetchAllOperationsAfter(',{data:[{seq:21,op_id:'synthetic-op',payload:{opId:'synthetic-op'}}]}],
 ['master','  async function fetchMaster() {','  function recordFromResult(',{data:{payload:{stockRows:[]},sync_mode:'operations'}}]
])test('actual '+name+' read rejects old-client results even when owner and device IDs remain the same',async()=>{
 const c=fixture(),pending=deferred();c.client={from(){return {select(){return this;},eq(){return this;},gt(){return this;},order(){return this;},limit(){return this;},maybeSingle(){return this;},abortSignal(){return pending.promise;}};}};
 vm.runInContext(source(start,end),c);const result=name==='operations'?c.fetchOperationsAfter(20):c.fetchMaster(),rejected=assert.rejects(result,/SYNC_CONTEXT_CHANGED/);await tick();c.client={replacement:true};pending.resolve(response);await rejected;
});
test('the receive loop rejects a replaced client before any business apply, journal, rebase or cursor advancement',async()=>{
 const c=fixture(),pending=deferred();let writes=0;c.client={from(){return {select(){return this;},eq(){return this;},gt(){return this;},order(){return this;},limit(){return this;},abortSignal(){return pending.promise;}};}};
 Object.assign(c,{navigator:{onLine:true},pullInFlight:false,PROTOCOL_VERSION:4,queue:[],appliedOperations:{},ZEZMS_M43_CAPABILITY_GUARD:async()=>{},setState(patch){Object.assign(c.state,patch);},handleError(){},
  applyOperation(){writes++;},applyInverseOperation(){writes++;},rawSaveDatabase(){writes++;},writeApplyJournal(){writes++;},persistAppliedOperations(){writes++;},persistState(){writes++;},persistQueue(){writes++;}});
 c.state.cursor=20;vm.runInContext(source('  async function fetchOperationsAfter(cursor) {','  async function fetchAllOperationsAfter(')+source('  async function pullNowCore(silent) {','  var resilienceQueuedPull = null;'),c);
 const result=c.pullNowCore(true),rejected=assert.rejects(result,/SYNC_CONTEXT_CHANGED/);await tick();c.client={replacement:true};pending.resolve({data:[{seq:21,op_id:'synthetic-op',payload:{opId:'synthetic-op'}}]});await rejected;assert.equal(writes,0);assert.equal(c.state.cursor,20);assert.equal(c.pullInFlight,false);
});
function pullFixture(work){const c=fixture();let serial=Promise.resolve();c.serializeSync=fn=>{const result=serial.then(fn,fn);serial=result.catch(()=>{});return result;};c.pullNowCore=work;vm.runInContext(source('  var resilienceQueuedPull = null;','  function flushQueue(showNotice) {'),c);return c;}
test('twenty queued automatic notifications share one receive and one result',async()=>{
 let reads=0;const c=pullFixture(async()=>{reads++;return true;});const calls=Array.from({length:20},()=>c.pullNow(true));assert.ok(calls.every(p=>p===calls[0]));await Promise.all(calls);assert.equal(reads,1);
});
test('notifications during an active receive retain one trailing receive and see the latest state',async()=>{
 const active=deferred();let reads=0,cloud=1,local=0;const c=pullFixture(async()=>{reads++;const captured=cloud;if(reads===1)await active.promise;local=captured;return local;});
 const first=c.pullNow(true);await tick();cloud=2;const trailing=Array.from({length:20},()=>c.pullNow(true));assert.ok(trailing.every(p=>p===trailing[0]));assert.notEqual(first,trailing[0]);active.resolve();await Promise.all([first,...trailing]);assert.equal(reads,2);assert.equal(local,2);
});
test('explicit manual receives remain distinct and preserve their notice argument',async()=>{
 const notices=[],c=pullFixture(async silent=>{notices.push(silent);return true;});await Promise.all([c.pullNow(true),c.pullNow(false),c.pullNow(false)]);assert.deepEqual(notices,[true,false,false]);
});
test('a failed background receive releases its slot; subsequent calls can recover',async()=>{
 let reads=0;const c=pullFixture(async()=>{if(++reads===1)throw Error('synthetic failure');return true;});await assert.rejects(c.pullNow(true),/synthetic failure/);assert.equal(await c.pullNow(true),true);assert.equal(reads,2);
});
test('a queued receive cannot run in a replacement Cloud context or absorb its new request',async()=>{
 let reads=0;const c=pullFixture(async()=>{reads++;return true;});const previous=c.pullNow(true),rejected=assert.rejects(previous,/SYNC_CONTEXT_CHANGED/);c.client={replacement:true};const current=c.pullNow(true);assert.notEqual(previous,current);await rejected;await current;assert.equal(reads,1);
});
