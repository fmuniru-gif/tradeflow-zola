const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const playwright=require(process.env.PLAYWRIGHT_CORE_PATH||'playwright-core');
const recoveryCore=require('../js/shop-directory-recovery-core.js');
const root=path.resolve(__dirname,'..');
const release='20261022-shop-chrome-directory-chain-r70w-v1';
const oldCache='zezms-shop-directory-recovery-v2';
const newCache='zezms-shop-chrome-directory-chain-20261022-v1';
let mismatchedManifest=false;
let serveBaseline=false;
const baseline='a323d78da4559fe13f082cf172932ce6e7a93adb';
const priorAssets=new Map(['index.html','sw.js','manifest.json'].map(name=>[name,execFileSync('git',['show',baseline+':'+name],{cwd:root,maxBuffer:32*1024*1024})]));
const server=http.createServer((request,response)=>{
  let pathname=new URL(request.url,'http://localhost').pathname;
  if(pathname.endsWith('/'))pathname+='index.html';
  const file=path.resolve(root,'.'+pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){response.writeHead(404);response.end();return;}
  response.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.json')?'application/json':file.endsWith('.html')?'text/html':'application/octet-stream');
  if(pathname==='/manifest.json'&&mismatchedManifest){const data=JSON.parse(fs.readFileSync(file,'utf8'));data.start_url='./index.html?build=stale-worker-mismatch';response.end(JSON.stringify(data));return;}
  if(serveBaseline&&priorAssets.has(path.basename(file))&&['/','/index.html','/sw.js','/manifest.json'].includes(new URL(request.url,'http://localhost').pathname)){response.end(priorAssets.get(path.basename(file)));return;}
  response.end(fs.readFileSync(file));
});

test('mixed shell and manifest cannot activate the new worker',async()=>{
  const f=await setup();
  mismatchedManifest=true;
  try{
    await f.page.goto(f.origin+'/FORCE_UPDATE_MOBILE.html');
    await f.page.evaluate(async release=>{try{await navigator.serviceWorker.register('./sw.js?v='+release);}catch(_){}},release);
    await f.page.waitForTimeout(1400);
    const state=await f.page.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();return {active:!!registration?.active,controller:!!navigator.serviceWorker.controller};});
    assert.equal(state.active,false);
    assert.equal(state.controller,false);
  }finally{mismatchedManifest=false;await f.context.close();}
});
let browser;
after(async()=>{if(browser)await browser.close();if(server.listening)await new Promise(resolve=>server.close(resolve));});
async function setup(){
  if(!server.listening)await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  if(!browser)browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
  const context=await browser.newContext(),requests=[],origin='http://127.0.0.1:'+server.address().port;
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===origin)return route.continue();requests.push({method:route.request().method(),path:url.pathname});return route.abort();});
  const page=await context.newPage();
  return {context,page,requests,origin};
}
async function ready(page){
  await page.waitForFunction(()=>document.documentElement.getAttribute('data-zezms-release')==='v3.31.19-prebranch-functional'&&window.ZEZMS?.cloudSync&&window.ZEZMS?.staffAuth&&window.ZEZMS?.managedDevices,null,{timeout:15000});
}

