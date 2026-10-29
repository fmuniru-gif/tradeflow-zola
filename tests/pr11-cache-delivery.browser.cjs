// Genuine controlled-worker upgrades. Localhost, fresh profiles, synthetic data.
const {test,after}=require('node:test');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const playwright=require(process.env.PLAYWRIGHT_CORE_PATH||'playwright-core');
const delivery=require('../tools/build-pr11-delivery.cjs'),{fixtureAsset}=require('./delivery-fixture.cjs');
const root=path.resolve(__dirname,'..'),before='1241e0ea2a02d05d68e976d16f51164ad72c216b',production='f810940762809e89a35f982a8577a9f32dcabf4e';
const brokenProduction='d2a91205e0c8974ad298b56b3b744a8588d32319';
const currentProduction='e3e0bf654519f3d9745ec89f3d9dbc394cf53067';
const memo=new Map();
function committed(ref,name){const key=ref+':'+name;if(!memo.has(key))memo.set(key,execFileSync('git',['show',key],{cwd:root,maxBuffer:32*1024*1024}));return memo.get(key);}
let mode='before',fault='',browser;
const requests=[];
const server=http.createServer((req,res)=>{
  let file=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  if(!/^[A-Za-z0-9_./-]+$/.test(file)||file.includes('..')||!fs.existsSync(path.join(root,file))){res.writeHead(404);return res.end();}
  requests.push({mode,fault,file,url:req.url});
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.html')?'text/html':file.endsWith('.json')?'application/json':'application/octet-stream');
  if(mode==='corrected'&&fault==='missing-velocity'&&file==='js/stock-velocity-v390.js'){res.writeHead(503);return res.end('synthetic interrupted download');}
  if(mode==='corrected'&&fault==='stale-management'&&file==='js/management-intelligence-v380.js')return res.end(committed(before,file));
  if(mode==='corrected'&&fault==='stale-shell'&&file==='index.html')return res.end(committed(before,file));
  if(mode==='corrected'&&fault==='missing-main-pages'&&file==='js/main-table-pages.js'){res.writeHead(503);return res.end('synthetic interrupted paging download');}
  if(mode==='corrected'&&fault==='stale-owner-maintenance'&&file==='js/owner-maintenance-v373.js')return res.end(committed(currentProduction,file));
  res.end(mode==='corrected'?fixtureAsset(file):committed(mode==='current-production'?currentProduction:mode==='broken'?brokenProduction:mode==='before'?before:production,file));
});
after(async()=>{if(browser)await browser.close();if(server.listening)await new Promise(r=>server.close(r));});
async function ready(page){await page.waitForFunction(()=>!!window.ZEZMS?.navigationV3101&&!!window.ZEZMS?.managementIntelligence&&!!window.ZEZMS?.stockVelocity,null,{timeout:20000});}
async function waitForAsync(page,predicate,arg,timeout){
  // Playwright 1.56 treats the returned Promise itself as truthy in
  // waitForFunction. Poll awaited values so Cache API evidence is real.
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){if(await page.evaluate(predicate,arg))return;await new Promise(resolve=>setTimeout(resolve,100));}
  assert.fail('Asynchronous delivery evidence did not become true within '+timeout+'ms');
}
async function apis(page){return page.evaluate(async()=>{
  const source=document.querySelector('script[data-zezms-navigation-v3101-r68e]')?.textContent;
  if(!source)throw Error('Installed navigation source is missing');
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source.replace(/\r\n/g,'\n').trim()));
  return {navigation:[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join(''),
    management:typeof ZEZMS.managementIntelligence.viewHTML==='function'&&typeof ZEZMS.managementIntelligence.viewDashboardHTML==='function',
    velocity:typeof ZEZMS.stockVelocity.clearPlanningSnapshot==='function',delivery:document.querySelector('meta[name="zezms-delivery"]')?.content||null,
    tablePages:ZEZMS.tablePages?.size===50,receiptLookup:typeof ZEZMS.ownerMaintenance?.receiptEditLookup==='function'};
});}
async function workerProof(page,which='active'){return page.evaluate(which=>new Promise(async(resolve,reject)=>{
  const r=await navigator.serviceWorker.getRegistration(),worker=which==='controller'?navigator.serviceWorker.controller:r?.[which];
  if(!worker)return reject(Error('No '+which+' worker'));
  const timer=setTimeout(()=>{navigator.serviceWorker.removeEventListener('message',receive);reject(Error('worker proof timeout'));},5000);
  function receive(event){if(event.source===worker&&event.data?.type==='ZEZMS_RUNTIME_INTEGRITY_RESPONSE'){clearTimeout(timer);navigator.serviceWorker.removeEventListener('message',receive);resolve(event.data);}}
  navigator.serviceWorker.addEventListener('message',receive);worker.postMessage({type:'ZEZMS_RUNTIME_INTEGRITY_PROBE',nonce:'synthetic-proof'});
}),which);}
async function proveDirectNavigation(page){
  // The security wrapper deliberately hides the underlying function's source.
  // Exercise its normal delegation with a disposable renderer sentinel, keeping
  // the guard installed. No transaction, storage or business API is invoked.
  const result=await page.evaluate(()=>{
    const intelligence=ZEZMS.managementIntelligence;
    let calls=0;
    ZEZMS.managementIntelligence=Object.assign({},intelligence,{viewHTML:()=>{calls++;return '<section id="managementIntelligence">SYNTHETIC-DIRECT-RENDERER</section>';}});
    try{const html=ZEZMS.navigationV3101.viewManagementSection('management-intelligence');return {calls,html};}
    finally{ZEZMS.managementIntelligence=intelligence;}
  });
  assert.equal(result.calls,1);
  assert.ok(result.html.includes('SYNTHETIC-DIRECT-RENDERER'),'installed navigation did not use the PR11 direct renderer');
}
async function update(page){return page.evaluate(async()=>{
  const registration=await navigator.serviceWorker.getRegistration();
  const state=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('synthetic worker install timeout')),30000);
    registration.addEventListener('updatefound',()=>{
      const worker=registration.installing;
      function changed(){if(['installed','redundant'].includes(worker.state)){clearTimeout(timer);worker.removeEventListener('statechange',changed);resolve(worker.state);}}
      worker.addEventListener('statechange',changed);changed();
    },{once:true});
  });
  await registration.update();return state;
});}
async function baseline(initial='before'){
  mode=initial;fault='';
  if(!server.listening)await new Promise(r=>server.listen(0,'127.0.0.1',r));
  if(!browser)browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
  const context=await browser.newContext(),errors=[],external=[],navigations=[];
  const origin='http://127.0.0.1:'+server.address().port;
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():(external.push(route.request().url()),route.abort()));
  context.on('page',p=>p.on('pageerror',e=>errors.push(String(e))));
  context.on('response',r=>{if(r.request().isNavigationRequest())navigations.push(r.body().then(body=>({url:r.url(),worker:r.fromServiceWorker(),sha:delivery.sha(body)})).catch(()=>({url:r.url(),unavailable:true})));});
  let page=await context.newPage();await page.goto(origin+'/index.html');await ready(page);
  await page.evaluate(async()=>{await navigator.serviceWorker.register('./sw.js?v=20261024-ui-stock-review-r1');await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('synthetic worker startup timeout')),30000))]);});
  if(initial==='corrected'||initial==='current-production'){
    await page.reload();await ready(page);
    return {context,page,origin,errors,external,navigations};
  }
  // Wait for the actual old worker's sequential post-shell cache pass, including
  // its old query aliases. Do not fake a fresh installation or clear any cache.
  // First reopen under its controller so the existing shell-ready message starts
  // that pass; serviceWorker.ready alone does not control the installing page.
  await page.reload();await ready(page);
  await waitForAsync(page,async()=>{
    const cache=await caches.open('zezms-ui-stock-review-20261024-v1');
    return !!await cache.match('./js/management-intelligence-v380.js?v=20261004-r70f-recovery-stabilization')&&
      !!await cache.match('./js/stock-velocity-v390.js?v=20261004-r70f-recovery-stabilization');
  },null,25000);
  assert.ok(await page.evaluate(()=>!!navigator.serviceWorker.controller));
  const old=await apis(page);assert.equal(old.management,false);assert.equal(old.velocity,false);
  assert.notEqual(old.navigation,'7556cedf8c66af19c98bbb01ef19f10ec23442211a6413decdf7243fd006fa7b');
  return {context,page,origin,errors,external,navigations};
}
async function seed(f,label,device,access){
  await f.page.evaluate(async({label,device,access})=>{
    const db=JSON.parse(JSON.stringify(DB)),now=new Date();
    db.products=[{id:'SYN-P1',name:'Synthetic preservation product',category:'Fixture',uCost:15,uPrice:25}];
    db.stockRows=[{id:'SYN-R1',productId:'SYN-P1',productName:'Synthetic preservation product',category:'Fixture',year:now.getFullYear(),month:now.getMonth()+1,qtyIn:15,qtyOut:3,rStock:12,uCost:15,uPrice:25,tSales:75,profit:30}];
    db.sales=[{id:'SYN-S1',date:now.toISOString(),total:75,status:'ACTIVE'}];
    db.receipts=[{receiptNo:'SYN-RC1',date:now.toISOString(),items:[],total:75,amountPaid:75,status:'ACTIVE'}];
    db.cashBalances={Others:12,'Cash in Hand':21,MOMO:3};
    localStorage.setItem('tradeflow_v321_zola',JSON.stringify(db));
    const state={...ZEZMS.cloudSync.getState(),deviceId:device,deviceName:'Synthetic '+label,deviceAccessMode:access,initialized:true,businessId:'synthetic-business',syncOwnerId:'synthetic-owner',cursor:17,deviceSeq:7,liveSyncEnabled:false,liveSyncDesired:false,supabaseUrl:'https://synthetic.invalid',publishableKey:'synthetic-not-production'};
    localStorage.setItem('zezms_cloud_sync_m4_state',JSON.stringify(state));
    localStorage.setItem('zezms_cloud_sync_m4_queue',JSON.stringify([{opId:'SYN-OUTBOX-'+label,deviceId:device,deviceSeq:7,kind:'DATABASE_CHANGE',patches:[],payloadHash:'synthetic'}]));
    localStorage.setItem('zezms_cloud_sync_m4_failed_v2','[]');localStorage.setItem('zezms_cloud_sync_m4_rejected','[]');
    localStorage.setItem('zezms_cloud_sync_m4_applied_v2',JSON.stringify({'SYN-APPLIED':17}));
    localStorage.setItem('synthetic-delivery-preservation',JSON.stringify({identity:device,label}));
    await new Promise((resolve,reject)=>{
      const open=indexedDB.open('synthetic-delivery-preservation',1);
      open.onupgradeneeded=()=>open.result.createObjectStore('evidence');open.onerror=()=>reject(open.error);
      open.onsuccess=()=>{const database=open.result,tx=database.transaction('evidence','readwrite');tx.objectStore('evidence').put({device,label,businessRecord:'SYNTHETIC-UNCHANGED'},'identity');tx.oncomplete=()=>{database.close();resolve();};tx.onerror=()=>reject(tx.error);};
    });
  },{label,device,access});
  await f.page.reload();await ready(f.page);await f.page.waitForTimeout(700);
  // The unchanged convergence module publishes after 3500ms even with Live
  // Sync disabled. With the SDK blocked it records a capability error; the
  // known Shop identity can instead be stopped by its existing recovery guard.
  // Observe completion rather than imposing Main's guard outcome on Shop.
  await f.page.waitForFunction(()=>!!ZEZMS.convergence?.getState().lastError);
  console.log('DELIVERY_BASELINE_GUARD '+JSON.stringify(await f.page.evaluate(label=>({device:label,code:ZEZMS.cloudSync.getState().r70CapabilityBlockCode||null,convergenceError:ZEZMS.convergence.getState().lastError,syntheticCloudUnavailable:true}),label)));
  return snapshot(f.page);
}
async function snapshot(page){return page.evaluate(async()=>{
  const keys=['tradeflow_v321_zola','zezms_cloud_sync_m4_state','zezms_cloud_sync_m4_queue','zezms_cloud_sync_m4_failed_v2','zezms_cloud_sync_m4_rejected','zezms_cloud_sync_m4_applied_v2','synthetic-delivery-preservation'];
  const storage=Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)]));
  // Existing M4 startup/offline handling changes this presentation label. Keep
  // every identity, cursor, sequence, configuration and preference field exact.
  const sync=JSON.parse(storage.zezms_cloud_sync_m4_state);delete sync.status;
  if(sync.r70CapabilityBlockedAt){
    if(!Number.isFinite(Date.parse(sync.r70CapabilityBlockedAt)))throw Error('Invalid capability-check timestamp');
    sync.r70CapabilityBlockedAt='OBSERVED_EXISTING_CAPABILITY_CHECK_TIMESTAMP';
  }
  storage.zezms_cloud_sync_m4_state=JSON.stringify(sync);
  const idb=await new Promise((resolve,reject)=>{const open=indexedDB.open('synthetic-delivery-preservation',1);open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction('evidence','readonly'),read=tx.objectStore('evidence').get('identity');read.onsuccess=()=>resolve(read.result);read.onerror=()=>reject(read.error);tx.oncomplete=()=>db.close();};});
  return {storage,idb};
});}
async function activateNaturally(f){
  const worker=f.context.serviceWorkers().at(-1);
  await f.page.close();
  // Only observes registration state. No skipWaiting, claim, unregister or reset.
  const deadline=Date.now()+15000;
  while(Date.now()<deadline){if(await worker.evaluate(()=>self.registration.active?.state==='activated'&&!self.registration.waiting))break;await new Promise(r=>setTimeout(r,50));}
  f.page=await f.context.newPage();await f.page.goto(f.origin+'/index.html');await ready(f.page);
  // Registration.active and this page's controller need not be the same version
  // during passive handoff. Identical script URLs do not identify worker bytes.
  const controller=await f.page.evaluate(()=>!!navigator.serviceWorker.controller);
  if(!controller||(await workerProof(f.page,'controller')).delivery!==delivery.DELIVERY){await f.page.reload();await ready(f.page);}
  assert.equal((await workerProof(f.page,'controller')).delivery,delivery.DELIVERY);
  assert.equal((await workerProof(f.page)).delivery,delivery.DELIVERY);
}

