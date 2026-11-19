/* Receipt-specific full settlements. Pure planning and operation validation. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.ZEZMS=root.ZEZMS||{};root.ZEZMS.receiptPaymentCore=api;}})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const SOURCE='RECEIPT_SETTLEMENT',list=x=>Array.isArray(x)?x:[],copy=x=>JSON.parse(JSON.stringify(x)),text=x=>String(x==null?'':x),active=x=>x&&!x.voided&&!['VOID','VOIDED','UNDONE','REVERSED','CANCELLED','CANCELED','REJECTED'].includes(text(x.status).toUpperCase());
function check(ok,message){if(!ok)throw Error('Receipt payment: '+message);}
function cents(value){const n=Number(value);check(Number.isFinite(n)&&Math.abs(n)<=1e9,'invalid monetary amount.');const c=Math.round(n*100);check(Math.abs(n*100-c)<0.00001,'amounts must use at most two decimal places.');return c;}
const money=c=>c/100;
function unique(rows,test,label){const found=list(rows).filter(test);check(found.length===1,label+' is missing or ambiguous.');return found[0];}
function isPayment(t){return t&&t.meta&&t.meta.source===SOURCE;}
function linked(db,id){return list(db.accountTxns).filter(t=>isPayment(t)&&t.meta.receiptNo===id);}
function inspect(db,identifier){
 const r=unique(db.receipts,r=>text(r.receiptNo)===text(identifier)||text(r.receiptRef)===text(identifier),'Receipt');
 const id=text(r.receiptNo),s=unique(db.sales,s=>text(s.receiptNo||s.id)===id,'Matching sale');
 check(id&&active(r)&&active(s),'the receipt or sale is void or reversed.');
 const due=cents(r.balance),paid=cents(r.amountPaid!=null?r.amountPaid:r.paid||0);
 const gross=cents(r.totalAmount!=null?r.totalAmount:r.grossTotal!=null?r.grossTotal:s.grossTotal!=null?s.grossTotal:s.total);
 const tax=cents(r.withholdingTax!=null?r.withholdingTax:r.withholdingTaxAmount||0);
 const net=r.netAmountCollectible!=null?cents(r.netAmountCollectible):gross-tax;
 check(due>0&&paid>=0&&net>0&&paid+due===net,'the receipt must have a verified outstanding amount.');
 check(cents(s.balance)===due&&cents(s.paid||0)===paid,'receipt and sale payment amounts differ.');
 check(!r.settlementId&&!linked(db,id).some(active),'a payment is already recorded for this receipt.');
 const credit=unique(db.accountTxns,t=>active(t)&&/credit sale/i.test(text(t.txnType))&&text(t.receiptNo||t.meta&&t.meta.saleReceiptNo)===id,'Original debtor credit entry');
 check(cents(credit.amount)===due,'the original debtor credit does not match the receipt balance. Review Accounts first.');
 check(/debtor/i.test(text(credit.accountType))||credit.meta&&credit.meta.kind==='debtors','the linked account is not a debtor.');
 const debtor=unique(db.debtors,d=>text(d.id)===text(credit.accountID),'Linked debtor');
 check(cents(debtor.balance)>=due,'the debtor balance is less than this receipt. Check for a payment already recorded in Accounts.');
 const previous=text(r.lastSettlementId);check(!previous||linked(db,id).some(t=>t.id===previous&&!active(t)),'the earlier payment/reversal history is unavailable.');
 return {receiptNo:id,receipt:r,sale:s,debtor,credit,due,paid,net,previous};
}
function proof(db,id){const x=inspect(db,id);return JSON.stringify({receipt:x.receipt,sale:x.sale,debtor:x.debtor,credit:x.credit,payments:linked(db,x.receiptNo)});}
function scope(s){return {ownerId:text(s.syncOwnerId||s.ownerId),businessId:text(s.businessId),branchId:text(s.branchId)};}
function sameScope(a,b){return ['ownerId','businessId','branchId'].every(k=>text(a&&a[k])===text(b&&b[k]));}
function seed(db,id,s){const x=inspect(db,id),binding=scope(s);check(binding.ownerId&&binding.businessId&&binding.branchId,'Cloud owner, business and branch must be verified.');return JSON.stringify(['ZEZMS-RECEIPT-SETTLEMENT/1',binding.ownerId,binding.businessId,binding.branchId,x.receiptNo,x.previous]);}
function applyPayment(database,input){
 const db=copy(database),x=inspect(db,input.receiptNo),suffix=text(input.operationId).replace(/^RCPAY-/,'');
 check(/^RCPAY-[a-f0-9]{64}$/.test(input.operationId),'invalid payment identity.');
 check(proof(database,input.receiptNo)===input.proof,'the receipt or debtor changed after review. Open Paid again.');
 check(input.confirmed===true,'confirm that this is a new payment actually received, not one already entered in Accounts.');
 check(text(input.actor&&input.actor.id)&&text(input.actor.name)&&text(input.at),'payment audit identity is required.');
 const wallet=text(input.wallet);check(wallet&&Object.hasOwn(db.cashBalances||{},wallet),'choose a valid receiving cash wallet.');
 const beforeCash=cents(db.cashBalances[wallet]),beforeDebt=cents(x.debtor.balance),id='RSP-'+suffix,cashId='RSC-'+suffix;
 check(!list(db.accountTxns).some(t=>t.id===id)&&!list(db.cashLog).some(t=>t.id===cashId),'this payment has already been recorded.');
 const meta={source:SOURCE,kind:'debtors',version:1,receiptNo:x.receiptNo,receiptRef:text(x.receipt.receiptRef||x.receiptNo),accountId:text(x.debtor.id),creditTxnId:text(x.credit.id),paymentId:id,paymentOperationId:input.operationId,cashLogId:cashId,wallet,cashAction:'Add',cashAmount:money(x.due),beforeBalance:money(beforeDebt),afterBalance:money(beforeDebt-x.due),beforeAmountPaid:money(x.paid),beforeReceiptBalance:money(x.due),beforeCashReceived:money(cents(x.receipt.cashReceived!=null?x.receipt.cashReceived:x.paid/100)),scope:copy(input.scope),actor:copy(input.actor)};
 x.debtor.balance=money(beforeDebt-x.due);x.debtor.date=input.at;
 db.accountTxns.push({id,accountID:x.debtor.id,accountType:'DEBTOR',name:x.debtor.name,txnType:'SETTLE',amount:money(-x.due),balanceAfter:x.debtor.balance,date:input.at,receiptNo:x.receiptNo,receiptRef:meta.receiptRef,cashier:input.actor.name,status:'ACTIVE',meta});
 db.cashBalances[wallet]=money(beforeCash+x.due);
 db.cashLog.push({id:cashId,cashType:wallet,walletKey:wallet,action:'Add',amount:money(x.due),before:money(beforeCash),after:money(beforeCash+x.due),at:input.at,cashier:input.actor.name,status:'ACTIVE',note:'Receipt payment '+meta.receiptRef,meta:{source:SOURCE,receiptNo:x.receiptNo,receiptRef:meta.receiptRef,accountTxnId:id,accountKind:'debtors',accountId:x.debtor.id,paymentOperationId:input.operationId}});
 for(const record of [x.receipt,x.sale])Object.assign(record,{balance:0,settlementId:id,lastSettlementId:id,settlementWallet:wallet,settlementCashLogId:cashId,settledAt:input.at,settledBy:input.actor.name,cashReceived:money(cents(record.cashReceived!=null?record.cashReceived:x.paid/100)+x.due)});
 x.receipt.amountPaid=money(x.net);x.receipt.credit=false;x.sale.paid=money(x.net);x.sale.pay='PAID';
 return {database:db,paymentId:id,receiptNo:x.receiptNo,amount:money(x.due),wallet};
}
function undoProof(db,id){const t=unique(db.accountTxns,t=>t.id===id&&isPayment(t),'Receipt payment');return JSON.stringify({transaction:t,receipt:list(db.receipts).find(r=>r.receiptNo===t.meta.receiptNo),sale:list(db.sales).find(r=>text(r.receiptNo||r.id)===t.meta.receiptNo),debtor:list(db.debtors).find(d=>d.id===t.accountID),cash:list(db.cashLog).find(c=>c.id===t.meta.cashLogId),wallet:db.cashBalances&&db.cashBalances[t.meta.wallet]});}
function applyUndo(database,input){
 const db=copy(database),txn=unique(db.accountTxns,t=>t.id===input.paymentId&&isPayment(t),'Receipt payment'),m=txn.meta;
 check(active(txn),'this payment has already been reversed.');
 check(undoProof(database,input.paymentId)===input.proof,'payment details changed after reversal was requested.');
 check(input.operationId==='RCPAYUNDO-'+m.paymentOperationId.slice(6),'invalid payment reversal identity.');
 const r=unique(db.receipts,r=>r.receiptNo===m.receiptNo,'Receipt'),s=unique(db.sales,s=>text(s.receiptNo||s.id)===m.receiptNo,'Matching sale'),d=unique(db.debtors,d=>d.id===txn.accountID,'Debtor'),cash=unique(db.cashLog,c=>c.id===m.cashLogId,'Payment cash entry');
 check(active(r)&&active(s)&&r.settlementId===txn.id&&s.settlementId===txn.id&&r.lastSettlementId===txn.id,'receipt payment history changed; a partial reversal is blocked.');
 const amount=cents(m.cashAmount);check(amount>0&&cents(txn.amount)===-amount&&active(cash)&&cents(cash.amount)===amount&&cash.cashType===m.wallet&&cash.meta&&cash.meta.accountTxnId===txn.id,'the linked debtor and cash payment do not match.');
 const current=cents(db.cashBalances[m.wallet]);check(m.wallet==='Others'||current>=amount,'the receiving wallet no longer contains enough money to reverse this payment.');
 d.balance=money(cents(d.balance)+amount);d.date=input.at;db.cashBalances[m.wallet]=money(current-amount);
 for(const entry of [txn,cash])Object.assign(entry,{status:'UNDONE',undoneAt:input.at,undoneBy:input.actor.name,undoReason:text(input.reason)});
 txn.meta.reversalOperationId=input.operationId;txn.meta.reversedBy=copy(input.actor);cash.undoSource=SOURCE;cash.linkedUndoId=txn.id;cash.balanceAfterUndo=db.cashBalances[m.wallet];
 for(const record of [r,s]){record.balance=m.beforeReceiptBalance;record.cashReceived=money(cents(record.cashReceived)-amount);delete record.settlementId;delete record.settlementWallet;delete record.settlementCashLogId;delete record.settledAt;delete record.settledBy;}
 r.amountPaid=m.beforeAmountPaid;r.credit=true;s.paid=m.beforeAmountPaid;s.pay=cents(s.paid)>0?'PARTIAL':'CREDIT';
 return {database:db,paymentId:txn.id,receiptNo:m.receiptNo,amount:money(amount),wallet:m.wallet};
}
function descriptor(operation){
 if(!operation||!/^RCPAY(?:UNDO)?-[a-f0-9]{64}$/.test(text(operation.opId)))return null;
 const undo=operation.opId.startsWith('RCPAYUNDO-'),patch=unique(operation.patches,p=>p.collection==='accountTxns'&&isPayment(p.value||p.fallback),'Settlement operation marker'),t=patch.value||patch.fallback,m=t.meta;
 check((undo?m.reversalOperationId:m.paymentOperationId)===operation.opId,'operation identity does not match its payment.');
 check(t.id==='RSP-'+m.paymentOperationId.slice(6)&&/^RCPAY-[a-f0-9]{64}$/.test(m.paymentOperationId),'invalid debtor payment marker.');
 return {undo,txn:t,meta:m,id:t.id,receiptNo:m.receiptNo,accountId:t.accountID,wallet:m.wallet,amount:cents(m.cashAmount),scope:m.scope};
}
function operationId(patches){
 const markers=list(patches).filter(p=>p.collection==='accountTxns'&&isPayment(p.value||p.fallback));if(!markers.length)return '';
 check(markers.length===1,'only one receipt payment may be saved per transaction.');const p=markers[0],m=(p.value||p.fallback).meta;
 if(p.action==='insert')return m.paymentOperationId;
 if(p.action==='update'&&list(p.changes).some(c=>c.field==='status'&&c.value==='UNDONE'))return m.reversalOperationId;
 throw Error('Receipt payment: payment audit entries cannot be edited independently.');
}
function validate(operation,state){
 const d=descriptor(operation);if(!d)return null;check(sameScope(d.scope,scope(state)),'payment belongs to a different owner, business or branch.');
 check(d.amount>0&&list(operation.patches).length===6,'payment must contain exactly its linked receipt, sale, debtor, account entry, cash entry and wallet.');
 const p=operation.patches,find=(c)=>unique(p,x=>x.collection===c,c+' payment patch'),r=find('receipts'),s=find('sales'),deb=find('debtors'),at=find('accountTxns'),cash=find('cashLog'),wallet=unique(p,x=>x.action==='root-object'&&x.root==='cashBalances','Wallet payment patch');
 check(r.action==='update'&&s.action==='update'&&deb.action==='update'&&(r.fallback||{}).receiptNo===d.receiptNo&&text((s.fallback||{}).receiptNo||(s.fallback||{}).id)===d.receiptNo&&(deb.fallback||{}).id===d.accountId,'payment record identities differ.');
 const allowed={receipts:new Set(['amountPaid','balance','credit','settlementId','lastSettlementId','settlementWallet','settlementCashLogId','settledAt','settledBy','cashReceived']),sales:new Set(['paid','balance','pay','settlementId','lastSettlementId','settlementWallet','settlementCashLogId','settledAt','settledBy','cashReceived']),debtors:new Set(['balance','date']),accountTxns:new Set(['status','undoneAt','undoneBy','undoReason','meta']),cashLog:new Set(['status','undoneAt','undoneBy','undoReason','undoSource','linkedUndoId','balanceAfterUndo'])};
 for(const patch of p)if(patch.action==='update')for(const change of patch.changes)check(allowed[patch.collection]&&allowed[patch.collection].has(change.field),'payment cannot change unrelated '+patch.collection+'.'+change.field);
 for(const [patch,field,value]of [[r,'balance',d.undo?d.meta.beforeReceiptBalance:0],[r,'amountPaid',d.undo?d.meta.beforeAmountPaid:money(cents(d.meta.beforeAmountPaid)+d.amount)],[s,'balance',d.undo?d.meta.beforeReceiptBalance:0],[s,'paid',d.undo?d.meta.beforeAmountPaid:money(cents(d.meta.beforeAmountPaid)+d.amount)]]){const change=unique(patch.changes,c=>c.field===field,field+' payment update');check(change.mode==='set'&&cents(change.value)===cents(value)&&cents(patch.fallback[field])===cents(value),'receipt payment amounts must change together.');}
 const delta=(x,field)=>{const c=unique(x.changes,c=>c.field===field,field+' change');check(c.mode==='delta','balance changes must retain native delta semantics.');return cents(c.value);};
 check(delta(deb,'balance')===(d.undo?d.amount:-d.amount)&&wallet.mode==='delta'&&wallet.key===d.wallet&&cents(wallet.value)===(d.undo?-d.amount:d.amount),'debtor or wallet delta does not match payment.');
 check((cash.value||cash.fallback||{}).id===d.meta.cashLogId&&at.action===(d.undo?'update':'insert')&&cash.action===(d.undo?'update':'insert'),'payment audit entries are not linked.');
 check(cents(d.txn.amount)===-d.amount&&d.txn.accountID===d.accountId,'invalid debtor payment amount.');
 if(!d.undo){check(d.txn.status==='ACTIVE'&&(r.fallback||{}).settlementId===d.id&&(s.fallback||{}).settlementId===d.id,'receipt paid markers differ.');check(cents((cash.value||{}).amount)===d.amount&&(cash.value||{}).action==='Add'&&(cash.value||{}).cashType===d.wallet,'invalid cash receipt.');}
 else check(d.txn.status==='UNDONE'&&(cash.fallback||{}).status==='UNDONE'&&!(r.fallback||{}).settlementId,'the reversal must reopen the receipt and reverse both audit entries.');
 return d;
}
function collision(row,local,state,hash){
 if(!row||!local||row.op_id!==local.opId||!/^RCPAY(?:UNDO)?-/.test(text(local.opId)))return false;
 const incoming=row.payload;check(incoming&&incoming.opId===row.op_id&&incoming.deviceId===row.device_id&&incoming.payloadHash&&hash(incoming)===incoming.payloadHash,'Cloud payment response integrity failed.');
 const a=validate(local,state),b=validate(incoming,state);check(a&&b&&a.undo===b.undo&&a.receiptNo===b.receiptNo&&a.id===b.id&&text(a.accountId)===text(b.accountId)&&a.amount===b.amount&&a.meta.creditTxnId===b.meta.creditTxnId&&(!a.undo||a.wallet===b.wallet)&&sameScope(a.scope,b.scope),'Cloud contains a different logical payment.');return true;
}
function materialized(db,operation){
 const d=descriptor(operation);if(!d)return false;const t=list(db.accountTxns).find(t=>t.id===d.id),p=operation.patches;
 if(!t){check(!d.undo,'the original payment is missing.');const x=inspect(db,d.receiptNo);check(x.due===d.amount&&x.paid===cents(d.meta.beforeAmountPaid)&&x.credit.id===d.meta.creditTxnId&&text(x.debtor.id)===text(d.accountId),'the credit receipt changed before this payment could be applied.');return false;}
 if(d.undo&&t.status==='ACTIVE'){
  const r=unique(db.receipts,r=>r.receiptNo===d.receiptNo,'Receipt'),c=unique(db.cashLog,c=>c.id===d.meta.cashLogId,'Cash payment');
  check(r.settlementId===d.id&&active(c)&&cents(c.amount)===d.amount&&t.meta.paymentOperationId===d.meta.paymentOperationId,'the payment reversal has an incomplete before-state.');return false;
 }
 for(const patch of p){
  if(patch.action==='root-object'){const expected=cents(patch.before)+cents(patch.value);check(cents((db[patch.root]||{})[patch.key])===expected,'the payment wallet after-state is unproven.');continue;}
  const expected=patch.value||patch.fallback,record=list(db[patch.collection]).find(r=>text(r.id||r.receiptNo)===text(expected.id||expected.receiptNo));check(record,'a linked payment record is missing.');
  if(patch.action==='insert'){check(JSON.stringify(record)===JSON.stringify(expected),'a different payment record already uses this receipt payment identity.');continue;}
  for(const change of patch.changes){const expectedValue=change.mode==='delta'?money(cents(change.before)+cents(change.value)):change.value;check(JSON.stringify(record[change.field])===JSON.stringify(expectedValue),'the complete payment after-state is unproven: '+patch.collection+'.'+change.field);}
 }
 return true;
}
return Object.freeze({SOURCE,cents,active,isPayment,inspect,proof,seed,scope,sameScope,applyPayment,undoProof,applyUndo,operationId,descriptor,validate,collision,materialized,linked});
});