test('cold and older-cache startup use the matched protected shell without branch management',async()=>{
  const f=await setup();
  try{
    await f.page.goto(f.origin+'/FORCE_UPDATE_MOBILE.html');
    await f.page.evaluate(async oldCache=>{
      const cache=await caches.open(oldCache);
      await cache.put(new Request(location.origin+'/index.html'),new Response('<html>old protected shell</html>',{headers:{'Content-Type':'text/html'}}));
    },oldCache);
    await f.page.goto(f.origin+'/index.html');
    await ready(f.page);
    await f.page.evaluate(async()=>{await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('worker timeout')),10000))]);});
    const before=await f.page.evaluate(async({oldCache,newCache,release})=>{
      const names=await caches.keys();
      const cache=await caches.open(newCache);
      const shell=await cache.match(location.origin+'/index.html');
      return {names,matchedShell:!!shell&&(await shell.text()).includes('const RELEASE="'+release+'";'),branchApi:!!window.ZEZMS.branchManagement,branchCard:window.viewSettings().includes('data-zezms-branch-management'),pdf:!!document.querySelector('script[data-zezms-account-cash-pdf-r68e]'),kpi:!!document.querySelector('script[data-zezms-kpi-charts-compact-r68e]'),print:!!document.querySelector('script[data-zezms-pdf-export-r67r]')};
    },{oldCache,newCache,release});
    assert.ok(before.names.includes(oldCache));
    assert.ok(before.names.includes(newCache));
    assert.equal(before.matchedShell,true);
    assert.equal(before.branchApi,false);
    assert.equal(before.branchCard,false);
    assert.equal(before.pdf,true);assert.equal(before.kpi,true);assert.equal(before.print,true);
    await f.page.reload();await ready(f.page);
    assert.equal(await f.page.evaluate(()=>!!window.ZEZMS.branchManagement),false);
    assert.equal(await f.page.evaluate(()=>document.documentElement.getAttribute('data-zezms-release')),'v3.31.19-prebranch-functional');
    assert.ok(!f.requests.some(x=>x.path.endsWith('/zezms_ops_push')));
  }finally{await f.context.close();}
});

