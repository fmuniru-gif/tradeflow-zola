const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const delivery=require('../tools/build-pr11-delivery.cjs'),{transformDeviceCards}=require('../tools/device-cards-transform.cjs');
function fixture(){
 const user={role:'OWNER',user:{id:'staff-1',active:true}},state={initialized:true,deviceId:'D1',businessId:'B1',syncOwnerId:'owner',deviceAccessMode:'OWNER'};
 let reads=0,mfa=0,ready=true,temporary=false,response={data:[{device_id:'D1',app_version:'3.31.19',last_seen_at:new Date().toISOString()}]},pending=null;
 const queries=[];const client={from(table){queries.push(['table',table]);return {select(value){queries.push(['select',value]);return this;},eq(k,v){queries.push([k,v]);return this;},order(){return this;},abortSignal(){reads++;return pending||Promise.resolve(response);}};}};
 const c={window:null,document:{addEventListener(){},getElementById(){return null;}},APP_VERSION:'3.31.19',setTimeout,clearTimeout,AbortController,Intl,Date,console,ZEZMS:{staffAuth:{getContext:()=>user},cloudSync:{getState:()=>({...state}),getOwnerManagementContext:()=>({ready,temporary,client,session:{user:{id:'owner'}}}),ensureMfa:async()=>{mfa++;return true;}}}};c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync('js/sync-resilience.js','utf8'),c);c.ZEZMS.syncResilience=Object.assign({},c.ZEZMS.syncResilience,{transport:c.ZEZMS.syncResilience.create({sleep:async()=>{}})});vm.runInContext(fs.readFileSync('js/device-cards.js','utf8'),c);
 return {c,user,state,api:c.ZEZMS.deviceCards,queries,reads:()=>reads,mfa:()=>mfa,setReady:v=>{ready=v;},setTemporary:v=>{temporary=v;},response:v=>{response=v;},pending:v=>{pending=v;}};
}
test('only signed-in Owner/Admin users on initialized non-revoked devices can access recovery and directory cards',()=>{
 const f=fixture();for(const mode of ['OWNER','PAIRED'])for(const role of ['OWNER','ADMIN','CASHIER','AUDITOR','READ_ONLY','']){f.state.deviceAccessMode=mode;f.user.role=role;assert.equal(f.api.allowed(),['OWNER','ADMIN'].includes(role));}
 f.user.role='OWNER';f.user.user.active=false;assert.equal(f.api.allowed(),false);f.user.user.active=true;
 for(const patch of [{initialized:false},{deviceId:''},{deviceAccessStatus:'REVOKED'},{lifecycleState:'REPLACED'},{deviceAccessStatus:'ACTIVE',lifecycleState:'RETIRED'}]){const before={...f.state};Object.assign(f.state,patch);assert.equal(f.api.allowed(),false);Object.keys(f.state).forEach(k=>delete f.state[k]);Object.assign(f.state,before);}
});
test('recent active filtering retains all history and uses reported app version without changing registration status',()=>{
 const f=fixture(),now=Date.now(),current={device_id:'current',app_version:'3.31.19',last_seen_at:new Date(now).toISOString()},old={...current,device_id:'old',last_seen_at:new Date(now-8*86400000).toISOString()},revoked={...current,device_id:'revoked',revoked_at:'2026-11-01'},version={...current,device_id:'older-app',app_version:'3.31.17'},unknown={...current,device_id:'unknown',last_seen_at:null},retired={...current,device_id:'retired',status:'RETIRED'};
 const all=[current,old,revoked,version,unknown,retired],before=JSON.stringify(all);
 assert.deepEqual(Array.from(f.api.select(all,now,'3.31.19',false),d=>d.device_id),['current']);assert.equal(f.api.select(all,now,'3.31.19',true).length,6);assert.equal(JSON.stringify(all),before);
});
test('paired local role alone cannot read or mutate the fleet without verified Cloud owner authority',async()=>{
 for(const role of ['OWNER','ADMIN']){const f=fixture();f.user.role=role;f.state.deviceAccessMode='PAIRED';f.setReady(false);await assert.rejects(f.api.load(),/Verify the Owner/);await assert.rejects(f.api.requireActor(true),/Verify the Owner/);assert.equal(f.reads(),0);assert.equal(f.mfa(),0);assert.deepEqual(Array.from(f.api.records()),[]);}
});
test('reads from both consumers share one scoped request and valid rows do not disappear during refresh',async()=>{
 const f=fixture();await Promise.all([f.api.load(false),f.api.load(false)]);assert.equal(f.reads(),1);assert.equal(f.mfa(),0);assert.ok(f.queries.some(q=>q[0]==='business_id'&&q[1]==='B1'));
 let resolve;f.pending(new Promise(r=>{resolve=r;}));const refresh=f.api.load(true);await Promise.resolve();await Promise.resolve();assert.equal(f.api.records().length,1);resolve({data:[{device_id:'D2',app_version:'3.31.19',last_seen_at:new Date().toISOString()}]});await refresh;assert.equal(f.api.records()[0].device_id,'D2');
});
test('mutations retain primary MFA and paired verified-session requirements',async()=>{
 const f=fixture();await f.api.requireActor(true);assert.equal(f.mfa(),1);f.state.deviceAccessMode='PAIRED';f.setTemporary(true);await f.api.requireActor(true);assert.equal(f.mfa(),1);
 f.setReady(false);await assert.rejects(f.api.requireActor(true));assert.equal(f.mfa(),1);f.user.role='CASHIER';await assert.rejects(f.api.requireActor(false));assert.equal(f.reads(),0);
});
test('changed owner/business/staff context prevents stale results and cached directory disclosure',async()=>{
 const f=fixture();await f.api.load();let resolve;f.pending(new Promise(r=>{resolve=r;}));const request=f.api.load(true);await Promise.resolve();await Promise.resolve();f.state.businessId='B2';resolve({data:[{device_id:'D9'}]});await assert.rejects(request,/context changed/);assert.equal(f.api.records().length,0);f.user.role='CASHIER';assert.equal(f.api.html('registered'),'');
});
test('invalid or duplicate device identities cannot replace a valid directory snapshot',async()=>{
 const f=fixture();await f.api.load();for(const data of [null,[null],[{device_id:''}],[{device_id:'D1'},{device_id:'D1'}]]){f.response({data});await assert.rejects(f.api.load(true),/invalid response/);assert.equal(f.api.records().length,1);}
});
test('history toggle is presentation-only and current-device revocation is blocked before any request',async()=>{
 const f=fixture();await f.api.load();const before=JSON.stringify(f.state);f.api.toggle();assert.equal(JSON.stringify(f.state),before);assert.equal(f.reads(),1);assert.throws(()=>f.api.assertRevocation('D1'),/another authorized/);f.user.role='CASHIER';assert.throws(()=>f.api.toggle());assert.throws(()=>f.api.assertRevocation('D2'));assert.equal(f.reads(),1);
});
test('native Cloud management context supports registered Owner/Admin on paired devices but expires or rejects unverified/different staff sessions',()=>{
 const html=delivery.assembledShell(delivery.assetBytes('index.html').toString()),start=html.indexOf('  function deviceManagementStaff()'),end=html.indexOf('  async function verifyOwnerManagement(',start),native=html.slice(start,end);
 for(const role of ['OWNER','ADMIN']){const f=fixture();f.user.role=role;f.state.deviceAccessMode='PAIRED';Object.assign(f.c,{state:f.state,configured:()=>true,configurationError:()=>'',ownerManagement:null,clearOwnerManagementSession:()=>{f.c.ownerManagement=null;}});vm.runInContext(native,f.c);assert.equal(f.c.ownerManagementContext().ready,false);f.c.ownerManagement={staffId:'staff-1',expiresAt:Date.now()+10000,client:{},session:{user:{id:'owner'}}};assert.equal(f.c.ownerManagementContext().ready,true);f.c.ownerManagement.expiresAt=0;assert.equal(f.c.ownerManagementContext().ready,false);f.c.ownerManagement={staffId:'different',expiresAt:Date.now()+10000};assert.equal(f.c.ownerManagementContext().ready,false);}
});
test('all assembled differences are exactly the reviewed device transform and coupled original commercial module',()=>{
 const index=delivery.assetBytes('index.html').toString();let expected=delivery.assembledShell(index,{withoutDeviceCards:true});const meta=expected.match(/<meta name="zezms-delivery" content="[^"]+">/)[0];expected=expected.replace(meta,'');
 expected=expected.replace('<script src="js/commercial-foundation.js?v=20260812-portfolio-signals-r39"></script>','<script data-zezms-device-module="commercial-foundation.js">\n'+delivery.assetBytes('js/commercial-foundation.js').toString().replace(/<\/script/gi,'<\\/script')+'\n</script>');
 expected=transformDeviceCards(expected,delivery.assetBytes('js/device-cards.js').toString()).replace('</head>',meta+'</head>');assert.equal(delivery.sha(Buffer.from(delivery.assembledShell(index))),delivery.sha(Buffer.from(expected)));
 const old=execFileSync('git',['show','9286f24d472dff253b4b69cd1a13ea7a9e950fb9:index.html'],{maxBuffer:32*1024*1024}).toString();assert.equal(delivery.stripDelivery(index),delivery.stripDelivery(old));
 const before=delivery.assembledShell(old),after=delivery.assembledShell(index),owner=html=>html.slice(html.indexOf('  function localOwnerStaff()'),html.indexOf('  function clearOwnerManagementSession()'));assert.equal(owner(after),owner(before),'unrelated Owner-only authority remains unchanged');
 assert.throws(()=>transformDeviceCards('<html></html>',''),/MARKER/);
});
