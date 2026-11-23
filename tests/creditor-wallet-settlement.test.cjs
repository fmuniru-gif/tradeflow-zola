'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { test } = require('node:test');
const delivery = require('../tools/build-pr11-delivery.cjs');
const { edits, transformCreditorWalletSettlement, withoutCreditorWalletSettlement } =
  require('../tools/creditor-wallet-settlement-transform.cjs');

test('the verified app changes only the active Settle cash direction for creditor receipts', () => {
  const baseline = '7f3a57419c9a53fa73e828b022f0fd30df4fd215';
  const prior = execFileSync('git', ['show', baseline + ':index.html'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const current = delivery.assembledShell(delivery.assetBytes('index.html').toString('utf8'));
  const withoutVersion = html => html.replace(/<meta name="zezms-delivery" content="[^"]+">/, '');
  const [before, after] = edits();
  const handler = current.slice(current.indexOf('  function postSettlement(kind, id)'), current.indexOf('  /* ---- Source-aware financial editing ---- */'));
  assert.ok(handler.includes(after));
  assert.equal(withoutVersion(withoutCreditorWalletSettlement(current)), withoutVersion(delivery.assembledShell(prior)));
  assert.throws(() => transformCreditorWalletSettlement('', before, after), /MARKER_MISMATCH/);
});
