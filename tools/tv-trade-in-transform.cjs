'use strict';
function edits() {
  return [
    ['  function inferKind(patches) {', "  function inferKind(patches) {\n    if (patches.some(function(p) { return p.action === 'insert' && p.collection === 'inventoryTxns' && p.value && p.value.subtype === 'TV_TRADE_IN'; })) return 'STOCK_IN';"],
    ['          if (isStockConflict(error)) {', "          if (isStockConflict(error) || (operation.kind === 'STOCK_IN' && operation.patches.some(function(p) { return p.action === 'insert' && p.collection === 'inventoryTxns' && p.value && p.value.subtype === 'TV_TRADE_IN'; }) && /ZEZMS_OPERATION_PAYLOAD_CONFLICT/.test(String(error.message || error)))) {"],
    ['function recordSaleOutFIFO(productName, qty, uPrice, disc){', 'function recordSaleOutFIFO(productName, qty, uPrice, disc){\n  if (ZEZMS.tvTradeIns) ZEZMS.tvTradeIns.assertResalable(productName);'],
    ["    const operationId = rolloverPatch && rolloverPatch.key\n      ? 'AUTO-' + String(rolloverPatch.key)\n      : makeUUID();", "    const tradeInPatch = patches.find(function(p) { return p.action === 'insert' && p.collection === 'inventoryTxns' && p.value && p.value.subtype === 'TV_TRADE_IN'; });\n    const tradeInOperationId = tradeInPatch && tradeInPatch.value.details && tradeInPatch.value.details.tradeIn && tradeInPatch.value.details.tradeIn.operationId;\n    if (tradeInPatch && !/^TVTI-[a-f0-9]{64}$/.test(String(tradeInOperationId || ''))) throw Error('ZEZMS_TRADE_IN_OPERATION_ID_INVALID');\n    const operationId = tradeInOperationId || (rolloverPatch && rolloverPatch.key\n      ? 'AUTO-' + String(rolloverPatch.key)\n      : makeUUID());"],
    ['  function performInventoryUndo(transactionId) {', '  function performInventoryUndo(transactionId) {\n    if (ZEZMS.tvTradeIns) ZEZMS.tvTradeIns.blockPartial(transactionId);'],
    ['  function recordSalesAndCashUndo(receiptNo, reason) {', '  function recordSalesAndCashUndo(receiptNo, reason) {\n    if (ZEZMS.tvTradeIns) ZEZMS.tvTradeIns.blockPartial(receiptNo);'],
    ['  function reverseQuickSaleAndCash(transactionId, reason) {', '  function reverseQuickSaleAndCash(transactionId, reason) {\n    if (ZEZMS.tvTradeIns) ZEZMS.tvTradeIns.blockPartial(transactionId);'],
    ['  function performCashUndo(cashLogId, reason) {', '  function performCashUndo(cashLogId, reason) {\n    if (ZEZMS.tvTradeIns) ZEZMS.tvTradeIns.blockCash(cashLogId);'],
    ["  window.saveReceiptEdit = function () {\n    if (!canEditReceipts()", "  window.saveReceiptEdit = function () {\n    try { if (ZEZMS.tvTradeIns && receiptEditDraft) ZEZMS.tvTradeIns.blockPartial(receiptEditDraft.receiptNo); } catch(error) { toast(error.message, 'err'); return; }\n    if (!canEditReceipts()"],
    ['        <div class="receipt-paid">Amount Paid: ${fmtN(sale.paid)}</div>', '        <div class="receipt-paid">Amount Paid: ${fmtN(sale.paid)}</div>\n        ${ZEZMS.tvTradeIns ? ZEZMS.tvTradeIns.receiptHTML(source) : \'\'}'],
    ['    pdf.summary(summaryRows);\n    pdf.signatures(\'Cashier signature\', \'Customer signature\', { approved: true });', '    if (ZEZMS.tvTradeIns) summaryRows.push(...ZEZMS.tvTradeIns.receiptPDFRows(source));\n    pdf.summary(summaryRows);\n    pdf.signatures(\'Cashier signature\', \'Customer signature\', { approved: true });']
  ];
}
function transformTradeIns(html, helper, changes) {
  if(html.includes('<script data-zezms-tv-trade-ins>'))throw Error('TV_TRADE_IN_ALREADY_APPLIED');
  for(const [before,after] of changes) {
    // Two PDF implementations are deliberately preserved in the assembled app.
    const expected=before.startsWith('    pdf.summary(summaryRows);')?2:1;
    if(html.split(before).length!==expected+1)throw Error('TV_TRADE_IN_MARKER: '+before.slice(0,100));
    html=html.split(before).join(after);
  }
  const end=html.lastIndexOf('</body>');
  if(end<0)throw Error('TV_TRADE_IN_BODY_MARKER');
  return html.slice(0,end)+'<script data-zezms-tv-trade-ins>\n'+helper+'\n</script>'+html.slice(end);
}
function withoutTradeIns(html) {
  if(!html.includes('<script data-zezms-tv-trade-ins>'))return html;
  if(html.split('<script data-zezms-tv-trade-ins>').length!==2)throw Error('TV_TRADE_IN_PROOF_HELPER_COUNT');
  html=html.replace(/<script data-zezms-tv-trade-ins>[\s\S]*?<\/script>/,'');
  for(const [before,after] of edits()) {
    const expected=before.startsWith('    pdf.summary(summaryRows);')?2:1;
    if(html.split(after).length!==expected+1)throw Error('TV_TRADE_IN_PROOF_MARKER: '+before.slice(0,100));
    html=html.split(after).join(before);
  }
  return html;
}
module.exports={edits,transformTradeIns,withoutTradeIns};
