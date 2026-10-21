const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const crypto=require('node:crypto');
const playwright=require(process.env.PLAYWRIGHT_CORE_PATH||'playwright-core');
const root=path.resolve(__dirname,'..');
const release='v3.31.19-prebranch-functional';
const server=http.createServer((request,response)=>{
  const file=path.resolve(root,'.'+new URL(request.url,'http://localhost').pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){response.writeHead(404);response.end();return;}
  response.writeHead(200,{'content-type':file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':'application/octet-stream'});
  response.end(fs.readFileSync(file));
});
let browser;
async function page(){
  if(!server.listening)await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  if(!browser)browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
  const tab=await browser.newPage();
  await tab.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await tab.goto('http://127.0.0.1:'+server.address().port+'/index.html',{waitUntil:'domcontentloaded'});
  await tab.waitForFunction(expected=>document.documentElement.getAttribute('data-zezms-release')===expected&&
    window.ZEZMS?.bootstrapStartupGuard&&window.ZEZMS?.autoMonth&&window.ZEZMSConfirmedJulySnapshot&&window.ZEZMS?.shopChromeBootstrapProof,release,{timeout:20000});
  return tab;
}
after(async()=>{if(browser)await browser.close();if(server.listening)await new Promise(resolve=>server.close(resolve));});

test('fresh unbound shell cannot create a KPI or rollover operation',async()=>{
  const tab=await page();
  try{
    await tab.waitForTimeout(2300);
    const result=await tab.evaluate(()=>({allowed:ZEZMS.bootstrapStartupGuard.allowsAutomaticBusinessWrites(),
      queue:ZEZMS.cloudSync.getOutbox().length,kpi:(DB.kpiHistory||[]).length,
      rollover:(DB.monthRollovers||[]).length,
      scripts:Array.from(document.scripts).map(script=>script.getAttribute('src')).filter(Boolean),
      ensure:ZEZMS.autoMonth.ensure({silent:true}),apply:ZEZMSConfirmedJulySnapshot.apply()}));
    assert.equal(result.allowed,false);assert.equal(result.queue,0);assert.equal(result.kpi,0);
    assert.equal(result.rollover,0);assert.equal(result.ensure.deferred,true);assert.equal(result.apply,false);
    for(const name of ['bootstrap-startup-guard','auto-month-rollover-bootstrap-guard',
      'confirmed-july-snapshot-bootstrap-guard','shop-chrome-bootstrap-proof'])
      assert.equal(result.scripts.filter(source=>source.includes('/'+name+'.js?')).length,1,name);
    assert.ok(!result.scripts.some(source=>/\/(?:auto-month-rollover|confirmed-july-snapshot)\.js\?/.test(source)));
  }finally{await tab.close();}
});

test('staged and interrupted bootstrap stays write-locked across reload',async()=>{
  const tab=await page();
  try{
    const before=await tab.evaluate(()=>{
      const state=ZEZMS.cloudSync.getState();
      localStorage.setItem('zezms_m5a4_safe_bootstrap_stage_v1',JSON.stringify({version:1,deviceId:state.deviceId,lifecycleId:'synthetic-life',cursor:42,candidate:{}}));
      localStorage.setItem('zezms_m5a4_safe_bootstrap_journal_v2',JSON.stringify({version:2,deviceId:state.deviceId,lifecycleId:'synthetic-life',stage:'VERIFYING'}));
      localStorage.setItem('zezms_cloud_sync_m4_queue',JSON.stringify([{opId:'synthetic-preserved',kind:'DATABASE_CHANGE',patches:[{action:'insert',collection:'kpiHistory',value:{id:'unproven'}}]}]));
      return {stage:localStorage.getItem('zezms_m5a4_safe_bootstrap_stage_v1'),journal:localStorage.getItem('zezms_m5a4_safe_bootstrap_journal_v2'),queue:localStorage.getItem('zezms_cloud_sync_m4_queue')};
    });
    await tab.reload({waitUntil:'domcontentloaded'});
    await tab.waitForFunction(()=>window.ZEZMS?.autoMonth&&window.ZEZMSConfirmedJulySnapshot);
    await tab.waitForTimeout(1800);
    const after=await tab.evaluate(()=>({allowed:ZEZMS.bootstrapStartupGuard.allowsAutomaticBusinessWrites(),
      stage:localStorage.getItem('zezms_m5a4_safe_bootstrap_stage_v1'),journal:localStorage.getItem('zezms_m5a4_safe_bootstrap_journal_v2'),
      queue:localStorage.getItem('zezms_cloud_sync_m4_queue'),kpi:(DB.kpiHistory||[]).length,
      classification:ZEZMS.cloudSync._test.r70m.classifyOperation(ZEZMS.cloudSync.getOutbox()[0],{}).classification}));
    assert.equal(after.allowed,false);assert.equal(after.stage,before.stage);assert.equal(after.journal,before.journal);
    assert.equal(after.queue,before.queue);assert.equal(after.kpi,0);
    assert.notEqual(after.classification,'SAFE_SETUP_RESIDUE');
  }finally{await tab.close();}
});

test('enrolling, verifying, revoked and unknown paired states defer automatic writes',async()=>{
  const tab=await page();
  try{
    const outcomes=await tab.evaluate(()=>{
      const original=ZEZMS.cloudSync.getState;
      const base={deviceId:'synthetic-device',businessId:'synthetic-business',syncOwnerId:'synthetic-owner',
        initialized:true,deviceAccessMode:'PAIRED'};
      const result={};
      for(const lifecycle of ['ENROLLING','BOOTSTRAPPING','VERIFYING','REVOKED','RETIRED','', 'ACTIVE']){
        ZEZMS.cloudSync.getState=()=>Object.assign({},base,{deviceLifecycleState:lifecycle});
        result[lifecycle||'UNKNOWN']=ZEZMS.bootstrapStartupGuard.allowsAutomaticBusinessWrites();
      }
      ZEZMS.cloudSync.getState=original;
      return result;
    });
    for(const state of ['ENROLLING','BOOTSTRAPPING','VERIFYING','REVOKED','RETIRED','UNKNOWN'])
      assert.equal(outcomes[state],false,state);
    assert.equal(outcomes.ACTIVE,true);
  }finally{await tab.close();}
});

test('established ACTIVE device still runs confirmed KPI startup once',async()=>{
  const tab=await page();
  try{
    await tab.evaluate(()=>{
      const state=ZEZMS.cloudSync.getState();
      localStorage.setItem('zezms_cloud_sync_m4_state',JSON.stringify(Object.assign({},state,{initialized:true,businessId:'synthetic-business',syncOwnerId:'synthetic-owner',deviceAccessMode:'PAIRED',deviceLifecycleState:'ACTIVE',liveSyncEnabled:false})));
    });
    await tab.reload({waitUntil:'domcontentloaded'});
    await tab.waitForFunction(()=>window.ZEZMS?.bootstrapStartupGuard?.allowsAutomaticBusinessWrites(),null,{timeout:10000});
    await tab.waitForFunction(()=>(DB.kpiHistory||[]).some(row=>row.id==='KPI-202607-CONFIRMED'),null,{timeout:10000});
    const first=await tab.evaluate(()=>({kpi:DB.kpiHistory.filter(row=>row.id==='KPI-202607-CONFIRMED').length,
      queue:ZEZMS.cloudSync.getOutbox().length}));
    assert.equal(first.kpi,1);assert.ok(first.queue>=1);
    await tab.reload({waitUntil:'domcontentloaded'});
    await tab.waitForFunction(()=>window.ZEZMS?.autoMonth&&window.ZEZMSConfirmedJulySnapshot);
    const again=await tab.evaluate(()=>DB.kpiHistory.filter(row=>row.id==='KPI-202607-CONFIRMED').length);
    assert.equal(again,1);
  }finally{await tab.close();}
});

async function signedInEstablishedPage(mode,businessId){
  const tab=await page();
  const salt=Buffer.alloc(16,7),password='synthetic-owner-password';
  const owner={id:'synthetic-owner-staff',name:'Synthetic Owner',tel:'',role:'OWNER',active:true,
    passwordAlgorithm:'PBKDF2-SHA256',passwordIterations:210000,passwordSalt:salt.toString('base64'),
    passwordHash:crypto.pbkdf2Sync(password,salt,210000,32,'sha256').toString('base64'),
    createdAt:'2026-10-20T00:00:00Z',updatedAt:'2026-10-20T00:00:00Z'};
  const seed=await tab.evaluate(({owner,mode,businessId})=>{
    const db=JSON.parse(JSON.stringify(DB));
    db.sharedDeviceAuth={version:1,enabled:true,businessId:'synthetic-business',users:[owner],audit:[]};
    db.sharedDeviceDirectory={version:1,enabled:true,businessId:'synthetic-business',users:[owner],
      updatedAt:'2026-10-20T00:00:00Z'};
    const now=new Date();
    db.monthRollovers=[{id:'synthetic-current-month',targetYear:now.getFullYear(),targetMonth:now.getMonth()+1}];
    db.kpiHistory=[{id:'KPI-202607-CONFIRMED',year:2026,month:7,...ZEZMSConfirmedJulySnapshot.values,
      confirmedClosing:true,confirmationSource:'User-confirmed July 2026 closing balances',
      correctionRelease:'3.4.23',snapshotVersion:3,automatic:false}];
    const state={...ZEZMS.cloudSync.getState(),deviceId:'synthetic-established-'+mode.toLowerCase(),
      deviceAccessMode:mode,deviceLifecycleState:mode==='PAIRED'?'ACTIVE':'',
      businessId,syncOwnerId:'synthetic-cloud-owner',initialized:true,liveSyncEnabled:false};
    return {db:JSON.stringify(db),state:JSON.stringify(state)};
  },{owner,mode,businessId});
  await tab.addInitScript(seed=>{
    if(localStorage.getItem('__synthetic_trading_seed'))return;
    localStorage.setItem('tradeflow_v321_zola',seed.db);
    localStorage.setItem('zezms_cloud_sync_m4_state',seed.state);
    localStorage.setItem('zezms_cloud_sync_m4_queue','[]');
    localStorage.setItem('__synthetic_trading_seed','1');
  },seed);
  await tab.reload({waitUntil:'domcontentloaded'});
  await tab.waitForFunction(()=>window.ZEZMS?.staffAuth&&window.ZEZMS?.autoMonth);
  await tab.locator('#sharedLoginUser').selectOption(owner.id);
  await tab.locator('#sharedLoginPassword').fill(password);
  await tab.evaluate(()=>ZEZMS.staffAuth.signInFromLogin());
  await tab.waitForFunction(()=>ZEZMS.staffAuth.getContext().role==='OWNER');
  return tab;
}

for(const [mode,businessId] of [['OWNER',''],['PAIRED','synthetic-business']])
test('established '+mode+' trading reaches real stock-in and sales despite deferred automatic maintenance',async()=>{
  const tab=await signedInEstablishedPage(mode,businessId);
  try{
    const result=await tab.evaluate(async()=>{
      const guard=ZEZMS.bootstrapStartupGuard;
      const eligibility={automatic:guard.allowsAutomaticBusinessWrites(),trading:guard.allowsBusinessTransactions()};
      // Simulate a maintenance-only deferral; ordinary transactions must use
      // their own eligibility gate and the application's staff permissions.
      ZEZMS.bootstrapStartupGuard={...guard,allowsAutomaticBusinessWrites:()=>false};
      nav('stockin');
      document.getElementById('siNewName').value='Synthetic Trading Item';
      document.getElementById('siQty').value='2';
      document.getElementById('siCost').value='10';
      document.getElementById('siPrice').value='20';
      const before={stock:DB.stockRows.length,undo:DB.undoLog.length,
        queue:ZEZMS.cloudSync.getOutbox().length};
      await doStockIn();
      nav('pos');
      document.getElementById('posProduct').value='Synthetic Trading Item';
      document.getElementById('posQty').value='1';
      document.getElementById('posUPrice').value='20';
      await addItemToList();
      const cartCount=cart.length;
      await quickSaleOut();
      ZEZMS.bootstrapStartupGuard=guard;
      const row=DB.stockRows.find(entry=>entry.productName==='Synthetic Trading Item');
      return {eligibility,before,cartCount,remaining:row?.rStock,cartAfter:cart.length,
        stock:DB.stockRows.length,undo:DB.undoLog.length,queue:ZEZMS.cloudSync.getOutbox().length};
    });
    assert.deepEqual(result.eligibility,{automatic:true,trading:true});
    assert.equal(result.cartCount,1);
    assert.equal(result.stock,result.before.stock+1);
    assert.equal(result.remaining,1);
    assert.equal(result.cartAfter,0);
    assert.equal(result.undo,result.before.undo+2);
  }finally{await tab.close();}
});

test('staged bootstrap and Shop recovery hold reject manual trading and automatic writes',async()=>{
  const tab=await page();
  try{
    const staged=await tab.evaluate(()=>{
      const original=ZEZMS.cloudSync.getState;
      ZEZMS.cloudSync.getState=()=>({initialized:true,deviceId:'synthetic-staged',
        deviceAccessMode:'PAIRED',deviceLifecycleState:'ACTIVE',businessId:'synthetic-business',syncOwnerId:'synthetic-owner'});
      localStorage.setItem('zezms_m5a4_safe_bootstrap_stage_v1','{"synthetic":true}');
      const result={automatic:ZEZMS.bootstrapStartupGuard.allowsAutomaticBusinessWrites(),
        trading:ZEZMS.bootstrapStartupGuard.allowsBusinessTransactions(),
        transaction:addItemToList()};
      localStorage.removeItem('zezms_m5a4_safe_bootstrap_stage_v1');
      ZEZMS.cloudSync.getState=original;
      return result;
    });
    assert.deepEqual(staged,{automatic:false,trading:false,transaction:false});
    const held=await tab.evaluate(()=>{
      const cloud=ZEZMS.cloudSync,originalState=cloud.getState,originalHold=cloud.isShopDirectoryRecoveryHeld;
      cloud.getState=()=>({initialized:true,deviceId:'synthetic-held',deviceAccessMode:'OWNER',
        syncOwnerId:'synthetic-owner',businessId:''});
      cloud.isShopDirectoryRecoveryHeld=()=>true;
      const result={automatic:ZEZMS.bootstrapStartupGuard.allowsAutomaticBusinessWrites(),
        trading:ZEZMS.bootstrapStartupGuard.allowsBusinessTransactions(),transaction:doStockIn()};
      cloud.getState=originalState;cloud.isShopDirectoryRecoveryHeld=originalHold;
      return result;
    });
    assert.deepEqual(held,{automatic:false,trading:false,transaction:false});
  }finally{await tab.close();}
});

test('exact Shop Chrome proof is read-only and conceals payload values',async()=>{
  const tab=await page();
  try{
    const result=await tab.evaluate(async()=>{
      const deviceId='6229402b-947f-43b2-818f-143c3a27a1a0',lifecycleId='0820a9f3-9e62-45c8-ac81-c4e15f5a03a5';
      const op={opId:'95bab3c9-04dd-4cf2-b514-90d3964fbd31',deviceId,kind:'DATABASE_CHANGE',deviceSeq:1,
        createdAt:'2026-10-21T08:48:31.527Z',patches:[{action:'insert',collection:'kpiHistory',value:{id:'KPI-202607-CONFIRMED',secret:'customer-private'}}]};
      op.payloadHash=ZEZMS.cloudSync._test.deterministicHash(op);
      ZEZMS.managedDevices.hasVerifiedPendingStage=()=>true;
      ZEZMS.bootstrapPhaseA={inspect:()=>({status:'PRESENT',stage:{version:1,deviceId,lifecycleId,cursor:3642,attestedAt:'2026-10-21T08:53:29.329Z',candidate:{kpiHistory:[]}}})};
      ZEZMS.cloudSync.getState=()=>({deviceId,deviceAccessMode:'PAIRED'});
      ZEZMS.cloudSync.getOutbox=()=>[op];
      const before=JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(key=>[key,localStorage.getItem(key)])));
      const envelope=await ZEZMS.shopChromeBootstrapProof.inspect();
      const after=JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(key=>[key,localStorage.getItem(key)])));
      return {before,after,envelope};
    });
    const {report,integrity}=result.envelope;
    assert.equal(result.after,result.before);assert.equal(report.patchCount,1);
    assert.equal(report.payloadHashMatches,true);assert.equal(report.patches[0].confirmedJulyExact,false);
    assert.equal(report.patches[0].exactCandidateMatch,false);
    assert.ok(!JSON.stringify(result.envelope).includes('customer-private'));
    assert.equal(integrity.sha256,crypto.createHash('sha256').update(JSON.stringify(report)).digest('hex'));
  }finally{await tab.close();}
});

