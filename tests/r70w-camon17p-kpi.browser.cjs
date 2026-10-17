/* Assembled production shell; synthetic browser data and localhost only. */
const {test, after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const crypto=require('node:crypto');
const playwright=require(process.env.PLAYWRIGHT_CORE_PATH||'playwright-core');
const root=path.resolve(__dirname,'..');
const device='4f95591d-8a5a-4866-a009-74b50bfe32f0';
const lifecycle='e2f9a4be-f306-4bbd-ba1d-387d8274c63d';
const opId='ee957e0e-5d46-4e84-8418-d9527347b945';
const server=http.createServer((request,response)=>{
  const requested=new URL(request.url,'http://localhost').pathname;
  if(requested==='/__r70w_fixture_blank'){
    response.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});
    response.end('<!doctype html><title>isolated synthetic setup</title>');
    return;
  }
  const file=path.resolve(root,'.'+(requested==='/'?'/index.html':requested));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
    response.writeHead(404);response.end();return;
  }
  response.writeHead(200,{'content-type':file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':'application/octet-stream'});
  response.end(fs.readFileSync(file));
});
let browser;
test('review module has no queue, database or cloud mutation entry point',()=>{
  const source=fs.readFileSync(path.join(root,'js/camon17p-kpi-review-r70w.js'),'utf8');
  assert.doesNotMatch(source,/localStorage\.(?:setItem|removeItem|clear)\s*\(/);
  assert.doesNotMatch(source,/\.(?:rpc|pushNow|pullNow|finish|activateVerifiedBootstrapR70M)\s*\(/);
  assert.doesNotMatch(source,/\bfetch\s*\(/);
  assert.doesNotMatch(source,/reconcileCamon17pKpiOutbox/);
});
function ordered(value){
  if(Array.isArray(value))return value.map(ordered);
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])]));
}
async function page(){
  if(!server.listening)await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  if(!browser)browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
  const tab=await browser.newPage({acceptDownloads:true});
  const errors=[];
  tab.on('pageerror',error=>errors.push(String(error.stack||error)));
  await tab.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await tab.goto('http://127.0.0.1:'+server.address().port+'/index.html',{waitUntil:'domcontentloaded'});
  await tab.waitForFunction(()=>document.documentElement.getAttribute('data-zezms-release')==='v3.31.20-r70w-review'&&
    window.ZEZMS?.cloudSync&&window.ZEZMS?.managedDevices&&window.ZEZMS?.camon17pKpiReview&&window.ZEZMSConfirmedJulySnapshot,
  null,{timeout:18000}).catch(async error=>{throw Error(JSON.stringify({error:String(error),errors,
    state:await tab.evaluate(()=>({release:document.documentElement.getAttribute('data-zezms-release'),
      boot:document.getElementById('r55BootStatus')?.textContent,
      script:document.querySelector('[data-zezms-camon17p-kpi-review-r70w]')?.outerHTML,
      modules:{cloud:!!window.ZEZMS?.cloudSync,managed:!!window.ZEZMS?.managedDevices,review:!!window.ZEZMS?.camon17pKpiReview,july:!!window.ZEZMSConfirmedJulySnapshot}}))}));});
  return tab;
}
after(async()=>{if(browser)await browser.close();if(server.listening)await new Promise(resolve=>server.close(resolve));});
async function blank(tab){await tab.goto(new URL('/__r70w_fixture_blank',tab.url()).href,{waitUntil:'domcontentloaded'});}
async function app(tab){
  await tab.goto(new URL('/index.html',tab.url()).href,{waitUntil:'domcontentloaded'});
  await tab.waitForFunction(()=>window.ZEZMS?.cloudSync?.isReadyForLocalOperations()&&
    window.ZEZMS?.managedDevices?._test?.fingerprintCandidate&&window.ZEZMS?.camon17pKpiReview,
  null,{timeout:18000});
}
async function prepare(tab){
  await tab.waitForFunction(()=>ZEZMS.cloudSync.isReadyForLocalOperations(),null,{timeout:18000});
  const state=await tab.evaluate(()=>ZEZMS.cloudSync.getState());
  await blank(tab);
  await tab.evaluate(({device,state})=>{
    localStorage.setItem('zezms_cloud_sync_m4_state',JSON.stringify(Object.assign({},state,{
      deviceId:device,deviceAccessMode:'PAIRED',businessId:'synthetic-business',syncOwnerId:'synthetic-owner',
      liveSyncEnabled:false,liveSyncDesired:false,initialized:false,cursor:0})));
    localStorage.setItem('zezms_cloud_sync_m4_queue','[]');
    localStorage.setItem('zezms_cloud_sync_m4_failed_v2','[]');
  },{device,state});
  await app(tab);
  assert.equal(await tab.evaluate(()=>ZEZMS.cloudSync.getState().deviceId),device);
  const payload=await tab.evaluate(({device,lifecycle,opId})=>{
    const generator=ZEZMSConfirmedJulySnapshot;
    const fallback={id:'KPI-202607-CONFIRMED',year:2026,month:7,
      debt:generator.values.debt,creditors:generator.values.creditors,deposits:generator.values.deposits,
      cashBuckets:generator.values.cashBuckets,confirmedClosing:true,
      confirmationSource:'User-confirmed July 2026 closing balances',correctionRelease:'3.4.23',
      snapshotVersion:3,automatic:false,_syncId:'synthetic-kpi-sync-id'};
    const value=DB.kpiHistory?.find(item=>item?.id===fallback.id)||fallback;
    DB.kpiHistory=(DB.kpiHistory||[]).filter(item=>item?.id!==fallback.id).concat([value]);
    const candidate=JSON.parse(JSON.stringify(DB));
    candidate.kpiHistory=(candidate.kpiHistory||[]).filter(item=>item?.id!==value.id).concat([value]);
    const stage={version:1,build:'synthetic',deviceId:device,lifecycleId:lifecycle,cursor:3498,candidate,
      fingerprint:ZEZMS.managedDevices._test.fingerprintCandidate(candidate),attestedAt:'2026-10-15T12:13:30.233Z'};
    const journal={version:2,deviceId:device,lifecycleId:lifecycle,stage:'VERIFYING',lastVerifiedStage:'VERIFYING',replayCursor:3498};
    const operation=ZEZMS.cloudSync._test.sealOperation({opId,deviceId:device,deviceSeq:1,
      createdAt:'2026-10-15T12:09:31.221Z',reason:'database-save',kind:'DATABASE_CHANGE',
      appVersion:'3.31.19',patches:[{action:'insert',collection:'kpiHistory',key:String(value._syncId||value.id),value}]});
    return {dbKey:DB_KEY,database:JSON.stringify(DB),stage:JSON.stringify(stage),
      journal:JSON.stringify(journal),queue:JSON.stringify([operation])};
  },{device,lifecycle,opId});
  await blank(tab);
  await tab.evaluate(payload=>{
    localStorage.setItem(payload.dbKey,payload.database);
    localStorage.setItem('zezms_m5a4_safe_bootstrap_stage_v1',payload.stage);
    localStorage.setItem('zezms_m5a4_safe_bootstrap_journal_v2',payload.journal);
    localStorage.setItem('zezms_cloud_sync_m4_queue',payload.queue);
  },payload);
  await app(tab);
  await tab.waitForFunction(()=>window.ZEZMS?.camon17pKpiReview&&ZEZMS.cloudSync.getOutbox().length===1,null,{timeout:18000});
}
async function snapshot(tab){return tab.evaluate(async()=>({queue:localStorage.getItem('zezms_cloud_sync_m4_queue'),
  stage:localStorage.getItem('zezms_m5a4_safe_bootstrap_stage_v1'),
  journal:localStorage.getItem('zezms_m5a4_safe_bootstrap_journal_v2'),
  state:localStorage.getItem('zezms_cloud_sync_m4_state'),db:JSON.stringify(DB),
  indexedDB:await indexedDB.databases()}));}
