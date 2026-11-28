'use strict';

function edits() {
  const nav = '  currentView = view;\n  document.querySelectorAll(';
  const pos = "      case 'pos': root.innerHTML=viewPOS(); bindPOS(); break;";
  const operation = '    const operationId = receiptPaymentId || tradeInOperationId || (rolloverPatch && rolloverPatch.key';
  const collision = 'ZEZMS.receiptPaymentCore.collision(row,originalQueue.find(function(op){return op.opId===row.op_id;}),state,deterministicHash)';
  const inverse = "    if (/^RCPAY(?:UNDO)?-/.test(String(operation.opId||''))) {\n      ZEZMS.receiptPaymentCore.validate(operation,state);\n      inverse.patches.forEach(function(patch){";
  const recover = 'if (/^RCPAY(?:UNDO)?-/.test(String(operation.opId||\'\')) && ';
  const payload = "      voidedBy: sale.voidedBy || sale.undoneBy || ''";
  const receipt = "        ${ZEZMS.tvTradeIns ? ZEZMS.tvTradeIns.receiptHTML(source) : ''}";
  const list = '    const list = DB[accTab] || [];\n    const singular';
  const choices = '    const options = fullAccounts.slice().sort(function (a, b) {';
  const selected = "    const selectedAccount = fullAccounts.find(function (account) { return text(account.id) === selectedId; });";
  const settlement = "    const before = number(account.balance) || 0, priorAccount = copy(account), transactionLength";
  const remove = '    const account = list[index];\n    promptPIN(\'Admin PIN to delete account holder';
  const planUndo = '    const allocations = [];\n    (sale.lines || []).forEach((line) => {';
  const applyUndo = "    sale.undoReason = String(reason || '').trim();\n    if (receipt)";
  const editReceipt = "    if (!receipt || !sale) { toast('This receipt has no linked FIFO sale and cannot be edited safely.', 'err'); return; }";
  const reverse = '      const depositMutation = ZEZMS.deposits.validateUndo(txn, account);';
  return [
    [nav, "  if (window.ZEZMS?.depositCheckout) ZEZMS.depositCheckout.leaving(view);\n" + nav],
    [pos, "      case 'pos': if (ZEZMS.depositCheckout.selected()) root.innerHTML=ZEZMS.depositCheckout.viewHTML(); else { root.innerHTML=viewPOS(); bindPOS(); } break;"],
    [operation, operation.replace('receiptPaymentId ||', 'receiptPaymentId || ZEZMS.depositCheckout?.operationId(patches) ||')],
    [collision, collision + ' || ZEZMS.depositCheckout?.collision(row,originalQueue.find(function(op){return op.opId===row.op_id;}),deterministicHash)'],
    [inverse, inverse.replace("''))) {", "'')) || ZEZMS.depositCheckout?.linkedOperation(operation)) {")],
    [recover + '/ZEZMS_OPERATION_PAYLOAD_CONFLICT/', recover.replace('if (','if ((').replace(' && ', ' || ZEZMS.depositCheckout?.linkedOperation(operation)) && ') + '/ZEZMS_OPERATION_PAYLOAD_CONFLICT/'],
    [recover + 'isStockConflict(failure)', recover.replace('if (','if ((').replace(' && ', ' || ZEZMS.depositCheckout?.linkedOperation(operation)) && ') + 'isStockConflict(failure)'],
    [payload, payload + ",\n      depositApplied: sale.depositApplied,\n      depositHandoverCash: sale.depositHandoverCash"],
    [receipt, receipt + "\n        ${sale.depositApplied ? '<div>Deposit applied: ' + fmtN(sale.depositApplied) + '</div><div>Payment at handover: ' + fmtN(sale.depositHandoverCash) + '</div>' : ''}"],
    [list, list.replace('DB[accTab] || []', "(DB[accTab] || []).filter(account => accTab !== 'depositors' || ZEZMS.depositCheckout.visibleAccount(account))")],
    [selected, selected.replace('=== selectedId;', "=== selectedId && (kind !== 'depositors' || ZEZMS.depositCheckout.visibleAccount(account));")],
    [choices, choices.replace('fullAccounts.slice()', "fullAccounts.filter(account => kind !== 'depositors' || ZEZMS.depositCheckout.visibleAccount(account))")],
    [settlement, "    const held = kind === 'depositors' && direction === 'REDUCE' ? ZEZMS.depositCheckout?.heldForOrders(id) || 0 : 0;\n"
      + "    if (held > 0 && round(Number(account.balance) - amount) < held) { notice('Use Undo on the matching deposit receipt to return a product payment.', 'err'); return false; }\n" + settlement],
    [remove, remove.replace('    promptPIN', "    if (kind === 'depositors' && ZEZMS.depositCheckout?.heldForOrders(id) > 0) { toast('This depositor has an open product order.', 'err'); return; }\n    promptPIN")],
    [planUndo, '    const depositUndo = ZEZMS.depositCheckout?.planUndo(sale);\n' + planUndo],
    [applyUndo, applyUndo.replace('    if (receipt)', '    ZEZMS.depositCheckout?.undo(depositUndo, reason);\n    if (receipt)')],
    [editReceipt, editReceipt + "\n    if (sale.depositOrderId) { toast('Undo the linked Sale Out before correcting a product deposit sale.', 'err'); return; }"],
    [reverse, "      if (ZEZMS.depositCheckout?.applied(txn)) throw Error('Undo the linked Sale Out to restore the product deposit.');\n" + reverse]
  ];
}

function transformDepositCheckout(html, changes, source) {
  for (const [before, after] of changes) {
    if (html.split(before).length !== 2) throw Error('DEPOSIT_CHECKOUT_MARKER: ' + before.slice(0, 130));
    html = html.replace(before, () => after);
  }
  if (!source) return html;
  const bodyEnd = html.lastIndexOf('</body>');
  if (bodyEnd < 0) throw Error('DEPOSIT_CHECKOUT_BODY_MARKER');
  return html.slice(0, bodyEnd) + '<script data-zezms-deposit-checkout>\n' + source + '\n</script>' + html.slice(bodyEnd);
}

function withoutDepositCheckout(html) {
  if (!html.includes('<script data-zezms-deposit-checkout>')) return html;
  const editReceipt = "    if (!receipt || !sale) { toast('This receipt has no linked FIFO sale and cannot be edited safely.', 'err'); return; }";
  const reverse = edits().reverse().map(([before, after]) => [after, before]);
  return transformDepositCheckout(html.replace(/<script data-zezms-deposit-checkout>[\s\S]*?<\/script>/, ''), reverse);
}

module.exports = { edits, transformDepositCheckout, withoutDepositCheckout };
