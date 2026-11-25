'use strict';

function edits() {
  const pay = "    if (walletKey && kind === 'creditors' && direction === 'REDUCE') { action = 'Deduct'; cashNote = 'Creditor pay ' + account.name; }";
  const receive = "    if (walletKey && kind === 'creditors' && direction === 'INCREASE') { action = 'Add'; cashNote = 'Creditor funds received ' + account.name; }";
  return [pay, pay + '\n' + receive];
}

function transformCreditorWalletSettlement(html, before, after) {
  if (html.split(before).length !== 2) {
    throw Error('CREDITOR_WALLET_SETTLEMENT_MARKER_MISMATCH');
  }
  return html.replace(before, () => after);
}

function withoutCreditorWalletSettlement(html) {
  html = require('./product-selling-price-transform.cjs').withoutProductSellingPrice(html);
  html = require('./stock-unit-cost-transform.cjs').withoutStockUnitCost(html);
  if (!html.includes("cashNote = 'Creditor funds received ' + account.name")) return html;
  const [before, after] = edits();
  return transformCreditorWalletSettlement(html, after, before);
}

module.exports = { edits, transformCreditorWalletSettlement, withoutCreditorWalletSettlement };
