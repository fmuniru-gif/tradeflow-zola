/* Pure comparison of queued staff publications against an authoritative directory. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./staff-directory-review-core.js'));else root.ZEZMSPairedDirectoryReviewCore=factory(root.ZEZMSStaffDirectoryReviewCore);})(globalThis,function(base){
 'use strict';
 const fields=['name','tel','role','active','signatureFile','passwordAlgorithm','passwordIterations','passwordSalt','passwordHash','passwordChangedAt','createdAt'];
 const stable=base.stable,fail=m=>{throw Error('PAIRED_DIRECTORY_STOP: '+m);};
 function localDirectory(db,business){const a=db&&db.sharedDeviceAuth;if(!a||!a.enabled||a.businessId!==business||!Array.isArray(a.users))fail('Local staff access is unavailable.');return {version:1,businessId:business,enabled:!!a.enabled,users:a.users.map(u=>({id:String(u.id||''),name:String(u.name||''),tel:String(u.tel||''),role:String(u.role||'CASHIER').toUpperCase(),active:u.active!==false,signatureFile:String(u.signatureFile||''),passwordAlgorithm:String(u.passwordAlgorithm||'PBKDF2-SHA256'),passwordIterations:Number(u.passwordIterations)||210000,passwordSalt:String(u.passwordSalt||''),passwordHash:String(u.passwordHash||''),passwordChangedAt:String(u.passwordChangedAt||''),createdAt:String(u.createdAt||'')}))};}
 function differences(a,b){const changed=[];for(const k of ['version','businessId','enabled'])if(stable(a[k])!==stable(b[k]))changed.push(k);const left=new Map(a.users.map(u=>[u.id,u])),right=new Map(b.users.map(u=>[u.id,u]));for(const id of new Set([...left.keys(),...right.keys()])){if(!left.has(id)||!right.has(id)){changed.push('ACCOUNT_MEMBERSHIP');continue;}for(const k of fields)if(stable(left.get(id)[k])!==stable(right.get(id)[k]))changed.push(k);}return [...new Set(changed)].sort();}
 function compare(s,q,cloud,db,hash){
  if(!s||s.deviceAccessMode!=='PAIRED'||!s.initialized||![s.deviceId,s.businessId,s.syncOwnerId].every(x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(x)))fail('Use an established paired device with its enrolled Owner binding.');
  if(!Array.isArray(q)||!q.length||q.length>20||new Set(q.map(o=>o&&o.opId)).size!==q.length)fail('The queue must contain only one to twenty distinct directory entries.');
  const canonical=base.normal(cloud,s.businessId),rows=[];let seq=-1;
  for(const o of q){if(!o||!o.opId||o.kind!=='SHARED_DEVICE_DIRECTORY'||o.deviceId!==s.deviceId||(o.originDeviceId&&o.originDeviceId!==s.deviceId)||o.protocolVersion!=='M4/3'||!Number.isSafeInteger(o.deviceSeq)||o.deviceSeq<=seq||!o.payloadHash||hash(o)!==o.payloadHash||!Array.isArray(o.patches)||o.patches.length!==1)fail('Operation identity, order or hash differs.');seq=o.deviceSeq;
   const p=o.patches[0];if(p.action!=='root-set'||p.root!=='sharedDeviceDirectory'||Object.keys(p).some(k=>!['action','root','before','value'].includes(k)))fail('An entry has another effect; preserve the entire queue.');
   const before=base.normal(p.before,s.businessId),after=base.normal(p.value,s.businessId);
   rows.push({operationId:o.opId,deviceSeq:o.deviceSeq,payloadHashValid:true,beforeMatchesCloud:stable(before)===stable(canonical),afterMatchesCloud:stable(after)===stable(canonical),differencesWithinOperation:differences(before,after),differencesFromCloud:[...new Set([...differences(before,canonical),...differences(after,canonical)])].sort()});
  }
  if(!Number.isSafeInteger(s.deviceSeq)||s.deviceSeq<seq)fail('Device sequence is behind the preserved entries.');
  const localDirectoryMatchesCloud=stable(base.normal(db.sharedDeviceDirectory,s.businessId))===stable(canonical),localAccessMatchesCloud=stable(base.normal(localDirectory(db,s.businessId),s.businessId))===stable(canonical);
  return {ready:localDirectoryMatchesCloud&&localAccessMatchesCloud&&rows.every(r=>r.beforeMatchesCloud&&r.afterMatchesCloud),count:q.length,operationIds:q.map(o=>o.opId),localDirectoryMatchesCloud,localAccessMatchesCloud,rows};
 }
 function verify(...args){const r=compare(...args);if(!r.ready)fail('A staff account, credential, permission or active status differs. Keep every pending entry.');return r;}
 return Object.freeze({compare,verify,stable,cloudDirectory:base.cloudDirectory});
});
