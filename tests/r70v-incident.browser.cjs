/* Browser integration against the assembled production shell. Synthetic data only. */
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const playwright=require(process.env.PLAYWRIGHT_CORE_PATH||'playwright-core');
const root=path.resolve(__dirname,'..');
const server=http.createServer((request,response)=>{
  const pathname=new URL(request.url,'http://localhost').pathname;
  const file=path.resolve(root,'.'+pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){response.writeHead(404);response.end();return;}
  const type=file.endsWith('.js')?'text/javascript':file.endsWith('.json')?'application/json':file.endsWith('.html')?'text/html':'application/octet-stream';
  response.writeHead(200,{'content-type':type+'; charset=utf-8'});response.end(fs.readFileSync(file));
});
let browser;
async function page(){
  if(!server.listening)await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  if(!browser)browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
  const result=await browser.newPage();
  await result.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await result.goto('http://127.0.0.1:'+server.address().port+'/index.html',{waitUntil:'domcontentloaded'});
  await result.waitForFunction(()=>document.documentElement.getAttribute('data-zezms-release')==='v3.31.19-r70v'&&window.ZEZMS&&ZEZMS.cloudSync&&ZEZMS.managedDevices&&ZEZMS.deviceControlPlaneR70P,null,{timeout:15000});
  await result.waitForFunction(()=>document.documentElement.getAttribute('data-zezms-device-enrollment')==='historical-read-only',null,{timeout:5000});
  await result.waitForFunction(()=>document.documentElement.getAttribute('data-zezms-managed-device-lifecycle')==='r70p',null,{timeout:5000});
  return result;
}
after(async()=>{if(browser)await browser.close();if(server.listening)await new Promise(resolve=>server.close(resolve));});

test('assembled shell exposes the actual r70M classifier and one canonical device controller',async()=>{
  const tab=await page();
  try{
    const result=await tab.evaluate(()=>({build:document.documentElement.getAttribute('data-zezms-release'),classifier:typeof ZEZMS.cloudSync._test.r70m.classifyOperation,control:typeof ZEZMS.deviceControlPlaneR70P.settingsHtml,legacyEnrollment:document.documentElement.getAttribute('data-zezms-device-enrollment'),state:ZEZMS.cloudSync.getState().deviceId}));
    assert.equal(result.build,'v3.31.19-r70v');
    assert.equal(result.classifier,'function');
    assert.equal(result.control,'function');
    assert.equal(result.legacyEnrollment,'historical-read-only');
    assert.ok(result.state);
    assert.equal(await tab.locator('#zezmsDeviceManagementSlot').count(),0);
  }finally{await tab.close();}
});

test('legacy registration mutation entry points fail closed in the assembled shell',async()=>{
  const tab=await page();
  try{
    const result=await tab.evaluate(()=>{
      const calls=[()=>ZEZMS.deviceEnrollment.createPairing(),()=>ZEZMS.deviceEnrollment.revokeDevice(),()=>secureDeviceEnrollmentOpenRevocation('old-device'),()=>secureDeviceEnrollmentConfirmRevocation()];
      return calls.map(fn=>{try{fn();return 'ALLOWED';}catch(e){return String(e.message);}});
    });
    assert.equal(result.length,4);
    result.forEach(message=>assert.match(message,/Managed Device Lifecycle|Device Control Center/));
  }finally{await tab.close();}
});

