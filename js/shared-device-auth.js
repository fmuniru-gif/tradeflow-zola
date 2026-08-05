/* ZEZMS v3.6.9 — Cross-Device Staff Access */
(function(){
'use strict';
window.ZEZMS=window.ZEZMS||{};
const BUILD='20260805-cross-device-staff-access-r27';
const ITER=210000, RECOVERY_KEY='zezms-shared-device-owner-recovery', DIRECTORY_MARKER_KEY='zezms-shared-device-directory-published';
const ROLES={
 OWNER:['*'],
 ADMIN:['LOGIN','VIEW_DASHBOARD','SALE_OUT','VIEW_RECEIPTS','STOCK_IN','VIEW_PRODUCTS','MANAGE_PRODUCTS','VIEW_STOCK','VIEW_CASH','MANAGE_CASH','VIEW_EXPENSES','MANAGE_EXPENSES','VIEW_ACCOUNTS','MANAGE_ACCOUNTS','VIEW_REPORTS','MANAGE_SYNC','MANAGE_SETTINGS','MANAGE_STAFF','UNDO_TRANSACTION','PRICE_ADJUSTMENT','EXPORT_BACKUP','IMPORT_DATA','RESET_DATA','MANAGE_DOCUMENTS','VIEW_AUDIT'],
 MANAGER:['LOGIN','VIEW_DASHBOARD','SALE_OUT','VIEW_RECEIPTS','STOCK_IN','VIEW_PRODUCTS','MANAGE_PRODUCTS','VIEW_STOCK','VIEW_CASH','MANAGE_CASH','VIEW_EXPENSES','MANAGE_EXPENSES','VIEW_ACCOUNTS','MANAGE_ACCOUNTS','VIEW_REPORTS','UNDO_TRANSACTION','PRICE_ADJUSTMENT','EXPORT_BACKUP','MANAGE_DOCUMENTS'],
 CASHIER:['LOGIN','SALE_OUT','VIEW_RECEIPTS'],
 READ_ONLY:['LOGIN','VIEW_DASHBOARD','VIEW_RECEIPTS','VIEW_PRODUCTS','VIEW_STOCK','VIEW_CASH','VIEW_EXPENSES','VIEW_ACCOUNTS','VIEW_REPORTS','EXPORT_BACKUP'],
 AUDITOR:['LOGIN','VIEW_DASHBOARD','VIEW_RECEIPTS','VIEW_PRODUCTS','VIEW_STOCK','VIEW_CASH','VIEW_EXPENSES','VIEW_ACCOUNTS','VIEW_REPORTS','EXPORT_BACKUP','VIEW_AUDIT']
};
const VIEW={dashboard:'VIEW_DASHBOARD',pos:'SALE_OUT',receipts:'VIEW_RECEIPTS',stockin:'STOCK_IN',products:'VIEW_PRODUCTS',stock:'VIEW_STOCK',cash:'VIEW_CASH',expenses:'VIEW_EXPENSES',accounts:'VIEW_ACCOUNTS',reports:'VIEW_REPORTS',sync:'MANAGE_SYNC',settings:'MANAGE_SETTINGS'};
const WRAP={quickSaleOut:'SALE_OUT',printReceiptSale:'SALE_OUT',doStockIn:'STOCK_IN',addProduct:'MANAGE_PRODUCTS',saveEditProduct:'MANAGE_PRODUCTS',delProduct:'MANAGE_PRODUCTS',doCashMove:'MANAGE_CASH',addExpense:'MANAGE_EXPENSES',delExpense:'MANAGE_EXPENSES',addAccount:'MANAGE_ACCOUNTS',applySettle:'MANAGE_ACCOUNTS',deleteAccountHolder:'MANAGE_ACCOUNTS',saveElectronicInvoice:'MANAGE_DOCUMENTS',saveElectronicWaybill:'MANAGE_DOCUMENTS',voidCommercialDocument:'MANAGE_DOCUMENTS',waybillFromInvoice:'MANAGE_DOCUMENTS',undoLast:'UNDO_TRANSACTION',undoInventoryTransaction:'UNDO_TRANSACTION',undoLastInventoryTransaction:'UNDO_TRANSACTION',undoAccountTransaction:'UNDO_TRANSACTION',undoLastAccountTransaction:'UNDO_TRANSACTION',undoSelectedAccountTransaction:'UNDO_TRANSACTION',undoCashTransaction:'UNDO_TRANSACTION',undoLastCashTransaction:'UNDO_TRANSACTION',undoSelectedCashTransaction:'UNDO_TRANSACTION',unlockPriceAdj:'PRICE_ADJUSTMENT',saveBiz:'MANAGE_SETTINGS',resetAll:'RESET_DATA',importDB:'IMPORT_DATA',importExcelWorkbook:'IMPORT_DATA',restoreFromLocal:'IMPORT_DATA',restoreCloudBackupAt:'IMPORT_DATA',m4SaveConfiguration:'MANAGE_SYNC',m4CreateCloudAccount:'MANAGE_SYNC',m4SignIn:'MANAGE_SYNC',m4SignOut:'MANAGE_SYNC',m4BootstrapThisDevice:'MANAGE_SYNC',m4DownloadCloudMaster:'MANAGE_SYNC'};
const REAUTH=new Set(['MANAGE_STAFF','MANAGE_SETTINGS','MANAGE_SYNC','IMPORT_DATA','RESET_DATA']);
let wrapped=false,recoveryClient=null,recoverySession=null,recoveryFactors=[];
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function attr(v){return esc(v).replace(/\n/g,'');}
function stamp(){return new Date().toISOString();}
function uid(prefix='USR-'){try{return prefix+crypto.randomUUID().replace(/-/g,'').slice(0,10).toUpperCase();}catch(_){return prefix+Math.random().toString(36).slice(2,12).toUpperCase();}}
function b64(bytes){let s='';bytes.forEach(x=>s+=String.fromCharCode(x));return btoa(s);}
function unb64(s){const x=atob(String(s||'')),a=new Uint8Array(x.length);for(let i=0;i<x.length;i++)a[i]=x.charCodeAt(i);return a;}
async function derive(password,salt,iterations){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(String(password||'')),{name:'PBKDF2'},false,['deriveBits']);return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:Number(iterations)||ITER,hash:'SHA-256'},key,256));}
function equal(a,b){if(!(a instanceof Uint8Array)||!(b instanceof Uint8Array)||!a.length||!b.length)return false;let d=a.length^b.length,n=Math.max(a.length,b.length);for(let i=0;i<n;i++)d|=(a[i%a.length]||0)^(b[i%b.length]||0);return d===0;}
async function makePassword(password){const salt=crypto.getRandomValues(new Uint8Array(16)),hash=await derive(password,salt,ITER);return{algorithm:'PBKDF2-SHA256',iterations:ITER,salt:b64(salt),hash:b64(hash)};}
async function verify(user,password){if(!user||!user.passwordHash||!user.passwordSalt)return false;return equal(await derive(password,unb64(user.passwordSalt),user.passwordIterations||ITER),unb64(user.passwordHash));}
function businessId(){try{if(DB&&DB.sharedDeviceAuth&&DB.sharedDeviceAuth.businessId)return String(DB.sharedDeviceAuth.businessId);if(DB&&DB.commercialSecurity&&DB.commercialSecurity.businessId)return String(DB.commercialSecurity.businessId);const f=JSON.parse(localStorage.getItem('zezms_commercial_m5a1_state')||'{}');return String(f.businessId||(f.context&&f.context.business_id)||'');}catch(_){return '';}}
function model(){if(!DB.sharedDeviceAuth||typeof DB.sharedDeviceAuth!=='object')DB.sharedDeviceAuth={version:1,enabled:false,businessId:businessId(),users:[],audit:[],createdAt:'',updatedAt:''};const m=DB.sharedDeviceAuth;if(!Array.isArray(m.users))m.users=[];if(!Array.isArray(m.audit))m.audit=[];if(!m.businessId)m.businessId=businessId();m.users.forEach(u=>{if(!u.id)u.id=uid();if(!u.role)u.role='CASHIER';if(typeof u.active!=='boolean')u.active=true;});return m;}

