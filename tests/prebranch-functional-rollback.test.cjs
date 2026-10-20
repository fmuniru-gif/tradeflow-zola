const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const baseline='a323d78da4559fe13f082cf172932ce6e7a93adb';
const release='20261020-prebranch-functional-r1';
const normalized=value=>value.replace(/\r\n/g,'\n');
const read=name=>normalized(fs.readFileSync(path.join(root,name),'utf8'));
const old=name=>normalized(execFileSync('git',['show',baseline+':'+name],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024}));
const embedded=source=>new Map([...source.matchAll(/const ([A-Z0-9_]+_B64)="([^"]+)";/g)].map(m=>[m[1],m[2]]));
function outsideShop(base64){
  const cloud=Buffer.from(base64,'base64').toString('utf8');
  const begin='/* SHOP_DIRECTORY_RECOVERY_INSERT_BEGIN */',end='/* SHOP_DIRECTORY_RECOVERY_INSERT_END */';
  const a=cloud.indexOf(begin),b=cloud.indexOf(end);
  assert.ok(a>=0&&b>a);
  return cloud.slice(0,a)+cloud.slice(b+end.length);
}

test('the assembled shell removes only the r69 branch registry module',()=>{
  const before=embedded(old('index.html'));
  const after=embedded(read('index.html'));
  assert.ok(before.has('BRANCH_MANAGEMENT_R69_B64'));
  assert.ok(!after.has('BRANCH_MANAGEMENT_R69_B64'));
  assert.deepEqual([...after.keys()].sort(),[...before.keys()].filter(x=>x!=='BRANCH_MANAGEMENT_R69_B64').sort());
  for(const [name,value] of after){
    if(name==='CLOUD_B64')assert.equal(outsideShop(value),outsideShop(before.get(name)),'cloud closure outside Shop insertion changed');
    else assert.equal(value,before.get(name),name+' changed');
  }
  const shell=read('index.html');
  assert.ok(!shell.includes('branchManagementR69'));
  assert.ok(!shell.includes('<script data-zezms-branch-management-r69a>'));
  assert.match(shell,/if\(output\.includes\('data-zezms-branch-management-r69a'\)\)throw/);
  for(const marker of ['data-zezms-cloud-sync-r61o','data-zezms-managed-device-lifecycle-r70p','data-zezms-account-cash-pdf-r68e','data-zezms-kpi-charts-compact-r68e','data-zezms-prelogin-verified-activation-r70u'])assert.ok(shell.includes(marker),marker);
});

test('protected business and diagnostic source files remain unchanged',()=>{
  for(const name of ['js/managed-device-lifecycle-r61.js','js/commercial-foundation.js','js/account-cash-pdf-r68e.js','js/kpi-charts-compact-r68e.js','js/pdf-export.js','js/direct-print-bridge-v3121.js','js/sync-integrity-v3161.js'])assert.equal(read(name),old(name),name);
  const oldFiles=execFileSync('git',['ls-tree','-r','--name-only',baseline,'diagnostics'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
  assert.ok(oldFiles.length>0);
  for(const name of oldFiles)assert.equal(read(name),old(name),'diagnostic changed: '+name);
});

test('the new worker and helper never seize clients or erase older caches',()=>{
  const shell=read('index.html'),worker=read('sw.js'),manifest=JSON.parse(read('manifest.json')),helper=read('FORCE_UPDATE_MOBILE.html');
  assert.match(shell,new RegExp('const RELEASE="'+release+'";'));
  assert.equal(manifest.start_url,'./index.html?build='+release);
  assert.ok(worker.includes(release)&&helper.includes(release));
  assert.ok(worker.includes('zezms-shop-trading-readiness-20261020-v1'));
  assert.ok(shell.includes('zezms-shop-trading-readiness-patched-v1'));
  assert.ok(!worker.includes('branch-management-r69.js'));
  for(const unsafe of ['skipWaiting(', 'clients.claim(', 'caches.delete(', 'indexedDB.deleteDatabase('])assert.ok(!worker.includes(unsafe),unsafe);
  for(const unsafe of ['unregister(', 'caches.delete(', 'localStorage.clear(', 'indexedDB.deleteDatabase('])assert.ok(!helper.includes(unsafe),unsafe);
  assert.match(worker,/shellText\.includes\('BRANCH_MANAGEMENT_R69_B64'\)/);
  assert.match(worker,/ZEZMS_PRESERVATION_RELEASE_MISMATCH/);
});