async function inspect(tab){
  const before=await snapshot(tab);
  const result=await tab.evaluate(()=>ZEZMS.camon17pKpiReview.inspect());
  const after=await snapshot(tab);
  assert.deepEqual(after,before,'read-only review changed durable data');
  assert.equal(result.readOnly,true);
  assert.ok(!JSON.stringify(result).includes('synthetic-kpi-sync-id'));
  assert.ok(!JSON.stringify(result).includes('not-approved'));
  assert.ok(!JSON.stringify(result).includes('User-confirmed July 2026 closing balances'));
  assert.equal(await tab.evaluate(()=>typeof ZEZMS.cloudSync.reconcileCamon17pKpiOutbox),'undefined');
  return result;
}
test('new service worker installs the matching shell, manifest and verifier asset',async()=>{
  const tab=await page();
  try{
    const proof=await tab.evaluate(async()=>{
      const registration=await navigator.serviceWorker.register('./sw.js?v=20261017-r70w-camon17p-kpi-review');
      await navigator.serviceWorker.ready;
      const cache=await caches.open('zezms-r70w-kpi-review-20261017');
      const names=['./','./index.html','./manifest.json','./js/camon17p-kpi-review-r70w.js?v=20261017-r70w-camon17p-kpi-review'];
      const matches=await Promise.all(names.map(async name=>!!(await cache.match(new URL(name,registration.scope).href))));
      return {active:!!registration.active,matches};
    });
    assert.equal(proof.active,true);
    assert.deepEqual(proof.matches,[true,true,true,true]);
  }finally{await tab.close();}
});
test('pending bootstrap and KPI review survive a fully offline shell restart',async()=>{
  const tab=await page();
  try{
    await prepare(tab);
    const before=await snapshot(tab);
    const requests=[];
    tab.on('request',request=>requests.push(request.url()));
    await tab.evaluate(async()=>{await navigator.serviceWorker.ready;});
    // Simulate the first r70W open after an older release, with no prepared r70W shell.
    await tab.evaluate(()=>caches.delete('zezms-r70w-camon17p-kpi-patched-v1'));
    await tab.reload({waitUntil:'domcontentloaded'});
    await tab.waitForFunction(()=>!!navigator.serviceWorker.controller&&
      window.ZEZMS?.camon17pKpiReview&&ZEZMS.cloudSync?.isReadyForLocalOperations(),null,{timeout:18000});
    const assetProof=await tab.evaluate(async()=>{
      const cache=await caches.open('zezms-r70w-kpi-review-20261017');
      const urls=[...document.scripts].map(script=>script.src).filter(url=>url&&new URL(url).origin===location.origin);
      const uncached=[];
      for(const url of urls)if(!(await cache.match(url,{ignoreVary:true})))uncached.push(new URL(url).pathname);
      return {count:urls.length,uncached,release:document.documentElement.getAttribute('data-zezms-release')};
    });
    assert.equal(assetProof.release,'v3.31.20-r70w-review');
    assert.ok(assetProof.count>20,'assembled shell did not load expected application modules');
    assert.deepEqual(assetProof.uncached,[],'required same-origin application scripts were not cached');
    assert.equal(requests.some(url=>/supabase\.co|\/rest\/v1\/|\/rpc\//i.test(url)),false,
      'restricted-network shell startup attempted a cloud request');
    requests.length=0;
    await tab.context().setOffline(true);
    await tab.reload({waitUntil:'domcontentloaded'});
    await tab.waitForFunction(()=>window.ZEZMS?.camon17pKpiReview&&
      ZEZMS.cloudSync?.isReadyForLocalOperations(),null,{timeout:18000});
    const result=await inspect(tab);
    const after=await snapshot(tab);
    assert.equal(result.status,'EXACT_EQUALITY',JSON.stringify(result));
    for(const field of ['queue','stage','journal','db'])assert.equal(after[field],before[field],field+' changed');
    const previous=JSON.parse(before.state),current=JSON.parse(after.state);
    for(const field of ['deviceId','cursor','deviceAccessMode','liveSyncEnabled'])
      assert.deepEqual(current[field],previous[field],field+' changed');
    assert.deepEqual(after.indexedDB,before.indexedDB,'IndexedDB inventory changed');
    assert.equal(requests.some(url=>/supabase\.co|\/rest\/v1\/|\/rpc\//i.test(url)),false,
      'offline review attempted a cloud request');
  }finally{await tab.context().setOffline(false);await tab.close();}
});
test('one exact candidate-equivalent KPI insert is reported without reconciliation or activation',async()=>{
  const tab=await page();
  try{
    await prepare(tab);
    const result=await inspect(tab);
    assert.equal(result.status,'EXACT_EQUALITY',JSON.stringify(result));
    assert.equal(result.queueCount,1);
    assert.equal(result.failedCount,0);
    assert.equal(result.checks.verifiedStage,true);
    assert.equal(result.comparison.candidateExact,true);
    assert.equal(result.comparison.expectedExact,true);
    assert.match(result.hashes.patch,/^[a-f0-9]{64}$/);
    await tab.locator('#r70wVerifyKpiOutbox').waitFor({timeout:5000});
    await tab.locator('#r70wVerifyKpiOutbox').click();
    await tab.locator('#r70wDownloadKpiReport').waitFor({state:'visible'});
    const started=tab.waitForEvent('download');
    await tab.locator('#r70wDownloadKpiReport').click();
    const saved=await started;
    const envelope=JSON.parse(fs.readFileSync(await saved.path(),'utf8'));
    assert.equal(envelope.report.status,'EXACT_EQUALITY');
    assert.equal(envelope.integrity.sha256,crypto.createHash('sha256')
      .update(JSON.stringify(ordered(envelope.report))).digest('hex'));
    await tab.evaluate(()=>{
      const queued=JSON.parse(localStorage.getItem('zezms_cloud_sync_m4_queue'));
      queued.push({...queued[0],opId:'synthetic-late-operation'});
      localStorage.setItem('zezms_cloud_sync_m4_queue',JSON.stringify(queued));
    });
    const changedDownload=tab.waitForEvent('download');
    await tab.locator('#r70wDownloadKpiReport').click();
    const changed=JSON.parse(fs.readFileSync(await (await changedDownload).path(),'utf8'));
    assert.equal(changed.report.status,'NOT_VERIFIABLE','download must not reuse a stale exact report');
  }finally{await tab.close();}
});
for(const [name,mutate,expectedStatus] of [
  ['different KPI value',"queue[0].patches[0].value.debt+=1; queue[0].payloadHash=ZEZMS.cloudSync._test.deterministicHash(queue[0]);",'MISMATCH'],
  ['matching but extra KPI field',"queue[0].patches[0].value.extra='not-approved'; stage.candidate.kpiHistory.find(x=>x.id==='KPI-202607-CONFIRMED').extra='not-approved'; DB.kpiHistory.find(x=>x.id==='KPI-202607-CONFIRMED').extra='not-approved'; localStorage.setItem(DB_KEY,JSON.stringify(DB)); stage.fingerprint=ZEZMS.managedDevices._test.fingerprintCandidate(stage.candidate); queue[0].payloadHash=ZEZMS.cloudSync._test.deterministicHash(queue[0]);",'PARTIAL_EQUALITY'],
  ['missing candidate record',"stage.candidate.kpiHistory=[];",'NOT_VERIFIABLE'],
  ['second queued operation',"queue.push({...queue[0],opId:'different-operation'});",'MISMATCH'],
  ['changed operation ID',"queue[0].opId='different-operation'; queue[0].payloadHash=ZEZMS.cloudSync._test.deterministicHash(queue[0]);",'MISMATCH'],
  ['corrupted stage fingerprint',"stage.fingerprint.operationalHash='corrupt';",'NOT_VERIFIABLE'],
  ['corrupted journal',"const journal=JSON.parse(localStorage.getItem('zezms_m5a4_safe_bootstrap_journal_v2')); journal.lastVerifiedStage='FAILED'; localStorage.setItem('zezms_m5a4_safe_bootstrap_journal_v2',JSON.stringify(journal));",'NOT_VERIFIABLE'],
  ['wrong lifecycle',"stage.lifecycleId='different-lifecycle';",'NOT_VERIFIABLE'],
  ['incomplete patch equivalence',"queue[0].patches.push({action:'root-set',root:'settings',value:{unrelated:true}}); queue[0].payloadHash=ZEZMS.cloudSync._test.deterministicHash(queue[0]);",'MISMATCH'],
  ['operation after attestation',"queue[0].createdAt='2026-10-16T12:09:31.221Z'; queue[0].payloadHash=ZEZMS.cloudSync._test.deterministicHash(queue[0]);",'MISMATCH']
])test('fail-closed assembled shell: '+name,async()=>{
  const tab=await page();
  try{
    await prepare(tab);
    await tab.evaluate(source=>{
      const queue=JSON.parse(localStorage.getItem('zezms_cloud_sync_m4_queue'));
      const stage=JSON.parse(localStorage.getItem('zezms_m5a4_safe_bootstrap_stage_v1'));
      (new Function('queue','stage','ZEZMS','DB','DB_KEY','localStorage',source))(queue,stage,ZEZMS,DB,DB_KEY,localStorage);
      localStorage.setItem('zezms_cloud_sync_m4_queue',JSON.stringify(queue));
      localStorage.setItem('zezms_m5a4_safe_bootstrap_stage_v1',JSON.stringify(stage));
    },mutate);
    await tab.reload({waitUntil:'domcontentloaded'});
    await tab.waitForFunction(()=>window.ZEZMS?.camon17pKpiReview&&window.ZEZMS?.cloudSync,null,{timeout:18000});
    const result=await inspect(tab);
    assert.equal(result.status,expectedStatus,JSON.stringify(result));
  }finally{await tab.close();}
});
test('unverified queue remains after existing activation fails; other devices see no control',async()=>{
  const tab=await page();
  try{
    assert.equal(await tab.locator('#r70wVerifyKpiOutbox').count(),0);
    await prepare(tab);
    const before=await snapshot(tab);
    await assert.rejects(tab.evaluate(()=>ZEZMS.managedDevices.finish()),/ZEZMS_BOOTSTRAP_OUTBOX_REVIEW_REQUIRED|paired cloud identity|not been activated/i);
    const after=await snapshot(tab);
    assert.equal(after.queue,before.queue);
    assert.equal(after.stage,before.stage);
    assert.equal(after.journal,before.journal);
  }finally{await tab.close();}
});
test('interrupted sanitized report download leaves the original operation and stage intact',async()=>{
  const tab=await page();
  try{
    await prepare(tab);
    const before=await snapshot(tab);
    await tab.locator('#r70wVerifyKpiOutbox').click();
    const started=tab.waitForEvent('download');
    await tab.locator('#r70wDownloadKpiReport').click();
    const download=await started;
    await download.cancel();
    assert.deepEqual(await snapshot(tab),before);
    assert.equal((await inspect(tab)).status,'EXACT_EQUALITY');
  }finally{await tab.close();}
});
test('wrong browser identity, failed item, or unrelated local sale cannot pass verification',async()=>{
  const tab=await page();
  try{
    await prepare(tab);
    await tab.evaluate(()=>DB.sales.push({id:'synthetic-unrelated-sale'}));
    assert.equal((await inspect(tab)).status,'MISMATCH');
    await tab.evaluate(()=>DB.sales.pop());
    await tab.evaluate(()=>localStorage.setItem('zezms_cloud_sync_m4_failed_v2',JSON.stringify([{opId:'synthetic-failed'}])));
    await tab.reload({waitUntil:'domcontentloaded'});
    await tab.waitForFunction(()=>window.ZEZMS?.camon17pKpiReview&&ZEZMS.cloudSync.getFailedOperations().length===1);
    assert.equal((await inspect(tab)).status,'MISMATCH');
    await tab.evaluate(()=>{
      localStorage.setItem('zezms_cloud_sync_m4_failed_v2','[]');
      const state=JSON.parse(localStorage.getItem('zezms_cloud_sync_m4_state'));
      state.deviceId='different-device';
      localStorage.setItem('zezms_cloud_sync_m4_state',JSON.stringify(state));
    });
    await tab.reload({waitUntil:'domcontentloaded'});
    await tab.waitForFunction(()=>window.ZEZMS?.camon17pKpiReview&&ZEZMS.cloudSync.getState().deviceId==='different-device');
    const wrong=await inspect(tab);
    assert.equal(wrong.status,'MISMATCH');
    assert.equal(wrong.operationId,null);
    assert.equal(wrong.hashes.operation,null);
    assert.equal(await tab.locator('#r70wVerifyKpiOutbox').count(),0);
  }finally{await tab.close();}
});
test('missing trusted verifier dependency cannot produce exact equality',async()=>{
  const tab=await page();
  try{
    await prepare(tab);
    await tab.evaluate(()=>{window.ZEZMSConfirmedJulySnapshot=undefined;});
    const result=await inspect(tab);
    assert.equal(result.status,'NOT_VERIFIABLE');
    assert.ok(result.reasons.includes('EXPECTED_GENERATOR_UNAVAILABLE'));
  }finally{await tab.close();}
});
