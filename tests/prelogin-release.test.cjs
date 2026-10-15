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
const release = '20261015-r70v-outbox-settings';

test('the deployed shell, worker, manifest and update helper name one release',()=>{
  assert.match(index,new RegExp('const RELEASE="'+release+'";'));
  assert.ok(worker.includes(release));
  assert.equal(manifest.start_url,'./index.html?build='+release);
  assert.match(helper,new RegExp(release));
  assert.match(index,/data-zezms-prelogin-verified-activation-r70u/);
  assert.match(worker,/ZEZMS_RUNTIME_INTEGRITY_PROBE/);
  assert.match(worker,/ZEZMS_PRESERVATION_RELEASE_MISMATCH/);
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

test('production cloud, business and protocol modules remain unchanged',()=>{
  const {execFileSync}=require('node:child_process');
  const changed=execFileSync('git',['diff','--name-only','origin/main'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
  assert.ok(changed.every(name=>[
    'index.html','sw.js','manifest.json','FORCE_UPDATE_MOBILE.html',
    'js/managed-device-lifecycle-r61.js','js/prelogin-verified-activation-r70u.js','js/commercial-foundation.js',
    'tests/prelogin-activation.test.cjs','tests/prelogin-activation.browser.cjs','tests/prelogin-release.test.cjs',
    'tests/r70v-incident.browser.cjs','tests/r70v-incident.test.cjs',
    'docs/r70u-prelogin-activation.md','docs/r70u-test-report.md','docs/r70v-incident-review.md'
  ].includes(name)));
  const previous=execFileSync('git',['show','origin/main:index.html'],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024});
  for(const name of ['CLOUD_B64','VERIFIED_BASELINE_B64','INTEGRITY_B64','CONVERGENCE_B64']){
    const pattern=new RegExp('const '+name+'="([^"]+)";');
    assert.equal(index.match(pattern)?.[1],previous.match(pattern)?.[1],name+' changed');
  }
});
