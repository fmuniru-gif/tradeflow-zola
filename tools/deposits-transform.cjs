'use strict';

const navigationItem = "        { view: 'deposits', label: 'Deposits', icon: '💵', permissionView: 'accounts' },\n";
const script = '<script data-zezms-deposits>';

function edits() {
  const salesRecords = "        { view: 'receipts', label: 'Sales Records', icon: '🧾' },\n";
  const title = "  receipts:'Sales Records', 'proforma-invoices':'Proforma Invoices', reports:'Reports',";
  const route = "      case 'receipts': root.innerHTML=viewReceipts(); break;";
  const permission = "receipts:'VIEW_RECEIPTS',invoices:'MANAGE_DOCUMENTS'";
  const reverse = '      reverseCashForAccountTxn(txn, reason);';
  const accountEdit = "    if (type === 'ACCOUNT_DELETE') return { ok: false, message: 'Account-delete audit entries cannot be edited.' };";
  return [
    [salesRecords, salesRecords + navigationItem],
    [title, title.replace("receipts:'Sales Records',", "receipts:'Sales Records', deposits:'Deposits',")],
    [route, route + "\n      case 'deposits': root.innerHTML=ZEZMS.deposits.viewHTML(); break;"],
    [permission, permission.replace(",invoices:", ",deposits:'VIEW_ACCOUNTS',invoices:")],
    [reverse, '      ZEZMS.deposits.validateUndo(txn, account);\n' + reverse],
    [accountEdit, accountEdit + "\n    if (source === 'SALES_DEPOSIT') return { ok: false, message: 'Use Undo to void this issued deposit receipt before posting its correction.' };"]
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
