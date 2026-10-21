const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname,'..');
const read = name => fs.readFileSync(path.join(root,name),'utf8');
const index = read('index.html');
const worker = read('sw.js');
const manifest = JSON.parse(read('manifest.json'));
const helper = read('FORCE_UPDATE_MOBILE.html');
const release = '20261021-shop-chrome-bootstrap-guard-r1';

test('the deployed shell, worker, manifest and update helper name one release',()=>{
  assert.match(index,new RegExp('const RELEASE="'+release+'";'));
  assert.ok(worker.includes(release));
  assert.equal(manifest.start_url,'./index.html?build='+release);
  assert.match(helper,new RegExp(release));
  assert.match(index,/data-zezms-prelogin-verified-activation-r70u/);
  assert.match(worker,/ZEZMS_RUNTIME_INTEGRITY_PROBE/);
  assert.match(worker,/ZEZMS_PRESERVATION_RELEASE_MISMATCH/);
  assert.ok(worker.includes("data.release === '20261015-r70u-prelogin-verified-activation'"),'old in-flight shell compatibility missing');
  assert.ok(worker.includes("data.release === '20261020-prebranch-functional-r1'"),'previous in-flight shell compatibility missing');
  assert.ok(!index.includes('BRANCH_MANAGEMENT_R69_B64'),'branch-management module remains embedded');
  assert.ok(!index.includes('<script data-zezms-branch-management-r69a>'),'branch-management UI remains injectable');
});

test('bootstrap guard assets are critical and worker upgrade remains passive',()=>{
  for(const name of ['bootstrap-startup-guard','auto-month-rollover-bootstrap-guard',
    'confirmed-july-snapshot-bootstrap-guard','shop-chrome-bootstrap-proof']){
    assert.ok(worker.includes('./js/'+name+'.js?v='+release),name);
    assert.ok(index.includes('js/'+name+'.js?v='),name);
  }
  assert.ok(!/\bskipWaiting\s*\(|\bclients\.claim\s*\(|\bcaches\.delete\s*\(/.test(worker));
  assert.ok(!/\.quarantine\s*\(|\.activateVerifiedBootstrapR70M\s*\(/.test(read('js/shop-chrome-bootstrap-proof.js')));
});

for(const [constant,file] of [
  ['MANAGED_DEVICE_LIFECYCLE_R61_B64','js/managed-device-lifecycle-r61.js'],
  ['PRELOGIN_VERIFIED_ACTIVATION_R70U_B64','js/prelogin-verified-activation-r70u.js']
])test('embedded '+file+' matches its reviewable normalized source',()=>{
  const match=index.match(new RegExp('const '+constant+'="([^"]+)";'));
  assert.ok(match,constant+' missing');
  const source=fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
  assert.equal(Buffer.from(match[1],'base64').toString('utf8').replace(/\r\n/g,'\n'),source);
});

// Shop-specific injection is proved separately by shop-directory-delivery.test.cjs.
test('unrelated embedded business and protocol modules remain unchanged',()=>{
  const {execFileSync}=require('node:child_process');
  const changed=execFileSync('git',['diff','--name-only','origin/main'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
  assert.ok(changed.every(name=>[
    'index.html','sw.js','manifest.json','FORCE_UPDATE_MOBILE.html',
    'js/shop-directory-recovery-core.js','js/shop-directory-recovery-runtime.js',
    'tests/shop-directory-recovery.test.cjs','tests/shop-directory-recovery.browser.cjs',
    'tests/shop-directory-delivery.test.cjs','tools/build-shop-directory-recovery.cjs','tools/patch-shop-trading-readiness.cjs','tools/patch-shop-recovery-storage-capacity.cjs',
    'docs/shop-directory-recovery.md','docs/prebranch-functional-rollback.md','docs/shop-trading-readiness.md','docs/shop-recovery-storage-capacity.md',
    'tests/prebranch-functional-rollback.test.cjs','tests/prebranch-functional-rollback.browser.cjs',
    'js/prelogin-verified-activation-r70u.js',
    'js/bootstrap-startup-guard.js','js/auto-month-rollover-bootstrap-guard.js',
    'js/confirmed-july-snapshot-bootstrap-guard.js','js/shop-chrome-bootstrap-proof.js',
    'docs/shop-chrome-bootstrap-startup-guard.md','tests/shop-chrome-bootstrap.browser.cjs',
    'tests/prelogin-activation.test.cjs','tests/prelogin-activation.browser.cjs','tests/prelogin-release.test.cjs',
    'tests/r70v-diagnostic.browser.cjs','tests/shop-directory-recovery.browser.cjs',
    'tests/approved-deployment-gate.test.cjs',
    'scripts/approved-deployment-gate.cjs','docs/r70v-diagnostic-runbook.md','docs/approved-github-deployment.md',
    'diagnostics/financial-audit/index.html','diagnostics/financial-audit/style.css',
    'diagnostics/financial-audit/capture.js','tools/financial-audit/analyze.cjs',
    'tests/financial-audit.browser.cjs','docs/financial-cash-divergence-audit.md',
    'diagnostics/main-cash-repair/index.html','diagnostics/main-cash-repair/style.css',
    'diagnostics/main-cash-repair/repair-core.js','diagnostics/main-cash-repair/repair-core-r2.js',
    'diagnostics/main-cash-repair/repair-core-r3.js','diagnostics/main-cash-repair/repair-r3.js',
    'diagnostics/main-cash-repair/preflight-r3.html',
    'diagnostics/main-cash-repair/preflight-r2.html','diagnostics/main-cash-repair/repair.js',
    'tests/main-cash-repair.test.cjs','tests/main-cash-repair.browser.cjs',
    'docs/main-cash-repair.md','tools/main-cash-repair/verify-backup.cjs',
    'diagnostics/main-cash-input-compare/README.md',
    'diagnostics/main-cash-input-compare/capture-r60o.js',
    'diagnostics/main-cash-input-compare/compare-core.js',
    'diagnostics/main-cash-input-compare/index.html',
    'diagnostics/main-cash-input-compare/integrity-r60o.js',
    'diagnostics/main-cash-input-compare/page.js',
    'diagnostics/main-cash-input-compare/style.css',
    'tests/main-cash-input-compare.browser.cjs'
  ].includes(name)));
  const previous=execFileSync('git',['show','origin/main:index.html'],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024});
  const embedded=[...previous.matchAll(/const ([A-Z0-9_]+_B64)="([^"]+)";/g)].map(match=>match[1]);
  for(const name of embedded.filter(name=>!['PRELOGIN_VERIFIED_ACTIVATION_R70U_B64','CLOUD_B64','MANAGER_SCOPE_STAFF_LOGIN_B64','BRANCH_MANAGEMENT_R69_B64'].includes(name))){
    const pattern=new RegExp('const '+name+'="([^"]+)";');
    assert.equal(index.match(pattern)?.[1],previous.match(pattern)?.[1],name+' changed');
  }
});
