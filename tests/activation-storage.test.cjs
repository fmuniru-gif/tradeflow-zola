'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const delivery = require('../tools/build-pr11-delivery.cjs');
const { withoutActivationStorage } = require('../tools/activation-storage-transform.cjs');

test('the storage change reverses exactly to the approved delivery, including its existing sync and approval guards', () => {
  const baseline = '6f7067cef42255c47da57f565cad23cf4b4364cc';
  const old = execFileSync('git', ['show', baseline + ':index.html'], { maxBuffer:32*1024*1024, encoding:'utf8' });
  const before = delivery.assembledShell(old);
  const updated = delivery.assembledShell(delivery.assetBytes('index.html').toString('utf8'));
  const stripDelivery = html => html.replace(/<meta name="zezms-delivery" content="[^"]+">/, 'DELIVERY');
  assert.equal(stripDelivery(withoutActivationStorage(updated)), stripDelivery(before));
});
