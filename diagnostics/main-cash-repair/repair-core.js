/* One-use Main cash reconciliation. Pure checks; no network or storage access. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ZEZMSMainCashRepairCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MAIN = '9a5ab8eb-f67e-425c-866d-574b641295f0';
  const CASH = Object.freeze([
    {id:'CB-20261015-112834-639-6946A5A99F4241718B772CCAF5F30F00',wallet:'Others',amount:70},
    {id:'CB-20261015-113005-658-C30CD6B2D6A146368C0F0CADCEC891DA',wallet:'Cash in Hand',amount:100},
    {id:'CB-20261015-113041-508-CA67DEA2C4454137B56086CDBDFB92E7',wallet:'Cash in Hand',amount:70}
  ]);
  const EXPENSE = 'EXP-20261015-113005-658-4F25DF798ADA47048395FE1C9E6B1969';
  const EXPECTED_MISSING = new Set(CASH.map(x=>'cashLog/'+x.id).concat('expenses/'+EXPENSE));
  const clone=x=>JSON.parse(JSON.stringify(x));
  function fail(code) { throw Error('STOP_'+code); }
  function canonicalize(value) {
    if (value === undefined) return null;
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(canonicalize);
    const out={};Object.keys(value).sort().forEach(key=>{
      if (!['payloadHash','outboxState','attempts','lastAttempt','lastError','_legacyPayload'].includes(key))
        out[key]=canonicalize(value[key]);
    });return out;
  }
  function operationHash(value) {
    const text=JSON.stringify(canonicalize(value));
    let high=0xcbf29ce4,low=0x84222325;
    for(let i=0;i<text.length;i++){
      low^=text.charCodeAt(i);
      const nextLow=Math.imul(low,0x1b3);
      const carry=((low>>>0)*0x100+(nextLow>>>0))/0x100000000;
      high=(Math.imul(high,0x1b3)+Math.floor(carry))>>>0;
      low=nextLow>>>0;
    }
    return high.toString(16).padStart(8,'0')+low.toString(16).padStart(8,'0');
  }
  function stable(value) {
    if(value===null||typeof value!=='object')return JSON.stringify(value);
    if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
    return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
  }
  function exactlyOne(database,collection,id) {
    const rows=database[collection];
    if(!Array.isArray(rows))fail('COLLECTION_'+collection);
    const found=rows.filter(row=>row&&String(row.id)===id);
    if(found.length!==1)fail('CLOUD_RECORD_'+collection+'_'+id);
    return found[0];
  }
  function money(value) {
    if(typeof value!=='number'||!Number.isFinite(value))fail('INVALID_MONEY');
    return Math.round(value*100);
  }
  function assertOperationEvidence(bundle,records) {
    const rows=bundle.operations||[];
    const ids=new Set();let last=Number(bundle.baselineCursor);
    if(!Number.isSafeInteger(last)||last<0||!Array.isArray(rows))fail('CLOUD_WINDOW');
    for(const row of rows){
      const seq=Number(row.seq),op=row.payload;
      if(!Number.isSafeInteger(seq)||seq<=last||!row.op_id||ids.has(row.op_id)||!op||
         String(op.opId||'')!==String(row.op_id)||!Array.isArray(op.patches))fail('CLOUD_ORDER');
      if(op.payloadHash&&op.payloadHash!==operationHash(op))fail('OPERATION_HASH');
      ids.add(row.op_id);last=seq;
    }
    if(last!==Number(bundle.headSeq))fail('CLOUD_HEAD');
    const opFor=(collection,id)=>{
      const matches=rows.filter(row=>(row.payload.patches||[]).some(p=>
        p.action==='insert'&&p.collection===collection&&String(p.key)===id&&
        stable(p.value)===stable(records[collection][id])));
      if(matches.length!==1||!matches[0].payload.payloadHash)fail('SOURCE_OPERATION_'+id);
      return matches[0];
    };
    const cashOps=CASH.map(item=>{
      const row=opFor('cashLog',item.id);
      const deltas=row.payload.patches.filter(p=>p.action==='root-object'&&p.root==='cashBalances'&&
        p.key===item.wallet&&p.mode==='delta'&&money(p.value)===-item.amount*100);
      if(deltas.length!==1)fail('CASH_EFFECT_'+item.id);
      return row;
    });
    const expenseOp=opFor('expenses',EXPENSE);
    if(expenseOp.op_id!==cashOps[1].op_id)fail('EXPENSE_OPERATION_LINK');
    return cashOps.map(row=>({seq:row.seq,opId:row.op_id,payloadHash:row.payload.payloadHash}));
  }
  function assess(input) {
    const {local,cloud,state,queue,failed,applyJournal,report,bundle,ownerId}=input;
    if(!local||!cloud||!state||state.deviceId!==MAIN||state.deviceAccessMode!=='OWNER'||
      state.initialized!==true||!Number.isSafeInteger(Number(state.cursor))||
      !ownerId||(state.syncOwnerId&&String(state.syncOwnerId)!==String(ownerId)))fail('MAIN_OWNER_IDENTITY');
    if(!Array.isArray(queue)||queue.length||!Array.isArray(failed)||failed.length||applyJournal)
      fail('LOCAL_SYNC_STATE');
    if(Number(state.cursor)!==Number(bundle.headSeq)||!report||
      (report.unappliedCloudOperations||[]).length||(report.unacknowledgedLocalOperations||[]).length||
      (report.cloudProjectionConflicts||[]).length)fail('AUDIT_STATE');
    const records={cashLog:{},expenses:{}};
    for(const item of CASH){
      const row=exactlyOne(cloud,'cashLog',item.id);
      if(row.action!=='Deduct'||row.cashType!==item.wallet||money(row.amount)!==item.amount*100||
        !String(row.at||row.date||'').startsWith('2026-10-15')||
        !['ACTIVE',''].includes(String(row.status||'')))fail('CASH_PAYLOAD_'+item.id);
      records.cashLog[item.id]=row;
    }
    const expense=exactlyOne(cloud,'expenses',EXPENSE);
    if(money(expense.amount)!==10000||expense.wallet!=='Cash in Hand'||
      expense.cashLogId!==CASH[1].id||!String(expense.date||'').startsWith('2026-10-15')||
      !['ACTIVE',''].includes(String(expense.status||''))||
      records.cashLog[CASH[1].id].meta?.expenseId!==EXPENSE)fail('EXPENSE_PAYLOAD');
    records.expenses[EXPENSE]=expense;
    const operations=assertOperationEvidence(bundle,records);
    const present=CASH.map(x=>(local.cashLog||[]).filter(r=>r&&r.id===x.id));
    present.push((local.expenses||[]).filter(r=>r&&r.id===EXPENSE));
    if(present.some(list=>list.length>1)||
      (present.some(list=>list.length===1)&&present.some(list=>list.length===0)))fail('PARTIAL_LOCAL_RECORDS');
    const already=present.every(list=>list.length===1);
    if(already){
      for(let i=0;i<CASH.length;i++)if(stable(present[i][0])!==stable(records.cashLog[CASH[i].id]))fail('LOCAL_PAYLOAD_MISMATCH');
      if(stable(present[3][0])!==stable(expense))fail('LOCAL_EXPENSE_MISMATCH');
    }
    const differences=(report.differences||[]).map(d=>d.category+'/'+d.collection+'/'+d.id);
    const expected=[...EXPECTED_MISSING].map(x=>'Missing Locally/'+x).sort();
    if(already){if(differences.length)fail('POST_RECORD_DIFFERENCE');}
    else if(stable(differences.sort())!==stable(expected))fail('UNEXPECTED_RECORD_DIFFERENCE');
    const localWallets=local.cashBalances,cloudWallets=cloud.cashBalances;
    if(!localWallets||!cloudWallets||stable(Object.keys(localWallets).sort())!==stable(Object.keys(cloudWallets).sort()))
      fail('WALLET_SET');
    const balances=[];
    for(const wallet of Object.keys(cloudWallets)){
      const before=money(localWallets[wallet]),target=money(cloudWallets[wallet]),delta=before-target;
      const allowed=wallet==='Cash in Hand'?17000:wallet==='Others'?7000:0;
      if(already ? delta!==0 : delta!==0&&delta!==allowed)fail('WALLET_DELTA_'+wallet);
      balances.push({wallet,before:before/100,cloud:target/100,difference:delta/100});
    }
    return {status:already?'ALREADY_REPAIRED':'READY',records,operations,balances,
      headSeq:Number(bundle.headSeq),deviceId:MAIN,recordIds:[...EXPECTED_MISSING].sort()};
  }
  function candidate(local,plan,audit) {
    if(plan.status!=='READY')fail('NOT_READY');
    const next=clone(local);
    for(const item of CASH)next.cashLog.push(clone(plan.records.cashLog[item.id]));
    next.expenses.push(clone(plan.records.expenses[EXPENSE]));
    for(const balance of plan.balances)if(balance.wallet==='Cash in Hand'||balance.wallet==='Others')
      next.cashBalances[balance.wallet]=balance.cloud;
    if(next.syncReconciliationLog!=null&&!Array.isArray(next.syncReconciliationLog))fail('AUDIT_LOG_SHAPE');
    next.syncReconciliationLog=(next.syncReconciliationLog||[]).concat({
      kind:'MAIN_CASH_REPAIR_20261015',at:audit.at,deviceId:MAIN,cloudHead:plan.headSeq,
      recordIds:plan.recordIds,operationIds:plan.operations.map(x=>x.opId),
      backupSha256:audit.backupSha256,beforeSha256:audit.beforeSha256
    });
    return next;
  }
  function assertOnlyExpectedChanges(local,next,plan) {
    const restored=clone(next);
    const addedCash=restored.cashLog.splice(-3);
    const addedExpense=restored.expenses.pop();
    if(addedCash.length!==3||CASH.some((item,i)=>stable(addedCash[i])!==stable(plan.records.cashLog[item.id]))||
      stable(addedExpense)!==stable(plan.records.expenses[EXPENSE]))fail('CANDIDATE_RECORDS');
    for(const wallet of ['Cash in Hand','Others'])restored.cashBalances[wallet]=local.cashBalances[wallet];
    const audit=restored.syncReconciliationLog?.pop();
    if(!audit||audit.kind!=='MAIN_CASH_REPAIR_20261015')fail('CANDIDATE_AUDIT');
    if(local.syncReconciliationLog==null)delete restored.syncReconciliationLog;
    if(stable(restored)!==stable(local))fail('CANDIDATE_OTHER_DATA');
    return true;
  }
  return Object.freeze({MAIN,CASH,EXPENSE,operationHash,stable,assess,candidate,assertOnlyExpectedChanges});
});
