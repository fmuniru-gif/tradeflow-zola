/* Full assembled production shell; synthetic isolated profile and cloud only. */
const {test,after}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),crypto=require('node:crypto');
const playwright=require(process.env.PLAYWRIGHT_CORE_PATH||'playwright-core');
const core=require('../js/shop-directory-recovery-core.js');
const root=path.resolve(__dirname,'..');
let browser,workerGeneration=0,silentWorker=false,activationVariant=false;
const server=http.createServer((req,res)=>{let name=new URL(req.url,'http://localhost').pathname;if(name.endsWith('/'))name+='index.html';const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.json')?'application/json':file.endsWith('.html')?'text/html':'application/octet-stream');
  let body=fs.readFileSync(file);
  if(file.endsWith('sw.js')){let worker=body.toString('utf8');if(silentWorker)worker=worker.replace("if (data && data.type === 'ZEZMS_SHOP_RECOVERY_CLIENTS') {","if (false && data && data.type === 'ZEZMS_SHOP_RECOVERY_CLIENTS') {");body=worker+"\n// synthetic-worker-generation-"+workerGeneration;}
  if(file.endsWith('index.html')&&activationVariant){let shell=body.toString('utf8');shell=shell.replace(/const CLOUD_B64="([A-Za-z0-9+/=]+)";/,(_all,b64)=>{const cloud=Buffer.from(b64,'base64').toString('utf8');assert.ok(cloud.includes('var SHOP_TRADING_ACTIVATION_ENABLED=false;'));return 'const CLOUD_B64="'+Buffer.from(cloud.replace('var SHOP_TRADING_ACTIVATION_ENABLED=false;','var SHOP_TRADING_ACTIVATION_ENABLED=true;')).toString('base64')+'";';});body=shell;}
  res.end(body);
});
after(async()=>{if(browser)await browser.close();if(server.listening)await new Promise(r=>server.close(r));});
async function setup(device=core.DEVICE){
  if(!server.listening)await new Promise(r=>server.listen(0,'127.0.0.1',r));
  if(!browser)browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
  const context=await browser.newContext(),calls=[];let page=await context.newPage();
  if(process.env.SHOP_TEST_DEBUG){page.on('pageerror',e=>console.log('BROWSER_ERROR',e.stack?.slice(0,900)));page.on('console',m=>{if(m.type()==='error')console.log('BROWSER_CONSOLE',m.text().slice(0,900));});}
  const origin='http://127.0.0.1:'+server.address().port;
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===origin)return route.continue();calls.push({method:route.request().method(),path:url.pathname});return route.abort();});
  await page.goto(origin+'/index.html');
  if(process.env.SHOP_TEST_DEBUG)console.log('stage initial page loaded');
  await page.waitForFunction(()=>window.ZEZMS?.cloudSync&&window.ZEZMS?.managedDevices&&window.ZEZMS?.staffAuth);
  await page.waitForFunction(()=>document.documentElement.getAttribute('data-zezms-shared-device-auth')==='ready');
  await page.waitForTimeout(300);
  const salt=Buffer.alloc(16,9),password='synthetic-owner-password';
  const owner={id:'owner-staff-synthetic',name:'Synthetic Owner',tel:'',role:'OWNER',active:true,passwordAlgorithm:'PBKDF2-SHA256',passwordIterations:210000,passwordSalt:salt.toString('base64'),passwordHash:crypto.pbkdf2Sync(password,salt,210000,32,'sha256').toString('base64'),createdAt:'2026-10-16T00:00:00Z',updatedAt:'2026-10-16T00:00:00Z'};
  const seed=await page.evaluate(({owner,device,ids})=>{
    const db=JSON.parse(JSON.stringify(DB));db.sharedDeviceAuth={version:1,enabled:true,businessId:'synthetic-business',users:[owner],audit:[]};
    const directory={version:1,businessId:'synthetic-business',enabled:true,updatedAt:'2026-10-16T00:00:00Z',users:[owner]};
    let before=directory;const q=ids.map((opId,i)=>{const value=JSON.parse(JSON.stringify(before));value.updatedAt='2026-10-17T00:0'+i+':00Z';const op={opId,deviceId:device,deviceSeq:i+1,createdAt:value.updatedAt,protocolVersion:'M4/3',kind:'SHARED_DEVICE_DIRECTORY',patches:[{action:'root-set',root:'sharedDeviceDirectory',before,value}]};op.payloadHash=ZEZMS.cloudSync._test.deterministicHash(op);before=value;return op;});
    db.sharedDeviceDirectory=before;
    localStorage.setItem('tradeflow_v321_zola',JSON.stringify(db));
    const state=Object.assign({},ZEZMS.cloudSync.getState(),{deviceId:device,deviceName:device==='197e3568-5a89-4a56-b9d0-07f5e8248734'?'ZEZMS Shop':'Healthy synthetic',deviceAccessMode:'OWNER',syncOwnerId:'synthetic-owner',businessId:'synthetic-business',initialized:true,cursor:1,deviceSeq:3,liveSyncEnabled:false,liveSyncDesired:false,configurationVerificationRequired:false,supabaseUrl:'https://ruadyqcsutfprrxdaahi.supabase.co',publishableKey:'sb_publishable_synthetic'});
    localStorage.setItem('zezms_cloud_sync_m4_state',JSON.stringify(state));localStorage.setItem('zezms_cloud_sync_m4_queue',JSON.stringify(q));localStorage.setItem('zezms_cloud_sync_m4_failed_v2','[]');localStorage.setItem('zezms_cloud_sync_m4_applied_v2','{}');
    localStorage.setItem('zezms-m3-supabase-auth',JSON.stringify({access_token:'synthetic-token-never-production',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'synthetic-owner',is_anonymous:false}}));
    return Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)]));
  },{owner,device,ids:core.IDS});
  await page.evaluate(async()=>{
    await navigator.serviceWorker.register('./sw.js?v=20261022-shop-chrome-directory-chain-r70w-v1');
    await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('Reviewed service worker did not activate')),10000))]);
  });
  if(process.env.SHOP_TEST_DEBUG)console.log('stage worker ready');
  // End all fresh-install writers before presenting the existing-device fixture.
  // Seed the replacement page before any production initialization executes.
  await page.close();page=await context.newPage();
  await page.addInitScript(seed=>{
    if(localStorage.getItem('__synthetic_shop_seed_complete'))return;
    for(const [k,v]of Object.entries(seed))localStorage.setItem(k,v);
    localStorage.setItem('__synthetic_shop_seed_complete','1');
  },seed);
  await page.goto(origin+'/index.html');await page.waitForFunction(()=>window.ZEZMS?.cloudSync&&window.ZEZMS?.staffAuth).catch(async error=>{
    console.log('SHOP_BOOT_STATE',await page.evaluate(()=>({status:document.getElementById('r55BootStatus')?.textContent,release:document.documentElement.getAttribute('data-zezms-release'),scripts:[...document.scripts].filter(s=>s.src).map(s=>s.src).slice(-6)})));throw error;
  });
  if(process.env.SHOP_TEST_DEBUG)console.log('stage Shop reload ready');
  await page.locator('#sharedLoginUser').selectOption(owner.id);
  await page.locator('#sharedLoginPassword').fill(password);
  await page.evaluate(()=>ZEZMS.staffAuth.signInFromLogin());
  if(process.env.SHOP_TEST_DEBUG)console.log('stage real login returned');
  await page.waitForFunction(()=>ZEZMS.staffAuth.getContext().role==='OWNER',null,{timeout:5000}).catch(async error=>{
    console.log('OWNER_LOGIN_STATE',await page.evaluate(()=>({role:ZEZMS.staffAuth.getContext().role,status:document.getElementById('sharedLoginStatus')?.textContent,api:!!ZEZMS.cloudSync.shopRecovery,controller:navigator.serviceWorker.controller?.scriptURL})));throw error;
  });
  await page.evaluate(()=>nav('settings'));
  if(process.env.SHOP_TEST_DEBUG)console.log('stage Settings rendered');
  return {page,context,calls,origin,seedQueue:seed.zezms_cloud_sync_m4_queue};
}
test('actual shell exposes Shop-only Owner controls and blocks upload/reconnect after reload',async()=>{
  const f=await setup();try{
    await f.page.locator('#shopRecoveryPanel').waitFor({timeout:5000}).catch(async error=>{
      console.log('SHOP_INTEGRATION_STATE',await f.page.evaluate(()=>({role:ZEZMS.staffAuth.getContext().role,device:ZEZMS.cloudSync.getState().deviceId,api:!!ZEZMS.cloudSync.shopRecovery,settingsHasControl:ZEZMS.cloudSync.settingsHtml().includes('shopRecoveryPanel'),settingsPanels:document.querySelectorAll('#shopRecoveryPanel').length,view:document.querySelector('main')?.textContent?.slice(0,80),controller:navigator.serviceWorker.controller?.scriptURL})));throw error;
    });
    const before=await f.page.evaluate(()=>localStorage.getItem('zezms_cloud_sync_m4_queue'));
    assert.equal(before,f.seedQueue,'the first protected load rewrote the three-operation queue');
    const info=await f.page.evaluate(async()=>{
      const saved=localStorage.getItem('tradeflow_v321_zola'),old=DB.cashBalances.Others;let postingBlocked=false;DB.cashBalances.Others=Number(old)+1;try{saveDB();}catch(_){postingBlocked=true;}DB.cashBalances.Others=old;if(!postingBlocked||localStorage.getItem('tradeflow_v321_zola')!==saved)throw Error('Shop business posting guard failed');
      const api=ZEZMS.cloudSync;let publicationBlocked=false;
      try{await api.publishRoot('sharedDeviceDirectory',{},'SHARED_DEVICE_DIRECTORY');}catch(_){publicationBlocked=true;}
      await api.start(false);await api.reconnectNow(false);window.dispatchEvent(new Event('online'));window.dispatchEvent(new Event('focus'));
      return {ready:api.isReadyForLocalOperations(),review:api.getDirectoryOutboxReview(),publicationBlocked,diagnostic:api.getState().connectionLabel};
    });
    assert.equal(info.ready,false);assert.equal(info.review.required,true);assert.equal(info.publicationBlocked,true);
    await f.page.waitForTimeout(350);assert.equal(await f.page.evaluate(()=>localStorage.getItem('zezms_cloud_sync_m4_queue')),before);
    for(let repeat=0;repeat<2;repeat++){
      await f.page.reload();
      await f.page.waitForFunction(()=>window.ZEZMS?.cloudSync?.isShopDirectoryRecoveryHeld?.());
      assert.equal(await f.page.evaluate(()=>localStorage.getItem('zezms_cloud_sync_m4_queue')),f.seedQueue,'repeated initialization changed the protected queue');
      assert.equal(await f.page.evaluate(()=>ZEZMS.cloudSync.getState().liveSyncEnabled),false);
    }
    assert.ok(!f.calls.some(r=>r.path.endsWith('/zezms_ops_push')));
    const finalQueue=await f.page.evaluate(()=>localStorage.getItem('zezms_cloud_sync_m4_queue'));
    const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
    console.log('Synthetic Shop queue evidence: before=3 after=3; beforeSha256='+digest(f.seedQueue)+' afterSha256='+digest(finalQueue)+'; pushRequests=0; liveSync=false; hold=true');
    assert.ok(await f.page.evaluate(()=>document.body.textContent.includes('Directory recovery hold')));
  }finally{await f.context.close();}
});
test('Main, Camon 50 Pro and replacement Camon 17P do not acquire Shop controls',async()=>{
  for(const device of ['9a5ab8eb-f67e-425c-866d-574b641295f0','499b7dcf-9552-4337-929b-95828263b6db','4f95591d-8a5a-4866-a009-74b50bfe32f0']){
    const f=await setup(device);try{assert.equal(await f.page.locator('#shopRecoveryPanel').count(),0);assert.equal(await f.page.evaluate(()=>ZEZMS.cloudSync.shopRecovery),null);}finally{await f.context.close();}
  }
});
test('actual worker refuses recovery while another old/uncontrolled tab exists',async()=>{
  const f=await setup();try{
    async function count(){return f.page.evaluate(()=>new Promise((resolve,reject)=>{const c=new MessageChannel();setTimeout(()=>reject(Error('worker reply timeout: '+navigator.serviceWorker.controller?.scriptURL)),5000);c.port1.onmessage=e=>resolve(e.data);navigator.serviceWorker.controller.postMessage({type:'ZEZMS_SHOP_RECOVERY_CLIENTS'},[c.port2]);}));}
    assert.equal((await count()).count,1);
    const old=await f.context.newPage();await old.goto(f.origin+'/diagnostics/financial-audit/');
    assert.equal((await count()).count,2);await old.close();assert.equal((await count()).count,1);
  }finally{await f.context.close();}
});
test('Owner worker check reports reviewed worker, extra clients and survives Settings redraw',async()=>{
  const f=await setup();try{
    const before=await f.page.evaluate(()=>({queue:localStorage.getItem('zezms_cloud_sync_m4_queue'),db:localStorage.getItem('tradeflow_v321_zola'),journal:localStorage.getItem('zezms_shop_directory_recovery_v1')}));
    const calls=f.calls.length;
    const ready=await f.page.evaluate(()=>zezmsShopRecoveryAction('worker'));
    assert.equal(ready.status,'READY');assert.equal(ready.clientCount,1);assert.equal(ready.release,'shop-storage-capacity-v1');
    assert.deepEqual(await f.page.evaluate(()=>({queue:localStorage.getItem('zezms_cloud_sync_m4_queue'),db:localStorage.getItem('tradeflow_v321_zola'),journal:localStorage.getItem('zezms_shop_directory_recovery_v1')})),before);
    assert.equal(f.calls.length,calls);
    await f.page.evaluate(()=>nav('settings'));
    assert.match(await f.page.locator('#shopRecoveryReport').textContent(),/"status": "READY"/);
    const extra=await f.context.newPage();try{
      await extra.goto(f.origin+'/diagnostics/financial-audit/');
      const blocked=await f.page.evaluate(()=>ZEZMS.cloudSync.shopRecoveryWorkerReadiness());
      assert.equal(blocked.status,'OTHER_CLIENTS');assert.equal(blocked.clientCount,2);
    }finally{await extra.close();}
    assert.equal((await f.page.evaluate(()=>ZEZMS.cloudSync.shopRecoveryWorkerReadiness())).status,'READY');
  }finally{await f.context.close();}
});
test('silent old controlling worker reports NO_REPLY and preserves the exact held queue',async()=>{
  silentWorker=true;let f;
  try{
    f=await setup();const before=await f.page.evaluate(()=>localStorage.getItem('zezms_cloud_sync_m4_queue'));
    const worker=await f.page.evaluate(()=>ZEZMS.cloudSync.shopRecoveryWorkerReadiness());
    assert.equal(worker.status,'NO_REPLY');
    await f.context.setOffline(true);
    await assert.rejects(f.page.evaluate(()=>ZEZMS.cloudSync.shopRecovery.quarantine('QUARANTINE EXACT THREE')),/SHOP_STOP_WORKER_NO_REPLY/);
    assert.equal(await f.page.evaluate(()=>localStorage.getItem('zezms_cloud_sync_m4_queue')),before);
    assert.equal(await f.page.evaluate(()=>ZEZMS.cloudSync.isShopDirectoryRecoveryHeld()),true);
  }finally{silentWorker=false;if(f)await f.context.close();}
});
test('same-origin helper updates a silent worker only after old clients close, preserving Shop data',async()=>{
  silentWorker=true;let f;
  try{
    f=await setup();const before=await f.page.evaluate(()=>({queue:localStorage.getItem('zezms_cloud_sync_m4_queue'),db:localStorage.getItem('tradeflow_v321_zola'),journal:localStorage.getItem('zezms_shop_directory_recovery_v1')}));
    assert.equal((await f.page.evaluate(()=>ZEZMS.cloudSync.shopRecoveryWorkerReadiness())).status,'NO_REPLY');
    silentWorker=false;workerGeneration++;
    await f.page.goto(f.origin+'/FORCE_UPDATE_MOBILE.html');
    await f.page.waitForFunction(()=>!document.getElementById('status')?.textContent.includes('Checking'),null,{timeout:12000});
    const helper=await f.page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();return {status:document.getElementById('status').textContent,waiting:!!r?.waiting,active:!!r?.active,controller:!!navigator.serviceWorker.controller};});
    assert.ok(helper.status.includes('waiting')||helper.status.includes('Update check complete'),JSON.stringify(helper));
    assert.deepEqual(await f.page.evaluate(()=>({queue:localStorage.getItem('zezms_cloud_sync_m4_queue'),db:localStorage.getItem('tradeflow_v321_zola'),journal:localStorage.getItem('zezms_shop_directory_recovery_v1')})),before);
    await f.page.close();
    const next=await f.context.newPage();await next.goto(f.origin+'/index.html');
    await next.waitForFunction(()=>window.ZEZMS?.cloudSync?.shopRecoveryWorkerReadiness);
    await next.waitForFunction(async()=>{const r=await ZEZMS.cloudSync.shopRecoveryWorkerReadiness();return r.status==='READY';},null,{timeout:25000});
    assert.deepEqual(await next.evaluate(()=>({queue:localStorage.getItem('zezms_cloud_sync_m4_queue'),db:localStorage.getItem('tradeflow_v321_zola'),journal:localStorage.getItem('zezms_shop_directory_recovery_v1')})),before);
    assert.equal(await next.evaluate(()=>ZEZMS.cloudSync.isShopDirectoryRecoveryHeld()),true);
    assert.ok(!f.calls.some(r=>r.path.endsWith('zezms_ops_push')));
  }finally{silentWorker=false;if(f)await f.context.close();}
});
test('full shell read-only cloud preflight, real disk archive, quarantine and receive-only audit',async()=>{
  const f=await setup(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'shop-recovery-test-')),file=path.join(dir,'synthetic-encrypted.json');
  try{
    const pressure=await f.page.evaluate(()=>{
      DB.backupSettings=Object.assign({},DB.backupSettings,{syntheticPadding:''});
      const pad=1894805-JSON.stringify(DB).length;if(pad<0)throw Error('Synthetic database already exceeds target');
      DB.backupSettings.syntheticPadding='x'.repeat(pad);
      localStorage.setItem('tradeflow_v321_zola',JSON.stringify(DB));
      const total=()=>Object.keys(localStorage).reduce((n,k)=>n+localStorage.getItem(k).length,0);
      const filler=2330990-total();if(filler<0)throw Error('Synthetic storage already exceeds target');
      localStorage.setItem('__synthetic_unrelated_storage','x'.repeat(filler));
      return {db:localStorage.getItem('tradeflow_v321_zola').length,total:total()};
    });
    assert.deepEqual(pressure,{db:1894805,total:2330990});
    const bundle=await f.page.evaluate(()=>{
      const db=JSON.parse(JSON.stringify(DB));db.sharedDeviceDirectory.updatedAt='2026-10-18T00:00:00Z';
      const payload={opId:'synthetic-current-cloud',deviceId:'synthetic-other',deviceSeq:1,protocolVersion:'M4/3',kind:'DATABASE_CHANGE',patches:[{action:'root-object',root:'cashBalances',key:'Others',mode:'delta',before:Number(db.cashBalances.Others)||0,value:5}]};payload.payloadHash=ZEZMS.cloudSync._test.deterministicHash(payload);
      return {db,hash:ZEZMS.managedDevices._test.legacyCheckpointHash(db),payload};
    });
    await f.context.unroute('**/*');
    const reads=[];let movingHead=true,headReads=0;
    await f.context.route('**/*',async route=>{
      const u=new URL(route.request().url());if(u.origin===f.origin)return route.continue();
      if(u.origin!=='https://ruadyqcsutfprrxdaahi.supabase.co')return route.abort();
      reads.push({method:route.request().method(),path:u.pathname});
      if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':f.origin,'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'apikey,authorization,accept,content-type'}});
      let data;
      if(u.pathname==='/auth/v1/user')data={id:'synthetic-owner',is_anonymous:false};
      else if(u.pathname.endsWith('/zezms_m43_checkpoint_latest'))data=[{checkpoint_id:'synthetic-cp',checkpoint_cursor:1,payload:bundle.db,payload_hash:bundle.hash,protocol_version:'M4/3'}];
      else if(u.pathname.endsWith('/zezms_m5a4_canonical_fleet_read'))data=[{device_id:core.DEVICE,lifecycle_id:'synthetic-life',lifecycle_state:'ACTIVE',authentication_eligible:true,device_access_status:'ACTIVE',device_access_revoked_at:null}];
      else if(u.pathname.endsWith('/zezms_device_lifecycle'))data=[{id:'synthetic-life',device_id:core.DEVICE,owner_id:'synthetic-owner',business_id:'synthetic-business',lifecycle_state:'ACTIVE',revision:1}];
      else if(u.pathname.endsWith('/zezms_sync_state'))data=[{owner_id:'synthetic-owner',sync_mode:'operations',revision:1,operation_cursor:1}];
      else if(u.pathname.endsWith('/zezms_sync_operations'))data=u.searchParams.has('op_id')?[]:u.searchParams.get('select')==='seq'?[{seq:movingHead&&++headReads%2===0?3:2}]:[{seq:2,op_id:bundle.payload.opId,owner_id:'synthetic-owner',device_id:'synthetic-other',payload:bundle.payload}];
      else throw Error('Unexpected cloud endpoint '+u.pathname);
      return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':f.origin},body:JSON.stringify(data)});
    });
    const original=await f.page.evaluate(()=>({db:localStorage.getItem('tradeflow_v321_zola'),queue:localStorage.getItem('zezms_cloud_sync_m4_queue'),state:localStorage.getItem('zezms_cloud_sync_m4_state'),applied:localStorage.getItem('zezms_cloud_sync_m4_applied_v2')}));
    await f.page.evaluate(()=>{session.commercialRole='CASHIER';});await assert.rejects(f.page.evaluate(()=>ZEZMS.cloudSync.shopRecovery.preflight()),/SHOP_OWNER_OR_RUNTIME/);await f.page.evaluate(()=>{session.commercialRole='OWNER';});await assert.rejects(f.page.evaluate(()=>ZEZMS.cloudSync.shopRecovery.preflight()),/CLOUD_OR_SESSION_CHANGED/);movingHead=false;const report=await f.page.evaluate(()=>ZEZMS.cloudSync.shopRecovery.preflight());assert.equal(report.rows.length,3);
    assert.deepEqual(await f.page.evaluate(()=>({db:localStorage.getItem('tradeflow_v321_zola'),queue:localStorage.getItem('zezms_cloud_sync_m4_queue'),state:localStorage.getItem('zezms_cloud_sync_m4_state'),applied:localStorage.getItem('zezms_cloud_sync_m4_applied_v2')})),original);
    await f.page.exposeFunction('__archiveWrite',text=>fs.writeFileSync(file,text));await f.page.exposeFunction('__archiveRead',()=>fs.readFileSync(file,'utf8'));
    const archived=await f.page.evaluate(async()=>{const handle={createWritable:async()=>({write:async t=>window.__archiveWrite(t),close:async()=>{}}),getFile:async()=>({text:async()=>window.__archiveRead()})};window.__testArchiveHandle=handle;return ZEZMS.cloudSync.shopRecovery.saveArchive(handle,'synthetic sufficiently long archive passphrase');});
    assert.equal(archived.savedReadbackAndDecryptionVerified,true);assert.ok(fs.existsSync(file));
    const requestsBefore=reads.length;await f.context.setOffline(true);
    await f.page.evaluate(()=>ZEZMS.cloudSync.shopRecovery.quarantine('QUARANTINE EXACT THREE'));
    assert.equal(reads.length,requestsBefore);assert.equal(await f.page.evaluate(()=>localStorage.getItem('zezms_cloud_sync_m4_queue')),'[]');assert.equal(await f.page.evaluate(()=>localStorage.getItem('tradeflow_v321_zola')),original.db);
    await f.context.setOffline(false);
    await f.page.evaluate(()=>ZEZMS.cloudSync.shopRecovery.prepareReceive());
    await assert.rejects(f.page.evaluate(()=>ZEZMS.cloudSync.shopRecovery.receive('RECEIVE ONLY')),/FRESH_FULL_RECEIVE_BACKUP_REQUIRED/);
    await f.page.evaluate(()=>ZEZMS.cloudSync.shopRecovery.saveArchive(window.__testArchiveHandle,'synthetic sufficiently long archive passphrase'));
    await f.page.evaluate(()=>ZEZMS.cloudSync.shopRecovery.receive('RECEIVE ONLY'));
    const audited=await f.page.evaluate(()=>ZEZMS.cloudSync.shopRecovery.verifyCurrent());assert.equal(audited.walletsEqual,true);assert.equal(audited.queueCount,0);
    const readiness=await f.page.evaluate(()=>ZEZMS.cloudSync.shopRecovery.activationReadiness());assert.equal(readiness.walletsEqual,true);assert.equal(readiness.activationAvailable,false);
    await assert.rejects(f.page.evaluate(()=>ZEZMS.cloudSync.shopRecovery.activateTrading('ACTIVATE SHOP TRADING')),/TRADING_ACTIVATION_DISABLED/);
    assert.equal(await f.page.evaluate(()=>JSON.parse(localStorage.getItem('zezms_shop_directory_recovery_v1')).phase),'VERIFIED_HOLD');
    assert.ok(reads.every(r=>r.method==='GET'||r.method==='OPTIONS'||r.method==='POST'&&['/rest/v1/rpc/zezms_m43_checkpoint_latest','/rest/v1/rpc/zezms_m5a4_canonical_fleet_read'].includes(r.path)));
    assert.ok(!JSON.stringify(report).includes('synthetic-token-never-production'));
    const after=await f.page.evaluate(()=>({state:ZEZMS.cloudSync.getState(),balance:DB.cashBalances.Others,held:ZEZMS.cloudSync.getDirectoryOutboxReview().required}));assert.equal(after.state.deviceId,core.DEVICE);assert.equal(after.state.cursor,2);assert.equal(after.balance,(Number(bundle.db.cashBalances.Others)||0)+5);assert.equal(after.state.liveSyncEnabled,false);assert.equal(after.held,true);
    const durableBeforeUpdate=await f.page.evaluate(()=>({queue:localStorage.getItem('zezms_cloud_sync_m4_queue'),journal:localStorage.getItem('zezms_shop_directory_recovery_v1'),db:localStorage.getItem('tradeflow_v321_zola')}));workerGeneration++;await f.page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});await f.page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting);assert.deepEqual(await f.page.evaluate(()=>({queue:localStorage.getItem('zezms_cloud_sync_m4_queue'),journal:localStorage.getItem('zezms_shop_directory_recovery_v1'),db:localStorage.getItem('tradeflow_v321_zola')})),durableBeforeUpdate);await f.page.reload();await f.page.waitForFunction(()=>ZEZMS.cloudSync?.shopRecovery);await f.page.evaluate(async()=>{await ZEZMS.cloudSync.start(false);window.dispatchEvent(new Event('online'));});assert.equal(await f.page.evaluate(()=>ZEZMS.cloudSync.getDirectoryOutboxReview().required),true);
    assert.ok(!reads.some(r=>r.path.endsWith('zezms_ops_push')));
    // Independent restoration in a second disposable browser profile. Only
    // synthetic post-receive storage is transferred; the local journal is lost.
    const snapshot=await f.page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(k=>k!=='zezms_shop_directory_recovery_v1').map(k=>[k,localStorage.getItem(k)])));
    const disposable=await browser.newContext();try{
      const tab=await disposable.newPage();await disposable.route('**/*',r=>new URL(r.request().url()).origin===f.origin?r.continue():r.abort());
      await tab.addInitScript(snapshot=>{if(localStorage.getItem('__external_restore_fixture'))return;for(const [k,v]of Object.entries(snapshot))localStorage.setItem(k,v);localStorage.setItem('__external_restore_fixture','1');},snapshot);
      await tab.goto(f.origin+'/index.html');await tab.waitForFunction(()=>window.ZEZMS?.cloudSync?.shopRecovery&&window.ZEZMS?.staffAuth);
      await tab.evaluate(async()=>{await navigator.serviceWorker.register('./sw.js');await navigator.serviceWorker.ready;});await tab.reload();await tab.waitForFunction(()=>window.ZEZMS?.staffAuth&&window.ZEZMS?.cloudSync?.shopRecovery);
      if(await tab.evaluate(()=>ZEZMS.staffAuth.getContext().role!=='OWNER')){await tab.locator('#sharedLoginUser').selectOption('owner-staff-synthetic');await tab.locator('#sharedLoginPassword').fill('synthetic-owner-password');await tab.evaluate(()=>ZEZMS.staffAuth.signInFromLogin());}
      await tab.waitForFunction(()=>ZEZMS.staffAuth.getContext().role==='OWNER');await tab.exposeFunction('__readIndependentBackup',()=>fs.readFileSync(file,'utf8'));await disposable.setOffline(true);
      await tab.evaluate(async()=>{const a=ZEZMS.cloudSync.shopRecovery;await a.verifyArchive({text:()=>window.__readIndependentBackup()},'synthetic sufficiently long archive passphrase');await a.restoreExternal('RESTORE VERIFIED EXTERNAL BACKUP');});
      const restored=await tab.evaluate(()=>({db:JSON.parse(localStorage.getItem('tradeflow_v321_zola')),state:ZEZMS.cloudSync.getState(),queue:localStorage.getItem('zezms_cloud_sync_m4_queue'),journal:JSON.parse(localStorage.getItem('zezms_shop_directory_recovery_v1'))}));
      assert.equal(restored.queue,original.queue);assert.equal(restored.state.deviceId,core.DEVICE);assert.equal(restored.state.cursor,1);assert.equal(restored.state.liveSyncEnabled,false);assert.deepEqual(restored.db.cashBalances,JSON.parse(original.db).cashBalances);assert.equal(restored.journal.externalRestoration,true);
    }finally{await disposable.close();}
  }finally{await f.context.close();fs.rmSync(file,{force:true});fs.rmdirSync(dir);}
});
test('isolated approved activation releases posting only after verified hold and leaves Live Sync off',async()=>{
  activationVariant=true;let f;
  try{
    f=await setup();
    const bundle=await f.page.evaluate(()=>{const db=JSON.parse(JSON.stringify(DB));db.sharedDeviceDirectory.updatedAt='2026-10-18T00:00:00Z';return {db,hash:ZEZMS.managedDevices._test.legacyCheckpointHash(db)};});
    await f.context.unroute('**/*');const requests=[];
    await f.context.route('**/*',route=>{
      const u=new URL(route.request().url());if(u.origin===f.origin)return route.continue();
      requests.push({method:route.request().method(),path:u.pathname});
      if(u.origin!=='https://ruadyqcsutfprrxdaahi.supabase.co')return route.abort();
      if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':f.origin,'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'apikey,authorization,accept,content-type'}});
      let data;
      if(u.pathname==='/auth/v1/user')data={id:'synthetic-owner',is_anonymous:false};
      else if(u.pathname.endsWith('/zezms_m43_checkpoint_latest'))data=[{checkpoint_id:'synthetic-cp',checkpoint_cursor:1,payload:bundle.db,payload_hash:bundle.hash,protocol_version:'M4/3'}];
      else if(u.pathname.endsWith('/zezms_m5a4_canonical_fleet_read'))data=[{device_id:core.DEVICE,lifecycle_id:'synthetic-life',lifecycle_state:'ACTIVE',authentication_eligible:true,device_access_status:'ACTIVE',device_access_revoked_at:null}];
      else if(u.pathname.endsWith('/zezms_device_lifecycle'))data=[{id:'synthetic-life',device_id:core.DEVICE,owner_id:'synthetic-owner',business_id:'synthetic-business',lifecycle_state:'ACTIVE',revision:1}];
      else if(u.pathname.endsWith('/zezms_sync_state'))data=[{owner_id:'synthetic-owner',sync_mode:'operations',revision:1,operation_cursor:1}];
      else if(u.pathname.endsWith('/zezms_sync_operations'))data=u.searchParams.has('op_id')?[]:u.searchParams.get('select')==='seq'?[{seq:1}]:[];
      else throw Error('Unexpected cloud endpoint '+u.pathname);
      return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':f.origin},body:JSON.stringify(data)});
    });
    const report=await f.page.evaluate(()=>ZEZMS.cloudSync.shopRecovery.preflight());assert.equal(report.dispositionEligible,true);
    await f.page.evaluate(async()=>{window.__testShopArchive='';window.__testShopHandle={createWritable:async()=>({write:async text=>{window.__testShopArchive=text;},close:async()=>{}}),getFile:async()=>({text:async()=>window.__testShopArchive})};await ZEZMS.cloudSync.shopRecovery.saveArchive(window.__testShopHandle,'synthetic sufficiently long archive passphrase');});
    await f.context.setOffline(true);await f.page.evaluate(()=>ZEZMS.cloudSync.shopRecovery.quarantine('QUARANTINE EXACT THREE'));
    await f.context.setOffline(false);
    await f.page.evaluate(async()=>{await ZEZMS.cloudSync.shopRecovery.prepareReceive();await ZEZMS.cloudSync.shopRecovery.saveArchive(window.__testShopHandle,'synthetic sufficiently long archive passphrase');await ZEZMS.cloudSync.shopRecovery.receive('RECEIVE ONLY');});
    const readiness=await f.page.evaluate(()=>ZEZMS.cloudSync.shopRecovery.activationReadiness());assert.equal(readiness.walletsEqual,true);assert.equal(readiness.activationAvailable,true);
    // Record synthetic queue *shapes* around activation; never output payload values.
    const queueShape=()=>ZEZMS.cloudSync.getOutbox().map(o=>({kind:String(o.kind||''),reason:String(o.reason||''),patches:(o.patches||[]).map(p=>({action:p.action,root:p.root||'',collection:p.collection||''}))}));
    const beforeActivation=await f.page.evaluate(queueShape);
    const activated=await f.page.evaluate(()=>ZEZMS.cloudSync.shopRecovery.activateTrading('ACTIVATE SHOP TRADING'));assert.equal(activated.tradingActive,true);
    const afterActivation=await f.page.evaluate(queueShape);
    const posted=await f.page.evaluate(()=>{
      const api=ZEZMS.cloudSync,before=api.getOutbox().length;
      DB.settings.syntheticTradingReadiness='review-only-synthetic';
      saveDB();
      return {held:api.isShopDirectoryRecoveryHeld(),ready:api.isReadyForLocalOperations(),before,beforeRows:api.getOutbox().slice(0,before).map(o=>({kind:String(o.kind||''),reason:String(o.reason||''),patches:(o.patches||[]).map(p=>({action:p.action,root:p.root||'',collection:p.collection||''}))})),queue:api.getOutbox().map(o=>({opId:o.opId,kind:o.kind})),state:api.getState(),phase:JSON.parse(localStorage.getItem('zezms_shop_directory_recovery_v1')).phase};
    });
    assert.equal(posted.held,false);assert.equal(posted.ready,true);assert.equal(posted.phase,'TRADING_ACTIVE');
    assert.equal(posted.before,0,'UNEXPECTED_SYNTHETIC_PREEXISTING_QUEUE '+JSON.stringify({beforeActivation,afterActivation,beforeSave:posted.beforeRows}));
    assert.equal(posted.queue.length,1);assert.ok(!core.IDS.includes(posted.queue[0].opId));
    assert.equal(posted.state.liveSyncEnabled,false);assert.ok(!requests.some(r=>r.path.endsWith('zezms_ops_push')));
    await f.page.reload();await f.page.waitForFunction(()=>window.ZEZMS?.cloudSync?.getState?.().deviceId==='197e3568-5a89-4a56-b9d0-07f5e8248734');
    assert.equal(await f.page.evaluate(()=>ZEZMS.cloudSync.isShopDirectoryRecoveryHeld()),false);
    assert.equal(await f.page.evaluate(()=>ZEZMS.cloudSync.getOutbox().length),1);
  }finally{activationVariant=false;if(f)await f.context.close();}
});