function directoryUser(u){
  return {
    id:String(u.id||''),
    name:String(u.name||''),
    tel:String(u.tel||''),
    role:String(u.role||'CASHIER').toUpperCase(),
    active:u.active!==false,
    signatureFile:String(u.signatureFile||''),
    passwordAlgorithm:String(u.passwordAlgorithm||'PBKDF2-SHA256'),
    passwordIterations:Number(u.passwordIterations)||ITER,
    passwordSalt:String(u.passwordSalt||''),
    passwordHash:String(u.passwordHash||''),
    passwordChangedAt:String(u.passwordChangedAt||''),
    createdAt:String(u.createdAt||''),
    updatedAt:String(u.updatedAt||'')
  };
}

function directoryPayload(){
  const m=model();
  return {
    version:1,
    businessId:String(m.businessId||businessId()),
    enabled:!!m.enabled,
    updatedAt:String(m.updatedAt||stamp()),
    users:m.users.map(directoryUser)
  };
}

function directoryFingerprint(value){
  const text=JSON.stringify(value||directoryPayload());
  let hash=2166136261;
  for(let i=0;i<text.length;i++){
    hash^=text.charCodeAt(i);
    hash=Math.imul(hash,16777619);
  }
  return (hash>>>0).toString(16);
}

function writeDirectoryRoot(){
  DB.sharedDeviceDirectory=directoryPayload();
  return DB.sharedDeviceDirectory;
}

function importDirectory(){
  const root=DB&&DB.sharedDeviceDirectory;
  if(!root||!Array.isArray(root.users)||!root.users.length)return false;
  const m=model();
  const localById=new Map(m.users.map(u=>[String(u.id||''),u]));
  m.users=root.users.map(remote=>{
    const local=localById.get(String(remote.id||''))||{};
    return Object.assign({},remote,{
      failedAttempts:Number(local.failedAttempts)||0,
      lockedUntil:String(local.lockedUntil||''),
      lastLoginAt:String(local.lastLoginAt||'')
    });
  });
  m.enabled=root.enabled!==false;
  m.businessId=String(root.businessId||m.businessId||businessId());
  m.directoryUpdatedAt=String(root.updatedAt||'');
  return true;
}

