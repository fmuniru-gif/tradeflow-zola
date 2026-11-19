const crypto=require('node:crypto');
const core=require('../js/receipt-payment-core.js');
function fixture({paid=0,total=950,withholding=0,accountBalance=2000}={}){
 const net=total-withholding,due=net-paid;
 return {business:{name:'Synthetic Zola'},products:[{id:'P1',name:'Synthetic television'}],stockRows:[{id:'S1',rStock:4,uCost:500}],cashBalances:{'Cash in Hand':25,MOMO:40},cashLog:[],receipts:[{receiptNo:'SR-SYNTHETIC',receiptRef:'R-SYNTHETIC',customerName:'Synthetic Customer',contact:'0240000000',totalAmount:total,grossTotal:total,netAmountCollectible:net,withholdingTax:withholding,amountPaid:paid,balance:due,credit:true,status:'ACTIVE',date:'2026-11-16T12:00:00Z',cashReceived:paid,lines:[{product:'Synthetic television',qty:1,total}]}],sales:[{id:'SR-SYNTHETIC',receiptNo:'SR-SYNTHETIC',customer:'Synthetic Customer',total,grossTotal:total,netAmountCollectible:net,withholdingTax:withholding,paid,balance:due,pay:paid?'PARTIAL':'CREDIT',cashReceived:paid,status:'ACTIVE',date:'2026-11-16T12:00:00Z',profit:150,lines:[{product:'Synthetic television',qty:1,fifo:[{stockRowId:'S1',qty:1,uCost:500}]}]}],debtors:[{id:'D1',name:'Synthetic Customer',balance:accountBalance}],accountTxns:[{id:'CREDIT-1',accountID:'D1',accountType:'DEBTOR',name:'Synthetic Customer',txnType:'Credit Sale',amount:due,balanceAfter:accountBalance,receiptNo:'SR-SYNTHETIC',status:'ACTIVE',date:'2026-11-16T12:00:00Z',meta:{source:'SALE',kind:'debtors',saleReceiptNo:'SR-SYNTHETIC'}}]};
}
const scope={ownerId:'OWNER-1',businessId:'BUSINESS-1',branchId:'BRANCH-1'},state={syncOwnerId:scope.ownerId,businessId:scope.businessId,branchId:scope.branchId},actor={id:'STAFF-1',name:'Synthetic Owner',role:'OWNER'};
function paymentInput(db,extra={}){return {receiptNo:'SR-SYNTHETIC',operationId:'RCPAY-'+crypto.createHash('sha256').update(core.seed(db,'SR-SYNTHETIC',state)).digest('hex'),proof:core.proof(db,'SR-SYNTHETIC'),scope,actor,wallet:'Cash in Hand',at:'2026-11-19T10:00:00Z',confirmed:true,...extra};}
function operation(before,after,id,device='MAIN'){
 const patches=[];
 for(const collection of ['receipts','sales','debtors','accountTxns','cashLog']){
  for(const item of after[collection]){const key=item.id||item.receiptNo,old=before[collection].find(x=>(x.id||x.receiptNo)===key);
   if(!old){patches.push({action:'insert',collection,key,value:structuredClone(item)});continue;}
   const changes=[];for(const field of new Set([...Object.keys(old),...Object.keys(item)])){if(JSON.stringify(old[field])===JSON.stringify(item[field]))continue;const additive=collection==='debtors'&&field==='balance';changes.push({field,mode:additive?'delta':'set',before:old[field],value:additive?item[field]-old[field]:item[field]});}
   if(changes.length)patches.push({action:'update',collection,key,changes,fallback:structuredClone(item)});
  }
 }
 for(const wallet of Object.keys(after.cashBalances))if(before.cashBalances[wallet]!==after.cashBalances[wallet])patches.push({action:'root-object',root:'cashBalances',key:wallet,mode:'delta',before:before.cashBalances[wallet],value:after.cashBalances[wallet]-before.cashBalances[wallet]});
 const op={opId:id,deviceId:device,deviceSeq:1,patches};op.payloadHash=hash(op);return op;
}
function hash(op){const x=structuredClone(op);delete x.payloadHash;return crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');}
module.exports={fixture,paymentInput,operation,hash,core,state,scope,actor};