async function stageExistingQueue(tab,queueKind){
  await tab.waitForFunction(()=>ZEZMS.cloudSync.getOutbox().length>0,null,{timeout:8000});
  const expected=await tab.evaluate(queueKind=>{
    const sync=ZEZMS.cloudSync.getState();
    const candidate=JSON.parse(JSON.stringify(DB));
    const fingerprint=ZEZMS.convergence.buildFingerprint();
    const lifecycleId='synthetic-approved-lifecycle';
    const stage={version:1,build:'r70s-q1',deviceId:sync.deviceId,lifecycleId,cursor:42,candidate,fingerprint,attestedAt:new Date().toISOString()};
    const journal={version:2,deviceId:sync.deviceId,lifecycleId,stage:'VERIFYING',lastVerifiedStage:'VERIFYING',replayCursor:42};
    if(queueKind){
      const queued=JSON.parse(localStorage.getItem('zezms_cloud_sync_m4_queue'));
      queued[0].patches=queueKind==='safe'
        ?[{action:'root-set',root:'settings',value:candidate.settings}]
        :[{action:'insert',collection:'sales',value:{id:'unsent-sale-1',total:97}}];
      localStorage.setItem('zezms_cloud_sync_m4_queue',JSON.stringify(queued));
    }
    localStorage.setItem('zezms_m5a4_safe_bootstrap_stage_v1',JSON.stringify(stage));
    localStorage.setItem('zezms_m5a4_safe_bootstrap_journal_v2',JSON.stringify(journal));
    localStorage.setItem('zezms_cloud_sync_m4_state',JSON.stringify(Object.assign({},sync,{deviceAccessMode:'PAIRED',businessId:'business-1',syncOwnerId:'owner-1',liveSyncEnabled:false,initialized:false,cursor:0})));
    return {queue:localStorage.getItem('zezms_cloud_sync_m4_queue'),stage:localStorage.getItem('zezms_m5a4_safe_bootstrap_stage_v1'),journal:localStorage.getItem('zezms_m5a4_safe_bootstrap_journal_v2'),deviceId:sync.deviceId,businessId:'business-1',syncOwnerId:'owner-1',cursor:0};
  },queueKind);
  await tab.reload({waitUntil:'domcontentloaded'});
  await tab.waitForFunction(()=>document.documentElement.getAttribute('data-zezms-release')==='v3.31.19-r70v'&&ZEZMS.cloudSync&&ZEZMS.managedDevices,null,{timeout:15000});
  return expected;
}

test('real startup-generated unknown operation blocks activation and pre-login inspection preserves evidence',async()=>{
  const tab=await page();
  try{
    const before=await stageExistingQueue(tab);
    assert.equal(await tab.evaluate(()=>ZEZMS.managedDevices.hasVerifiedPendingStage()),true);
    await tab.locator('#r70vInspectBootstrapOutbox').waitFor();
    await tab.locator('#r70vInspectBootstrapOutbox').click();
    const report=JSON.parse(await tab.locator('#r70vBootstrapOutboxReport').textContent());
    assert.equal(report.queueCount,1);
    assert.equal(report.activationEligible,false);
    assert.equal(report.rows[0].type,'DATABASE_CHANGE');
    assert.equal(report.rows[0].classification,'UNKNOWN / REVIEW REQUIRED');
    assert.deepEqual(report.rows[0].paths.map(p=>[p.action,p.root,p.collection]),[['insert','','kpiHistory'],['root-set','settings','']]);
    assert.ok(!JSON.stringify(report).includes('passwordHash'));
    await tab.evaluate(()=>{
      ZEZMS.cloudSync.waitUntilReady=async()=>true;
      ZEZMS.cloudSync.getSession=()=>({user:{id:'paired-user'}});
      ZEZMS.cloudSync.getClient=()=>({rpc:async(name)=>{
        if(name!=='zezms_m5a4_device_context')throw Error('Unexpected cloud RPC');
        return {data:{lifecycle_id:'synthetic-approved-lifecycle',device_id:ZEZMS.cloudSync.getState().deviceId,lifecycle_state:'ACTIVE',business_id:'business-1',owner_id:'owner-1'},error:null};
      }});
      const original=ZEZMS.managedDevices.finish;
      ZEZMS.managedDevices.finish=async()=>{try{return await original();}catch(error){window.__activationError=String(error.message);throw error;}};
    });
    await tab.locator('#r70uCompleteVerifiedActivation').click();
    await tab.waitForFunction(()=>typeof window.__activationError==='string',null,{timeout:10000});
    assert.match(await tab.evaluate(()=>window.__activationError),/ZEZMS_BOOTSTRAP_OUTBOX_REVIEW_REQUIRED/);
    assert.deepEqual(await tab.evaluate(()=>({queue:localStorage.getItem('zezms_cloud_sync_m4_queue'),stage:localStorage.getItem('zezms_m5a4_safe_bootstrap_stage_v1'),journal:localStorage.getItem('zezms_m5a4_safe_bootstrap_journal_v2'),deviceId:ZEZMS.cloudSync.getState().deviceId,businessId:ZEZMS.cloudSync.getState().businessId,syncOwnerId:ZEZMS.cloudSync.getState().syncOwnerId,cursor:ZEZMS.cloudSync.getState().cursor,liveSync:ZEZMS.cloudSync.getState().liveSyncEnabled})),{queue:before.queue,stage:before.stage,journal:before.journal,deviceId:before.deviceId,businessId:before.businessId,syncOwnerId:before.syncOwnerId,cursor:before.cursor,liveSync:false});
  }finally{await tab.close();}
});

