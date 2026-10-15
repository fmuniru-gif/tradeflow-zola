const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'managed-device-lifecycle-r61.js'), 'utf8');
const deviceId = '11111111-2222-4333-8444-555555555555';
const lifecycleId = 'camon-17p-verified-lifecycle';
const stageKey = 'zezms_m5a4_safe_bootstrap_stage_v1';
const journalKey = 'zezms_m5a4_safe_bootstrap_journal_v2';

function fixture() {
  const values = new Map();
  const candidate = { marker:'cloud-current', cashBalances:{ Others:0 }, sharedDeviceDirectory:{ users:[{id:'staff-1',name:'Staff',active:true,passwordHash:'hash'}] }, sharedDeviceAuth:{ users:[],audit:[] } };
  const fingerprint = { deviceId, operationalHash:'op-cloud-current', extendedHash:'ext-cloud-current', collections:{sales:'sales-cloud-current'},createdAt:'2026-10-01T00:00:00Z',appVersion:'3.31.17' };
  const stage = { version:1, build:'r70s-q1', deviceId, lifecycleId, cursor:42, candidate, fingerprint, attestedAt:'2026-10-15T00:00:00Z' };
  const journal = { version:2, deviceId, lifecycleId, stage:'VERIFYING', lastVerifiedStage:'VERIFYING', replayCursor:42 };
  values.set(stageKey,JSON.stringify(stage));
  values.set(journalKey,JSON.stringify(journal));
  const state = { deviceId, deviceAccessMode:'PAIRED', businessId:'business-1', syncOwnerId:'owner-1' };
  const context = { lifecycle_id:lifecycleId, device_id:deviceId, lifecycle_state:'ACTIVE', business_id:'business-1', owner_id:'owner-1' };
  const calls = { rpc:0, activation:0, events:[], renders:0, recoveryPrompts:0 };
  let failActivation = false;
  const localStorage = {getItem:k=>values.has(k)?values.get(k):null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
  const cloudSync = {
    getState:()=>state, waitUntilReady:async()=>{}, getSession:()=>({user:{id:'paired-user'}}),
    getClient:()=>({rpc:async(name,args)=>{calls.rpc++;assert.equal(name,'zezms_m5a4_device_context');assert.deepEqual(Array.from(args.p_allowed_states),['ACTIVE']);return {data:context,error:null};}}),
    commitM5a4BootstrapCandidate:()=>{},
    activateVerifiedBootstrapR70M:async(ready,proof)=>{calls.activation++;assert.equal(ready.marker,'cloud-current');assert.equal(proof.context.lifecycle_id,context.lifecycle_id);if(failActivation)throw new Error('interrupted');environment.DB=JSON.parse(JSON.stringify(ready));},
    getOutbox:()=>[]
  };
  const ZEZMS = {
    bootstrapPhaseA:{inspect:()=>{const raw=localStorage.getItem(stageKey);if(raw===null)return {status:'ABSENT'};try { const parsed=JSON.parse(raw);return parsed.version===1 && parsed.candidate && Number.isSafeInteger(parsed.cursor)?{status:'PRESENT',stage:parsed}:{status:'MALFORMED'}; }catch{return {status:'MALFORMED'};}}},
    cloudSync,
    syncIntegrity:{_test:{localAudit:()=>({violations:[]})}},
    convergence:{buildFingerprint:()=>({ deviceId:state.deviceId,operationalHash:'op-'+environment.DB.marker,extendedHash:'ext-'+environment.DB.marker,collections:{sales:'sales-'+environment.DB.marker},createdAt:new Date().toISOString(),appVersion:'3.31.18' })},
    recoveryStabilization:{showRecoveryButton:()=>{calls.recoveryPrompts++;}}
  };
  const window = { ZEZMS, dispatchEvent:event=>calls.events.push(event.type) };
  const environment = { window, ZEZMS, DB:{marker:'empty',cashBalances:{}}, localStorage, navigator:{userAgent:'test'}, document:{documentElement:{setAttribute:()=>{}}}, CustomEvent:class{constructor(type){this.type=type;}}, setTimeout:()=>{}, render:()=>{calls.renders++;}, toast:()=>{}, console };
  vm.createContext(environment);
  vm.runInContext(source,environment,{filename:'managed-device-lifecycle-r61.js'});
  return { values, stage, journal, state, context, calls, environment, managed:ZEZMS.managedDevices, setFailActivation:v=>{failActivation=v;} };
}

test('verified ACTIVE stage commits only through existing activation and refreshes staff directory',async()=>{
  const f=fixture();
  assert.equal(f.managed.hasVerifiedPendingStage(),true);
  assert.equal(await f.managed.finish(),true);
  assert.equal(f.calls.rpc,1);
  assert.equal(f.calls.activation,1);
  assert.equal(f.environment.DB.marker,'cloud-current');
  assert.deepEqual(f.calls.events,['zezms-shared-device-directory-updated']);
  assert.equal(f.values.has(stageKey),false);
  assert.equal(f.values.has(journalKey),false);
  assert.equal(f.managed.hasVerifiedPendingStage(),false);
  await assert.rejects(f.managed.finish(),/No verified bootstrap candidate/);
  assert.equal(f.calls.activation,1);
});

for(const [name,mutate] of [
  ['wrong current device',f=>{f.state.deviceId='different';}],
  ['tampered candidate',f=>{const x=JSON.parse(f.values.get(stageKey));x.candidate.marker='stale';f.values.set(stageKey,JSON.stringify(x));}],
  ['wrong journal',f=>{const x=JSON.parse(f.values.get(journalKey));x.lifecycleId='different';f.values.set(journalKey,JSON.stringify(x));}],
  ['malformed journal',f=>{f.values.set(journalKey,'{');}],
  ['malformed stage',f=>{f.values.set(stageKey,'{');}],
  ['completed stage',f=>{f.values.delete(stageKey);}],
  ['missing integrity module',f=>{delete f.environment.ZEZMS.syncIntegrity;}]
]) test(name+' cannot expose or execute activation',async()=>{
  const f=fixture();mutate(f);
  assert.equal(f.managed.hasVerifiedPendingStage(),false);
  await assert.rejects(f.managed.finish());
  assert.equal(f.calls.rpc,0);
  assert.equal(f.calls.activation,0);
});

test('Owner approval and lifecycle binding remain mandatory',async()=>{
  const f=fixture();f.context.lifecycle_state='VERIFYING';
  await assert.rejects(f.managed.finish(),/not been activated/);
  assert.equal(f.calls.activation,0);
  assert.equal(f.values.has(stageKey),true);
  f.context.lifecycle_state='ACTIVE';f.context.lifecycle_id='another-lifecycle';
  await assert.rejects(f.managed.finish(),/INVALID_DEVICE_ID_BINDING/);
  assert.equal(f.calls.activation,0);
  f.context.lifecycle_id=lifecycleId;f.context.business_id='other-business';
  await assert.rejects(f.managed.finish(),/INVALID_DEVICE_ID_BINDING/);
  assert.equal(f.calls.activation,0);
});

for (const lifecycleState of ['REVOKED','RETIRED']) test(lifecycleState+' lifecycle cannot complete staged activation',async()=>{
  const f=fixture();f.context.lifecycle_state=lifecycleState;
  await assert.rejects(f.managed.finish(),/not been activated/);
  assert.equal(f.calls.activation,0);
  assert.equal(f.values.has(stageKey),true);
});

test('missing paired cloud session cannot activate',async()=>{
  const f=fixture();f.environment.ZEZMS.cloudSync.getSession=()=>null;
  await assert.rejects(f.managed.finish(),/paired cloud identity/);
  assert.equal(f.calls.rpc,0);
  assert.equal(f.calls.activation,0);
  assert.equal(f.values.has(stageKey),true);
});

test('server permission rejection cannot activate or remove stage',async()=>{
  const f=fixture();f.environment.ZEZMS.cloudSync.getClient=()=>({rpc:async()=>({error:new Error('permission denied')})});
  await assert.rejects(f.managed.finish(),/permission denied/);
  assert.equal(f.calls.activation,0);
  assert.equal(f.values.has(stageKey),true);
});

test('interrupted activation preserves stage and retry is possible',async()=>{
  const f=fixture();f.setFailActivation(true);
  await assert.rejects(f.managed.finish(),/interrupted/);
  assert.equal(f.values.has(stageKey),true);
  assert.equal(f.values.has(journalKey),true);
  f.setFailActivation(false);
  assert.equal(await f.managed.finish(),true);
  assert.equal(f.calls.activation,2);
});

test('verified stage remains resumable when the journal write was interrupted',async()=>{
  const f=fixture();f.values.delete(journalKey);
  assert.equal(f.managed.hasVerifiedPendingStage(),true);
  assert.equal(await f.managed.finish(),true);
});

test('missing guarded activation bridge cannot fall back to a less guarded commit',async()=>{
  const f=fixture();delete f.environment.ZEZMS.cloudSync.activateVerifiedBootstrapR70M;
  await assert.rejects(f.managed.finish(),/r70M bootstrap activation bridge is unavailable/);
  assert.equal(f.calls.activation,0);
  assert.equal(f.values.has(stageKey),true);
});

test('simultaneous clicks share a single activation attempt',async()=>{
  const f=fixture();
  const [first,second]=await Promise.all([f.managed.finish(),f.managed.finish()]);
  assert.equal(first,true);assert.equal(second,true);
  assert.equal(f.calls.rpc,1);assert.equal(f.calls.activation,1);
});

for (const [label,id,lifecycle] of [
  ['new Android','8c4a1111-12b7-4666-a333-11775fca91b2','new-android-lifecycle'],
  ['replacement Windows','6b5e2222-26ca-4888-b444-5291eb89d7a3','replacement-windows-lifecycle']
]) test(label+' uses its own verified identity and lifecycle',async()=>{
  const f=fixture();
  const stage=JSON.parse(f.values.get(stageKey)),journal=JSON.parse(f.values.get(journalKey));
  stage.deviceId=id;stage.lifecycleId=lifecycle;
  stage.fingerprint.deviceId=id;
  journal.deviceId=id;journal.lifecycleId=lifecycle;
  f.values.set(stageKey,JSON.stringify(stage));f.values.set(journalKey,JSON.stringify(journal));
  f.state.deviceId=id;f.context.device_id=id;f.context.lifecycle_id=lifecycle;
  assert.equal(f.managed.hasVerifiedPendingStage(),true);
  assert.equal(await f.managed.finish(),true);
  assert.equal(f.calls.activation,1);
});

test('absent staff directory does not invent accounts and exposes existing recovery route',async()=>{
  const f=fixture();
  const stage=JSON.parse(f.values.get(stageKey));
  stage.candidate.sharedDeviceDirectory={users:[]};
  f.values.set(stageKey,JSON.stringify(stage));
  assert.equal(await f.managed.finish(),true);
  assert.deepEqual(f.environment.DB.sharedDeviceDirectory.users,[]);
  assert.equal(f.calls.recoveryPrompts,1);
});