test('synthetic Main business records and local Owner access survive initialization',async()=>{
  const f=await setup();
  try{
    await f.page.goto(f.origin+'/index.html');await ready(f.page);
    const salt=Buffer.alloc(16,7),password='synthetic-owner-password';
    const owner={id:'synthetic-main-owner',name:'Synthetic Owner',tel:'',role:'OWNER',active:true,passwordAlgorithm:'PBKDF2-SHA256',passwordIterations:210000,passwordSalt:salt.toString('base64'),passwordHash:crypto.pbkdf2Sync(password,salt,210000,32,'sha256').toString('base64'),createdAt:'2026-10-20T00:00:00Z',updatedAt:'2026-10-20T00:00:00Z'};
    const seed=await f.page.evaluate(owner=>{
      const db=JSON.parse(JSON.stringify(DB));
      db.sharedDeviceAuth={version:1,enabled:true,businessId:'synthetic-business',users:[owner],audit:[]};
      db.sharedDeviceDirectory={version:1,businessId:'synthetic-business',enabled:true,updatedAt:'2026-10-20T00:00:00Z',users:[owner]};
      db.sales.push({id:'synthetic-preserved-sale',total:125,createdAt:'2026-10-20T00:00:00Z'});
      db.cashLog.push({id:'synthetic-preserved-cash',amount:25,type:'Cash in Hand',createdAt:'2026-10-20T00:00:00Z'});
      db.cashBalances['Cash in Hand']=1234;
      // This fixture represents an established, already reconciled Main device.
      // Keep historical KPI and current-month rollover from racing this PDF check.
      const july=ZEZMSConfirmedJulySnapshot.values;
      db.kpiHistory.push({id:'KPI-202607-CONFIRMED',year:2026,month:7,debt:july.debt,
        creditors:july.creditors,deposits:july.deposits,cashBuckets:july.cashBuckets,
        confirmedClosing:true,confirmationSource:'User-confirmed July 2026 closing balances',
        correctionRelease:'3.4.23',snapshotVersion:3,automatic:false});
      const now=new Date();db.monthRollovers=db.monthRollovers||[];
      db.monthRollovers.push({id:'synthetic-current-month',targetYear:now.getFullYear(),targetMonth:now.getMonth()+1});
      const state={...ZEZMS.cloudSync.getState(),deviceId:'9a5ab8eb-f67e-425c-866d-574b641295f0',deviceName:'ZEZMS Main synthetic',deviceAccessMode:'OWNER',syncOwnerId:'synthetic-owner',businessId:'synthetic-business',initialized:true,cursor:1,liveSyncEnabled:false,liveSyncDesired:false,supabaseUrl:'',publishableKey:''};
      return {db:JSON.stringify(db),state:JSON.stringify(state),queue:'[]',applied:'{}'};
    },owner);
    await f.page.addInitScript(seed=>{
      if(localStorage.getItem('__synthetic_main_seed_complete'))return;
      localStorage.setItem('tradeflow_v321_zola',seed.db);
      localStorage.setItem('zezms_cloud_sync_m4_state',seed.state);
      localStorage.setItem('zezms_cloud_sync_m4_queue',seed.queue);
      localStorage.setItem('zezms_cloud_sync_m4_applied_v2',seed.applied);
      localStorage.setItem('__synthetic_main_seed_complete','1');
    },seed);
    await f.page.reload();await ready(f.page);
    const initial=await f.page.evaluate(()=>({sale:DB.sales.find(x=>x.id==='synthetic-preserved-sale'),cash:DB.cashLog.find(x=>x.id==='synthetic-preserved-cash'),wallet:DB.cashBalances['Cash in Hand'],queue:ZEZMS.cloudSync.getOutbox().map(x=>x.kind),state:ZEZMS.cloudSync.getState()}));
    assert.ok(initial.sale);assert.ok(initial.cash);assert.equal(initial.wallet,1234);
    assert.ok(!initial.queue.some(x=>x==='DATABASE_CHANGE'));
    assert.equal(initial.state.liveSyncEnabled,false);
    await f.page.locator('#sharedLoginUser').selectOption(owner.id);
    await f.page.locator('#sharedLoginPassword').fill(password);
    await f.page.evaluate(()=>ZEZMS.staffAuth.signInFromLogin());
    await f.page.waitForFunction(()=>ZEZMS.staffAuth.getContext().role==='OWNER');
    await f.page.evaluate(()=>nav('settings'));
    const after=await f.page.evaluate(()=>({sale:DB.sales.find(x=>x.id==='synthetic-preserved-sale'),cash:DB.cashLog.find(x=>x.id==='synthetic-preserved-cash'),wallet:DB.cashBalances['Cash in Hand'],queue:ZEZMS.cloudSync.getOutbox().map(x=>x.kind),owner:ZEZMS.staffAuth.getContext().role,branchCard:document.body.textContent.includes('Add branch')}));
    assert.deepEqual(after.sale,initial.sale);assert.deepEqual(after.cash,initial.cash);assert.equal(after.wallet,1234);
    assert.equal(after.owner,'OWNER');assert.equal(after.branchCard,false);
    assert.ok(!after.queue.some(x=>x==='DATABASE_CHANGE'));
    const print=await f.page.evaluate(async()=>{
      const queueBefore=localStorage.getItem('zezms_cloud_sync_m4_queue');
      nav('cash');
      const report=await ZEZMS.accountCashPdfR68E.buildCashBalancesReport();
      return {signature:String.fromCharCode(...report.bytes.slice(0,4)),wallet:report.model.wallets.find(x=>x.key==='Cash in Hand')?.balance,queueUnchanged:localStorage.getItem('zezms_cloud_sync_m4_queue')===queueBefore,cashRoute:document.body.textContent.includes('Download Cash Report PDF')};
    });
    assert.equal(print.signature,'%PDF');
    assert.equal(print.wallet,1234);
    assert.equal(print.queueUnchanged,true);
    assert.equal(print.cashRoute,true);
    assert.ok(!f.requests.some(x=>x.path.endsWith('/zezms_ops_push')));
  }finally{await f.context.close();}
});