test('actual staged-shell reconciliation clears only exact candidate-equivalent residue',async()=>{
  const tab=await page();
  try{
    const before=await stageExistingQueue(tab,'safe');
    const report=await tab.evaluate(()=>ZEZMS.cloudSync.inspectM5a4BootstrapOutbox());
    assert.equal(report.queueCount,1);
    assert.equal(report.activationEligible,true);
    assert.equal(report.rows[0].classification,'SAFE_SETUP_RESIDUE');
    const after=await tab.evaluate(()=>{
      const stage=JSON.parse(localStorage.getItem('zezms_m5a4_safe_bootstrap_stage_v1'));
      const database=JSON.stringify(DB);
      const result=ZEZMS.cloudSync._test.r70m.reconcile({candidate:stage.candidate,cursor:stage.cursor,context:{lifecycle_id:stage.lifecycleId,device_id:stage.deviceId,lifecycle_state:'ACTIVE'}});
      return {count:result.queueCount,queue:ZEZMS.cloudSync.getOutbox().length,stage:localStorage.getItem('zezms_m5a4_safe_bootstrap_stage_v1'),journal:localStorage.getItem('zezms_m5a4_safe_bootstrap_journal_v2'),deviceId:ZEZMS.cloudSync.getState().deviceId,databaseUnchanged:JSON.stringify(DB)===database,liveSync:ZEZMS.cloudSync.getState().liveSyncEnabled};
    });
    assert.deepEqual(after,{count:1,queue:0,stage:before.stage,journal:before.journal,deviceId:before.deviceId,databaseUnchanged:true,liveSync:false});
  }finally{await tab.close();}
});

test('actual staged-shell reconciliation refuses business operations without losing queue or stage',async()=>{
  const tab=await page();
  try{
    const before=await stageExistingQueue(tab,'business');
    const result=await tab.evaluate(()=>{
      const report=ZEZMS.cloudSync.inspectM5a4BootstrapOutbox();
      const stage=JSON.parse(localStorage.getItem('zezms_m5a4_safe_bootstrap_stage_v1'));
      let error='';
      try{ZEZMS.cloudSync._test.r70m.reconcile({candidate:stage.candidate,cursor:stage.cursor,context:{lifecycle_id:stage.lifecycleId,device_id:stage.deviceId,lifecycle_state:'ACTIVE'}});}catch(e){error=String(e.message);}
      return {classification:report.rows[0].classification,eligible:report.activationEligible,error,queue:localStorage.getItem('zezms_cloud_sync_m4_queue'),stage:localStorage.getItem('zezms_m5a4_safe_bootstrap_stage_v1'),journal:localStorage.getItem('zezms_m5a4_safe_bootstrap_journal_v2')};
    });
    assert.equal(result.classification,'BUSINESS_OPERATION');
    assert.equal(result.eligible,false);
    assert.match(result.error,/ZEZMS_BOOTSTRAP_OUTBOX_REVIEW_REQUIRED/);
    assert.equal(result.queue,before.queue);
    assert.equal(result.stage,before.stage);
    assert.equal(result.journal,before.journal);
  }finally{await tab.close();}
});