async function cachedBrokenPR12(f){
  mode='broken';
  assert.equal(await update(f.page),'redundant','deployed PR12 worker unexpectedly accepted raw Git HTTP assets');
  assert.equal((await workerProof(f.page)).cache,'zezms-ui-stock-review-20261024-v1');
  await f.page.reload();await ready(f.page);
  await waitForAsync(f.page,async expected=>{
    const cache=await caches.open('zezms-ui-stock-review-20261024-v1'),response=await cache.match(location.origin+'/index.html');
    if(!response)return false;
    const digest=await crypto.subtle.digest('SHA-256',await response.arrayBuffer());
    return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('')===expected;
  },delivery.sha(committed(brokenProduction,'index.html')),12000);
  await f.page.reload();await ready(f.page);
  assert.equal((await apis(f.page)).delivery,'20261026-pr11-cache-r1');
  // Cache the real old helper through the prior worker's normal HTTP path.
  // The correction must use its fresh helper URL, without deleting this entry.
  const oldHelper=await f.page.evaluate(async()=>await(await fetch('./PR11_DELIVERY_UPDATE.html')).text());
  assert.ok(oldHelper.includes("const expected='20261026-pr11-cache-r1'"));
}

test('deployed PR12 rejects raw Git HTTP Management bytes and retains its old active worker',async()=>{
  const f=await baseline();
  try{
    await cachedBrokenPR12(f);
    assert.equal(delivery.sha(committed(brokenProduction,'js/management-intelligence-v380.js')),'0fcacfe9043823f1528e68c5179c59f18b2a14045b9bc8c7b6fd4c2434f228b8');
    assert.ok(requests.some(r=>r.mode==='broken'&&r.file==='js/management-intelligence-v380.js'));
    console.log('RAW_BYTE_ORIGINAL_INSTALL '+JSON.stringify({rawHTTP:true,workerRejected:true,oldActivePreserved:true,cachedPR12Shell:true,oldHelperRetained:true}));
  }finally{await f.context.close();}
});

