/* Real assembled shell, isolated synthetic browser state. No production network. */
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const crypto=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
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
  const tab=await browser.newPage({acceptDownloads:true});
  await tab.addInitScript(()=>{
    window.__storageWriteEvents=[];
    const original=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){
      window.__storageWriteEvents.push({key:String(key),stack:String(new Error().stack||'').split('\n').slice(2,5).map(line=>line.replace(/https?:\/\/[^/]+/g,'[origin]'))});
      return original.call(this,key,value);
    };
  });
  await tab.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await tab.goto('http://127.0.0.1:'+server.address().port+'/index.html',{waitUntil:'domcontentloaded'});
  await tab.waitForFunction(expected=>document.documentElement.getAttribute('data-zezms-release')===expected&&window.ZEZMS&&ZEZMS.cloudSync&&ZEZMS.managedDevices,release,{timeout:15000});
  return tab;
}
after(async()=>{if(browser)await browser.close();if(server.listening)await new Promise(resolve=>server.close(resolve));});
async function stage(tab,kind){
  await tab.waitForFunction(()=>window.ZEZMS?.cloudSync?.getState()?.deviceId,null,{timeout:10000});
  const before=await tab.evaluate(kind=>{
    const state=ZEZMS.cloudSync.getState(),candidate=JSON.parse(JSON.stringify(DB));
    const lifecycleId='synthetic-approved-lifecycle';
    const stage={version:1,build:'r70s-q1',deviceId:state.deviceId,lifecycleId,cursor:42,candidate,fingerprint:ZEZMS.convergence.buildFingerprint(),attestedAt:new Date().toISOString()};
    const journal={version:2,deviceId:state.deviceId,lifecycleId,stage:'VERIFYING',lastVerifiedStage:'VERIFYING',replayCursor:42};
    const queued=[{opId:'synthetic-preserved-operation',deviceId:state.deviceId,createdAt:new Date().toISOString(),kind:'DATABASE_CHANGE',
      patches:[{action:'insert',collection:'kpiHistory',value:{id:'synthetic-kpi'}},{action:'root-set',root:'settings',value:candidate.settings}]}];
    if(kind==='safe')queued[0].patches=[{action:'root-set',root:'settings',value:candidate.settings}];
    if(kind==='business')queued[0].patches=[{action:'insert',collection:'sales',value:{id:'secret-sale',total:97,password:'secret-password'}}];
    if(kind==='unknown')queued[0].patches=[{action:'root-set',root:'settings',value:{unexpected:'secret-token'}}];
    localStorage.setItem('zezms_cloud_sync_m4_queue',JSON.stringify(queued));
    localStorage.setItem('zezms_m5a4_safe_bootstrap_stage_v1',JSON.stringify(stage));
    localStorage.setItem('zezms_m5a4_safe_bootstrap_journal_v2',JSON.stringify(journal));
    localStorage.setItem('zezms_cloud_sync_m4_state',JSON.stringify(Object.assign({},state,{deviceAccessMode:'PAIRED',businessId:'business-1',syncOwnerId:'owner-1',liveSyncEnabled:false,initialized:false,cursor:0})));
    return {deviceId:state.deviceId};
  },kind);
  await tab.reload({waitUntil:'domcontentloaded'});
  await tab.waitForFunction(()=>window.ZEZMS?.managedDevices?.hasVerifiedPendingStage()&&document.getElementById('r70vInspectBootstrapOutbox'),null,{timeout:15000});
  return before;
}
async function snapshot(tab){
  return tab.evaluate(()=>({storage:Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)])),db:JSON.stringify(DB),state:ZEZMS.cloudSync.getState(),queue:JSON.stringify(ZEZMS.cloudSync.getOutbox())}));
}
function changedPaths(left,right,prefix=''){
  if(isDeepStrictEqual(left,right))return [];
  if(!left||!right||typeof left!=='object'||typeof right!=='object')return [prefix||'<root>'];
  return [...new Set([...Object.keys(left),...Object.keys(right)])].flatMap(key=>changedPaths(left[key],right[key],prefix?prefix+'.'+key:key)).slice(0,30);
}
function preservationDelta(before,after,writes){
  const storageKeys=[...new Set([...Object.keys(before.storage),...Object.keys(after.storage)])]
    .filter(key=>before.storage[key]!==after.storage[key]);
  return {storageKeys:storageKeys.map(key=>{
    let paths=[];
    try{paths=changedPaths(JSON.parse(before.storage[key]),JSON.parse(after.storage[key]));}catch(_){paths=['<non-JSON>'];}
    return {key,paths};
  }),dbPaths:changedPaths(JSON.parse(before.db),JSON.parse(after.db)),statePaths:changedPaths(before.state,after.state),
    queueChanged:before.queue!==after.queue,writes};
}
function assertPreservedSnapshot(before,after,writes){
  const delta=preservationDelta(before,after,writes);
  const diagnosticKey='zezms_commercial_m5a1_state';
  const sameKeys=isDeepStrictEqual(Object.keys(before.storage).filter(key=>key!==diagnosticKey),Object.keys(after.storage).filter(key=>key!==diagnosticKey));
  assert.ok(sameKeys,JSON.stringify(delta));
  for(const key of Object.keys(before.storage)){
    if(key!==diagnosticKey){
      assert.equal(after.storage[key],before.storage[key],JSON.stringify(delta));
      continue;
    }
    // M5A-1 independently refreshes its display status after page startup.
    // Its timestamp and error text are diagnostics, not recovery authority.
    const prior=JSON.parse(before.storage[key]),later=JSON.parse(after.storage[key]);
    for(const field of ['lastCheckedAt','lastError']){delete prior[field];delete later[field];}
    assert.ok(isDeepStrictEqual(later,prior),JSON.stringify(delta));
  }
  if(!(diagnosticKey in before.storage) && diagnosticKey in after.storage){
    const created=JSON.parse(after.storage[diagnosticKey]);
    assert.equal(created.businessId,'',JSON.stringify(delta));
    assert.equal(created.context,null,JSON.stringify(delta));
    assert.equal(created.status,'error',JSON.stringify(delta));
  }
  assert.equal(after.db,before.db,JSON.stringify(delta));
  assert.ok(isDeepStrictEqual(after.state,before.state),JSON.stringify(delta));
  assert.equal(after.queue,before.queue,JSON.stringify(delta));
  for(const write of writes){
    assert.equal(write.key,diagnosticKey,JSON.stringify(delta));
    assert.ok(write.stack.some(line=>/at refresh \(\[origin\]\/js\/commercial-foundation\.js/.test(line)),JSON.stringify(delta));
  }
}
async function inspect(tab){
  await tab.locator('#r70vInspectBootstrapOutbox').click();
  await tab.waitForFunction(()=>document.getElementById('r70vBootstrapOutboxReport')?.textContent?.includes('ZEZMS_R70V_BOOTSTRAP_OUTBOX_DIAGNOSTIC_V1'));
  const envelope=JSON.parse(await tab.locator('#r70vBootstrapOutboxReport').textContent());
  assert.equal(envelope.integrity.algorithm,'SHA-256');
  assert.equal(envelope.integrity.covers,'report');
  assert.equal(envelope.integrity.sha256,crypto.createHash('sha256').update(JSON.stringify(envelope.report)).digest('hex'));
  assert.equal(envelope.report.readOnly,true);
  return envelope;
}
test('no verified matching stage means no diagnostic control',async()=>{
  const tab=await page();
  try{
    assert.equal(await tab.locator('#r70vInspectBootstrapOutbox').count(),0);
    assert.equal(await tab.locator('#r70vDownloadBootstrapOutbox').count(),0);
    assert.equal(await tab.locator('#r70uCompleteVerifiedActivation').count(),0);
    const state=await tab.evaluate(()=>ZEZMS.cloudSync.getState());
    await tab.evaluate(state=>{
      localStorage.setItem('zezms_m5a4_safe_bootstrap_stage_v1',JSON.stringify({version:1,deviceId:'wrong-device',lifecycleId:'wrong-life',cursor:42,candidate:{}}));
      localStorage.setItem('zezms_cloud_sync_m4_state',JSON.stringify(Object.assign({},state,{deviceAccessMode:'PAIRED'})));
    },state);
    await tab.reload({waitUntil:'domcontentloaded'});
    await tab.waitForTimeout(850);
    assert.equal(await tab.locator('#r70vInspectBootstrapOutbox').count(),0);
  }finally{await tab.close();}
});
for(const kind of ['startup','safe','business','unknown'])test('read-only assembled-shell diagnostic preserves '+kind+' outbox',async()=>{
  const tab=await page();
  try{
    const identity=await stage(tab,kind);
    const before=await snapshot(tab);
    const writeStart=await tab.evaluate(()=>window.__storageWriteEvents.length);
    let calls=0;
    await tab.evaluate(()=>{
      window.__rpcCalls=0;window.__activationCalls=0;
      ZEZMS.cloudSync.getClient=()=>({rpc:async()=>{window.__rpcCalls++;throw Error('cloud RPC forbidden');}});
      const finish=ZEZMS.managedDevices.finish;
      ZEZMS.managedDevices.finish=()=>{window.__activationCalls++;return finish();};
    });
    const envelope=await inspect(tab),report=envelope.report;
    assert.equal(report.bootstrapStage.deviceId,identity.deviceId);
    assert.equal(report.queueCount,1);
    assert.equal(report.rows.length,1);
    assert.equal(report.rows[0].type,'DATABASE_CHANGE');
    if(kind==='safe'){
      assert.equal(report.rows[0].classification,'SAFE_SETUP_RESIDUE');
      assert.equal(report.rows[0].candidateEquivalent,true);
      assert.equal(report.activationEligible,true);
    }else{
      assert.equal(report.rows[0].classification,kind==='business'?'BUSINESS_OPERATION':'UNKNOWN / REVIEW REQUIRED');
      assert.equal(report.rows[0].candidateEquivalent,false);
      assert.equal(report.activationEligible,false);
    }
    const queued=JSON.parse(before.queue);
    assert.equal(report.rows[0].operationId,queued[0].opId);
    assert.deepEqual(report.rows[0].paths.map(p=>[p.action,p.root,p.collection]),queued[0].patches.map(p=>[p.action,p.root||'',p.collection||'']));
    if(kind==='startup'){
      // The independent wallet seed can persist settings before or with July's
      // KPI save. Inspect the exact queued patches instead of assuming timing.
      const paths=report.rows[0].paths.map(p=>[p.action,p.root,p.collection]);
      assert.ok(paths.some(p=>p[0]==='insert'&&p[2]==='kpiHistory'));
      assert.ok(paths.every(p=>(p[0]==='insert'&&p[2]==='kpiHistory')||(p[0]==='root-set'&&p[1]==='settings')));
    }
    assert.ok(!JSON.stringify(envelope).includes('secret-password'));
    assert.ok(!JSON.stringify(envelope).includes('secret-token'));
    const downloadPromise=tab.waitForEvent('download');
    await tab.locator('#r70vDownloadBootstrapOutbox').click();
    const download=await downloadPromise;
    assert.match(download.suggestedFilename(),/^ZEZMS_Bootstrap_Outbox_Diagnostic_\d{4}-\d\d-\d\d\.json$/);
    assert.deepEqual(JSON.parse(fs.readFileSync(await download.path(),'utf8')),envelope);
    const afterSnapshot=await snapshot(tab);
    const writes=await tab.evaluate(start=>window.__storageWriteEvents.slice(start),writeStart);
    assertPreservedSnapshot(before,afterSnapshot,writes);
    assert.deepEqual(await tab.evaluate(()=>({rpc:window.__rpcCalls,activation:window.__activationCalls})),{rpc:0,activation:0});
    assert.equal(await tab.locator('#r70uCompleteVerifiedActivation').count(),1);
  }finally{await tab.close();}
});