test('the embedded r70M classifier distinguishes exact setup residue from business and unknown patches',async()=>{
  const tab=await page();
  try{
    const result=await tab.evaluate(()=>{
      const classify=ZEZMS.cloudSync._test.r70m.classifyOperation;
      const candidate={sharedDeviceDirectory:{businessId:'business-1',users:[{id:'staff-1'}]},settings:{tax:0}};
      const safe=classify({opId:'safe',kind:'DATABASE_CHANGE',patches:[{action:'root-set',root:'sharedDeviceDirectory',value:candidate.sharedDeviceDirectory}]},candidate);
      const changed=classify({opId:'changed',kind:'DATABASE_CHANGE',patches:[{action:'root-set',root:'sharedDeviceDirectory',value:{businessId:'business-1',users:[]}}]},candidate);
      const business=classify({opId:'business',kind:'DATABASE_CHANGE',patches:[{action:'insert',collection:'sales',value:{id:'sale-1'}}]},candidate);
      const mixed=classify({opId:'mixed',kind:'DATABASE_CHANGE',patches:[{action:'root-set',root:'settings',value:candidate.settings},{action:'insert',collection:'sales',value:{id:'sale-1'}}]},candidate);
      return [safe,changed,business,mixed].map(row=>({classification:row.classification,safeToDiscard:row.safeToDiscard}));
    });
    assert.deepEqual(result,[
      {classification:'SAFE_SETUP_RESIDUE',safeToDiscard:true},
      {classification:'UNKNOWN / REVIEW REQUIRED',safeToDiscard:false},
      {classification:'BUSINESS_OPERATION',safeToDiscard:false},
      {classification:'BUSINESS_OPERATION',safeToDiscard:false}
    ]);
  }finally{await tab.close();}
});

test('Settings has one stable canonical control and legacy registration stays read only',async()=>{
  const tab=await page();
  try{
    const result=await tab.evaluate(async()=>{
      const controller=ZEZMS.deviceControlPlaneR70P;
      const original=ZEZMS.cloudSync.getOwnerManagementContext;
      const originalState=ZEZMS.cloudSync.getState;
      ZEZMS.cloudSync.getState=()=>Object.assign({},originalState(),{businessId:'business-1'});
      let calls=0;
      ZEZMS.cloudSync.getOwnerManagementContext=()=>({ready:true,session:{user:{id:'owner-1'}},client:{rpc:async name=>{
        calls++;
        if(name!=='zezms_m5a4_canonical_fleet_read')throw Error('unexpected RPC');
        return {data:[{
          lifecycle_id:'lifecycle-old',device_id:'device-old',device_name:'Old Camon',enrollment_mode:'REPLACEMENT',lifecycle_state:'REVOKED',revision:2,replaces_lifecycle_id:null,replacement_lifecycle_id:'lifecycle-new',lifecycle_retired_at:null,lifecycle_revoked_at:'2026-10-01T00:00:00Z',last_seen_at:null,verified_cursor:42,queue_count:0,failed_count:0,app_version:'3.31.18',branch_id:'branch-1',branch_name:'Shop',branch_code:'S',device_access_status:'REVOKED',device_access_revoked_at:'2026-10-01T00:00:00Z',registered_device_status:'ACTIVE',registered_device_revoked_at:null,authentication_eligible:true
        }],error:null};
      }}});
      const first=viewSettings();
      await controller.ensureFleetLoaded(false);
      const projection=controller.getProjection();
      const second=viewSettings();
      const root=document.getElementById('viewRoot');
      ZEZMS.uiR70P.reconcile(root,second);
      const slot=root.querySelector('#zezmsDeviceManagementSlot');
      for(let i=0;i<4;i++){
        ZEZMS.uiR70P.reconcile(root,viewSettings());
        controller.afterSettingsRender();
      }
      const stable=slot===root.querySelector('#zezmsDeviceManagementSlot');
      const actualControls=root.querySelectorAll('[data-zezms-device-control-plane="r70p"]').length;
      const legacyCards=[...root.querySelectorAll('h3')].filter(h=>/^(Secure Device Enrollment|Registered devices)$/i.test(h.textContent.trim())).length;
      ZEZMS.cloudSync.getOwnerManagementContext=original;
      ZEZMS.cloudSync.getState=originalState;
      return {first,second,calls,stable,actualControls,legacyCards,projection:{active:projection.active.length,history:projection.history.length,state:projection.history[0]&&projection.history[0].canonicalStatus,access:projection.history[0]&&projection.history[0].operationalAccess},controlCount:(second.match(/data-zezms-device-control-plane="r70p"/g)||[]).length,legacyEnrollment:second.includes('Secure Device Enrollment'),legacyRegistered:second.includes('<h3>Registered devices</h3>'),historyAudit:second.includes('Historical registration audit')};
    });
    assert.equal(result.controlCount,1,JSON.stringify({calls:result.calls,projection:result.projection,first:result.first.slice(-1000),second:result.second.slice(-1000)}));
    assert.equal(result.legacyEnrollment,false);
    assert.equal(result.legacyRegistered,false);
    assert.equal(result.projection.active,0);
    assert.equal(result.projection.history,1);
    assert.equal(result.projection.state,'REVOKED');
    assert.equal(result.projection.access,false);
    assert.equal(result.calls,1);
    assert.equal(result.stable,true);
    assert.equal(result.actualControls,1);
    assert.equal(result.legacyCards,0);
    assert.equal(result.first.includes('Device Control Center'),true);
    assert.equal(result.second.includes('Device Control Center'),true);
  }finally{await tab.close();}
});