test('cached pre-PR11 assembled source reproduces missing APIs after unchanged worker deployment',async()=>{
  assert.deepEqual(committed(before,'sw.js'),committed(production,'sw.js'));
  const f=await baseline();
  try{
    mode='production';
    await f.page.reload();await ready(f.page);
    const expected=crypto.createHash('sha256').update(committed(production,'index.html')).digest('hex');
    await waitForAsync(f.page,async expected=>{
      const cache=await caches.open('zezms-ui-stock-review-20261024-v1');const response=await cache.match(location.origin+'/index.html');
      if(!response)return false;const digest=await crypto.subtle.digest('SHA-256',await response.arrayBuffer());
      return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('')===expected;
    },expected,12000);
    await f.page.reload();await ready(f.page);
    const stale=await apis(f.page);
    assert.equal(stale.management,false);assert.equal(stale.velocity,false);
    assert.notEqual(stale.navigation,'7556cedf8c66af19c98bbb01ef19f10ec23442211a6413decdf7243fd006fa7b');
    assert.equal((await workerProof(f.page)).cache,'zezms-ui-stock-review-20261024-v1');
    console.log('DELIVERY_ROOT_CAUSE '+JSON.stringify({freshOuterShell:true,oldAssembledCacheReused:true,stale}));
  }finally{await f.context.close();}
});

