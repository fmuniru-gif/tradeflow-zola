const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const delivery=require('../tools/build-pr11-delivery.cjs'),undo=require('../tools/camon-kpi-transform.cjs').withoutCamonKpi;
const vm=require('node:vm'),{webcrypto}=require('node:crypto');
function comparisonFixture(change=()=>{}){
 const device='4f95591d-8a5a-4866-a009-74b50bfe32f0',lifecycle='e2f9a4be-f306-4bbd-ba1d-387d8274c63d';
 const values={debt:1,creditors:2,deposits:3,cashBuckets:4};
 const value={id:'KPI-202607-CONFIRMED',year:2026,month:7,...values,confirmedClosing:true,confirmationSource:'User-confirmed July 2026 closing balances',correctionRelease:'3.4.23',snapshotVersion:3,automatic:false,_syncId:'synthetic-kpi'};
 const state={deviceId:device,deviceAccessMode:'PAIRED',liveSyncEnabled:false},db={kpiHistory:[structuredClone(value)]};
 const queue=[{opId:'ee957e0e-5d46-4e84-8418-d9527347b945',deviceId:device,kind:'DATABASE_CHANGE',createdAt:'2026-10-15T12:09:31.221Z',payloadHash:'synthetic-valid',patches:[{action:'insert',collection:'kpiHistory',key:'synthetic-kpi',value:structuredClone(value)}]}];
 const stage={deviceId:device,lifecycleId:lifecycle,cursor:3498,attestedAt:'2026-10-15T12:13:30.233Z',candidate:{kpiHistory:[structuredClone(value)]},fingerprint:{synthetic:true}},journal={deviceId:device,lifecycleId:lifecycle,stage:'VERIFYING'};
 const fixture={state,db,queue,stage,journal,values,verified:true,failed:[],material:0};change(fixture);
 const storage=new Map(Object.entries({zezms_cloud_sync_m4_queue:JSON.stringify(queue),zezms_cloud_sync_m4_failed_v2:JSON.stringify(fixture.failed),zezms_m5a4_safe_bootstrap_stage_v1:JSON.stringify(stage),zezms_m5a4_safe_bootstrap_journal_v2:JSON.stringify(journal),zezms_cloud_sync_m4_state:JSON.stringify(state)}));
 const sync={getState:()=>structuredClone(state),getOutbox:()=>structuredClone(queue),getFailedOperations:()=>structuredClone(fixture.failed),inspectM5a4BootstrapOutbox:()=>({localBusinessRecordCount:fixture.material}),_test:{deterministicHash:()=> 'synthetic-valid'}};
 const window={TextEncoder,ZEZMS:{cloudSync:sync,managedDevices:{hasVerifiedPendingStage:()=>fixture.verified}},ZEZMSConfirmedJulySnapshot:{build:'20261008-r70q-phase-a-review',values},addEventListener(){}};
 const context={window,ZEZMS:window.ZEZMS,DB:db,crypto:webcrypto,TextEncoder,document:{getElementById:()=>null},localStorage:{getItem:k=>storage.get(k)||null,setItem(){throw Error('No writes permitted');},removeItem(){throw Error('No removal permitted');}}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('js/camon17p-kpi-review-r70w.js','utf8'),context);
 return {async inspect(){const before=JSON.stringify({storage:[...storage],db,queue,state,stage,journal});const result=await window.ZEZMS.camon17pKpiReview.inspect();assert.equal(JSON.stringify({storage:[...storage],db,queue,state,stage,journal}),before);return JSON.parse(JSON.stringify(result));}};
}
test('local comparison reports exact full equality without changing any supplied record',async()=>{
 const result=await comparisonFixture().inspect();assert.equal(result.status,'EXACT_EQUALITY');
 assert.equal(result.comparison.candidateExact,true);assert.equal(result.checks.operationPayloadHash,true);
 assert.doesNotMatch(JSON.stringify(result),/synthetic-kpi|User-confirmed July/);
});
for(const [name,change] of Object.entries({
 'different queued value':f=>f.queue[0].patches[0].value.debt++,
 'extra shared field':f=>{f.queue[0].patches[0].value.extra=true;f.stage.candidate.kpiHistory[0].extra=true;f.db.kpiHistory[0].extra=true;},
 'missing candidate record':f=>f.stage.candidate.kpiHistory=[],
 'second operation':f=>f.queue.push({...f.queue[0],opId:'synthetic-second'}),
 'invalid payload hash':f=>f.queue[0].payloadHash='corrupt',
 'unverified native stage':f=>f.verified=false,
 'failed operation':f=>f.failed.push({opId:'synthetic-failed'}),
 'unrelated business record':f=>f.material=1,
 'different browser identity':f=>f.state.deviceId='synthetic-other'
}))test('local comparison refuses exact equality for '+name,async()=>{assert.notEqual((await comparisonFixture(change).inspect()).status,'EXACT_EQUALITY');});
test('Camon review adds only the isolated read-only verifier to the current assembled application',()=>{
 const current=delivery.assembledShell(fs.readFileSync('index.html','utf8'));
 const base=delivery.assembledShell(cp.execFileSync('git',['show','390ee823c4583f36527e21767412599b401e8c3e:index.html'],{maxBuffer:32e6}).toString());
 const clean=s=>s.replace(/<meta name="zezms-delivery" content="[^"]+">/,'DELIVERY');
 assert.equal(clean(undo(current)),clean(base));
 const embedded=current.match(/<script data-zezms-camon17p-kpi-review-r70w>\n([\s\S]*?)\n<\/script>/);
 assert.ok(embedded);assert.equal(embedded[1],fs.readFileSync('js/camon17p-kpi-review-r70w.js','utf8').replace(/<\/script/gi,'<\\/script'));
});
test('the scoped verifier cannot mutate storage, send Cloud requests or call activation',()=>{
 const code=fs.readFileSync('js/camon17p-kpi-review-r70w.js','utf8');
 assert.doesNotMatch(code,/localStorage\.(?:setItem|removeItem|clear)\s*\(/);
 assert.doesNotMatch(code,/\.(?:rpc|pushNow|pullNow|finish|activateVerifiedBootstrapR70M)\s*\(/);
 assert.doesNotMatch(code,/\bfetch\s*\(/);
 const helper=fs.readFileSync('CAMON_KPI_REVIEW_UPDATE.html','utf8');
 assert.match(helper,/20261110-camon-kpi-review-r1/);assert.doesNotMatch(helper,/skipWaiting|clients\.claim|localStorage\./);
});