test('real verified pre-login stage exposes the proof button without changing the queue',async()=>{
  const tab=await page();
  try{
    const deviceId='6229402b-947f-43b2-818f-143c3a27a1a0',lifecycleId='0820a9f3-9e62-45c8-ac81-c4e15f5a03a5';
    await tab.evaluate(deviceId=>{
      const state=ZEZMS.cloudSync.getState();
      localStorage.setItem('zezms_cloud_sync_m4_state',JSON.stringify(Object.assign({},state,
        {deviceId,deviceAccessMode:'PAIRED',businessId:'synthetic-business',syncOwnerId:'synthetic-owner',
          initialized:false,liveSyncEnabled:false})));
    },deviceId);
    await tab.reload({waitUntil:'domcontentloaded'});
    await tab.waitForFunction(()=>window.ZEZMS?.convergence&&window.ZEZMS?.managedDevices);
    await tab.evaluate(({deviceId,lifecycleId})=>{
      const candidate=JSON.parse(JSON.stringify(DB));
      const stage={version:1,deviceId,lifecycleId,cursor:3642,candidate,
        fingerprint:ZEZMS.convergence.buildFingerprint(),attestedAt:'2026-10-21T08:53:29.329Z'};
      const journal={version:2,deviceId,lifecycleId,stage:'VERIFYING',lastVerifiedStage:'VERIFYING',replayCursor:3642};
      const op={opId:'95bab3c9-04dd-4cf2-b514-90d3964fbd31',deviceId,deviceSeq:1,
        createdAt:'2026-10-21T08:48:31.527Z',kind:'DATABASE_CHANGE',
        patches:[{action:'insert',collection:'kpiHistory',value:{id:'synthetic-unproven-kpi'}}]};
      op.payloadHash=ZEZMS.cloudSync._test.deterministicHash(op);
      localStorage.setItem('zezms_m5a4_safe_bootstrap_stage_v1',JSON.stringify(stage));
      localStorage.setItem('zezms_m5a4_safe_bootstrap_journal_v2',JSON.stringify(journal));
      localStorage.setItem('zezms_cloud_sync_m4_queue',JSON.stringify([op]));
    },{deviceId,lifecycleId});
    await tab.reload({waitUntil:'domcontentloaded'});
    await tab.locator('#shopChromeBootstrapProofButton').waitFor({timeout:15000});
    const before=await tab.evaluate(()=>({queue:localStorage.getItem('zezms_cloud_sync_m4_queue'),
      stage:localStorage.getItem('zezms_m5a4_safe_bootstrap_stage_v1'),
      journal:localStorage.getItem('zezms_m5a4_safe_bootstrap_journal_v2')}));
    await tab.locator('#shopChromeBootstrapProofButton').click();
    await tab.waitForFunction(()=>document.getElementById('shopChromeBootstrapProofReport')?.textContent?.includes('ZEZMS_SHOP_CHROME_BOOTSTRAP_PROOF_V1'));
    const report=JSON.parse(await tab.locator('#shopChromeBootstrapProofReport').textContent()).report;
    assert.equal(report.operationId,'95bab3c9-04dd-4cf2-b514-90d3964fbd31');
    assert.equal(report.queueCount,1);assert.match(report.disposition,/UNRESOLVED/);
    const after=await tab.evaluate(()=>({queue:localStorage.getItem('zezms_cloud_sync_m4_queue'),
      stage:localStorage.getItem('zezms_m5a4_safe_bootstrap_stage_v1'),
      journal:localStorage.getItem('zezms_m5a4_safe_bootstrap_journal_v2')}));
    assert.deepEqual(after,before);
  }finally{await tab.close();}
});