test('ACTIVE lifecycle with revoked access is never operational despite owner registration or server eligibility',async()=>{
  const tab=await page();
  try{
    const result=await tab.evaluate(async()=>{
      const controller=ZEZMS.deviceControlPlaneR70P;
      const original=ZEZMS.cloudSync.getOwnerManagementContext;
      const originalState=ZEZMS.cloudSync.getState;
      ZEZMS.cloudSync.getState=()=>Object.assign({},originalState(),{businessId:'business-1'});
      const base={device_name:'Device',enrollment_mode:'ADD',lifecycle_state:'ACTIVE',revision:1,replaces_lifecycle_id:null,replacement_lifecycle_id:null,lifecycle_retired_at:null,lifecycle_revoked_at:null,last_seen_at:null,verified_cursor:42,queue_count:0,failed_count:0,app_version:'3.31.19',branch_id:'branch-1',branch_name:'Main',branch_code:'M',registered_device_status:'REGISTERED',registered_device_revoked_at:null,authentication_eligible:true};
      const rows=[
        Object.assign({},base,{lifecycle_id:'life-revoked-status',device_id:'device-revoked-status',device_name:'Revoked access',device_access_status:'REVOKED',device_access_revoked_at:null}),
        Object.assign({},base,{lifecycle_id:'life-revoked-timestamp',device_id:'device-revoked-timestamp',device_name:'Revoked timestamp',device_access_status:'ACTIVE',device_access_revoked_at:'2026-10-01T00:00:00Z'}),
        Object.assign({},base,{lifecycle_id:'life-healthy',device_id:'device-healthy',device_name:'Healthy device',device_access_status:'ACTIVE',device_access_revoked_at:null})
      ];
      ZEZMS.cloudSync.getOwnerManagementContext=()=>({ready:true,session:{user:{id:'owner-1'}},client:{rpc:async name=>{
        if(name!=='zezms_m5a4_canonical_fleet_read')throw Error('unexpected RPC');
        return {data:rows,error:null};
      }}});
      await controller.ensureFleetLoaded(true);
      const projection=controller.getProjection();
      const html=controller.settingsHtml();
      ZEZMS.cloudSync.getOwnerManagementContext=original;
      ZEZMS.cloudSync.getState=originalState;
      return {active:projection.active.map(row=>row.device_id),pending:projection.pending.map(row=>({deviceId:row.device_id,status:row.canonicalStatus,eligible:row.authenticationEligible,operational:row.operationalAccess,contradictions:row.contradictions})),html};
    });
    assert.deepEqual(result.active,['device-healthy']);
    assert.equal(result.pending.length,2);
    result.pending.forEach(row=>{
      assert.equal(row.status,'ACCESS REVOKED');
      assert.equal(row.eligible,false);
      assert.equal(row.operational,false);
      assert.match(row.contradictions.join(' '),/cannot restore operational access/);
    });
    assert.match(result.html,/ACCESS REVOKED/);
    assert.match(result.html,/Healthy device/);
  }finally{await tab.close();}
});