test('a corrected outer shell controlled by the old worker still executes all three PR11 modules together',async()=>{
  const f=await baseline();
  try{
    mode='corrected';
    await f.page.reload();await ready(f.page);
    const expected=delivery.sha(fixtureAsset('index.html'));
    await waitForAsync(f.page,async expected=>{
      const cache=await caches.open('zezms-ui-stock-review-20261024-v1');const response=await cache.match(location.origin+'/index.html');
      if(!response)return false;const digest=await crypto.subtle.digest('SHA-256',await response.arrayBuffer());
      return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('')===expected;
    },expected,12000);
    await f.page.reload();await ready(f.page);
    assert.equal((await workerProof(f.page,'controller')).cache,'zezms-ui-stock-review-20261024-v1');
    const current=await apis(f.page);
    console.log('DELIVERY_TRANSITION_STATE '+JSON.stringify({current,navigations:await Promise.all(f.navigations),errors:f.errors,caches:await f.page.evaluate(()=>caches.keys())}));
    assert.equal(current.navigation,'7556cedf8c66af19c98bbb01ef19f10ec23442211a6413decdf7243fd006fa7b');
    assert.equal(current.management,true);assert.equal(current.velocity,true);assert.equal(current.delivery,delivery.DELIVERY);
    await proveDirectNavigation(f.page);
    console.log('DELIVERY_OLD_CONTROLLER '+JSON.stringify({allThreePR11Modules:true,oldWorkerStillControls:true,noMixedBundle:true}));
  }finally{await f.context.close();}
});

