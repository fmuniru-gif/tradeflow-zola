const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),vm=require('node:vm');
const transform=require('../tools/device-approval-transform.cjs'),source=fs.readFileSync('js/managed-device-lifecycle-r61.js','utf8');
function fixture({role='OWNER',mode='OWNER',ready=true,mfa=true,confirm=true,readError=false}={}){
 const timers=[],values=new Map(),calls={read:0,mutation:0,mfa:0,confirm:0,refresh:0};let lifecycle='VERIFYING';
 const state={initialized:true,deviceId:'MAIN-1',deviceAccessMode:mode,syncOwnerId:'OWNER-1',businessId:'BUSINESS-1'};
 const client={rpc:async(name,args)=>{if(name==='zezms_m5a4_managed_fleet_with_branch'){calls.read++;return readError?{error:{message:'Synthetic read failed'}}:{data:[{lifecycle_id:'PHONE-LIFE',device_id:'PHONE-1',device_name:'Synthetic iPhone',lifecycle_state:lifecycle,revision:7,verified_cursor:5000,app_version:'3.31.19'}],error:null};}assert.equal(name,'zezms_m5a4_activate_device');assert.equal(args.p_lifecycle_id,'PHONE-LIFE');assert.equal(args.p_expected_revision,7);calls.mutation++;lifecycle='ACTIVE';return {data:true,error:null};}};
 const elements={m5a4DeviceRows:{innerHTML:''},m5a4FleetStatus:{textContent:''}},env={console,URL,URLSearchParams,TextEncoder,location:{search:'',href:'https://synthetic.invalid/index.html'},navigator:{userAgent:'synthetic'},localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)},setTimeout:(fn,ms)=>{timers.push({fn,ms});},document:{documentElement:{setAttribute(){}},getElementById:id=>elements[id]||null},DB:{sales:[],receipts:[],cashBalances:{}},viewSettings:()=>'<main>Original settings</main>',render(){},toast(){},confirm:()=>{calls.confirm++;return confirm;}};
 env.window=env;env.ZEZMS={cloudSync:{getState:()=>state,waitUntilReady:async()=>{},getClient:()=>client,getSession:()=>ready?{user:{id:'OWNER-1'}}:null,ensureMfa:async()=>{calls.mfa++;return mfa;}},deviceCards:{allowed:()=>['OWNER','ADMIN'].includes(role)},commercialFoundation:{getState:()=>({businessId:'BUSINESS-1'})}};
 vm.createContext(env);vm.runInContext(transform.transformDeviceApproval(source,transform.edits()),env);timers.find(t=>t.ms===500).fn();return {env,state,calls,elements,timers,values};
}
test('missing control-center panel falls back to authoritative lifecycle rows; rendering and refreshing do not approve devices',async()=>{
 const f=fixture(),before=JSON.stringify(f.env.DB);assert.match(f.env.viewSettings(),/Managed Device Lifecycle/);assert.equal(f.calls.mutation,0);await f.env.ZEZMS.managedDevices.refresh();assert.match(f.elements.m5a4DeviceRows.innerHTML,/VERIFYING/);assert.match(f.elements.m5a4DeviceRows.innerHTML,/Approve activation/);assert.match(f.elements.m5a4DeviceRows.innerHTML,/PHONE-1/);assert.match(f.elements.m5a4DeviceRows.innerHTML,/5000/);assert.equal(JSON.stringify(f.env.DB),before);assert.equal(f.calls.mutation,0);assert.equal(f.calls.mfa,0);
 await f.env.ZEZMS.managedDevices.activate('PHONE-LIFE',7);assert.equal(f.calls.mfa,1);assert.equal(f.calls.confirm,1);assert.equal(f.calls.mutation,1);assert.match(f.elements.m5a4DeviceRows.innerHTML,/ACTIVE/);assert.doesNotMatch(f.elements.m5a4DeviceRows.innerHTML,/Approve activation/);assert.equal(JSON.stringify(f.env.DB),before);
});
test('an existing control center keeps sole ownership and paired or unauthorized staff never receive a fallback approval panel',()=>{
 const f=fixture();f.env.ZEZMS.deviceControlPlaneR70P={settingsHtml:()=>'<div>Existing control center</div>'};const html=f.env.viewSettings();assert.match(html,/Existing control center/);assert.doesNotMatch(html,/Managed Device Lifecycle/);
 for(const settings of [{role:'CASHIER'},{role:'AUDITOR'},{mode:'PAIRED'}])assert.doesNotMatch(fixture(settings).env.viewSettings(),/Managed Device Lifecycle/);
});
test('cancelled confirmation, cancelled MFA, missing Cloud session and unauthorized staff stop activation before a mutation',async()=>{
 for(const settings of [{confirm:false},{mfa:false},{ready:false},{role:'CASHIER'}]){const f=fixture(settings);await f.env.ZEZMS.managedDevices.activate('PHONE-LIFE',7).catch(()=>{});assert.equal(f.calls.mutation,0,JSON.stringify(settings));}
});
test('a lifecycle read failure stays visible and is never rendered as an empty or ACTIVE fleet',async()=>{
 const f=fixture({readError:true});f.env.viewSettings();await assert.rejects(f.env.ZEZMS.managedDevices.refresh());assert.match(f.elements.m5a4FleetStatus.textContent,/Unable to load managed fleet/);assert.match(f.elements.m5a4DeviceRows.innerHTML,/Unable to load managed fleet/);assert.equal(f.calls.mutation,0);
});
test('approval UI and post-claim refresh reverse exactly to production while financial, transport and bootstrap sources remain byte-identical',()=>{
 const d=require('../tools/build-pr11-delivery.cjs'),base='9b3c2f6b4c4c8517b00970245f42acc1bcd990fe',prior=f=>cp.execFileSync('git',['show',base+':'+f],{maxBuffer:32e6});const strip=x=>x.replace(/<meta name="zezms-delivery" content="[^"]+">/,'DELIVERY');assert.equal(strip(transform.withoutDeviceApproval(d.assembledShell(d.assetBytes('index.html').toString()))),strip(d.assembledShell(prior('index.html').toString())));
 for(const f of ['js/receipt-payment-core.js','js/receipt-payments.js','js/sync-durability.js','js/sync-durability-runtime.js','js/dbservice.js','js/sync-resilience.js','js/managed-device-lifecycle-r61.js','js/prelogin-verified-activation-r70u.js'])assert.deepEqual(d.assetBytes(f),prior(f),f);
});
