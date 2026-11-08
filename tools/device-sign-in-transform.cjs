'use strict';
// Only the local staff success path is shared; Cloud authentication is unchanged.
function transformDeviceSignIn(html,helper){
 const marker="ZEZMS.staffAuth={version:'M5A-2-SHARED-DEVICE'";
 if(html.split(marker).length!==2)throw Error('DEVICE_SIGN_IN_STAFF_MARKER');
 const at=html.indexOf(marker),start=html.lastIndexOf('<script',at),tagEnd=html.indexOf('>',start)+1;
 if(start<0||tagEnd>at)throw Error('DEVICE_SIGN_IN_SCRIPT_MARKER');
 const loginStart=html.lastIndexOf('async function login(){',at),loginEnd=html.indexOf('\nasync function logout(){',loginStart);
 if(loginStart<0||loginEnd<loginStart)throw Error('DEVICE_SIGN_IN_LOGIN_MARKER');
 const oldLogin=html.slice(loginStart,loginEnd),successStart=oldLogin.indexOf("u.failedAttempts=0;u.lockedUntil='';u.lastLoginAt=stamp();"),successEnd=oldLogin.indexOf('}catch(e){console.error(e);status(',successStart);
 if(successStart<0||successEnd<successStart)throw Error('DEVICE_SIGN_IN_SUCCESS_MARKER');
 const success=oldLogin.slice(successStart,successEnd);
 const shared='function completeLocalStaffLogin(u,method){'+success.replace("audit('STAFF_SIGNED_IN',{userId:u.id});","audit('STAFF_SIGNED_IN',method?{userId:u.id,method}:{userId:u.id});")+'}\n';
 const login=oldLogin.slice(0,successStart)+'completeLocalStaffLogin(u);'+oldLogin.slice(successEnd);
 html=html.slice(0,loginStart)+shared+login+html.slice(loginEnd);
 const integration=`/* DEVICE_SIGN_IN_NATIVE_BEGIN */
function readPasskeyAccount(id){
 const snapshot=(database)=>{const m=database&&database.sharedDeviceAuth,u=m&&m.enabled&&Array.isArray(m.users)&&m.users.find(x=>x.id===id);if(!u||u.active!==true||!ROLES[u.role])return null;return {id:u.id,name:u.name,role:u.role,active:u.active,businessId:m.businessId,passwordAlgorithm:u.passwordAlgorithm,passwordIterations:u.passwordIterations||ITER,passwordSalt:u.passwordSalt,passwordHash:u.passwordHash,passwordChangedAt:u.passwordChangedAt||'',createdAt:u.createdAt||'',lockedUntil:u.lockedUntil||''};};
 const live=snapshot(DB);if(!live)return null;try{let stored=ZEZMS.db.load(DB_KEY);if(typeof stored==='string')stored=JSON.parse(stored);return JSON.stringify(snapshot(stored))===JSON.stringify(live)?live:null;}catch(_){return null;}
}
const deviceSignIn=ZEZMS.createDeviceSignIn({
 account:readPasskeyAccount,currentId:()=>String(session.sharedUserId||''),verifyPassword:verify,
 binding:()=>{const c=ZEZMS.cloudSync,s=c&&c.getState?c.getState():{};return {allowed:!!(c&&c.isReadyForLocalOperations()&&ZEZMS.bootstrapStartupGuard&&ZEZMS.bootstrapStartupGuard.allowsBusinessTransactions()),deviceId:s.deviceId,mode:s.deviceAccessMode,ownerId:s.syncOwnerId,businessId:s.businessId,lifecycleId:s.deviceLifecycleId||s.lifecycleId||''};},
 passwordFailed:(id)=>{const u=model().users.find(x=>x.id===id);if(!u||u.active!==true)return;u.failedAttempts=Number(u.failedAttempts||0)+1;if(u.failedAttempts>=5){u.failedAttempts=0;u.lockedUntil=new Date(Date.now()+30000).toISOString();}saveDB();},
 complete:(id,expected)=>{const a=readPasskeyAccount(id);if(!a||JSON.stringify(a)!==expected||session.sharedUserId)throw Error('Staff or session changed while signing in.');const u=model().users.find(x=>x.id===id);try{completeLocalStaffLogin(u,'LOCAL_DEVICE_PASSKEY');}catch(error){if(session.sharedUserId===id)logout();throw error;}document.dispatchEvent(new Event('zezms-staff-auth-changed'));},
 notice:(message)=>toast(message,'warn')
});
ZEZMS.deviceSignIn=deviceSignIn;delete ZEZMS.createDeviceSignIn;
/* DEVICE_SIGN_IN_NATIVE_END */
`;
 html=html.replace(marker,integration+marker);
 // Bind the native auth entry to the verified closure, not a caller-provided proof.
 html=html.replace('signInFromLogin:login,signOut:logout,','signInFromLogin:login,signInWithDevice:deviceSignIn.signIn,signOut:logout,');
 return html.slice(0,tagEnd)+'\n</script><script data-zezms-device-sign-in>\n'+helper+'\n</script><script>'+html.slice(tagEnd);
}
function withoutDeviceSignIn(html){
 if(!html.includes('<script data-zezms-device-sign-in>'))return html;
 html=html.replace(/\n<\/script><script data-zezms-device-sign-in>[\s\S]*?<\/script><script>/,'');
 html=html.replace(/\/\* DEVICE_SIGN_IN_NATIVE_BEGIN \*\/[\s\S]*?\/\* DEVICE_SIGN_IN_NATIVE_END \*\/\n/,'').replace('signInFromLogin:login,signInWithDevice:deviceSignIn.signIn,signOut:logout,','signInFromLogin:login,signOut:logout,');
 const start=html.indexOf('function completeLocalStaffLogin(u,method){'),end=html.indexOf('\nasync function login(){',start);
 if(start<0||end<start)throw Error('DEVICE_SIGN_IN_SUCCESS_PROOF_MARKER');
 const body=html.slice(start+'function completeLocalStaffLogin(u,method){'.length,end-1).replace("audit('STAFF_SIGNED_IN',method?{userId:u.id,method}:{userId:u.id});","audit('STAFF_SIGNED_IN',{userId:u.id});");
 html=html.slice(0,start)+html.slice(end+1);return html.replace('completeLocalStaffLogin(u);',body);
}
module.exports={transformDeviceSignIn,withoutDeviceSignIn};
