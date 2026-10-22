const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),base='3582ab43f0a3ae3911f606c2d47615db291336e4',production='a323d78da4559fe13f082cf172932ce6e7a93adb';
const shell=fs.readFileSync(path.join(root,'index.html'),'utf8');
const {undoR70W}=require('./r70w-source-proof.cjs');
const original=execFileSync('git',['show',base+':index.html'],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024});
function decode(text,name){const m=text.match(new RegExp('const '+name+'=([\\s\\S]*?);\\s*(?:const|function|let|var)'));assert.ok(m,name);return Buffer.from([...m[1].matchAll(/"([A-Za-z0-9+/=]+)"/g)].map(x=>x[1]).join(''),'base64').toString('utf8');}
test('the exact production Shop guard remains inside the actual embedded cloud closure',()=>{
  const current=undoR70W(decode(shell,'CLOUD_B64')),prior=decode(original,'CLOUD_B64');
  assert.doesNotThrow(()=>new vm.Script(current));
  const protectedShell=execFileSync('git',['show',production+':index.html'],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024});
  const insertion=current.match(/\/\* SHOP_DIRECTORY_RECOVERY_INSERT_BEGIN \*\/[\s\S]*?\/\* SHOP_DIRECTORY_RECOVERY_INSERT_END \*\/\n/);assert.ok(insertion);
  assert.equal(current.replace(insertion[0],''),prior);
  const protectedCloud=decode(protectedShell,'CLOUD_B64'),protectedInsertion=protectedCloud.match(/\/\* SHOP_DIRECTORY_RECOVERY_INSERT_BEGIN \*\/[\s\S]*?\/\* SHOP_DIRECTORY_RECOVERY_INSERT_END \*\/\n/);
  assert.ok(protectedInsertion);assert.equal(current.replace(insertion[0],''),protectedCloud.replace(protectedInsertion[0],''));
  assert.ok(insertion[0].includes(fs.readFileSync(path.join(root,'js/shop-directory-recovery-core.js'),'utf8').replace(/\r\n/g,'\n')));
  assert.ok(insertion[0].includes(fs.readFileSync(path.join(root,'js/shop-directory-recovery-runtime.js'),'utf8').replace(/\r\n/g,'\n')));
  for(const name of ['VERIFIED_BASELINE_B64','INTEGRITY_B64','MANAGED_DEVICE_LIFECYCLE_R61_B64','PRELOGIN_VERIFIED_ACTIVATION_R70U_B64'])assert.equal(decode(shell,name),decode(original,name));
  const manager=decode(shell,'MANAGER_SCOPE_STAFF_LOGIN_B64');
  const guard=/\n    \/\* SHOP_DIRECTORY_TIMESTAMP_HOLD: keep login audit local during recovery\. \*\/\n    if \(window\.ZEZMS\.cloudSync && window\.ZEZMS\.cloudSync\.isShopDirectoryRecoveryHeld && window\.ZEZMS\.cloudSync\.isShopDirectoryRecoveryHeld\(\)\) return false;/;
  assert.match(manager,guard);assert.equal(manager.replace(guard,''),decode(original,'MANAGER_SCOPE_STAFF_LOGIN_B64'));
});
test('standalone legacy sync, Main repairs and financial code stay byte-identical',()=>{
  for(const file of ['js/cloud-sync.js','diagnostics/main-cash-repair/repair-core.js','diagnostics/main-cash-repair/repair-core-r3.js','diagnostics/main-cash-input-compare/integrity-r60o.js']){
    const old=execFileSync('git',['show',base+':'+file],{cwd:root,maxBuffer:32*1024*1024}).toString('utf8').replace(/\r\n/g,'\n');assert.equal(fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n'),old,file);
  }
});
test('worker requires new guard shell and enumerates old/uncontrolled clients',()=>{
  const source=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  assert.match(source,/includeUncontrolled:true/);assert.match(source,/SHOP_DIRECTORY_RECOVERY_BUILD/);assert.ok(!source.includes('skipWaiting('));assert.ok(!source.includes('clients.claim('));assert.ok(!source.includes('caches.delete('));assert.ok(!source.includes('indexedDB.deleteDatabase'));
  assert.match(shell,/PATCH_CACHE="zezms-shop-chrome-directory-chain-patched-v1"/);
  assert.match(source,/release:'shop-storage-capacity-v1'/);
  assert.match(shell,/SHOP_DIRECTORY_RECOVERY_BUILD="shop-storage-capacity-v1"/);
  assert.match(fs.readFileSync(path.join(root,'FORCE_UPDATE_MOBILE.html'),'utf8'),/shop-build=shop-storage-capacity-v1/);
  const runtime=fs.readFileSync(path.join(root,'js/shop-directory-recovery-runtime.js'),'utf8');
  assert.match(runtime,/var SHOP_TRADING_ACTIVATION_ENABLED=false;/);
  assert.match(runtime,/activationEnabled:SHOP_TRADING_ACTIVATION_ENABLED/);
  assert.ok(!runtime.includes("zezmsShopRecoveryAction('activateTrading')"));
});
test('recovery compares the complete production synchronized scope',()=>{
  const core=require('../js/shop-directory-recovery-core.js'),prior=decode(original,'CLOUD_B64');
  const collections=prior.match(/const COLLECTIONS = (\[[\s\S]*?\]);/);
  assert.ok(collections);assert.deepEqual(core.COLLECTIONS,Array.from(vm.runInNewContext(collections[1]),String));
  for(const root of core.ROOTS)assert.ok(prior.includes("'"+root+"'"),root);
});
test('the actual last upload hop blocks even a manually prepared original operation',async()=>{
  const source=fs.readFileSync(path.join(root,'js/shop-directory-recovery-runtime.js'),'utf8');
  const fragment=source.slice(source.indexOf('var shopBasePushOne='),source.indexOf('var shopBaseQueueOperation='));let pushes=0;
  const env={shopHeld:()=>true,shopStop:()=>{throw Error('held');},pushOne:async()=>{pushes++;}};vm.createContext(env);vm.runInContext(fragment,env);
  await assert.rejects(env.pushOne({opId:'9084b206-fbf5-41d3-88ab-4e17ed309962'}),/held/);assert.equal(pushes,0);
});
test('original production tabs with the preserved queue keep their own upload hold',async()=>{
  const source=decode(original,'CLOUD_B64');const start=source.indexOf('var r70sDirectoryQueueHold=queue.some('),end=source.indexOf('function r70sDirectoryReviewHtml()',start);assert.ok(start>0&&end>start);
  let uploads=0;const env={queue:[{kind:'SHARED_DEVICE_DIRECTORY'}],state:{},r70sQuarantineResurrected:()=>false,setState:()=>{},stopRealtime:()=>{},notify:()=>{},startLiveSync:async()=>{uploads++;},pullNowCore:async()=>{uploads++;},flushQueueCore:async()=>{uploads++;},r67hScheduleReconnect:()=>{uploads++;},r67iScheduleStartupSync:()=>{uploads++;},r67hReconnectNow:()=>{uploads++;},Promise};vm.createContext(env);vm.runInContext(source.slice(start,end),env);
  await env.startLiveSync(false);await env.pullNowCore(false);await env.flushQueueCore(false);env.r67hScheduleReconnect();env.r67iScheduleStartupSync();await env.r67hReconnectNow(false);assert.equal(uploads,0);
});
