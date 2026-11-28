'use strict';

const navigationItem = "        { view: 'deposits', label: 'Deposits', icon: '💵' },\n";
const script = '<script data-zezms-deposits>';

function edits() {
  const salesRecords = "        { view: 'receipts', label: 'Sales Records', icon: '🧾' },\n";
  const title = "  receipts:'Sales Records', 'proforma-invoices':'Proforma Invoices', reports:'Reports',";
  const route = "      case 'receipts': root.innerHTML=viewReceipts(); break;";
  const permission = "receipts:'VIEW_RECEIPTS',invoices:'MANAGE_DOCUMENTS'";
  const roleAccounts = "'MANAGE_EXPENSES','VIEW_ACCOUNTS','MANAGE_ACCOUNTS','VIEW_REPORTS'";
  const roleReadOnlyAccounts = "'VIEW_EXPENSES','VIEW_ACCOUNTS','VIEW_REPORTS','EXPORT_BACKUP'";
  const admin = roleAccounts + ",'VIEW_CUSTOMER_FOLLOWUPS'";
  const managers = roleAccounts + ",'UNDO_TRANSACTION'";
  const readers = roleReadOnlyAccounts + "],";
  const auditors = roleReadOnlyAccounts + ",'VIEW_AUDIT'";
  const grantDeposits = (layout, permissions) => [layout, layout.replace("'VIEW_REPORTS'", permissions + ",'VIEW_REPORTS'")];
  const managerViews = "const MANAGER_VIEWS = new Set(['pos', 'receipts', 'invoices'";
  const managerActions = "const MANAGER_ACTIONS = new Set(['LOGIN', 'SALE_OUT', 'VIEW_RECEIPTS', 'MANAGE_DOCUMENTS'";
  const managerLimits = 'Manager access is limited to Sale Out, Sales Records, Invoices, Waybills, and normal Sync / Backup.';
  const undoStart = '  function performAccountUndo(transactionId, reason) {';
  const undoSave = "    saveDB();\n    toast('Account transaction undone.');";
  const reverse = '      reverseCashForAccountTxn(txn, reason);';
  const accountEdit = "    if (type === 'ACCOUNT_DELETE') return { ok: false, message: 'Account-delete audit entries cannot be edited.' };";
  return [
    [salesRecords, salesRecords + navigationItem],
    [title, title.replace("receipts:'Sales Records',", "receipts:'Sales Records', deposits:'Deposits',")],
    [route, route + "\n      case 'deposits': root.innerHTML=ZEZMS.deposits.viewHTML(); break;"],
    [permission, permission.replace(",invoices:", ",deposits:'VIEW_DEPOSITS',invoices:")],
    grantDeposits(admin, "'VIEW_DEPOSITS','MANAGE_DEPOSITS'"),
    grantDeposits(managers, "'VIEW_DEPOSITS','MANAGE_DEPOSITS'"),
    grantDeposits(readers, "'VIEW_DEPOSITS'"),
    grantDeposits(auditors, "'VIEW_DEPOSITS'"),
    [managerViews, managerViews.replace("'receipts',", "'receipts', 'deposits',")],
    [managerActions, managerActions.replace("'VIEW_RECEIPTS',", "'VIEW_RECEIPTS', 'VIEW_DEPOSITS', 'MANAGE_DEPOSITS',")],
    [managerLimits, managerLimits.replace('Sales Records,', 'Sales Records, Deposits,')],
    [undoStart, undoStart.replace('reason)', 'reason, persist = true)')],
    [undoSave, '    if (!persist) return;\n' + undoSave],
    ['  window.undoLastAccountTransaction = function () {',
      '  window.confirmDepositCancellation = function (id) {\n'
      + '    return ZEZMS.deposits.confirmCancellation(id, reason => performAccountUndo(id, reason, false));\n'
      + '  };\n\n  window.undoLastAccountTransaction = function () {'],
    [reverse, '      const depositMutation = ZEZMS.deposits.validateUndo(txn, account);\n' + reverse
      + '\n      if (depositMutation) txn.depositMutationId = depositMutation;'],
    [accountEdit, accountEdit + "\n    if (source === 'SALES_DEPOSIT') return { ok: false, message: 'Use Cancel in Deposits to void this receipt before posting its correction.' };"]
  ];
}

function transformDeposits(html, changes, source) {
  for (const [before, after] of changes) {
    if (html.split(before).length !== 2) throw Error('DEPOSITS_MARKER: ' + before.slice(0, 90));
    html = html.replace(before, () => after);
  }
  if (!source) return html;
  const bodyEnd = html.lastIndexOf('</body>');
  if (bodyEnd < 0) throw Error('DEPOSITS_BODY_MARKER');
  return html.slice(0, bodyEnd) + '<script data-zezms-deposits>\n' + source + '\n</script>' + html.slice(bodyEnd);
}

function withoutDeposits(html) {
  html = require('./deposit-checkout-transform.cjs').withoutDepositCheckout(html);
  if (!html.includes(script)) return html;
  const reverse = edits().reverse().map(([before, after]) => [after, before]);
  return transformDeposits(html.replace(/<script data-zezms-deposits>[\s\S]*?<\/script>/, ''), reverse);
}

module.exports = { edits, transformDeposits, withoutDeposits, navigationItem };
