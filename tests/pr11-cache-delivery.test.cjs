const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const crypto=require('node:crypto');
const delivery=require('../tools/build-pr11-delivery.cjs');
const root=path.resolve(__dirname,'..'),base='f810940762809e89a35f982a8577a9f32dcabf4e';
const read=name=>delivery.assetBytes(name).toString('utf8');
const old=name=>execFileSync('git',['show',base+':'+name],{cwd:root,maxBuffer:32*1024*1024});

test('delivery shell changes are exactly cache identity, byte verification, metadata and coupled PR11 modules',()=>{
  assert.equal(delivery.stripDelivery(read('index.html')),delivery.normalized(old('index.html').toString()));
  assert.equal(read('index.html'),delivery.finishShell(delivery.applyDelivery(old('index.html').toString())));
  assert.deepEqual(delivery.build(true).delivery,delivery.DELIVERY);
});

test('both coupled modules have exactly the validated standalone PR11 bytes, even under an old controlling worker',()=>{
  const shell=delivery.assembledShell(read('index.html'));
  for(const file of ['management-intelligence-v380.js','stock-velocity-v390.js']){
    const tag='<script data-zezms-pr11-module="'+file+'">\n',start=shell.indexOf(tag);
    assert.ok(start>=0,file);
    const body=shell.slice(start+tag.length,shell.indexOf('</script>',start));
    assert.equal(body.trim(),read('js/'+file).replace(/<\/script/gi,'<\\/script').trim(),file);
  }
});

test('all protected application sources and validated PR11 modules remain identical to production',()=>{
  const allowed=new Set(['index.html','sw.js','tests/desktop-ui-performance.test.cjs','tests/prelogin-release.test.cjs',
    'tests/prebranch-functional-rollback.test.cjs','tests/prebranch-functional-rollback.browser.cjs',
    'tests/shop-directory-delivery.test.cjs','tests/shop-directory-recovery.browser.cjs']);
  const files=execFileSync('git',['ls-tree','-r','--name-only',base],{cwd:root,encoding:'utf8'}).trim().split('\n');
  for(const file of files){
    if(allowed.has(file))continue;
    const current=fs.readFileSync(path.join(root,file));
    if(/\.(?:js|cjs|json|html|css|md|yml)$/.test(file))assert.equal(delivery.normalized(current.toString()),delivery.normalized(old(file).toString()),file);
    else assert.deepEqual(current,old(file),file);
  }
});

test('every same-origin runtime script has an exact query-sensitive pinned byte digest',()=>{
  const index=read('index.html'),worker=read('sw.js');
  const hashes=delivery.workerHashes(worker,index);
  for(const match of delivery.assembledShell(index).matchAll(/<script\b[^>]*\bsrc="([^"#]+)"/g)){
    if(/^https?:/.test(match[1]))continue;
    assert.ok(hashes['./'+match[1].replace(/^\.\//,'')],match[1]);
  }
  for(const file of ['management-intelligence-v380.js','stock-velocity-v390.js'])assert.ok(hashes['./js/'+file+'?v='+delivery.DELIVERY]);
  assert.ok(!worker.includes('ignoreSearch: true'));
});

function workerContext(){
  const handlers={};
  const context={URL,Request,Response,Uint8Array,crypto:crypto.webcrypto,setTimeout,
    self:{location:{origin:'https://delivery.invalid'},registration:{scope:'https://delivery.invalid/'},addEventListener:(name,fn)=>{handlers[name]=fn;}}};
  vm.createContext(context);vm.runInContext(read('sw.js'),context);
  return {context,handlers};
}
test('worker byte verifier rejects a 200 stale module as well as failed/partial downloads',async()=>{
  const {context}=workerContext();
  for(const status of [200,503]){
    context.bad=new Response(status===200?'stale old module':'unavailable',{status});
    await assert.rejects(vm.runInContext("verifyDelivery('./js/management-intelligence-v380.js?v=20261027-pr12-raw-bytes-r1',bad)",context),/ZEZMS_DELIVERY_(HASH_MISMATCH|HTTP_FAILURE)/);
  }
  context.good=new Response(delivery.assetBytes('js/management-intelligence-v380.js'));
  await assert.doesNotReject(vm.runInContext("verifyDelivery('./js/management-intelligence-v380.js?v=20261027-pr12-raw-bytes-r1',good)",context));
});

test('worker scope matching and exact version lookups cannot reuse an older query alias',()=>{
  const {context}=workerContext();
  assert.equal(vm.runInContext("verifiedKey('https://delivery.invalid/js/management-intelligence-v380.js?v=old')",context),null);
  assert.equal(vm.runInContext("verifiedKey('https://delivery.invalid/index.html?build=old')",context),'./index.html');
});

test('update helper and worker retain passive activation and never erase device/origin storage',()=>{
  for(const file of ['sw.js','PR12_RAW_BYTE_UPDATE.html']){
    const source=read(file);
    for(const forbidden of ['skipWaiting(', 'clients.claim(', 'unregister(', 'caches.delete(', 'localStorage.clear(', 'indexedDB.deleteDatabase('])assert.ok(!source.includes(forbidden),file+': '+forbidden);
  }
  const helper=read('PR12_RAW_BYTE_UPDATE.html');
  assert.ok(helper.includes('await installed(registration.installing)'));
  assert.ok(helper.includes('proof.delivery!==expected||proof.verified!==true'));
});