async function publishDirectory(showNotice){
  const sync=window.ZEZMS&&ZEZMS.cloudSync;
  if(!sync||typeof sync.publishRoot!=='function'){
    if(showNotice!==false)status('Cloud Sync M4 is not ready to publish staff access.','error');
    return false;
  }
  const payload=writeDirectoryRoot();
  saveDB();
  await sync.publishRoot('sharedDeviceDirectory',payload,'SHARED_DEVICE_DIRECTORY');
  try{localStorage.setItem(DIRECTORY_MARKER_KEY,directoryFingerprint(payload));}catch(_){}
  if(showNotice!==false)toast('Staff access published to the other authorised devices.');
  return true;
}

async function autoPublishDirectory(){
  if(!['OWNER','ADMIN'].includes(role()))return false;
  const payload=directoryPayload();
  const fingerprint=directoryFingerprint(payload);
  let previous='';
  try{previous=localStorage.getItem(DIRECTORY_MARKER_KEY)||'';}catch(_){}
  if(previous===fingerprint)return true;
  try{return await publishDirectory(false);}catch(error){
    console.warn('Shared-device directory could not be auto-published',error);
    return false;
  }
}
function users(){return model().users.filter(u=>u&&u.active!==false&&u.passwordHash).slice().sort((a,b)=>(a.role==='OWNER'?0:1)-(b.role==='OWNER'?0:1)||String(a.name||'').localeCompare(String(b.name||'')));}
function current(){return model().users.find(u=>u.id===session.sharedUserId)||null;}
function role(){return String((session&&session.commercialRole)||(current()&&current().role)||'').toUpperCase();}
function can(action){const a=ROLES[role()]||[];return a.includes('*')||a.includes(String(action||'').toUpperCase());}
function canView(view){return can(VIEW[view]||'LOGIN');}
function fallback(){if(canView('pos'))return'pos';if(canView('dashboard'))return'dashboard';if(canView('receipts'))return'receipts';return'pos';}
function elevated(){return ['OWNER','ADMIN','MANAGER','READ_ONLY','AUDITOR'].includes(role());}
function audit(type,payload={}){const m=model();m.audit.push({id:uid('AUTH-'),at:stamp(),eventType:type,staffId:session.sharedUserId||'',staffName:session.cashier||'',role:role(),payload});if(m.audit.length>500)m.audit.splice(0,m.audit.length-500);m.updatedAt=stamp();saveDB();}
function status(message,type='info'){const e=document.getElementById('sharedLoginStatus');if(!e)return;const s={ok:['#052e2b','#2dd4bf','#ccfbf1'],error:['#3f1017','#fb7185','#ffe4e6'],working:['#172554','#60a5fa','#dbeafe'],info:['#1e293b','#475569','#cbd5e1']}[type]||['#1e293b','#475569','#cbd5e1'];e.style.background=s[0];e.style.borderColor=s[1];e.style.color=s[2];e.textContent=String(message||'');}
function refreshUsers(){importDirectory();const s=document.getElementById('sharedLoginUser');if(!s)return;const list=users(),old=s.value;s.innerHTML=list.map(u=>`<option value="${attr(u.id)}">${esc(u.name)} (${esc(u.role.replace('_',' '))})</option>`).join('');if(old&&list.some(u=>u.id===old))s.value=old;if(!list.length){s.innerHTML='<option value="">Owner setup required</option>';status('No staff directory is stored on this device yet. Select Refresh staff list to receive it from Cloud Sync M4.','working');}else status(`${list.length} active staff account${list.length===1?'':'s'} available. Cloud Sync remains connected.`,'info');}

