const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../js/sync-durability.js');
function fixture(){
 const memory=new Map(),writes=[];let stop=Infinity,n=0;
 const storage={getItem:k=>memory.has(k)?memory.get(k):null,setItem(k,v){if(n++===stop)throw Error('synthetic interruption');writes.push(k);memory.set(k,String(v));},removeItem(k){if(n++===stop)throw Error('synthetic interruption');writes.push(k);memory.delete(k);}};
 const before=JSON.stringify({cashLog:[],cashBalances:{Cash:100}}),after=JSON.stringify({cashLog:[{id:'cash-1',amount:25}],cashBalances:{Cash:75}});
 const state={deviceId:'device-1',syncOwnerId:'owner-1',businessId:'business-1',branchId:'branch-1',deviceAccessMode:'OWNER',cursor:20};
 memory.set(C.DB,before);memory.set(C.STATE,JSON.stringify(state));memory.set(C.QUEUE,'[]');memory.set(C.APPLIED,'{}');memory.set(C.FAILED,'[]');memory.set('existing-archive','preserved');memory.set('auth-token','private-synthetic-token');
 const next={[C.STATE]:JSON.stringify({...state,cursor:21}),[C.QUEUE]:'[]',[C.APPLIED]:'{"cash-op":21}',[C.FAILED]:'[]'};
 return {memory,writes,storage,before,after,state,next,api:C.create({storage}),fault(at){n=0;stop=at;},clearFault(){n=0;stop=Infinity;}};
}
test('normal commit persists the complete database before acknowledgements and retains unrelated keys',()=>{
 const f=fixture();f.api.commit('receive',f.before,f.after,f.next);assert.equal(f.memory.get(C.DB),f.after);for(const key of C.KEYS)assert.equal(f.memory.get(key),f.next[key]);assert.equal(f.api.pending(),false);assert.ok(f.writes.indexOf(C.DB)<f.writes.indexOf(C.APPLIED));assert.equal(f.memory.get('existing-archive'),'preserved');assert.equal(f.memory.get('auth-token'),'private-synthetic-token');
});
test('every interruption boundary reopens to the entire before or after result, never a partial cash operation',()=>{
 for(let at=0;at<8;at++){
  const f=fixture();f.fault(at);try{f.api.commit('receive',f.before,f.after,f.next);}catch(error){assert.match(error.message,/synthetic interruption/);}
  f.clearFault();const restarted=C.create({storage:f.storage});restarted.recover();const raw=f.memory.get(C.DB);assert.ok(raw===f.before||raw===f.after);
  const db=JSON.parse(raw),s=JSON.parse(f.memory.get(C.STATE)),a=JSON.parse(f.memory.get(C.APPLIED));
  if(raw===f.after){assert.equal(s.cursor,21);assert.equal(a['cash-op'],21);assert.equal(db.cashLog.length,1);assert.equal(db.cashBalances.Cash,75);}else{assert.equal(s.cursor,20);assert.deepEqual(a,{});assert.equal(db.cashLog.length,0);assert.equal(db.cashBalances.Cash,100);}
  assert.equal(restarted.pending(),false);assert.equal(f.memory.get('auth-token'),'private-synthetic-token');
 }
});
test('unrelated database changes cannot acknowledge an interrupted operation or erase its journal',()=>{
 const f=fixture();f.fault(2);assert.throws(()=>f.api.commit('receive',f.before,f.after,f.next));f.clearFault();f.memory.set(C.DB,JSON.stringify({cashLog:[],cashBalances:{Cash:100},unrelated:true}));const before=new Map(f.memory);assert.throws(()=>f.api.recover(),/matches neither/);assert.deepEqual(f.memory,before);assert.equal(JSON.parse(f.memory.get(C.STATE)).cursor,20);
});
test('changed device, owner, branch, queue, register or state fails closed with all bytes retained',()=>{
 for(const change of [f=>f.memory.set(C.STATE,JSON.stringify({...f.state,syncOwnerId:'other'})),f=>f.memory.set(C.STATE,JSON.stringify({...f.state,deviceId:'other'})),f=>f.memory.set(C.STATE,JSON.stringify({...f.state,branchId:'other'})),f=>f.memory.set(C.QUEUE,'[{"opId":"new"}]'),f=>f.memory.set(C.APPLIED,'{"unrelated":99}'),f=>f.memory.set(C.STATE,JSON.stringify({...f.state,cursor:99}))]){
  const f=fixture();f.fault(2);assert.throws(()=>f.api.commit('receive',f.before,f.after,f.next));f.clearFault();change(f);const before=new Map(f.memory);assert.throws(()=>f.api.recover(),/REVIEW_REQUIRED/);assert.deepEqual(f.memory,before);
 }
});
test('quota failure before journal acceptance never saves business effects; pending journals block later writes',()=>{
 const f=fixture();f.fault(0);assert.throws(()=>f.api.commit('local-save',f.before,f.after,f.next));assert.equal(f.memory.get(C.DB),f.before);assert.equal(f.api.pending(),false);
 f.fault(2);assert.throws(()=>f.api.commit('local-save',f.before,f.after,f.next));f.clearFault();assert.throws(()=>f.api.writeJSON(C.QUEUE,[]),/REVIEW_REQUIRED/);assert.throws(()=>f.api.commit('receive',f.after,f.after,f.next),/previous interrupted/);
});
test('malformed journals, unexpected key names and invalid post-images are retained for review',()=>{
 for(const change of [()=>'{broken',j=>({...j,version:9}),j=>({...j,after:{...j.after,'unapproved-key':'{}'}}),j=>({...j,after:{...j.after,[C.QUEUE]:'{}'}}),j=>({...j,after:{...j.after,[C.STATE]:'{}'}})]){
  const f=fixture();f.fault(2);assert.throws(()=>f.api.commit('receive',f.before,f.after,f.next));f.clearFault();const j=JSON.parse(f.memory.get(C.JOURNAL)),next=change(j);f.memory.set(C.JOURNAL,typeof next==='string'?next:JSON.stringify(next));const before=new Map(f.memory);assert.throws(()=>f.api.recover());assert.deepEqual(f.memory,before);
 }
});
test('an already completed save and unchanged database with metadata-only edits recover idempotently',()=>{
 const f=fixture();f.fault(6);assert.throws(()=>f.api.commit('receive',f.before,f.after,f.next));f.clearFault();assert.equal(f.api.recover(),'COMMITTED');const before=new Map(f.memory);assert.equal(f.api.recover(),'ABSENT');assert.deepEqual(f.memory,before);
 const g=fixture();g.fault(2);assert.throws(()=>g.api.commit('local-save',g.before,g.before,g.next));g.clearFault();assert.equal(g.api.recover(),'COMMITTED');assert.equal(g.memory.get(C.DB),g.before);
});
test('database service verifies writes, blocks pending journals and refuses stale windows even after a read-only load',()=>{
 const f=fixture(),c={window:null,localStorage:f.storage,ZEZMS:{syncDurability:f.api,storage:{save:(k,v)=>f.storage.setItem(k,JSON.stringify(v)),load:k=>JSON.parse(f.storage.getItem(k))}}};c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync('js/dbservice.js','utf8'),c);
 c.ZEZMS.db.load(C.DB);f.memory.set(C.DB,f.after);c.ZEZMS.db.load(C.DB);assert.throws(()=>c.ZEZMS.db.save(C.DB,JSON.parse(f.before)),/ANOTHER_WINDOW/);assert.equal(f.memory.get(C.DB),f.after);
 c.ZEZMS.db.acceptCommittedRaw(C.DB,f.after);c.ZEZMS.db.save(C.DB,JSON.parse(f.after));f.memory.set(C.JOURNAL,'pending');assert.throws(()=>c.ZEZMS.db.save(C.DB,{}),/REVIEW_REQUIRED/);
});
function native(){const d=require('../tools/build-pr11-delivery.cjs');return d.assembledShell(d.assetBytes('index.html').toString());}
function part(html,a,b){const x=html.indexOf(a),y=html.indexOf(b,x+1);assert.ok(x>=0&&y>x,a);return html.slice(x,y);}
test('legacy recovery no longer mistakes unrelated changes or an unproven rollback for a committed operation',()=>{
 const html=native(),source=part(html,'  function recoverInterruptedApply(database) {','  function recordFailedOperation('),before={cashLog:[],cashBalances:{Cash:100}},after={cashLog:[{id:'cash'}],cashBalances:{Cash:75}};
 for(const mode of ['legacy-change','rollback','exact-after','exact-before']){
  const j={opId:'cash-op',seq:21,beforeHash:JSON.stringify(before),durabilityContext:JSON.stringify(['','','','',''])};if(mode==='rollback')j.afterHash=j.beforeHash;if(mode==='exact-after')j.afterHash=JSON.stringify(after);
  const c={readApplyJournal:()=>j,deterministicHash:JSON.stringify,cleanSnapshot:x=>x,appliedOperations:{},state:{cursor:20},persistAppliedOperations(){},persistState(){},clearApplyJournal(){c.cleared=true;}};vm.createContext(c);vm.runInContext(source,c);
  if(mode==='legacy-change'){assert.throws(()=>c.recoverInterruptedApply(mode==='rollback'?before:{...before,unrelated:true}),/REVIEW_REQUIRED/);assert.equal(c.state.cursor,20);assert.deepEqual(c.appliedOperations,{});assert.equal(c.cleared,undefined);}else{assert.equal(c.recoverInterruptedApply(mode==='exact-after'?after:before),mode==='exact-after');assert.equal(c.state.cursor,mode==='exact-after'?21:20);assert.equal(c.cleared,true);}
 }
});
test('assembled application changes reverse exactly to the production baseline outside delivery metadata',()=>{
 const {execFileSync}=require('node:child_process'),d=require('../tools/build-pr11-delivery.cjs'),t=require('../tools/sync-durability-transform.cjs');
 const before=execFileSync('git',['show','505e1d8d76aefe87692dbafbd4efb4103988729f:index.html'],{maxBuffer:32e6}).toString();
 const strip=s=>s.replace(/<meta name="zezms-delivery" content="[^"]+">/,'DELIVERY');
 assert.equal(strip(t.withoutSyncDurability(native())),strip(d.assembledShell(before)));
});
test('an exact after-image from another legacy journal binding cannot advance this device',()=>{
 const source=part(native(),'  function recoverInterruptedApply(database) {','  function recordFailedOperation('),database={cashLog:[{id:'cash'}],cashBalances:{Cash:75}};
 const c={readApplyJournal:()=>({opId:'cash-op',seq:21,beforeHash:'before',afterHash:JSON.stringify(database),durabilityContext:JSON.stringify(['other-device','owner','','','OWNER'])}),deterministicHash:JSON.stringify,cleanSnapshot:x=>x,appliedOperations:{},state:{deviceId:'current-device',syncOwnerId:'owner',deviceAccessMode:'OWNER',cursor:20},persistAppliedOperations(){throw Error('must not persist');},persistState(){throw Error('must not persist');},clearApplyJournal(){throw Error('must retain');}};
 vm.createContext(c);vm.runInContext(source,c);assert.throws(()=>c.recoverInterruptedApply(database),/binding changed/);assert.equal(c.state.cursor,20);assert.deepEqual(c.appliedOperations,{});
});
test('a valid-JSON edit to an interrupted journal cannot forge a later cursor or outbox',()=>{
 const f=fixture();f.fault(2);assert.throws(()=>f.api.commit('receive',f.before,f.after,f.next));f.clearFault();
 const journal=JSON.parse(f.memory.get(C.JOURNAL));journal.after[C.STATE]=JSON.stringify({...f.state,cursor:999});f.memory.set(C.JOURNAL,JSON.stringify(journal));
 const before=new Map(f.memory);assert.throws(()=>f.api.recover(),/checksum differs/);assert.deepEqual(f.memory,before);assert.equal(JSON.parse(f.memory.get(C.STATE)).cursor,20);
});
