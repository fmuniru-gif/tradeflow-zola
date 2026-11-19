const {test}=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs');
const {fixture,paymentInput,operation,hash,core,state,scope,actor}=require('./receipt-payment-fixture.cjs');
test('full and originally partial credit receipts settle against the exact debtor ID without changing sale, tax, stock or profit history',()=>{
 for(const options of [{},{paid:200},{paid:100,total:1000,withholding:50}]){
  const before=fixture(options),original=JSON.stringify(before),input=paymentInput(before),plan=core.applyPayment(before,input),db=plan.database,due=before.receipts[0].balance;
  assert.equal(JSON.stringify(before),original);assert.equal(db.receipts[0].balance,0);assert.equal(db.receipts[0].credit,false);assert.equal(db.receipts[0].amountPaid,before.receipts[0].netAmountCollectible);assert.equal(db.sales[0].pay,'PAID');assert.equal(db.debtors[0].balance,2000-due);assert.equal(db.cashBalances['Cash in Hand'],25+due);assert.equal(db.accountTxns.at(-1).amount,-due);assert.equal(db.cashLog[0].amount,due);assert.deepEqual(db.products,before.products);assert.deepEqual(db.stockRows,before.stockRows);assert.deepEqual(db.sales[0].lines,before.sales[0].lines);assert.equal(db.sales[0].date,before.sales[0].date);assert.equal(db.sales[0].profit,before.sales[0].profit);assert.equal(core.operationId(operation(before,db,input.operationId).patches),input.operationId);core.validate(operation(before,db,input.operationId),state);
 }
});
test('same-name accounts cannot redirect payment; missing, duplicated, void, mismatched or previously collected debt fails without writes',()=>{
 const good=fixture();good.debtors.push({id:'D2',name:good.debtors[0].name,balance:999});assert.equal(core.inspect(good,'SR-SYNTHETIC').debtor.id,'D1');
 for(const change of [d=>d.accountTxns=[],d=>d.accountTxns.push({...d.accountTxns[0],id:'DUP'}),d=>d.debtors=[],d=>d.receipts[0].status='VOID',d=>d.sales[0].balance=700,d=>d.debtors[0].balance=200,d=>d.accountTxns[0].amount=900,d=>d.receipts[0].amountPaid=1,d=>d.receipts.push({...d.receipts[0]})]){const d=fixture();change(d);const raw=JSON.stringify(d);assert.throws(()=>core.inspect(d,'SR-SYNTHETIC'));assert.equal(JSON.stringify(d),raw);}
 const d=fixture(),p=paymentInput(d);assert.throws(()=>core.applyPayment(d,{...p,confirmed:false}),/not one already entered/);assert.throws(()=>core.applyPayment(d,{...p,wallet:'Unknown'}),/wallet/);assert.throws(()=>core.applyPayment({...d,debtors:[{...d.debtors[0],balance:2050}]},p),/changed after review/);
});
test('a repeated click cannot post another receipt payment and a complete reversal restores all four business effects together',()=>{
 const before=fixture({paid:200}),input=paymentInput(before),plan=core.applyPayment(before,input),paid=plan.database;
 assert.throws(()=>core.inspect(paid,'SR-SYNTHETIC'),/outstanding|already/);assert.throws(()=>core.applyPayment(paid,input));
 const id='RCPAYUNDO-'+input.operationId.slice(6),undone=core.applyUndo(paid,{paymentId:plan.paymentId,operationId:id,proof:core.undoProof(paid,plan.paymentId),actor,at:'2026-11-19T11:00:00Z',reason:'Synthetic correction'}).database;
 assert.equal(undone.receipts[0].amountPaid,200);assert.equal(undone.receipts[0].balance,750);assert.equal(undone.receipts[0].credit,true);assert.equal(undone.sales[0].pay,'PARTIAL');assert.equal(undone.debtors[0].balance,2000);assert.equal(undone.cashBalances['Cash in Hand'],25);assert.equal(undone.cashLog[0].status,'UNDONE');assert.equal(undone.accountTxns.at(-1).status,'UNDONE');core.validate(operation(paid,undone,id),state);assert.notEqual(paymentInput(undone).operationId,input.operationId);assert.throws(()=>core.applyUndo(paid,{paymentId:plan.paymentId,operationId:id,proof:'stale',actor,at:'now'}),/changed/);
 const empty=structuredClone(paid);empty.cashBalances['Cash in Hand']=0;assert.throws(()=>core.applyUndo(empty,{paymentId:plan.paymentId,operationId:id,proof:core.undoProof(empty,plan.paymentId),actor,at:'now'}),/enough money/);
});
test('operation identity is shared across devices and wallet choices; duplicate Cloud claims converge only after exact hash and scope validation',()=>{
 const base=fixture(),a=paymentInput(base),b=paymentInput(base,{wallet:'MOMO',actor:{id:'STAFF-2',name:'Synthetic Shop',role:'OWNER'}});assert.equal(a.operationId,b.operationId);
 const pa=core.applyPayment(base,a),pb=core.applyPayment(base,b),oa=operation(base,pa.database,a.operationId,'MAIN'),ob=operation(base,pb.database,b.operationId,'SHOP');
 const row={op_id:oa.opId,device_id:oa.deviceId,payload:oa};assert.equal(core.collision(row,ob,state,hash),true);assert.equal(core.materialized(pa.database,oa),true);assert.throws(()=>core.materialized(pa.database,ob),/different payment|after-state is unproven/);
 assert.throws(()=>core.collision({...row,payload:{...oa,payloadHash:'wrong'}},ob,state,hash),/integrity/);assert.throws(()=>core.validate(oa,{...state,syncOwnerId:'OTHER'}),/different owner/);
 for(const mutate of [o=>o.patches.push({action:'insert',collection:'expenses',key:'bad',value:{id:'bad'}}),o=>o.patches.find(p=>p.root==='cashBalances').value++,o=>o.patches.find(p=>p.collection==='debtors').changes.find(c=>c.field==='balance').mode='set']){const bad=structuredClone(oa);mutate(bad);assert.throws(()=>core.validate(bad,state));}
 assert.equal(core.descriptor({opId:'ordinary-operation',patches:[]}),null);
});
test('every native durable-write interruption recovers to one complete receipt/debtor/cash result and its one immutable outbox item',()=>{
 const D=require('../js/sync-durability.js');const before=fixture(),input=paymentInput(before),plan=core.applyPayment(before,input),op=operation(before,plan.database,input.operationId),initialState={deviceId:'MAIN',syncOwnerId:scope.ownerId,businessId:scope.businessId,branchId:scope.branchId,deviceAccessMode:'OWNER',cursor:20};
 for(let stop=0;stop<9;stop++){let n=0,fail=true;const memory=new Map([[D.DB,JSON.stringify(before)],[D.STATE,JSON.stringify(initialState)],[D.QUEUE,'[]'],[D.APPLIED,'{}'],[D.FAILED,'[]']]),storage={getItem:k=>memory.get(k)||null,setItem(k,v){if(fail&&n++===stop)throw Error('synthetic interruption');memory.set(k,String(v));},removeItem(k){if(fail&&n++===stop)throw Error('synthetic interruption');memory.delete(k);}};const api=D.create({storage}),next={[D.STATE]:JSON.stringify(initialState),[D.QUEUE]:JSON.stringify([op]),[D.APPLIED]:'{}',[D.FAILED]:'[]'};
  try{api.commit('receipt-payment',JSON.stringify(before),JSON.stringify(plan.database),next);}catch(_){}fail=false;D.create({storage}).recover();const db=JSON.parse(memory.get(D.DB)),queue=JSON.parse(memory.get(D.QUEUE));if(db.receipts[0].balance===0){assert.equal(db.debtors[0].balance,1050);assert.equal(db.cashBalances['Cash in Hand'],975);assert.equal(db.cashLog.length,1);assert.equal(db.accountTxns.length,2);assert.equal(queue.length,1);assert.equal(queue[0].opId,op.opId);}else{assert.deepEqual(db,before);assert.equal(queue.length,0);}
 }
});
test('all changes reverse exactly to the current production application and preserve the proven durability modules byte for byte',()=>{
 const d=require('../tools/build-pr11-delivery.cjs'),t=require('../tools/receipt-payment-transform.cjs'),base='1a12ff9d46b98ee16e04ad6fb289731cda9c485f',prior=f=>cp.execFileSync('git',['show',base+':'+f],{maxBuffer:32e6});const strip=x=>x.replace(/<meta name="zezms-delivery" content="[^"]+">/,'DELIVERY');
 assert.equal(strip(t.withoutReceiptPayment(d.assembledShell(d.assetBytes('index.html').toString()))),strip(d.assembledShell(prior('index.html').toString())));
 for(const file of ['js/sync-durability.js','js/sync-durability-runtime.js','js/dbservice.js','js/sync-resilience.js'])assert.deepEqual(d.assetBytes(file),prior(file),file);
});
