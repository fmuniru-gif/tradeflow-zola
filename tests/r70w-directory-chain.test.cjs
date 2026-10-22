'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const shell=fs.readFileSync(path.join(root,'index.html'),'utf8');
const embedded=shell.match(/const CLOUD_B64="([A-Za-z0-9+/=]+)";/);
assert.ok(embedded,'expected embedded Cloud module');
const cloud=Buffer.from(embedded[1],'base64').toString('utf8');
const blockStart=cloud.indexOf('/* R70W_SHOP_CHROME_EXACT_DIRECTORY_CHAIN_REVIEW_START */');
const blockEnd=cloud.indexOf('/* R70W_SHOP_CHROME_EXACT_DIRECTORY_CHAIN_REVIEW_END */');
assert.ok(blockStart>=0&&blockEnd>blockStart,'r70W embedded code missing');
function segment(first,last){
 const start=cloud.indexOf(first);const end=cloud.indexOf(last,start+first.length);
 assert.ok(start>=0&&end>start,'missing source segment '+first);
 return cloud.slice(start,end);
}
const source=[cloud.slice(blockStart,blockEnd+'/* R70W_SHOP_CHROME_EXACT_DIRECTORY_CHAIN_REVIEW_END */'.length),
 segment('function r70lBootstrapReplayPlan(', '/* During the window this uses'),
 segment('async function r70mActivateVerifiedBootstrap(candidate, proof) {','/* While a verified candidate is staged,')].join('\n');