test('Main, Shop and Camon upgrade cached old bundles passively and retain all synthetic business/sync/IDB evidence offline',async()=>{
  for(const [label,device,access] of [['Main','9a5ab8eb-f67e-425c-866d-574b641295f0','OWNER'],['Shop','197e3568-5a89-4a56-b9d0-07f5e8248734','PAIRED'],['Camon','499b7dcf-9552-4337-929b-95828263b6db','PAIRED']]){
    const f=await baseline();
    try{
      await cachedBrokenPR12(f);
      const saved=await seed(f,label,device,access);mode='corrected';
      await f.page.goto(f.origin+'/MAIN_RESPONSIVENESS_UPDATE.html');
      await f.page.waitForFunction(()=>document.getElementById('status')?.textContent.includes('Complete verified PR11 bundle is waiting'));
      assert.equal(await f.page.locator('#open').isVisible(),false);
      const waiting=await workerProof(f.page,'waiting');assert.equal(waiting.delivery,delivery.DELIVERY);assert.equal(waiting.verified,true);
      assert.equal((await workerProof(f.page)).cache,'zezms-ui-stock-review-20261024-v1','old active worker was replaced before its clients closed');
      assert.deepEqual(await snapshot(f.page),saved);
      await activateNaturally(f);
      const current=await apis(f.page);
      assert.equal(current.navigation,'7556cedf8c66af19c98bbb01ef19f10ec23442211a6413decdf7243fd006fa7b');assert.equal(current.management,true);assert.equal(current.velocity,true);assert.equal(current.delivery,delivery.DELIVERY);
      await proveDirectNavigation(f.page);
      assert.deepEqual(await snapshot(f.page),saved);
      await f.context.setOffline(true);await f.page.reload();await ready(f.page);
      assert.deepEqual(await apis(f.page),current);assert.deepEqual(await snapshot(f.page),saved);
      assert.equal(f.errors.length,0,JSON.stringify(f.errors));
      const cachesPresent=await f.page.evaluate(()=>caches.keys());
      assert.ok(cachesPresent.includes('zezms-ui-stock-review-20261024-v1'));assert.ok(cachesPresent.includes('zezms-ui-stock-review-patched-v1'));
      console.log('DELIVERY_UPGRADE '+JSON.stringify({device:label,apis:current,recordsUnchanged:true,identityCursorQueueConfigUnchanged:true,indexedDBUnchanged:true,offline:true,oldCachesRetained:true}));
    }finally{await f.context.close();}
  }
});

