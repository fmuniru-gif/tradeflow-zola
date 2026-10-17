const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const playwright=require(process.env.PLAYWRIGHT_CORE_PATH||'playwright-core');
const root=path.resolve(__dirname,'..');
const origin='https://fmuniru-gif.github.io';
const project='https://ruadyqcsutfprrxdaahi.supabase.co';
const routePath='/tradeflow-zola/diagnostics/main-cash-input-compare/';
const main='9a5ab8eb-f67e-425c-866d-574b641295f0';
let browser;
after(async()=>{if(browser)await browser.close();});

test('bundled current projector is byte-for-byte the production embedded module',()=>{
  const shell=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const match=shell.match(/const INTEGRITY_B64=\s*([\s\S]*?)\s*;\s*const /);
  assert.ok(match);
  const encoded=[...match[1].matchAll(/"([A-Za-z0-9+/=]+)"/g)].map(item=>item[1]).join('');
  const embedded=Buffer.from(encoded,'base64');
  const bundled=fs.readFileSync(path.join(root,
    'diagnostics/main-cash-input-compare/integrity-r60o.js'));
  assert.deepEqual(bundled,embedded);
});

async function setup(options={}){
  if(!browser)browser=await playwright.chromium.launch({headless:true,
    executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
  const context=await browser.newContext({acceptDownloads:true});
  const tab=await context.newPage();
  const record={id:'SYNTHETIC-CASH-1',amount:1,action:'Deduct'};
  const database={cashLog:[record],expenses:[],cashBalances:{'Cash in Hand':10}};
  const masterDatabase={cashLog:[],expenses:[],cashBalances:{'Cash in Hand':11}};
  const state={deviceId:options.wrongDevice?'synthetic-shop':main,deviceAccessMode:'OWNER',
    cursor:3,supabaseUrl:project,publishableKey:'sb_publishable_synthetic_for_tests'};
  const raw={tradeflow_v321_zola:JSON.stringify(database),
    zezms_cloud_sync_m4_state:JSON.stringify(state),zezms_cloud_sync_m4_queue:'[]',
    zezms_cloud_sync_m4_applied_v2:'{}'};
  await tab.addInitScript(({raw,origin})=>{
    if(location.origin!==origin)return;
    for(const [key,value] of Object.entries(raw))localStorage.setItem(key,value);
    localStorage.setItem('zezms-m3-supabase-auth',JSON.stringify({access_token:'synthetic-token',
      expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'synthetic-owner',is_anonymous:false}}));
    window.__writes=[];
    for(const method of ['setItem','removeItem','clear']){
      const original=Storage.prototype[method];
      Storage.prototype[method]=function(...args){window.__writes.push(method);return original.apply(this,args);};
    }
  },{raw,origin});
  const requests=[];let headReads=0;
  await tab.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin===origin){
      const name=url.pathname.endsWith('/')?'diagnostics/main-cash-input-compare/index.html':
        url.pathname.replace(/^\/tradeflow-zola\//,'');
      const file=path.join(root,name);
      if(!fs.existsSync(file)){await route.fulfill({status:404,body:'missing synthetic route'});return;}
      const type=name.endsWith('.js')?'application/javascript':
        name.endsWith('.css')?'text/css':'text/html';
      const bytes=fs.readFileSync(file);
      // Git stores this unchanged legacy source with LF even on a CRLF checkout.
      const body=name==='js/sync-integrity-v3161.js'
        ?Buffer.from(bytes.toString('utf8').replace(/\r\n/g,'\n')):bytes;
      await route.fulfill({status:200,contentType:type,body});return;
    }
    if(url.origin===project){
      requests.push({method:route.request().method(),path:url.pathname});
      if(route.request().method()==='OPTIONS'){
        await route.fulfill({status:204,headers:{'access-control-allow-origin':origin,
          'access-control-allow-methods':'GET, POST, OPTIONS',
          'access-control-allow-headers':'apikey,authorization,accept,content-type'}});return;
      }
      let data;
      if(url.pathname==='/auth/v1/user')data={id:'synthetic-owner',is_anonymous:false,
        app_metadata:{provider:'email'}};
      else if(url.pathname==='/rest/v1/rpc/zezms_m43_checkpoint_latest')
        data={checkpoint_id:'SYNTHETIC',checkpoint_cursor:3,protocol_version:'M4/3',
          payload:database,payload_hash:'synthetic'};
      else if(url.pathname==='/rest/v1/zezms_sync_state')data=[{owner_id:'synthetic-owner',
        payload:masterDatabase,revision:1,operation_cursor:3,sync_mode:'operations'}];
      else if(url.pathname==='/rest/v1/zezms_sync_operations'){
        headReads++;data=[{seq:options.changingHead&&headReads>1?4:3}];
      }else{await route.fulfill({status:404,body:'unknown read'});return;}
      await route.fulfill({status:200,contentType:'application/json',
        headers:{'access-control-allow-origin':origin},body:JSON.stringify(data)});return;
    }
    await route.abort();
  });
  await tab.goto(origin+routePath);
  return {tab,context,requests,raw};
}

