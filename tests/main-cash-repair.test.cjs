const {test}=require('node:test');
const assert=require('node:assert/strict');
const core=require('../diagnostics/main-cash-repair/repair-core.js');
const copy=x=>JSON.parse(JSON.stringify(x));
function fixture(){
  const [personal,cash100,cash70]=core.CASH;
  const logs=[
    {id:personal.id,cashType:'Others',action:'Deduct',amount:70,at:'2026-10-15T11:28:34.639Z',status:'ACTIVE'},
    {id:cash100.id,cashType:'Cash in Hand',action:'Deduct',amount:100,at:'2026-10-15T11:30:05.658Z',status:'ACTIVE',meta:{expenseId:core.EXPENSE}},
    {id:cash70.id,cashType:'Cash in Hand',action:'Deduct',amount:70,at:'2026-10-15T11:30:41.508Z',status:'ACTIVE'}
  ];
  const expense={id:core.EXPENSE,amount:100,wallet:'Cash in Hand',cashLogId:cash100.id,
    date:'2026-10-15T00:00:00.000Z',description:'Synthetic',status:'ACTIVE'};
  const local={cashBalances:{'Cash in Hand':1000,Others:500,MOMO:200},cashLog:[],expenses:[]};
  const cloud={cashBalances:{'Cash in Hand':830,Others:430,MOMO:200},cashLog:logs,expenses:[expense]};
  const ops=logs.map((entry,i)=>{
    const patches=[{action:'insert',collection:'cashLog',key:entry.id,value:copy(entry)}];
    if(i===1)patches.push({action:'insert',collection:'expenses',key:core.EXPENSE,value:copy(expense)});
    patches.push({action:'root-object',root:'cashBalances',key:entry.cashType,mode:'delta',value:-entry.amount,before:0});
    const payload={opId:'synthetic-op-'+i,protocolVersion:'M4/2',patches};
    payload.payloadHash=core.operationHash(payload);
    return {seq:i+1,op_id:payload.opId,payload};
  });
  const report={differences:[...core.CASH.map(x=>({category:'Missing Locally',collection:'cashLog',id:x.id})),
    {category:'Missing Locally',collection:'expenses',id:core.EXPENSE}],
    unappliedCloudOperations:[],unacknowledgedLocalOperations:[],cloudProjectionConflicts:[]};
  return {local,cloud,state:{deviceId:core.MAIN,deviceAccessMode:'OWNER',initialized:true,cursor:3},
    queue:[],failed:[],applyJournal:null,report,bundle:{baselineCursor:0,headSeq:3,operations:ops},ownerId:'owner-1'};
}
test('exact four records and full cloud effects yield one candidate and no invented operation',()=>{
  const f=fixture(),plan=core.assess(f);
  assert.equal(plan.status,'READY');
  assert.equal(plan.operations.length,3);
  assert.deepEqual(plan.balances.filter(x=>x.difference).map(x=>x.difference).sort((a,b)=>a-b),[70,170]);
  const next=core.candidate(f.local,plan,{at:'2026-10-17T00:00:00Z',backupSha256:'backup',beforeSha256:'before'});
  assert.equal(next.cashBalances['Cash in Hand'],830);
  assert.equal(next.cashBalances.Others,430);
  assert.equal(next.cashLog.length,3);
  assert.equal(next.expenses.length,1);
  assert.equal(next.syncReconciliationLog[0].backupSha256,'backup');
  assert.equal(core.assertOnlyExpectedChanges(f.local,next,plan),true);
  next.cashBalances.MOMO=199;
  assert.throws(()=>core.assertOnlyExpectedChanges(f.local,next,plan),/STOP_CANDIDATE_OTHER_DATA/);
  assert.equal(f.local.cashLog.length,0);
});
test('wallet already reflects cloud: records restore without a second deduction',()=>{
  const f=fixture();f.local.cashBalances['Cash in Hand']=830;f.local.cashBalances.Others=430;
  const plan=core.assess(f),next=core.candidate(f.local,plan,{at:'now',backupSha256:'b',beforeSha256:'a'});
  assert.equal(next.cashBalances['Cash in Hand'],830);
  assert.equal(next.cashBalances.Others,430);
  assert.ok(plan.balances.every(x=>x.difference===0));
});
test('completed state is idempotent and cannot build another candidate',()=>{
  const f=fixture();const plan=core.assess(f);
  f.local=core.candidate(f.local,plan,{at:'now',backupSha256:'b',beforeSha256:'a'});
  f.report.differences=[];
  const again=core.assess(f);
  assert.equal(again.status,'ALREADY_REPAIRED');
  assert.throws(()=>core.candidate(f.local,again,{at:'later'}),/STOP_NOT_READY/);
});
for(const [name,change,reason] of [
  ['wrong device',f=>{f.state.deviceId='shop';},'MAIN_OWNER_IDENTITY'],
  ['paired session',f=>{f.state.deviceAccessMode='PAIRED';},'MAIN_OWNER_IDENTITY'],
  ['queued operation',f=>{f.queue=[{opId:'q'}];},'LOCAL_SYNC_STATE'],
  ['failed operation',f=>{f.failed=[{opId:'q'}];},'LOCAL_SYNC_STATE'],
  ['interrupted journal',f=>{f.applyJournal={opId:'q'};},'LOCAL_SYNC_STATE'],
  ['wrong cloud record',f=>{f.cloud.cashLog[0].amount=71;},'CASH_PAYLOAD'],
  ['wrong expense link',f=>{f.cloud.expenses[0].cashLogId='other';},'EXPENSE_PAYLOAD'],
  ['tampered operation',f=>{f.bundle.operations[0].payload.patches[0].value.amount=71;},'OPERATION_HASH'],
  ['missing source operation',f=>{f.bundle.operations[0].payload.patches[0].key='other';f.bundle.operations[0].payload.payloadHash=core.operationHash(f.bundle.operations[0].payload);},'SOURCE_OPERATION'],
  ['duplicate local record',f=>{f.local.cashLog.push(copy(f.cloud.cashLog[0]),copy(f.cloud.cashLog[0]));},'PARTIAL_LOCAL_RECORDS'],
  ['partial local record',f=>{f.local.cashLog.push(copy(f.cloud.cashLog[0]));},'PARTIAL_LOCAL_RECORDS'],
  ['partial cash effect',f=>{f.local.cashBalances['Cash in Hand']=900;},'WALLET_DELTA'],
  ['other wallet drift',f=>{f.local.cashBalances.MOMO=201;},'WALLET_DELTA'],
  ['unexpected audit difference',f=>{f.report.differences.push({category:'Missing Locally',collection:'sales',id:'s'});},'UNEXPECTED_RECORD_DIFFERENCE'],
  ['unapplied operation',f=>{f.report.unappliedCloudOperations.push({opId:'other'});},'AUDIT_STATE'],
  ['stale cursor',f=>{f.state.cursor=2;},'AUDIT_STATE']
])test('fail closed: '+name,()=>{const f=fixture();change(f);assert.throws(()=>core.assess(f),new RegExp('STOP_'+reason));});