async function refreshUsersFromCloud(showNotice){
  refreshUsers();
  const sync=window.ZEZMS&&ZEZMS.cloudSync;
  if(!sync||typeof sync.pullNow!=='function'){
    if(showNotice!==false)status('Cloud Sync M4 has not loaded on this device.','error');
    return false;
  }
  try{
    status('Checking Cloud Sync M4 for the shared staff directory…','working');
    if(typeof sync.waitUntilReady==='function')await sync.waitUntilReady(7000);
    await sync.pullNow(true);
    importDirectory();
    refreshUsers();
    if(users().length){
      if(showNotice!==false)status('Shared staff access received from Cloud Sync M4.','ok');
      return true;
    }
    if(showNotice!==false)status('No published staff directory was found. Sign in on the main device and publish staff access first.','error');
    return false;
  }catch(error){
    console.error('Shared staff directory refresh failed',error);
    if(showNotice!==false)status('Could not receive staff access: '+(error&&error.message||error),'error');
    return false;
  }
}
async function login(){const id=String((document.getElementById('sharedLoginUser')||{}).value||''),password=String((document.getElementById('sharedLoginPassword')||{}).value||''),u=model().users.find(x=>x.id===id),btn=document.getElementById('sharedLoginButton');if(!u||!u.passwordHash){status('Select Owner recovery / first setup to create staff passwords.','error');return;}if(!password){status('Enter the selected staff member’s password.','error');return;}const lock=u.lockedUntil?new Date(u.lockedUntil).getTime():0;if(lock>Date.now()){status(`Too many failed attempts. Try again in ${Math.ceil((lock-Date.now())/1000)} seconds.`,'error');return;}if(btn){btn.disabled=true;btn.textContent='Checking password…';}status('Checking the local staff password…','working');try{if(!await verify(u,password)){u.failedAttempts=Number(u.failedAttempts||0)+1;if(u.failedAttempts>=5){u.failedAttempts=0;u.lockedUntil=new Date(Date.now()+30000).toISOString();}saveDB();status(`Incorrect password for ${u.name}.`,'error');return;}u.failedAttempts=0;u.lockedUntil='';u.lastLoginAt=stamp();saveDB();session.cashier=u.name;session.tel=u.tel||'';session.role=['OWNER','ADMIN','MANAGER','READ_ONLY','AUDITOR'].includes(u.role)?'ADMIN':'CASHIER2';session.sig=u.signatureFile||'';session.isCashier2=u.role==='CASHIER';session.adminMode=false;session.commercialRole=u.role;session.sharedUserId=u.id;session.businessId=model().businessId;cart=[];priceAdjUnlocked=false;document.getElementById('loginScreen').style.display='none';document.getElementById('appShell').style.display='flex';updateUserBadge();applyRoleUI();updatePeriodUI();audit('STAFF_SIGNED_IN',{userId:u.id});nav(fallback());toast('Welcome, '+String(u.name).split(' ')[0]+'!');if(['OWNER','ADMIN'].includes(u.role))setTimeout(()=>{autoPublishDirectory();},800);}catch(e){console.error(e);status(e.message||String(e),'error');}finally{if(btn){btn.disabled=false;btn.textContent='Sign in to this shared device';}}}
async function logout(){if(session.sharedUserId)audit('STAFF_SIGNED_OUT',{userId:session.sharedUserId});session={cashier:null,tel:null,role:null,adminMode:false,sig:null,isCashier2:false};cart=[];priceAdjUnlocked=false;document.getElementById('appShell').style.display='none';document.getElementById('loginScreen').style.display='flex';const p=document.getElementById('sharedLoginPassword');if(p)p.value='';refreshUsers();}
function badge(){const n=document.getElementById('uiUserName'),b=document.getElementById('uiUserRole');if(n)n.textContent=session.cashier||'—';if(b){b.textContent=role().replace('_',' ');b.className=role()==='CASHIER'?'badge cashier':'badge admin';}}
function roleUI(){document.querySelectorAll('#mainNav button[data-view]').forEach(b=>b.style.display=canView(b.dataset.view)?'':'none');const sw=document.getElementById('navAdminMode');if(sw){sw.style.display='';sw.textContent='⇄ Switch Staff';sw.style.background='rgba(20,184,166,.18)';sw.style.color='#99f6e4';}document.querySelectorAll('[data-admin-only]').forEach(e=>{if(e.id==='navAdminMode')return;const v=e.dataset&&e.dataset.view;e.style.display=v?(canView(v)?'':'none'):'';});badge();}
function afterRender(){const a=document.getElementById('legacyPinSecurityCard'),b=document.getElementById('legacyLocalUsersCard');if(a)a.remove();if(b)b.remove();if(['READ_ONLY','AUDITOR'].includes(role())){const names=Object.keys(WRAP);document.querySelectorAll('#viewRoot button[onclick]').forEach(x=>{const c=String(x.getAttribute('onclick')||'');if(names.some(n=>c.includes(n+'(')))x.style.display='none';});document.querySelectorAll('#viewRoot input:not([type="search"]),#viewRoot select,#viewRoot textarea').forEach(f=>{if(!f.closest('.period-selector')&&!String(f.id||'').startsWith('receiptNameSearch')&&!String(f.id||'').startsWith('stockSearch'))f.disabled=true;});}}
async function reauth(title){const u=current();if(!u)return false;return new Promise(resolve=>{sharedModal(`<h3>${esc(title||'Confirm staff password')}</h3><p class="muted">Re-enter the password for ${esc(u.name)}.</p><div class="field"><label>Password / secure PIN</label><input id="sharedReauthPassword" type="password" autocomplete="current-password"></div><div class="row"><button class="btn" id="sharedReauthConfirm">Confirm</button><button class="btn ghost" id="sharedReauthCancel">Cancel</button></div>`);document.getElementById('sharedReauthCancel').onclick=()=>{closeModal();resolve(false);};document.getElementById('sharedReauthConfirm').onclick=async()=>{const p=String((document.getElementById('sharedReauthPassword')||{}).value||'');if(!await verify(u,p)){toast('Incorrect password.','err');return;}closeModal();audit('SENSITIVE_ACTION_CONFIRMED',{title:String(title||'')});resolve(true);};setTimeout(()=>{const x=document.getElementById('sharedReauthPassword');if(x)x.focus();},50);});}
async function sensitive(title){if(!['OWNER','ADMIN','MANAGER'].includes(role())){toast('Your role cannot perform this action.','err');return false;}return reauth(title);}
function wrap(name,action){const original=window[name];if(typeof original!=='function'||original.__sharedDeviceWrapped)return;const fn=async function(){if(!can(action)){toast('Your staff role cannot perform this action.','err');return false;}if(REAUTH.has(action)&&!await reauth('Confirm '+action.replace(/_/g,' ').toLowerCase()))return false;return original.apply(this,arguments);};fn.__sharedDeviceWrapped=true;window[name]=fn;}
function guards(){if(wrapped)return;Object.keys(WRAP).forEach(n=>wrap(n,WRAP[n]));wrapped=true;}
async function upsert(values,id){const m=model(),name=String(values.name||'').trim(),tel=String(values.tel||'').trim(),r=String(values.role||'CASHIER').toUpperCase(),password=String(values.password||'');if(!name)throw new Error('Staff name is required.');if(!ROLES[r])throw new Error('Invalid role.');let u=id?m.users.find(x=>x.id===id):null;if(!u){u={id:uid(),createdAt:stamp()};m.users.push(u);}if(u.role==='OWNER'&&r!=='OWNER')throw new Error('The Owner role cannot be removed here.');u.name=name;u.tel=tel;u.role=r;u.active=values.active!==false;u.updatedAt=stamp();if(password){if(password.length<6)throw new Error('Password or secure PIN must contain at least 6 characters.');const rec=await makePassword(password);u.passwordAlgorithm=rec.algorithm;u.passwordIterations=rec.iterations;u.passwordSalt=rec.salt;u.passwordHash=rec.hash;u.passwordChangedAt=stamp();}else if(!u.passwordHash)throw new Error('A password is required for a new staff account.');m.enabled=true;m.updatedAt=stamp();if(!m.createdAt)m.createdAt=stamp();if(DB.security&&Array.isArray(DB.security.cashiers))DB.security.cashiers.forEach(c=>{if(c&&Object.prototype.hasOwnProperty.call(c,'password'))delete c.password;});if(DB.security){DB.security.adminPIN='';DB.security.pricePIN='';DB.security.sharedDevicePasswordsActive=true;}writeDirectoryRoot();saveDB();return u;}
function rows(){return model().users.slice().sort((a,b)=>(a.role==='OWNER'?0:1)-(b.role==='OWNER'?0:1)||String(a.name||'').localeCompare(String(b.name||''))).map(u=>`<tr><td>${esc(u.name)}${u.active===false?' <span class="badge bad">INACTIVE</span>':''}</td><td>${esc(u.tel||'')}</td><td><span class="badge ${u.role==='CASHIER'?'cashier':'admin'}">${esc(u.role.replace('_',' '))}</span></td><td>${u.passwordHash?'PBKDF2 protected':'Password required'}</td><td style="font-size:11px">${esc(u.lastLoginAt?new Date(u.lastLoginAt).toLocaleString():'Never')}</td><td><button class="btn sm ghost" onclick="sharedDeviceEditUser('${attr(u.id)}')">Manage</button></td></tr>`).join('')||'<tr><td colspan="6" class="empty">No shared-device users.</td></tr>';}
function card(){if(!can('MANAGE_SETTINGS'))return'';return `<div class="card" style="margin-top:12px"><div class="row" style="justify-content:space-between;align-items:center"><h3 style="margin:0">Shared-Device Staff Access</h3><span class="badge ok">ACTIVE</span></div><p class="muted" style="font-size:12px;line-height:1.55">Several staff members can use this same registered device. Staff switching does not sign out Cloud Sync M4. Passwords are stored only as salted PBKDF2 hashes.</p><div class="table-wrap"><table><thead><tr><th>Name</th><th>Telephone</th><th>Role</th><th>Password</th><th>Last login</th><th>Action</th></tr></thead><tbody>${rows()}</tbody></table></div><hr class="hr"><h3>Add staff member</h3><div class="grid g2"><div class="field"><label>Full name</label><input id="sharedNewName"></div><div class="field"><label>Telephone</label><input id="sharedNewTel"></div><div class="field"><label>Role</label><select id="sharedNewRole"><option value="ADMIN">ADMIN</option><option value="MANAGER">MANAGER</option><option value="CASHIER" selected>CASHIER</option><option value="READ_ONLY">READ ONLY</option><option value="AUDITOR">AUDITOR</option></select></div><div class="field"><label>Password / secure PIN</label><input id="sharedNewPassword" type="password" autocomplete="new-password"></div></div><button class="btn" onclick="sharedDeviceAddUser()">Add staff member</button><button class="btn ghost" style="margin-left:8px" onclick="sharedDevicePublishAccess()">Publish staff access to devices</button><button class="btn ghost" style="margin-left:8px" onclick="sharedDeviceOwnerRecovery()">Owner recovery</button><p class="muted" style="font-size:11px;margin-top:10px">The experimental one-user-per-browser login is disabled. Its Supabase records remain for future migration.</p></div>`;}
function installCard(){const original=window.viewSettings;if(typeof original!=='function'||original.__sharedDeviceWrapped)return;const fn=function(){return original.apply(this,arguments)+card();};fn.__sharedDeviceWrapped=true;window.viewSettings=fn;}
async function addUser(){try{if(!can('MANAGE_STAFF'))throw new Error('Only Owner or Admin can add staff.');if(!await reauth('Confirm new staff account'))return;const name=String((document.getElementById('sharedNewName')||{}).value||''),r=String((document.getElementById('sharedNewRole')||{}).value||'CASHIER');await upsert({name,tel:String((document.getElementById('sharedNewTel')||{}).value||''),role:r,password:String((document.getElementById('sharedNewPassword')||{}).value||''),active:true});audit('STAFF_ACCOUNT_CREATED',{name,role:r});render();refreshUsers();toast('Shared-device staff account created.');}catch(e){toast(e.message||String(e),'err');}}
function editUser(id){const u=model().users.find(x=>x.id===id);if(!u)return;const rs=u.role==='OWNER'?['OWNER']:['ADMIN','MANAGER','CASHIER','READ_ONLY','AUDITOR'];sharedModal(`<h3>Manage shared-device staff</h3><div class="field"><label>Full name</label><input id="sharedEditName" value="${attr(u.name)}"></div><div class="field"><label>Telephone</label><input id="sharedEditTel" value="${attr(u.tel||'')}"></div><div class="field"><label>Role</label><select id="sharedEditRole">${rs.map(x=>`<option value="${x}" ${x===u.role?'selected':''}>${x.replace('_',' ')}</option>`).join('')}</select></div><div class="field"><label>Status</label><select id="sharedEditActive"><option value="1" ${u.active!==false?'selected':''}>ACTIVE</option><option value="0" ${u.active===false?'selected':''}>INACTIVE</option></select></div><div class="field"><label>New password / secure PIN</label><input id="sharedEditPassword" type="password" placeholder="Leave blank to keep current password" autocomplete="new-password"></div><div class="row"><button class="btn" onclick="sharedDeviceSaveUser('${attr(u.id)}')">Save</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>`);}
async function saveUser(id){try{if(!can('MANAGE_STAFF'))throw new Error('Only Owner or Admin can manage staff.');if(!await reauth('Confirm staff-account change'))return;const u=model().users.find(x=>x.id===id);if(!u)throw new Error('Staff account not found.');if(role()==='ADMIN'&&u.role==='OWNER')throw new Error('An Admin cannot modify the Owner account.');await upsert({name:String((document.getElementById('sharedEditName')||{}).value||''),tel:String((document.getElementById('sharedEditTel')||{}).value||''),role:String((document.getElementById('sharedEditRole')||{}).value||u.role),password:String((document.getElementById('sharedEditPassword')||{}).value||''),active:String((document.getElementById('sharedEditActive')||{}).value||'1')==='1'},id);closeModal();audit('STAFF_ACCOUNT_UPDATED',{userId:id});render();refreshUsers();toast('Staff account updated.');}catch(e){toast(e.message||String(e),'err');}}
function cloud(){const s=ZEZMS.cloudSync;return s&&typeof s.getState==='function'?s.getState():{};}
function deviceArgs(){const s=cloud();return{p_device_id:String(s.deviceId||''),p_device_name:String(s.deviceName||'ZEZMS Device'),p_platform:String(navigator.userAgent||'').slice(0,240),p_app_version:typeof APP_VERSION!=='undefined'?String(APP_VERSION):'3.6.9'};}
function recovery(){const s=cloud();if(!s.supabaseUrl||!s.publishableKey||!window.supabase)throw new Error('Supabase configuration is unavailable on this device.');if(!recoveryClient)recoveryClient=window.supabase.createClient(String(s.supabaseUrl).replace(/\/$/,''),String(s.publishableKey),{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:RECOVERY_KEY}});return recoveryClient;}