test('actual embedded production and r3 modules isolate the cloud baseline without a write',async()=>{
  const {tab,context,requests}=await setup();
  try{
    await tab.locator('#run').click();
    await tab.waitForFunction(()=>document.querySelector('#result').hidden===false);
    const result=JSON.parse(await tab.locator('#report').textContent());
    assert.equal(result.stages.firstDivergentStage,'CLOUD_BASELINE');
    assert.equal(result.comparisons.normalInputEquivalent.totals.missingInCloud,0);
    assert.equal(result.comparisons.r3Standalone.totals.missingInCloud,1);
    assert.equal(result.cloud.head,3);
    assert.equal(result.local.collections.cashLog.count,1);
    assert.ok(result.local.collections.cashLog.sha256.match(/^[a-f0-9]{64}$/));
    assert.equal(await tab.evaluate(()=>window.__writes.length),0);
    assert.equal(await tab.evaluate(()=>typeof window.ZEZMS.syncIntegrity.applySafeMissingLocal),'undefined');
    assert.ok(requests.every(x=>x.method==='GET'||x.method==='OPTIONS'||
      x.method==='POST'&&x.path==='/rest/v1/rpc/zezms_m43_checkpoint_latest'));
    assert.equal(await tab.locator('#repair').count(),0);
    assert.ok(!JSON.stringify(result).includes('SYNTHETIC-CASH-1'));
    assert.ok(!JSON.stringify(result).includes('synthetic-token'));
  }finally{await context.close();}
});

test('wrong device stops before any cloud request or write',async()=>{
  const {tab,context,requests}=await setup({wrongDevice:true});
  try{
    await tab.locator('#run').click();
    await tab.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('STOP:'));
    assert.match(await tab.locator('#status').textContent(),/NOT_MAIN_DEVICE/);
    assert.equal(requests.length,0);
    assert.equal(await tab.evaluate(()=>window.__writes.length),0);
  }finally{await context.close();}
});

test('changing cloud head fails closed and leaves Main storage untouched',async()=>{
  const {tab,context}=await setup({changingHead:true});
  try{
    await tab.locator('#run').click();
    await tab.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('STOP:'));
    assert.match(await tab.locator('#status').textContent(),/CLOUD_CHANGED_DURING_COMPARISON/);
    assert.equal(await tab.evaluate(()=>window.__writes.length),0);
  }finally{await context.close();}
});

test('normal-app snapshot distinguishes runtime from persisted database without displaying records',async()=>{
  const {tab,context}=await setup();
  try{
    const snapshot=await tab.evaluate(({main})=>{
      const current=window.ZEZMSMainAuditR60o;
      const collections={};
      for(const name of window.ZEZMSMainAuditInputCore.COLLECTIONS){
        collections[name]={records:[]};
      }
      const value={format:current.format,module:{version:current.version,build:current.build},
        generatedAt:'2026-10-17T00:00:00Z',device:{deviceId:main,cursor:3},collections};
      value.snapshotHash=current.test.fingerprint(value);
      return JSON.stringify(value);
    },{main});
    await tab.locator('#snapshot').setInputFiles({name:'synthetic-snapshot.json',
      mimeType:'application/json',buffer:Buffer.from(snapshot)});
    await tab.locator('#run').click();
    await tab.waitForFunction(()=>document.querySelector('#result').hidden===false);
    const report=JSON.parse(await tab.locator('#report').textContent());
    assert.equal(report.stages.firstDivergentStage,'RUNTIME_VERSUS_PERSISTED_LOCAL');
    assert.deepEqual(report.stages.snapshot.differingCollections,['cashLog']);
    assert.equal(report.local.runtimeSnapshot.collections.cashLog.runtimeCount,0);
    assert.equal(await tab.evaluate(()=>window.__writes.length),0);
  }finally{await context.close();}
});