test('synthetic Camon identities and paused sync survive startup without cloud mutation',async()=>{
  for(const deviceId of ['499b7dcf-9552-4337-929b-95828263b6db','4f95591d-8a5a-4866-a009-74b50bfe32f0']){
    const f=await setup();
    try{
      await f.page.goto(f.origin+'/index.html');await ready(f.page);
      const seed=await f.page.evaluate(({deviceId,collections})=>({
        db:(()=>{const db=JSON.parse(localStorage.getItem('tradeflow_v321_zola'));for(const key of collections)if(!Array.isArray(db[key]))db[key]=[];return JSON.stringify(db);})(),
        state:JSON.stringify({...ZEZMS.cloudSync.getState(),deviceId,deviceName:'Synthetic phone',deviceAccessMode:'PAIRED',syncOwnerId:'synthetic-owner',businessId:'synthetic-business',initialized:true,cursor:500,liveSyncEnabled:false,liveSyncDesired:false,supabaseUrl:'',publishableKey:''}),
        queue:'[]'
      }),{deviceId,collections:recoveryCore.COLLECTIONS});
      await f.page.addInitScript(seed=>{
        if(localStorage.getItem('__synthetic_phone_seed_complete'))return;
        localStorage.setItem('tradeflow_v321_zola',seed.db);
        localStorage.setItem('zezms_cloud_sync_m4_state',seed.state);
        localStorage.setItem('zezms_cloud_sync_m4_queue',seed.queue);
        localStorage.setItem('__synthetic_phone_seed_complete','1');
      },seed);
      await f.page.reload();await ready(f.page);
      const result=await f.page.evaluate(()=>({state:ZEZMS.cloudSync.getState(),queue:localStorage.getItem('zezms_cloud_sync_m4_queue'),db:localStorage.getItem('tradeflow_v321_zola'),branchApi:!!ZEZMS.branchManagement}));
      assert.equal(result.state.deviceId,deviceId);
      assert.equal(result.state.cursor,500);
      assert.equal(result.state.liveSyncEnabled,false);
      assert.equal(result.queue,'[]');
      assert.equal(result.db,seed.db);
      assert.equal(result.branchApi,false);
      assert.ok(!f.requests.some(x=>x.path.endsWith('/zezms_ops_push')));
    }finally{await f.context.close();}
  }
});

test('an existing controlled r70V cache upgrades after old tabs close without cache deletion',async()=>{
  const f=await setup();
  serveBaseline=true;
  try{
    await f.page.goto(f.origin+'/index.html');
    await f.page.waitForFunction(()=>document.documentElement.getAttribute('data-zezms-release')==='v3.31.19-r70v-diagnostic');
    await f.page.evaluate(async()=>{await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('old worker timeout')),10000))]);});
    serveBaseline=false;
    await f.page.evaluate(async release=>{await navigator.serviceWorker.register('./sw.js?v='+release);},release);
    await f.page.waitForFunction(async()=>{const registration=await navigator.serviceWorker.getRegistration();return !!registration?.waiting;},null,{timeout:12000});
    await f.page.close();
    const next=await f.context.newPage();
    await next.goto(f.origin+'/FORCE_UPDATE_MOBILE.html');
    await next.waitForFunction(async()=>{const registration=await navigator.serviceWorker.getRegistration();return !!registration?.active?.scriptURL.includes('20261022-shop-chrome-directory-chain-r70w-v1');},null,{timeout:12000});
    await next.goto(f.origin+'/index.html');await ready(next);
    // Passive workers do not claim a page that began loading during activation.
    // A normal reload gives the newly active worker control without clearing data.
    if(!await next.evaluate(release=>navigator.serviceWorker.controller?.scriptURL.includes(release),release)){
      await next.reload();await ready(next);
    }
    await next.waitForFunction(release=>navigator.serviceWorker.controller?.scriptURL.includes(release),release,{timeout:12000});
    const result=await next.evaluate(async()=>({branchApi:!!window.ZEZMS.branchManagement,names:await caches.keys(),controller:navigator.serviceWorker.controller?.scriptURL}));
    assert.equal(result.branchApi,false);
    assert.ok(result.names.includes(oldCache),'old protected cache was deleted');
    assert.ok(result.names.includes(newCache),'new protected cache was not installed');
    assert.ok(result.controller?.includes(release));
    assert.ok(!f.requests.some(x=>x.path.endsWith('/zezms_ops_push')));
  }finally{serveBaseline=false;await f.context.close();}
});