function sharedModal(html){
  if(typeof window.openModal==='function'){
    return window.openModal(html);
  }

  let bg=document.getElementById('sharedDeviceFallbackModal');
  if(!bg){
    bg=document.createElement('div');
    bg.id='sharedDeviceFallbackModal';
    bg.style.cssText='position:fixed;inset:0;z-index:999999;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(2,6,23,.82)';

    const box=document.createElement('div');
    box.id='sharedDeviceFallbackModalBox';
    box.style.cssText='width:min(520px,100%);max-height:90vh;overflow:auto;border:1px solid #475569;border-radius:16px;background:#0f172a;color:#e2e8f0;padding:18px;box-shadow:0 24px 80px rgba(0,0,0,.5)';

    bg.appendChild(box);
    document.body.appendChild(bg);

    bg.addEventListener('click',function(event){
      if(event.target===bg) window.closeSharedDeviceFallbackModal();
    });
  }

  document.getElementById('sharedDeviceFallbackModalBox').innerHTML=html;
  bg.style.display='flex';

  if(typeof window.closeModal!=='function'){
    window.closeModal=window.closeSharedDeviceFallbackModal;
  }
}

window.closeSharedDeviceFallbackModal=function(){
  const bg=document.getElementById('sharedDeviceFallbackModal');
  if(bg) bg.style.display='none';
};

