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
