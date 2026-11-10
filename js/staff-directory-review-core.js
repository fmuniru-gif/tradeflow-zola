/* Timestamp-only staff publication review. No storage, network or authority changes. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ZEZMSStaffDirectoryReviewCore=api;})(globalThis,function(){
 'use strict';
 const DEVICE='9a5ab8eb-f67e-425c-866d-574b641295f0';
 const IDS=['ce44e93b-6a58-4cfa-887c-295ffca63e0a','5866d957-f790-4d1b-b44b-c6d3901b66cd','ec176fb1-8c24-4278-a760-814b97be3a1c','3b3013d3-67d0-44a9-b59f-722f7de035f8','7918967e-7450-4715-97cc-7f8faf7bcbcf','d6c87ed1-b935-4dd0-a5fb-abd6047ab117','26154c1f-3a47-4a35-bb9b-c199e6c6bd82','578fd126-d3ed-47ea-b674-fbb993eaea6a','e4a686d7-485b-461a-b6e2-db9f9e13b278'];
 const ROOT_FIELDS=['version','businessId','enabled','updatedAt','users'];
 const USER_FIELDS=['id','name','tel','role','active','signatureFile','passwordAlgorithm','passwordIterations','passwordSalt','passwordHash','passwordChangedAt','createdAt','updatedAt','lastLoginAt'];
 const fail=message=>{throw Error('STAFF_REVIEW_STOP: '+message);};
 const clone=x=>JSON.parse(JSON.stringify(x));
 function stable(x){if(x===undefined)return 'undefined';if(x===null||typeof x!=='object')return JSON.stringify(x);if(Array.isArray(x))return '['+x.map(stable).join(',')+']';return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+stable(x[k])).join(',')+'}';}
 function normal(d,business){
  if(!d||d.version!==1||d.businessId!==business||typeof d.enabled!=='boolean'||!Array.isArray(d.users)||!d.users.length||Object.keys(d).some(k=>!ROOT_FIELDS.includes(k)))fail('Unexpected staff-directory schema or business.');
  const ids=new Set(),x=clone(d);delete x.updatedAt;
  x.users=x.users.map(u=>{if(!u||!u.id||ids.has(u.id)||Object.keys(u).some(k=>!USER_FIELDS.includes(k))||typeof u.active!=='boolean'||!['OWNER','ADMIN','MANAGER','CASHIER','READ_ONLY','AUDITOR'].includes(u.role)||u.passwordAlgorithm!=='PBKDF2-SHA256'||!Number.isSafeInteger(u.passwordIterations)||u.passwordIterations<100000||typeof u.passwordHash!=='string'||typeof u.passwordSalt!=='string'||(u.active&&(!u.passwordHash||!u.passwordSalt)))fail('Unexpected staff account schema.');ids.add(u.id);delete u.updatedAt;delete u.lastLoginAt;return u;}).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  if(!x.users.some(u=>u.role==='OWNER'&&u.active))fail('No active Owner.');return x;
 }
 function localDirectory(db,business){const a=db&&db.sharedDeviceAuth;if(!a||!a.enabled||a.businessId!==business||!Array.isArray(a.users))fail('Local staff access is unavailable.');return {version:1,businessId:business,enabled:!!a.enabled,updatedAt:'',users:a.users.map(u=>({id:String(u.id||''),name:String(u.name||''),tel:String(u.tel||''),role:String(u.role||'CASHIER').toUpperCase(),active:u.active!==false,signatureFile:String(u.signatureFile||''),passwordAlgorithm:String(u.passwordAlgorithm||'PBKDF2-SHA256'),passwordIterations:Number(u.passwordIterations)||210000,passwordSalt:String(u.passwordSalt||''),passwordHash:String(u.passwordHash||''),passwordChangedAt:String(u.passwordChangedAt||''),createdAt:String(u.createdAt||''),updatedAt:'',lastLoginAt:''}))};}
 function verify(s,q,cloud,db,hash){
  if(!s||s.deviceId!==DEVICE||s.deviceAccessMode!=='OWNER'||!s.businessId||!s.syncOwnerId||!s.initialized)fail('This reviewed resolution is for the established Main Owner device only.');
  if(!Array.isArray(q)||q.length!==IDS.length||new Set(q.map(o=>o.opId)).size!==IDS.length||q.some(o=>!IDS.includes(o.opId)))fail('The active queue no longer matches the nine reviewed IDs.');
  const canonical=stable(normal(cloud,s.businessId));let seq=-1;
  for(const o of q){if(o.kind!=='SHARED_DEVICE_DIRECTORY'||o.deviceId!==DEVICE||(o.originDeviceId&&o.originDeviceId!==DEVICE)||o.protocolVersion!=='M4/3'||!Number.isSafeInteger(o.deviceSeq)||o.deviceSeq<=seq||!o.payloadHash||hash(o)!==o.payloadHash||!Array.isArray(o.patches)||o.patches.length!==1)fail('Operation identity, order or hash differs.');seq=o.deviceSeq;
   const p=o.patches[0];if(p.action!=='root-set'||p.root!=='sharedDeviceDirectory'||Object.keys(p).some(k=>!['action','root','before','value'].includes(k)))fail('Unexpected operation effect.');
   if(stable(normal(p.before,s.businessId))!==canonical||stable(normal(p.value,s.businessId))!==canonical)fail('A staff account, credential or permission differs from Cloud.');
  }
  if(!Number.isSafeInteger(s.deviceSeq)||s.deviceSeq<seq)fail('Device sequence is behind the preserved operations.');
  if(stable(normal(db.sharedDeviceDirectory,s.businessId))!==canonical||stable(normal(localDirectory(db,s.businessId),s.businessId))!==canonical)fail('Current local staff access differs from Cloud.');
  return {count:q.length,operationIds:q.map(o=>o.opId)};
 }
 function cloudDirectory(bundle,s,hash){
  if(!bundle||bundle.ownerId!==s.syncOwnerId||!Number.isSafeInteger(bundle.headSeq)||bundle.headSeq<s.cursor)fail('Cloud authority or head could not be verified.');
  let directory=clone(bundle.baseline&&bundle.baseline.sharedDeviceDirectory||null),seq=Number(bundle.baselineCursor)||0;
  for(const row of bundle.operations||[]){if(!Number.isSafeInteger(row.seq)||row.seq<=seq)fail('Cloud operations are not ordered.');seq=row.seq;const o=row.payload||{};
   for(const p of o.patches||[]){if(p.root!=='sharedDeviceDirectory')continue;if(p.action!=='root-set'||o.opId!==row.op_id||!o.payloadHash||hash(o)!==o.payloadHash)fail('Cloud staff operation is not verified.');directory=clone(p.value);}
  }
  if(seq!==bundle.headSeq)fail('Cloud head differs from the fetched operations.');normal(directory,s.businessId);return directory;
 }
 return Object.freeze({DEVICE,IDS:Object.freeze(IDS),stable,normal,verify,cloudDirectory});
});