test('exact PR14 cached Main, Shop and Camon upgrade naturally to the complete bounded-table bundle and reopen offline',async()=>{
  for(const [label,device,access] of [['Main','9a5ab8eb-f67e-425c-866d-574b641295f0','OWNER'],['Shop','197e3568-5a89-4a56-b9d0-07f5e8248734','PAIRED'],['Camon','499b7dcf-9552-4337-929b-95828263b6db','PAIRED']]){
    const f=await baseline('current-production');
    try{
      const oldProof=await workerProof(f.page),oldCaches=await f.page.evaluate(()=>caches.keys());
      assert.equal((await apis(f.page)).tablePages,false);
      const saved=await seed(f,label,device,access);mode='corrected';
      assert.equal(await update(f.page),'installed');assert.equal((await workerProof(f.page)).cache,oldProof.cache);
      assert.equal((await workerProof(f.page,'waiting')).delivery,delivery.DELIVERY);assert.deepEqual(await snapshot(f.page),saved);
      await activateNaturally(f);const current=await apis(f.page);assert.equal(current.tablePages,true);assert.equal(current.receiptLookup,true);assert.equal(current.delivery,delivery.DELIVERY);
      assert.deepEqual(await snapshot(f.page),saved);await f.context.setOffline(true);await f.page.reload();await ready(f.page);
      assert.deepEqual(await apis(f.page),current);assert.deepEqual(await snapshot(f.page),saved);
      const retained=await f.page.evaluate(()=>caches.keys());assert.ok(oldCaches.every(name=>retained.includes(name)));
      assert.equal(f.errors.length,0,JSON.stringify(f.errors));
      console.log('PR15_CACHED_UPGRADE '+JSON.stringify({device:label,baseline:currentProduction,completePagingBundle:true,naturalActivation:true,offline:true,stateUnchanged:true}));
    }finally{await f.context.close();}
  }
});

for(const failure of ['missing-velocity','stale-management','stale-shell','missing-main-pages','stale-owner-maintenance'])test('interrupted or mixed '+failure+' cannot activate and preserves the prior offline application',async()=>{
  const f=await baseline();
  try{
    const saved=await seed(f,failure,'11111111-2222-4333-8444-555555555555','OWNER');
    mode='corrected';fault=failure;
    assert.equal(await update(f.page),'redundant');
    assert.equal((await workerProof(f.page)).cache,'zezms-ui-stock-review-20261024-v1');
    assert.deepEqual(await snapshot(f.page),saved);
    await f.context.setOffline(true);await f.page.close();f.page=await f.context.newPage();await f.page.goto(f.origin+'/index.html');await ready(f.page);
    const current=await apis(f.page);
    assert.equal(current.management,current.velocity,'old worker delivered a mixed PR11 module set');
    if(current.management)assert.equal(current.navigation,'7556cedf8c66af19c98bbb01ef19f10ec23442211a6413decdf7243fd006fa7b');
    else assert.notEqual(current.navigation,'7556cedf8c66af19c98bbb01ef19f10ec23442211a6413decdf7243fd006fa7b');
    assert.deepEqual(await snapshot(f.page),saved);
    console.log('DELIVERY_INTERRUPTED '+JSON.stringify({failure,newWorkerRejected:true,priorOfflineAppPreserved:true,businessAndSyncEvidenceUnchanged:true}));
  }finally{fault='';await f.context.close();}
});

test('fresh corrected installation starts cleanly and rejects an old assembled page forged into the new patched cache',async()=>{
  const f=await baseline('corrected');
  try{
    const good=await apis(f.page);assert.equal(good.management,true);assert.equal(good.velocity,true);
    await f.page.goto(f.origin+'/MAIN_RESPONSIVENESS_UPDATE.html');
    await f.page.waitForFunction(()=>document.getElementById('status')?.textContent.includes('verified PR11 delivery worker is active'));
    assert.equal(await f.page.locator('#open').isVisible(),true);
    await f.page.goto(f.origin+'/index.html');await ready(f.page);
    await f.page.evaluate(async()=>{
      const names=await caches.keys(),name=names.find(n=>n.startsWith('zezms-pr11-patched-'));
      const cache=await caches.open(name),keys=await cache.keys();
      for(const key of keys){const hit=await cache.match(key);await cache.put(key,new Response('<html>synthetic stale assembled body</html>',{headers:hit.headers}));}
    });
    await f.context.setOffline(true);await f.page.reload();await ready(f.page);
    assert.deepEqual(await apis(f.page),good);assert.equal(f.errors.length,0,JSON.stringify(f.errors));
  }finally{await f.context.close();}
});