test('proof reports extra financial and settings patches without a disposition',async()=>{
  const tab=await page();
  try{
    const report=await tab.evaluate(async()=>{
      const deviceId='6229402b-947f-43b2-818f-143c3a27a1a0',lifecycleId='0820a9f3-9e62-45c8-ac81-c4e15f5a03a5';
      const op={opId:'95bab3c9-04dd-4cf2-b514-90d3964fbd31',deviceId,kind:'DATABASE_CHANGE',
        patches:[{action:'insert',collection:'kpiHistory',value:{id:'KPI-202607-CONFIRMED'}},
          {action:'insert',collection:'sales',value:{id:'private-sale',amount:500}},
          {action:'root-set',root:'settings',value:{password:'private-verifier'}}]};
      ZEZMS.managedDevices.hasVerifiedPendingStage=()=>true;
      ZEZMS.bootstrapPhaseA={inspect:()=>({status:'PRESENT',stage:{deviceId,lifecycleId,candidate:{kpiHistory:[],sales:[],settings:{}}}})};
      ZEZMS.cloudSync.getState=()=>({deviceId,deviceAccessMode:'PAIRED'});
      ZEZMS.cloudSync.getOutbox=()=>[op];
      return (await ZEZMS.shopChromeBootstrapProof.inspect()).report;
    });
    assert.equal(report.patchCount,3);
    assert.deepEqual(report.patches.map(p=>[p.action,p.collection,p.root]),[
      ['insert','kpiHistory',''],['insert','sales',''],['root-set','','settings']]);
    assert.ok(report.patches.every(p=>p.exactCandidateMatch===false));
    assert.match(report.disposition,/UNRESOLVED/);
    assert.ok(!JSON.stringify(report).includes('private-sale'));
    assert.ok(!JSON.stringify(report).includes('private-verifier'));
  }finally{await tab.close();}
});