function recoveryStatus(message,error){const e=document.getElementById('sharedRecoveryStatus');if(e){e.textContent=String(message||'');e.style.color=error?'#fda4af':'#bfdbfe';}}
function openRecovery(){sharedModal('<h3>Owner recovery / shared-device setup</h3><p class="muted">Verify the existing Supabase OWNER account. This does not disconnect Cloud Sync M4.</p><div class="field"><label>Owner email</label><input id="sharedRecoveryEmail" type="email" autocomplete="username"></div><div class="field"><label>Owner cloud password</label><input id="sharedRecoveryPassword" type="password" autocomplete="current-password"></div><div id="sharedRecoveryStatus" class="muted" style="font-size:11px;margin-bottom:10px">Ready for OWNER verification.</div><div class="row"><button class="btn" onclick="sharedDeviceVerifyOwnerPassword()">Verify Owner</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>');}
async function verifyOwnerPassword(){try{recoveryStatus('Checking the OWNER email and password…');const c=recovery(),email=String((document.getElementById('sharedRecoveryEmail')||{}).value||'').trim(),password=String((document.getElementById('sharedRecoveryPassword')||{}).value||'');if(!email||!password)throw new Error('Enter the OWNER email and cloud password.');const r=await c.auth.signInWithPassword({email,password});if(r.error)throw r.error;recoverySession=r.data.session;if(!recoverySession)throw new Error('The OWNER sign-in did not return a session.');const a=await c.auth.mfa.getAuthenticatorAssuranceLevel();if(a.error)throw a.error;if(a.data.currentLevel!=='aal2'&&a.data.nextLevel==='aal2'){const f=await c.auth.mfa.listFactors();if(f.error)throw f.error;recoveryFactors=((f.data&&f.data.totp)||[]).filter(x=>x&&(!x.status||x.status==='verified'));if(!recoveryFactors.length)throw new Error('No verified OWNER authenticator factor was returned.');openRecoveryMfa();return;}await verifyMembership();}catch(e){recoveryStatus(e.message||String(e),true);}}
function openRecoveryMfa(){sharedModal(`<h3>OWNER authenticator verification</h3><div class="field"><label>Authenticator entry</label><select id="sharedRecoveryFactor">${recoveryFactors.map(f=>`<option value="${attr(f.id)}">${esc(f.friendly_name||'Authenticator app')}</option>`).join('')}</select></div><div class="field"><label>Authenticator code</label><input id="sharedRecoveryCode" inputmode="numeric" autocomplete="one-time-code" maxlength="8"></div><div id="sharedRecoveryStatus" class="muted" style="font-size:11px;margin-bottom:10px">Enter the current code from the selected OWNER factor.</div><div class="row"><button class="btn" onclick="sharedDeviceVerifyOwnerMfa()">Verify authenticator</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>`);}
async function verifyOwnerMfa(){try{const c=recovery(),factorId=String((document.getElementById('sharedRecoveryFactor')||{}).value||''),code=String((document.getElementById('sharedRecoveryCode')||{}).value||'').trim();if(!factorId||!/^\d{6,8}$/.test(code))throw new Error('Select the authenticator entry and enter its current code.');recoveryStatus('Verifying OWNER authenticator…');const r=await c.auth.mfa.challengeAndVerify({factorId,code});if(r.error)throw r.error;recoverySession=(r.data&&r.data.session)||recoverySession;await verifyMembership();}catch(e){recoveryStatus(e.message||String(e),true);}}
async function verifyMembership(){const c=recovery(),bid=businessId();if(!bid)throw new Error('The M5A-1 Tenant ID could not be detected.');recoveryStatus('Checking the OWNER role and registered device…');const r=await c.rpc('zezms_m5a2_auth_context',Object.assign({p_business_id:bid},deviceArgs()));if(r.error)throw r.error;const x=Array.isArray(r.data)?r.data[0]:r.data;if(!x||String(x.member_role||'').toUpperCase()!=='OWNER')throw new Error('Only the registered business OWNER can recover shared-device access.');if(String(x.member_status||'').toUpperCase()!=='ACTIVE')throw new Error('The OWNER membership is not active.');openSetup(x);}
function owner(){return model().users.find(u=>u.role==='OWNER')||null;}
function legacy(){const a=[];if(DB.security&&Array.isArray(DB.security.cashiers))DB.security.cashiers.forEach(c=>{const n=String(c&&c.name||'').trim();if(n&&!a.includes(n))a.push(n);});return a;}
function openSetup(ctx){const o=owner(),name=(o&&o.name)||ctx.display_name||'Business Owner',tel=(o&&o.tel)||ctx.telephone||'';sharedModal(`<h3>Restore shared-device staff access</h3><p class="muted">Create the local OWNER password used on this counter device. The cloud connection remains separate.</p><div class="field"><label>Owner display name</label><input id="sharedSetupOwnerName" value="${attr(name)}"></div><div class="field"><label>Telephone</label><input id="sharedSetupOwnerTel" value="${attr(tel)}"></div><div class="field"><label>New local password / secure PIN</label><input id="sharedSetupOwnerPassword" type="password" autocomplete="new-password"></div><div class="field"><label>Confirm password</label><input id="sharedSetupOwnerConfirm" type="password" autocomplete="new-password"></div>${legacy().length?`<p class="muted" style="font-size:11px">Known former staff names will be preserved as inactive placeholders: ${esc(legacy().join(', '))}.</p>`:''}<div class="row"><button class="btn" onclick="sharedDeviceCompleteOwnerSetup()">Restore shared-device access</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>`);}
async function completeSetup(){try{const name=String((document.getElementById('sharedSetupOwnerName')||{}).value||'').trim(),tel=String((document.getElementById('sharedSetupOwnerTel')||{}).value||'').trim(),password=String((document.getElementById('sharedSetupOwnerPassword')||{}).value||''),confirm=String((document.getElementById('sharedSetupOwnerConfirm')||{}).value||'');if(password!==confirm)throw new Error('The two passwords do not match.');const m=model(),o=await upsert({name,tel,role:'OWNER',password,active:true},owner()&&owner().id);legacy().forEach(n=>{if(n===o.name||m.users.some(u=>String(u.name||'').toLowerCase()===n.toLowerCase()))return;m.users.push({id:uid(),name:n,tel:'',role:'CASHIER',active:false,createdAt:stamp(),updatedAt:stamp(),needsPasswordSetup:true});});m.enabled=true;m.businessId=businessId();m.recoveredAt=stamp();m.updatedAt=stamp();writeDirectoryRoot();saveDB();try{await recoveryClient.auth.signOut({scope:'local'});}catch(_){}recoverySession=null;closeModal();refreshUsers();status(`Shared-device access restored. Select ${o.name} and enter the new local password.`,'ok');toast('Shared-device staff access restored.');}catch(e){toast(e.message||String(e),'err');}}

