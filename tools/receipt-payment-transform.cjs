'use strict';
function edits(){return [
 ['Paid button','<div class="receipt-actions">\n            <button class="btn sm ghost" onclick="showStoredReceipt', '<div class="receipt-actions">\n            ${ZEZMS.receiptPayments ? ZEZMS.receiptPayments.button(record) : \'\'}\n            <button class="btn sm ghost" onclick="showStoredReceipt'],
 ['payment operation identity','    const operationId = tradeInOperationId || (rolloverPatch', '    const receiptPaymentId = ZEZMS.receiptPaymentCore.operationId(patches);\n    const operationId = receiptPaymentId || tradeInOperationId || (rolloverPatch'],
 ['receive payment validation','    const correctionInsert = operation.patches.find(function (patch) {','    if (ZEZMS.receiptPaymentCore.validate(operation,state) && ZEZMS.receiptPaymentCore.materialized(getDatabase(),operation)) return true;\n    const correctionInsert = operation.patches.find(function (patch) {'],
 ['concurrent payment claim','          .filter(function (row) { return row.device_id === state.deviceId && queuedIds.has(row.op_id); })','          .filter(function (row) { return queuedIds.has(row.op_id) && (row.device_id === state.deviceId || ZEZMS.receiptPaymentCore.collision(row,originalQueue.find(function(op){return op.opId===row.op_id;}),state,deterministicHash)); })'],
 ['conflict receive','          if (isStockConflict(error) || (operation.kind === \'STOCK_IN\'',"          if (/^RCPAY(?:UNDO)?-/.test(String(operation.opId||'')) && /ZEZMS_OPERATION_PAYLOAD_CONFLICT/.test(String(error.message||error))) {\n            await pullNowCore(true);\n            if (queue.some(function(op){return op.opId===operation.opId;})) throw error;\n            continue;\n          }\n          if (isStockConflict(error) || (operation.kind === 'STOCK_IN'"],
 ['linked reversal',"    if (txn.status === UNDONE) throw new Error('This account transaction has already been undone.');", "    if (txn.status === UNDONE) throw new Error('This account transaction has already been undone.');\n    if (ZEZMS.receiptPaymentCore.isPayment(txn)) return ZEZMS.receiptPayments.undoNative(transactionId,reason);"],
 ['native atomic payment commit','  function onLocalSave(reason) {',`  function commitReceiptPayment(next,expectedId) {
    ZEZMS.receiptPayments.authorize(expectedId);
    if(!observedSnapshot || applyingRemote || !state.initialized || queue.length) throw Error('Receipt payment requires an up-to-date, idle native transaction state.');
    syncDurabilityRun('receipt-payment',function(){
      DB=clone(next);
      onLocalSave('receipt-payment');
      if(queue.length!==1 || queue[0].opId!==expectedId) throw Error('Receipt payment did not produce exactly one linked outbox operation.');
      if(!ZEZMS.receiptPaymentCore.validate(queue[0],state)) throw Error('Receipt payment operation was not recognized.');
    });
    return clone(queue[0]);
  }

  function onLocalSave(reason) {`],
 ['native API','    saveLocalDatabaseDurably: saveLocalDatabaseDurably,','    saveLocalDatabaseDurably: saveLocalDatabaseDurably,\n    commitReceiptPayment: commitReceiptPayment,']
];}
function transformReceiptPayment(html,core,runtime,changes){
 if(html.includes('<script data-zezms-receipt-payment-core>'))throw Error('RECEIPT_PAYMENT_ALREADY_APPLIED');
 for(const [name,before,after]of changes){if(html.split(before).length!==2)throw Error('RECEIPT_PAYMENT_MARKER: '+name);html=html.replace(before,()=>after);}
 html=html.replace('</head>','<script data-zezms-receipt-payment-core>\n'+core+'\n</script></head>');
 const end=html.lastIndexOf('</body>');if(end<0)throw Error('RECEIPT_PAYMENT_BODY_MARKER');
 return html.slice(0,end)+'<script data-zezms-receipt-payments>\n'+runtime+'\n</script>'+html.slice(end);
}
function withoutReceiptPayment(html){
 if(!html.includes('<script data-zezms-receipt-payment-core>'))return html;
 html=html.replace(/<script data-zezms-receipt-payment-core>[\s\S]*?<\/script>/,'').replace(/<script data-zezms-receipt-payments>[\s\S]*?<\/script>/,'');
 for(const [name,before,after]of edits().reverse()){if(html.split(after).length!==2)throw Error('RECEIPT_PAYMENT_REVERSE_MARKER: '+name);html=html.replace(after,()=>before);}
 return html;
}
module.exports={edits,transformReceiptPayment,withoutReceiptPayment};
