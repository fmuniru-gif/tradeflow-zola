const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const proof=require('./recovery-source-proof.cjs'),delivery=require('../tools/build-pr11-delivery.cjs');
const root=path.resolve(__dirname,'..');
const prior=file=>execFileSync('git',['show',proof.baseline+':'+file],{cwd:root,maxBuffer:32*1024*1024});
test('only the three reviewed embedded recovery modules change; all remaining loader bytes are identical',()=>{
 const current=delivery.assetBytes('index.html').toString();
 assert.equal(delivery.stripDelivery(proof.withoutRecoveryIndex(current)),delivery.stripDelivery(prior('index.html').toString()));
 assert.equal(current,delivery.finishShell(delivery.applyDelivery(current)));
});
test('the bootstrap source changes only by adding the canonical recovery hold',()=>{
 const current=delivery.assetBytes('js/bootstrap-startup-guard.js').toString();
 const insertion="      const recovery = ZEZMS.canonicalRestore;\n      if (recovery && typeof recovery.getState === 'function') {\n        const hold = recovery.getState();\n        if (hold.executing || hold.pending || hold.preparation) return false;\n      }\n";
 assert.equal(current.split(insertion).length,2);assert.equal(current.replace(insertion,''),prior('js/bootstrap-startup-guard.js').toString());
});
test('all other existing application scripts, assets, manifests and protected update helpers remain exact Git bytes',()=>{
 const files=execFileSync('git',['ls-tree','-r','--name-only',proof.baseline,'js','assets','manifest.json','FORCE_UPDATE_MOBILE.html','MAIN_RESPONSIVENESS_UPDATE.html'],{cwd:root,encoding:'utf8'}).trim().split('\n');
 for(const file of files)if(!['js/bootstrap-startup-guard.js','js/dbservice.js'].includes(file))assert.deepEqual(delivery.assetBytes(file),prior(file),file);
});
test('both recovery guards and all recovery modules are coupled to the delivered shell',()=>{
 const html=delivery.assembledShell(delivery.assetBytes('index.html').toString());
 proof.withoutRecoveryGuardCoupling(html);
 assert.ok(html.includes("var BUILD = '20261103-canonical-recovery-r1'"));
 assert.ok(html.includes('prepareCanonicalRecovery: prepareCanonicalRecovery'));
 for(const file of ['sw.js','RECOVERY_WORKFLOW_UPDATE.html'])for(const forbidden of ['skipWaiting(', 'clients.claim(', 'caches.delete(', 'localStorage.clear(', 'indexedDB.deleteDatabase('])assert.ok(!delivery.assetBytes(file).toString().includes(forbidden),file+':'+forbidden);
});
test('critical-install probes refer to verified query-sensitive precache keys',()=>{
 const worker=delivery.assetBytes('sw.js').toString(),hashes=delivery.workerHashes(worker,delivery.assetBytes('index.html').toString());
 const block=worker.match(/const CRITICAL_ASSETS = \[([\s\S]*?)\];/)[1];
 const keys=[...block.matchAll(/'([^']+)'/g)].map(x=>x[1]);assert.equal(keys.length,9);
 for(const key of keys)assert.ok(hashes[key],'critical asset missing from verified manifest: '+key);
 const before=prior('sw.js').toString().match(/const CRITICAL_ASSETS = \[([\s\S]*?)\];/)[1];
 assert.equal(block,before.replace(/(bootstrap-startup-guard|auto-month-rollover-bootstrap-guard)\.js\?v=20261024-ui-stock-review-r1/g,'$1.js?v='+delivery.DELIVERY));
});