function init(){
  try{
    model();
    importDirectory();
    installCard();
    guards();
    window.toggleAdminModeBtn=logout;
    refreshUsers();
    window.addEventListener('zezms-shared-device-directory-updated',function(){
      importDirectory();
      refreshUsers();
    });
    window.addEventListener('zezms-cloud-ready',function(){
      if(!users().length)refreshUsersFromCloud(false);
    });
    document.documentElement.setAttribute('data-zezms-shared-device-auth','ready');
  }catch(error){
    console.error('Shared-device controller boot failed',error);
    document.documentElement.setAttribute('data-zezms-shared-device-auth','failed');
    status('Shared-device controller failed to start: '+(error&&error.message||error),'error');
  }
}


window.__ZEZMS_SHARED_DEVICE_CONTROLLER__=BUILD;

window.sharedDeviceRefreshUsers=function(showNotice){
  return refreshUsersFromCloud(showNotice!==false);
};

window.sharedDevicePublishAccess=function(){
  publishDirectory(true).catch(function(error){
    console.error('Staff-access publication failed',error);
    status('Could not publish staff access: '+(error&&error.message||error),'error');
  });
};

window.sharedDeviceOwnerRecovery=function(){
  try{
    status('Opening OWNER recovery…','working');
    openRecovery();
  }catch(error){
    console.error('OWNER recovery failed to open',error);
    const message='OWNER recovery could not open: '+(error&&error.message||error);
    status(message,'error');
    try{ window.alert(message); }catch(_){}
  }
};

window.sharedDeviceVerifyOwnerPassword=function(){ verifyOwnerPassword(); };
window.sharedDeviceVerifyOwnerMfa=function(){ verifyOwnerMfa(); };
window.sharedDeviceCompleteOwnerSetup=function(){ completeSetup(); };
window.sharedDeviceAddUser=function(){ addUser(); };
window.sharedDeviceEditUser=editUser;
window.sharedDeviceSaveUser=function(id){ saveUser(id); };

ZEZMS.staffAuth={version:'M5A-2-SHARED-DEVICE',build:BUILD,isActive:()=>true,can,canView,fallbackView:fallback,isElevatedForViewing:elevated,signInFromLogin:login,signOut:logout,confirmSensitive:sensitive,applyRoleUI:roleUI,updateUserBadge:badge,afterRender,getContext:()=>({authMode:'SHARED_DEVICE',businessId:model().businessId,role:role(),user:current()}),getState:()=>({enabled:!!model().enabled,businessId:model().businessId,directoryPublished:!!DB.sharedDeviceDirectory,users:model().users.map(u=>({id:u.id,name:u.name,tel:u.tel,role:u.role,active:u.active,lastLoginAt:u.lastLoginAt}))})};
setTimeout(init,250);
})();
