/* Optional, device-local WebAuthn for the existing local staff authentication boundary. */
(function(root){
 'use strict';
 const BUILD='20261108-device-sign-in-r1',KEY='zezms_device_staff_passkeys_v1';
 const bytes=x=>x instanceof Uint8Array?x:new Uint8Array(x),utf8=x=>new TextEncoder().encode(x);
 function requireValue(ok,message){if(!ok)throw Error(message);}
 function encode(x){let s='';bytes(x).forEach(v=>s+=String.fromCharCode(v));return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
 function decode(s){requireValue(typeof s==='string'&&s.length>0&&s.length<=8192&&/^[A-Za-z0-9_-]+$/.test(s),'Invalid credential encoding.');const out=Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));requireValue(encode(out)===s,'Noncanonical credential encoding.');return out;}
 function same(a,b){a=bytes(a);b=bytes(b);return a.length===b.length&&a.every((x,i)=>x===b[i]);}
 function join(a,b){a=bytes(a);b=bytes(b);const out=new Uint8Array(a.length+b.length);out.set(a);out.set(b,a.length);return out;}
 async function digest(x){return new Uint8Array(await crypto.subtle.digest('SHA-256',typeof x==='string'?utf8(x):x));}
 function revision(a){return JSON.stringify([a.id,a.role,a.active,a.passwordAlgorithm,a.passwordIterations,a.passwordSalt,a.passwordHash,a.passwordChangedAt||'',a.createdAt||'',a.businessId]);}
 function clientData(raw,type,challenge,origin){
  raw=bytes(raw);requireValue(raw.length>0&&raw.length<=16384,'Invalid client data.');
  const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
  requireValue(data.type===type&&data.challenge===encode(challenge)&&data.origin===origin&&data.crossOrigin!==true&&(!data.topOrigin||data.topOrigin===origin),'The device response belongs to a different sign-in request or origin.');return raw;
 }
 async function authenticatorData(raw,rpId,registration){
  raw=bytes(raw);requireValue(raw.length>=37&&raw.length<=16384,'Invalid authenticator data.');
  requireValue(same(raw.slice(0,32),await digest(rpId)),'The device response belongs to another site.');
  const flags=raw[32];requireValue((flags&1)!==0&&(flags&4)!==0,'Device unlock verification is required.');
  requireValue(!(flags&16)||(flags&8),'Invalid credential backup flags.');
  requireValue(registration?!!(flags&64):!(flags&64),'Unexpected attested credential data.');
  return {raw,flags,counter:new DataView(raw.buffer,raw.byteOffset,raw.byteLength).getUint32(33,false)};
 }
 // WebAuthn ES256 signatures use ASN.1 DER; WebCrypto ECDSA accepts IEEE P1363.
 function signatureRaw(signature){
  const s=bytes(signature);requireValue(s.length>=8&&s.length<=72&&s[0]===48&&s[1]===s.length-2,'Invalid signature encoding.');let p=2;const out=new Uint8Array(64);
  for(let part=0;part<2;part++){
   requireValue(s[p++]===2,'Invalid signature integer.');let n=s[p++];requireValue(n>0&&n<=33&&p+n<=s.length,'Invalid signature integer length.');let v=s.slice(p,p+n);p+=n;
   requireValue(!(v[0]&128),'Negative signature integer.');if(v.length>1&&v[0]===0){requireValue(!!(v[1]&128),'Noncanonical signature integer.');v=v.slice(1);}
   requireValue(v.length<=32,'Oversized signature integer.');out.set(v,part*32+32-v.length);
  }
  requireValue(p===s.length,'Trailing signature data.');return out;
 }
 async function verifyAssertion(record,credential,challenge,origin,rpId){
  requireValue(credential&&credential.type==='public-key'&&credential.id===record.id&&encode(credential.rawId)===record.id,'Unexpected credential.');
  const response=credential.response,client=clientData(response.clientDataJSON,'webauthn.get',challenge,origin),auth=await authenticatorData(response.authenticatorData,rpId,false);
  requireValue(!response.userHandle||same(response.userHandle,decode(record.userHandle)),'The credential belongs to another staff registration.');
  requireValue(record.backupEligible===!!(auth.flags&8),'Credential backup eligibility changed.');
  requireValue((record.counter===0&&auth.counter===0)||auth.counter>record.counter,'The credential counter is stale. Use password sign-in and set up this device again.');
  const key=await crypto.subtle.importKey('spki',decode(record.publicKey),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  requireValue(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,signatureRaw(response.signature),join(auth.raw,await digest(client))),'The device signature could not be verified.');return auth.counter;
 }
 function create(env){
  let job=null,available=null,queued=false,uiGeneration=0,loginMessage='';
  const doc=env.document||document,storage=env.storage||localStorage,nav=env.navigator||navigator,loc=env.location||location;
  const origin=loc.origin,rpId=loc.hostname,scope=new URL('./',loc.href).pathname;
  const selected=()=>String((doc.getElementById('sharedLoginUser')||{}).value||'');
  const account=id=>{const a=env.account(id);requireValue(a&&a.active===true&&a.passwordAlgorithm==='PBKDF2-SHA256'&&a.passwordHash&&a.passwordSalt,'Staff access changed or is unavailable. Use the staff password.');requireValue(!a.lockedUntil||new Date(a.lockedUntil).getTime()<=Date.now(),'Staff sign-in is temporarily locked. Try again after the lock expires.');return a;};
  function binding(){const b=env.binding();requireValue(b&&b.allowed&&b.deviceId,'Device sign-in requires an active, established device. Use password sign-in for recovery.');return JSON.stringify([origin,scope,rpId,b.deviceId,b.mode,b.ownerId,b.businessId,b.lifecycleId]);}
  function read(){const raw=storage.getItem(KEY);if(raw===null)return {version:1,records:[]};requireValue(raw.length<=262144,'Device sign-in metadata is too large. Use your password.');const data=JSON.parse(raw);requireValue(data&&data.version===1&&Array.isArray(data.records)&&data.records.length<=100,'Device sign-in metadata is invalid. Use your password.');return data;}
  function record(id){const records=read().records.filter(r=>r.staffId===id);requireValue(records.length<=1,'Conflicting device credentials. Use your password.');return records[0]||null;}
  function save(data){const raw=JSON.stringify(data);storage.setItem(KEY,raw);requireValue(storage.getItem(KEY)===raw,'Device sign-in could not be saved. Use your password.');}
  function status(text,bad){if(!doc.getElementById('deviceSignInDialogStatus'))loginMessage=text;const target=doc.getElementById('deviceSignInDialogStatus')||doc.getElementById('deviceSignInStatus');if(target&&target.textContent!==text){target.textContent=text;target.style.color=bad?'#fda4af':'#99f6e4';}}
  function cancel(){const old=job;job=null;if(old)old.controller.abort();schedule();}
  function valid(op){requireValue(job===op&&!op.controller.signal.aborted&&Date.now()-op.wall<90000&&performance.now()-op.monotonic<90000,'Device sign-in was cancelled or expired.');requireValue(binding()===op.binding&&revision(account(op.id))===op.revision,'Staff or device access changed. Start again using your password.');requireValue(env.currentId()===op.current&&(op.kind!=='signIn'||selected()===op.id),'The selected staff member or session changed. Start again.');}
  async function supported(){
   if(available!==null)return available;
   available=!!(root.isSecureContext&&root.PublicKeyCredential&&nav.credentials&&nav.credentials.create&&nav.credentials.get&&nav.locks&&nav.locks.request&&crypto.subtle);
   if(available)try{available=await root.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();}catch(_){available=false;}
   return available;
  }
  async function run(kind,action){
   requireValue(!job,'A device sign-in request is already open.');requireValue(await supported(),'Device sign-in is unavailable on this browser/device. Continue using your password.');
   const id=kind==='signIn'?selected():env.currentId();requireValue(id,'Select a staff member or sign in first.');
   requireValue(kind==='signIn'?!env.currentId():!!env.currentId(),'Switch staff or sign in with a password before setting up this device.');
   const a=account(id),op={id,kind,current:env.currentId(),binding:binding(),revision:revision(a),wall:Date.now(),monotonic:performance.now(),controller:new AbortController()};
   requireValue(!job,'A device sign-in request is already open.');job=op;schedule();
   try{return await nav.locks.request('tradeflow-device-staff-sign-in',{mode:'exclusive',ifAvailable:true},async lock=>{requireValue(lock,'Another TradeFlow tab is using device sign-in. Close that prompt first.');valid(op);return action(op,a);});}
   finally{if(job===op)job=null;schedule();}
  }
  async function reauthenticate(op,a){
   const field=doc.getElementById('deviceSignInPassword');let password=String(field&&field.value||'');if(field)field.value='';requireValue(password,'Re-enter your current staff password.');
   const ok=await env.verifyPassword(a,password);password='';valid(op);
   if(!ok){env.passwordFailed(op.id);throw Error('Incorrect staff password.');}
  }
  async function enroll(){try{return await run('enroll',async(op,a)=>{
   requireValue(!!(doc.getElementById('deviceSignInPrivate')||{}).checked,'Confirm that this OS profile/device unlock is private to you.');await reauthenticate(op,a);valid(op);
   const challenge=crypto.getRandomValues(new Uint8Array(32)),userHandle=crypto.getRandomValues(new Uint8Array(32)),old=record(op.id);status('Confirm device unlock in the fingerprint, face or PIN prompt.');
   const credential=await nav.credentials.create({publicKey:{challenge,rp:{id:rpId,name:'TradeFlow local staff sign-in'},user:{id:userHandle,name:a.name,displayName:a.name},pubKeyCredParams:[{type:'public-key',alg:-7}],authenticatorSelection:{authenticatorAttachment:'platform',residentKey:'discouraged',userVerification:'required'},attestation:'none',timeout:60000,excludeCredentials:[]},signal:op.controller.signal});valid(op);
   requireValue(credential&&credential.type==='public-key'&&credential.authenticatorAttachment==='platform'&&credential.id===encode(credential.rawId),'A platform device credential is required.');
   const response=credential.response;clientData(response.clientDataJSON,'webauthn.create',challenge,origin);
   requireValue(typeof response.getPublicKey==='function'&&response.getPublicKeyAlgorithm()===-7,'This device cannot export a supported verification key. Use your password.');
   const auth=await authenticatorData(response.getAuthenticatorData(),rpId,true),rawId=bytes(credential.rawId),n=auth.raw.length>=55?new DataView(auth.raw.buffer,auth.raw.byteOffset,auth.raw.byteLength).getUint16(53,false):0;
   requireValue(rawId.length>=16&&rawId.length<=1024&&n===rawId.length&&same(auth.raw.slice(55,55+n),rawId),'Invalid registered credential ID.');
   const publicKey=response.getPublicKey();requireValue(publicKey&&publicKey.byteLength<=1024,'Missing credential public key.');await crypto.subtle.importKey('spki',publicKey,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
   const next={staffId:op.id,id:credential.id,userHandle:encode(userHandle),publicKey:encode(publicKey),counter:auth.counter,backupEligible:!!(auth.flags&8),accountDigest:encode(await digest(op.revision)),bindingDigest:encode(await digest(op.binding)),createdAt:new Date().toISOString()};valid(op);
   const data=read();requireValue(JSON.stringify(record(op.id))===JSON.stringify(old),'Device registration changed in another tab. Start again.');data.records=data.records.filter(r=>r.staffId!==op.id);data.records.push(next);requireValue(data.records.length<=100,'This profile has too many device registrations.');save(data);status('Device sign-in is enabled for '+a.name+' on this browser. Password sign-in remains available.');return true;
  });}catch(error){status(friendly(error),true);return false;}}
  async function signIn(){try{return await run('signIn',async op=>{
   const before=record(op.id);requireValue(before,'Sign in with your password, then set up Device sign-in from the sidebar.');
   requireValue(before.accountDigest===encode(await digest(op.revision))&&before.bindingDigest===encode(await digest(op.binding)),'Staff credentials or device binding changed. Use your password and set up device sign-in again.');valid(op);
   const challenge=crypto.getRandomValues(new Uint8Array(32));status('Confirm device unlock to sign in.');
   const credential=await nav.credentials.get({publicKey:{challenge,rpId,allowCredentials:[{type:'public-key',id:decode(before.id),transports:['internal']}],userVerification:'required',timeout:60000},signal:op.controller.signal});valid(op);
   const counter=await verifyAssertion(before,credential,challenge,origin,rpId);valid(op);
   requireValue(JSON.stringify(record(op.id))===JSON.stringify(before),'Device registration changed while signing in. Start again.');
   const data=read(),next=data.records.find(r=>r.staffId===op.id);next.counter=counter;next.lastUsedAt=new Date().toISOString();save(data);valid(op);
   const current=account(op.id);env.complete(op.id,JSON.stringify(current));status('Device sign-in completed.');return true;
  });}catch(error){status(friendly(error),true);return false;}}
  async function remove(){try{return await run('remove',async(op,a)=>{await reauthenticate(op,a);valid(op);const data=read();data.records=data.records.filter(r=>r.staffId!==op.id);save(data);status('Device sign-in was removed from this browser. Password sign-in remains available.');return true;});}catch(error){status(friendly(error),true);return false;}}
  function friendly(error){return ['NotAllowedError','AbortError','InvalidStateError'].includes(error&&error.name)?'Device verification was cancelled, unavailable or already registered. Continue with your password; no sign-in was granted.':String(error&&error.message||error);}
  function close(){cancel();const dialog=doc.getElementById('deviceSignInDialog');if(dialog){const password=dialog.querySelector('input[type=password]');if(password)password.value='';if(dialog.open)dialog.close();dialog.remove();}}
  function openSettings(){
   try{requireValue(env.currentId(),'Sign in with your password first.');const a=account(env.currentId());binding();close();const dialog=doc.createElement('dialog');dialog.id='deviceSignInDialog';dialog.dataset.staffId=a.id;dialog.className='tf-device-sign-in';dialog.innerHTML='<h3>Device sign-in</h3><p id="deviceSignInAccount"></p><p>Use this device’s fingerprint, face or PIN instead of typing the staff password. TradeFlow does not receive your fingerprint.</p><p><strong>Shared computers:</strong> anyone who can unlock the same OS profile may use its passkeys. Use a separate OS profile for each staff member.</p><label class="tf-private"><input id="deviceSignInPrivate" type="checkbox"> This OS profile/device unlock is private to me.</label><label for="deviceSignInPassword">Re-enter your current staff password</label><input id="deviceSignInPassword" type="password" autocomplete="current-password"><p id="deviceSignInDialogStatus" role="status"></p><div class="row"><button type="button" class="btn" data-device="enroll">Enable / replace device sign-in</button><button type="button" class="btn ghost" data-device="remove">Remove device sign-in</button><button type="button" class="btn ghost" data-device="close">Close</button></div>';doc.body.appendChild(dialog);dialog.querySelector('#deviceSignInAccount').textContent=a.name+' · '+a.role;dialog.querySelector('[data-device=enroll]').onclick=enroll;dialog.querySelector('[data-device=remove]').onclick=remove;dialog.querySelector('[data-device=close]').onclick=close;dialog.addEventListener('cancel',event=>{event.preventDefault();close();});dialog.showModal();schedule();
   }catch(error){status(friendly(error),true);if(env.notice)env.notice(friendly(error));}
  }
  function setText(el,text){if(el&&el.textContent!==text)el.textContent=text;}
  function styles(){if(doc.getElementById('deviceSignInStyles'))return;const style=doc.createElement('style');style.id='deviceSignInStyles';style.textContent='.tf-device-sign-in{box-sizing:border-box;width:min(94vw,560px);max-height:92vh;overflow:auto;background:#0f172a;color:#f8fafc;padding:20px;border:1px solid #64748b;border-radius:10px}.tf-device-sign-in::backdrop{background:rgba(0,0,0,.7)}.tf-device-sign-in p{line-height:1.5}.tf-device-sign-in label{display:block;margin:12px 0 6px}.tf-device-sign-in input[type=password]{box-sizing:border-box;width:100%;padding:10px;color:#f8fafc;caret-color:#f8fafc;background:#081221;border:1px solid #64748b;border-radius:5px;font:inherit;color-scheme:dark}.tf-device-sign-in input:focus{outline:2px solid #2dd4bf;outline-offset:2px}.tf-device-sign-in .row{display:flex;gap:8px;flex-wrap:wrap}.tf-device-sign-in .tf-private{display:flex;gap:8px;align-items:start}.tf-device-login{margin-top:12px}.tf-device-login button{width:100%;white-space:normal}.tf-device-login p{font-size:12px;line-height:1.4}';doc.head.appendChild(style);}
  async function refresh(){
   const generation=++uiGeneration,ok=await supported();if(generation!==uiGeneration)return;
   const button=doc.getElementById('deviceSignInButton'),note=doc.getElementById('deviceSignInStatus'),dialog=doc.getElementById('deviceSignInDialog');if(env.currentId()){if(button)button.disabled=true;if(dialog)dialog.querySelectorAll('[data-device=enroll],[data-device=remove]').forEach(b=>b.disabled=!ok||!!job);return;}let linked=false;
   try{const id=selected(),a=account(id),r=record(id),b=binding();linked=!!r&&r.accountDigest===encode(await digest(revision(a)))&&r.bindingDigest===encode(await digest(b));}catch(_){}
   if(generation!==uiGeneration)return;if(button)button.disabled=!ok||!linked||!!job;
   if(!job)setText(note,loginMessage||(!ok?'Device unlock is unavailable in this browser. Password sign-in works as usual.':linked?'Device sign-in is set up for the selected staff member.':'Sign in with your password, then open Device sign-in in the sidebar to set up this browser.'));
   if(dialog)dialog.querySelectorAll('[data-device=enroll],[data-device=remove]').forEach(b=>b.disabled=!ok||!!job);
  }
  function mount(){queued=false;if(job){try{valid(job);}catch(_){cancel();}}const openDialog=doc.getElementById('deviceSignInDialog');if(openDialog&&openDialog.dataset.staffId!==env.currentId())close();styles();const passwordButton=doc.getElementById('sharedLoginButton');if(passwordButton&&!doc.getElementById('deviceSignInButton')){const box=doc.createElement('div');box.className='tf-device-login';box.innerHTML='<button id="deviceSignInButton" type="button" class="btn ghost" disabled>Sign in with device · fingerprint / PIN</button><p id="deviceSignInStatus" role="status"></p>';passwordButton.insertAdjacentElement('afterend',box);box.querySelector('button').onclick=signIn;}
   const switcher=doc.getElementById('navAdminMode');if(switcher&&!doc.getElementById('navDeviceSignIn')){const button=doc.createElement('button');button.id='navDeviceSignIn';button.type='button';button.textContent='🔐 Device sign-in';button.onclick=openSettings;switcher.insertAdjacentElement('afterend',button);}
   refresh().catch(()=>{});
  }
  function schedule(){if(!queued){queued=true;queueMicrotask(mount);}}
  doc.addEventListener('change',event=>{if(event.target.id==='sharedLoginUser'){loginMessage='';cancel();schedule();}});
  doc.addEventListener('click',event=>{if(event.target.closest('#sharedLoginButton')){loginMessage='';cancel();}},true);
  doc.addEventListener('zezms-staff-auth-changed',()=>{cancel();if(!env.currentId())close();schedule();});
  doc.addEventListener('visibilitychange',()=>{if(doc.hidden)cancel();});root.addEventListener('pagehide',cancel);root.addEventListener('zezms-cloud-ready',schedule);
  root.addEventListener('storage',event=>{if([KEY,'zezms_cloud_sync_m4_state','tradeflow_v321_zola'].includes(event.key))cancel();});
  new MutationObserver(changes=>{if((doc.getElementById('sharedLoginButton')&&!doc.getElementById('deviceSignInButton'))||(doc.getElementById('navAdminMode')&&!doc.getElementById('navDeviceSignIn'))||changes.some(c=>c.target.id==='sharedLoginUser'))schedule();}).observe(doc.body,{subtree:true,childList:true});const app=doc.getElementById('appShell');if(app)new MutationObserver(schedule).observe(app,{attributes:true,attributeFilter:['style']});schedule();
  return Object.freeze({build:BUILD,openSettings,enroll,remove,signIn,cancel,isAvailable:supported});
 }
 if(typeof module==='object'&&module.exports){module.exports={create,encode,decode,same,join,digest,revision,clientData,authenticatorData,signatureRaw,verifyAssertion,KEY};return;}
 root.ZEZMS=root.ZEZMS||{};root.ZEZMS.createDeviceSignIn=create;
})(typeof window==='object'?window:globalThis);