assert.doesNotThrow(()=>new vm.Script(source),'embedded patch fails to compile');
const clone=v=>JSON.parse(JSON.stringify(v));
const hash=v=>crypto.createHash('sha256').update(JSON.stringify({...v,payloadHash:undefined})).digest('hex');
const names={deviceId:'6229402b-947f-43b2-818f-143c3a27a1a0',lifecycleId:'0820a9f3-9e62-45c8-ac81-c4e15f5a03a5'};
function setup(options={}){
 const baseDir={revision:'checkpoint',staff:['a']};
 const before={revision:'older',staff:['a']};
 const mid1={revision:'3643',staff:['a']};
 const mid2={revision:'3644',staff:['a','b']};
 const final={revision:'3645',staff:['a','b','c']};
 const rows=[[3643,before,mid1],[3644,mid1,mid2],[3645,mid2,final]].map(([seq,before,value])=>{
  const payload={opId:'op-'+seq,deviceId:'another-device',kind:'SHARED_DEVICE_DIRECTORY',patches:[{action:'root-set',root:'sharedDeviceDirectory',before,value}]};payload.payloadHash=hash(payload);
  return {seq,op_id:payload.opId,device_id:payload.deviceId,kind:payload.kind,payload};
 });
 const stage={...names,cursor:3642,candidate:{sharedDeviceDirectory:baseDir,sales:[{id:'real-sale'}],cashBalances:{Cash:999}}};
 const bundle={baselineCursor:1267,headSeq:3645,baseline:{sharedDeviceDirectory:baseDir},operations:rows};
 const original={sharedDeviceDirectory:{revision:'local-before'},sales:[],cashBalances:{Cash:15}};
 const env={JSON,console,Error,Array,Number,String,Object,Date,Set,
  queue:[],failedOperations:[],state:{deviceId:names.deviceId,cursor:0,liveSyncEnabled:false},DB:clone(original),
  applied:{},ack:[],persist:[],r70mCopy:clone,r70mEqual:(a,b)=>JSON.stringify(a)===JSON.stringify(b),
  deterministicHash:hash,r70mText:String,
  r70mReadBootstrapStage:()=>stage,r70lWindowForRow:()=>true,
  prepareMissingOperation:()=>({safe:false,changes:0,conflicts:['root differs']}),
  ZEZMS:{cloudSync:{getState:()=>({deviceId:names.deviceId,deviceAccessMode:'PAIRED'})},
   syncIntegrity:{_test:{projectCloud:(v)=>({database:{sharedDeviceDirectory:v.operations.length?clone(final):clone(baseDir)},conflicts:[]})}}},
  fetchCloudAuditBundle:async()=>bundle,
  getDatabase:()=>env.DB,validateAppliedState:()=>{},rawSaveDatabase:()=>{env.saves=(env.saves||0)+1;},
  cleanSnapshot:v=>clone(v),observedSnapshot:null,r67hPersist:x=>env.persist.push(x),
  r70mSnapshotActivation:()=>({DB:clone(env.DB),queue:clone(env.queue),state:clone(env.state),applied:clone(env.applied)}),
  r70mRestoreActivation:s=>{env.DB=clone(s.DB);env.queue=clone(s.queue);env.state=clone(s.state);env.applied=clone(s.applied);env.ack=[];env.rollback=true;},
  r70mReconcileBootstrapOutbox:()=>({rows:[]}),
  commitM5a4BootstrapCandidate:candidate=>{env.DB=clone(candidate);env.state.cursor=3642;},
  activateM5a4Live:async()=>{
   for(const row of rows){
    if(options.corruptReplay===row.seq)row.payload.patches[0].value.revision='tampered-after-preflight';
    const p=env.r70lBootstrapReplayPlan(row,row.payload,false,false);
    if(p.shouldApply)throw Error('STOP_CHAIN_WOULD_REPLAY');
    env.r70lAssertBootstrapReplayMaterialized(row,row.payload,p);
    env.applied[row.op_id]=row.seq;env.ack.push(row.seq);env.state.cursor=row.seq;
   }
   env.state.liveSyncEnabled=true;
  }
 };
 vm.createContext(env);vm.runInContext(source,env);
 return {env,stage,bundle,rows,final,original};
}
const approval={context:{lifecycle_state:'ACTIVE'}};
test('embedded full exact-chain activation materializes only staff root and acknowledges all three in order',async()=>{
 const {env,stage,final}=setup();const result=await env.r70mActivateVerifiedBootstrap(stage.candidate,approval);
 assert.equal(result.ok,true);assert.deepEqual(clone(env.DB.sharedDeviceDirectory),final);
 assert.deepEqual(clone(env.DB.sales),[{id:'real-sale'}]);assert.deepEqual(clone(env.DB.cashBalances),{Cash:999});
 assert.deepEqual(clone(env.ack),[3643,3644,3645]);assert.equal(env.state.cursor,3645);assert.equal(env.state.liveSyncEnabled,true);
 assert.equal(env.r70wActivePlan,null,'authorization plan should not escape activation');
});
test('replay signature changes after cloud preflight cause full snapshot rollback',async()=>{
 const {env,stage,original}=setup({corruptReplay:3644});
 await assert.rejects(env.r70mActivateVerifiedBootstrap(stage.candidate,approval),/ZEZMS_R70W_STOP_REPLAY_SIGNATURE_OR_DIRECTORY_CHANGED/);
 assert.deepEqual(clone(env.DB),original);assert.deepEqual(clone(env.ack),[]);assert.equal(env.rollback,true);assert.equal(env.r70wActivePlan,null);
});
test('extra financial patch blocks before commit',async()=>{
 const {env,stage,rows,original}=setup();rows[0].payload.patches.push({action:'root-set',root:'cashBalances',value:{Cash:0}});
 rows[0].payload.payloadHash=hash(rows[0].payload);
 await assert.rejects(env.r70mActivateVerifiedBootstrap(stage.candidate,approval),/ZEZMS_R70W_STOP_WRONG_OPERATION_KIND_OR_SHAPE/);
 assert.deepEqual(clone(env.DB),original);assert.equal(env.rollback,true);assert.deepEqual(clone(env.ack),[]);
});
test('later directory change blocks before commit',async()=>{
 const {env,stage,bundle,original}=setup();bundle.headSeq=3646;bundle.operations.push({seq:3646,payload:{patches:[{action:'root-set',root:'sharedDeviceDirectory',value:{revision:'later'}}]}});
 await assert.rejects(env.r70mActivateVerifiedBootstrap(stage.candidate,approval),/ZEZMS_R70W_STOP_LATER_DIRECTORY_OPERATION/);
 assert.deepEqual(clone(env.DB),original);assert.equal(env.rollback,true);
});
test('dirty queue prevents materialization and rolls back',async()=>{
 const {env,stage,original}=setup();env.queue.push({opId:'unexpected'});
 await assert.rejects(env.r70mActivateVerifiedBootstrap(stage.candidate,approval),/ZEZMS_R70W_STOP_PRECOMMIT_INVARIANT/);
 assert.deepEqual(clone(env.DB),original);assert.equal(env.rollback,true);assert.equal(env.queue.length,1);
});
test('non-Shop device does not receive r70W special replay exemption',async()=>{
 const {env,stage}=setup();stage.deviceId='some-other-device';env.ZEZMS.cloudSync.getState=()=>({deviceId:'some-other-device',deviceAccessMode:'PAIRED'});
 const result=await env.r70wPreflightExactShopChain(stage.candidate,approval);assert.equal(result,null);
 assert.equal(env.r70wActivePlan,null);
 const row={seq:3643};const operation={patches:[]};const plan=env.r70lBootstrapReplayPlan(row,operation,false,false);
 assert.equal(plan.blocked,true,'normal replay must still stop on unproven effects');
});
