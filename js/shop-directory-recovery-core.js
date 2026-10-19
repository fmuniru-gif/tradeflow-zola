/* Shop-only recovery coordinator. All cloud access is supplied by a read-only
 * adapter. No operation is acknowledged, uploaded, or declared harmless. */
(function(root,factory){const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ZEZMSShopRecoveryCore=api;
  })(globalThis,function(){
  'use strict';
  const DEVICE='197e3568-5a89-4a56-b9d0-07f5e8248734';
  const IDS=Object.freeze(['9084b206-fbf5-41d3-88ab-4e17ed309962','6d02b995-78a4-4f0d-858d-94d9b14dd33d','6d97f771-c8a3-45c7-900e-955238bf6306']);
  const KEY='zezms_shop_directory_recovery_v1';
  const KEYS=Object.freeze({db:'tradeflow_v321_zola',state:'zezms_cloud_sync_m4_state',queue:'zezms_cloud_sync_m4_queue',applied:'zezms_cloud_sync_m4_applied_v2',failed:'zezms_cloud_sync_m4_failed_v2',apply:'zezms_cloud_sync_m4_apply_journal_v2'});
  const ROOTS=['cashBalances','selectedYear','selectedMonth','business','settings','security','sharedDeviceDirectory','warrantySettings'];
  const COLLECTIONS=['products','customers','customerFollowups','salesOpportunities','quotations','stockRows','stockCorrections','warranties','warrantyClaims','debtors','creditors','depositors','sales','receipts','invoices','waybills','purchaseOrders','saleLines','accountTxns','cashLog','expenses','inventoryTxns','undoLog','debtorsMonthly','creditorsMonthly','depositorsMonthly','kpiHistory','monthRollovers','managementTargets','managementTargetHistory','managementScenarios','managementAlertStates','managementAlertHistory','managementActionPlans','managementActionTasks','managementActionHistory','managementExecutionHandoffs'];
  const LOCAL_DATABASE_FIELDS=['sharedDeviceAuth','backupHistory','backupSettings','syncSettings','syncMeta','syncRejectedTransactions','syncReconciliationLog','version'];
  const fail=code=>{throw Error('SHOP_STOP_'+code);
  };
  const clone=x=>JSON.parse(JSON.stringify(x));
  function stable(x){if(x===undefined)return 'null';
  if(x===null||typeof x!=='object')return JSON.stringify(x);
  if(Array.isArray(x))return '['+x.map(stable).join(',')+']';
  return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+stable(x[k])).join(',')+'}';
  }
  function parse(s){try{return JSON.parse(s);
  }catch(_){fail('INVALID_JSON');
  }}
  const own=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
  const validInt=x=>Number.isSafeInteger(x)&&x>=0;
  function noSecrets(x){if(!x||typeof x!=='object')return;
  for(const k of Object.keys(x)){if(/^(access_token|refresh_token|id_token|password|passphrase|adminPIN|pricePIN|pin|authorization|publishableKey|supabaseKey)$/i.test(k))fail('SECRET_IN_EVIDENCE');
  if(['__proto__','constructor','prototype'].includes(k))fail('UNSAFE_KEY');
  noSecrets(x[k]);
  }}
  function directory(d,business){
    const fields=['version','businessId','enabled','updatedAt','users'];
    const userFields=['id','name','tel','role','active','signatureFile','passwordAlgorithm','passwordIterations','passwordSalt','passwordHash','passwordChangedAt','createdAt','updatedAt','lastLoginAt'];
    if(!d||d.version!==1||d.businessId!==business||typeof d.enabled!=='boolean'||!Number.isFinite(Date.parse(d.updatedAt))||!Array.isArray(d.users)||!d.users.length||Object.keys(d).some(k=>!fields.includes(k)))fail('DIRECTORY_SCHEMA');
    const ids=new Set();
  for(const u of d.users){if(!u||!u.id||ids.has(u.id)||typeof u.active!=='boolean'||!['OWNER','ADMIN','MANAGER','CASHIER','READ_ONLY','AUDITOR'].includes(u.role)||Object.keys(u).some(k=>!userFields.includes(k))||u.passwordAlgorithm!=='PBKDF2-SHA256'||!Number.isSafeInteger(u.passwordIterations)||u.passwordIterations<100000||!u.passwordSalt||!u.passwordHash)fail('STAFF_SCHEMA');
  ids.add(u.id);
  }if(!d.users.some(u=>u.role==='OWNER'&&u.active))fail('NO_ACTIVE_STAFF_OWNER');
  noSecrets(d);
  return d;
  }
  function validateQueue(q,state,hash){
    if(!Array.isArray(q)||q.length!==3||new Set(q.map(o=>o&&o.opId)).size!==3||stable(q.map(o=>o.opId).sort())!==stable([...IDS].sort()))fail('EXACT_QUEUE_IDS');
    let seq=-1;
  for(let i=0;
  i<q.length;
  i++){const o=q[i];
  if(o.deviceId!==DEVICE||(o.originDeviceId&&o.originDeviceId!==DEVICE)||o.kind!=='SHARED_DEVICE_DIRECTORY'||o.protocolVersion!=='M4/3'||!Number.isSafeInteger(o.deviceSeq)||o.deviceSeq<=seq||!Number.isFinite(Date.parse(o.createdAt))||!Array.isArray(o.patches)||o.patches.length!==1||!o.payloadHash||hash(o)!==o.payloadHash)fail('QUEUE_PAYLOAD');
  seq=o.deviceSeq;
      const p=o.patches[0];
  if(p.action!=='root-set'||p.root!=='sharedDeviceDirectory'||Object.keys(p).some(k=>!['action','root','value','before'].includes(k)))fail('UNEXPECTED_EFFECT');
  directory(p.value,state.businessId);
  directory(p.before,state.businessId);
  if(i&&stable(q[i-1].patches[0].value)!==stable(p.before))fail('DIRECTORY_CHAIN');
  noSecrets(o);
    }if(!Number.isSafeInteger(state.deviceSeq)||state.deviceSeq<seq)fail('DEVICE_SEQUENCE');
  return q;
  }
  function authority(c,s){
    if(!c||c.ownerId!==s.syncOwnerId||c.businessId!==s.businessId||!validInt(c.head)||!c.checkpoint||!validInt(c.checkpoint.checkpoint_cursor)||c.checkpoint.checkpoint_cursor>c.head||c.checkpoint.protocol_version!=='M4/3'||!c.checkpoint.checkpoint_id||!c.checkpoint.payload||!Array.isArray(c.operations)||!Array.isArray(c.fleet))fail('CLOUD_AUTHORITY');
    const life=c.lifecycle;
  if(!life||life.device_id!==DEVICE||life.owner_id!==s.syncOwnerId||life.business_id!==s.businessId||life.lifecycle_state!=='ACTIVE'||(!validInt(Number(life.revision))||Number(life.revision)<1))fail('LIFECYCLE_BINDING');
    const rows=c.fleet.filter(r=>r.device_id===DEVICE);
  if(rows.length!==1)fail('CANONICAL_FLEET');
  const r=rows[0];
  const access=String(r.device_access_status||'').toUpperCase();
  const ownerFallback=!access&&r.registered_device_status==='ACTIVE'&&!r.registered_device_revoked_at;
  if(access!=='ACTIVE'&&!ownerFallback)fail('ACCESS_AUTHORITY');
  if(r.lifecycle_id!==life.id||r.lifecycle_state!=='ACTIVE'||r.authentication_eligible!==true||!own(r,'device_access_status')||!own(r,'device_access_revoked_at')||String(r.device_access_status).toUpperCase()==='REVOKED'||r.device_access_revoked_at||r.lifecycle_revoked_at||r.lifecycle_retired_at||r.replacement_lifecycle_id)fail('DEVICE_NOT_AUTHORIZED');
  }
  function directoryMeaning(d){const copy=clone(d);delete copy.updatedAt;
    copy.users=copy.users.map(u=>{delete u.updatedAt;delete u.lastLoginAt;return u;}).sort((a,b)=>a.id.localeCompare(b.id));return stable(copy);}
  function directoryDelta(before,value){const a=new Map(before.users.map(u=>[u.id,u])),b=new Map(value.users.map(u=>[u.id,u]));
    const r={additions:0,removals:0,credentials:0,roles:0,reactivations:0,deactivations:0,profiles:0,timestamps:0,directoryAuthorization:before.enabled!==value.enabled?1:0};
    if(before.updatedAt!==value.updatedAt)r.timestamps++;
    for(const [id,u]of a){const v=b.get(id);if(!v){r.removals++;continue;}
      for(const k of ['passwordAlgorithm','passwordIterations','passwordHash','passwordSalt','passwordChangedAt'])if(stable(u[k])!==stable(v[k])){r.credentials++;break;}
      if(u.role!==v.role)r.roles++;if(!u.active&&v.active)r.reactivations++;if(u.active&&!v.active)r.deactivations++;
      if(['name','tel','signatureFile','createdAt'].some(k=>stable(u[k])!==stable(v[k])))r.profiles++;
      for(const k of ['updatedAt','lastLoginAt'])if(stable(u[k])!==stable(v[k]))r.timestamps++;
    }for(const id of b.keys())if(!a.has(id))r.additions++;
    return r;
  }
  function classify(q,cloud,business,history=[],cursor=0){directory(cloud,business);
    return q.map(o=>{const p=o.patches[0],actualChanges=directoryDelta(p.before,p.value),cloudDifferences=directoryDelta(p.value,cloud);
      const equivalent=directoryMeaning(p.value)===directoryMeaning(cloud),timestampOnly=directoryMeaning(p.before)===directoryMeaning(p.value);
      let meaning=directoryMeaning(p.value),transitions=0,broken=false;
      for(const row of history.filter(r=>r.seq>cursor))for(const patch of row.payload.patches||[]){if(patch.root!=='sharedDeviceDirectory')continue;
        if(patch.action!=='root-set'||!patch.before||!patch.value){broken=true;continue;}
        if(directoryMeaning(patch.before)===meaning){meaning=directoryMeaning(patch.value);transitions++;}else if(transitions)broken=true;
      }
      const cloudSupersessionProven=!broken&&transitions>0&&meaning===directoryMeaning(cloud);
      const superseded=timestampOnly&&Date.parse(p.value.updatedAt)<=Date.parse(cloud.updatedAt)&&(equivalent||cloudSupersessionProven);
      const safe=equivalent||superseded;
      return {opId:o.opId,deviceSeq:o.deviceSeq,createdAt:o.createdAt,payloadHash:o.payloadHash,root:'sharedDeviceDirectory',effect:'WHOLE_STAFF_AUTHORIZATION_ROOT',actualChanges,cloudDifferences,
        classification:superseded?'SUPERSEDED_TIMESTAMP_ONLY':equivalent?'AUTHORIZATION_ALREADY_REFLECTED_IN_CURRENT_CLOUD':'UNRESOLVED_STAFF_DIRECTORY_CHANGE',cloudSupersessionProven,safeToPreserveWithoutPublication:safe,
        directLifecycleMutation:false,disposition:safe?'PRESERVE_ENCRYPTED_WITHOUT_PUBLICATION':'BLOCK_QUARANTINE_UNRESOLVED_AUTHORIZATION'};
    });
  }
  function create(io){
    let plan=null,backup=null,busy=false;
    const crypto=io.crypto||globalThis.crypto,enc=new TextEncoder(),dec=new TextDecoder('utf-8',{fatal:true});
    const sha=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
    const secretKey=/^(access_token|refresh_token|id_token|accessToken|refreshToken|token|authToken|sessionToken|password|passphrase|adminPIN|pricePIN|pin|authorization|publishableKey|supabaseKey|apiKey|anonKey|serviceRoleKey|secretKey|credentials)$/i;
    // Preserve exact original JSON bytes around excluded credential values.
    // No session-storage key is ever read. Slots are hash-bound and can only be
    // restored from unchanged credential values still present on this device.
    function secretRanges(text){parse(text);let at=0;const ranges=[];
      const ws=()=>{while(/\s/.test(text[at]||'!'))at++;};
      function string(){const start=at++;while(at<text.length){const c=text[at++];if(c==='\\'){at++;continue;}if(c==='"')return JSON.parse(text.slice(start,at));}fail('BACKUP_JSON');}
      function value(path,masked){ws();const c=text[at];if(c==='{'){at++;ws();while(text[at]!=='}'){const k=string();if(['__proto__','prototype','constructor'].includes(k))fail('UNSAFE_KEY');ws();at++;ws();const start=at,isSecret=secretKey.test(k);value(path.concat(k),masked||isSecret);if(isSecret&&!masked)ranges.push({path:path.concat(k),start,end:at});ws();if(text[at]===','){at++;ws();}else break;}at++;}
        else if(c==='['){at++;ws();let i=0;while(text[at]!==']'){value(path.concat(i++),masked);ws();if(text[at]===','){at++;ws();}else break;}at++;}
        else if(c==='"')string();else{while(at<text.length&&!/[\s,}\]]/.test(text[at]))at++;}}
      value([],false);ws();if(at!==text.length)fail('BACKUP_JSON');return ranges.sort((a,b)=>a.start-b.start);
    }
    async function sealSnapshot(snapshot){const result={};
      for(const [k,text]of Object.entries(snapshot)){if(text===null){result[k]=null;continue;}let at=0;const pieces=[];
        for(const r of secretRanges(text)){pieces.push(text.slice(at,r.start),{path:r.path,sha256:await sha(text.slice(r.start,r.end))});at=r.end;}
        pieces.push(text.slice(at));result[k]={pieces,sha256:await sha(text)};
      }return result;
    }
    async function unsealSnapshot(snapshot,current){const result={};
      if(stable(Object.keys(snapshot).sort())!==stable(Object.keys(KEYS).sort()))fail('FULL_BACKUP_KEYS');
      for(const [k,entry]of Object.entries(snapshot)){if(entry===null){result[k]=null;continue;}
        if(!entry||!Array.isArray(entry.pieces)||!entry.sha256)fail('FULL_BACKUP_SHAPE');
        const slots=new Map(current[k]===null?[]:secretRanges(current[k]).map(r=>[stable(r.path),current[k].slice(r.start,r.end)]));let text='';
        for(const piece of entry.pieces){if(typeof piece==='string')text+=piece;else{const retained=slots.get(stable(piece.path));if(retained===undefined||await sha(retained)!==piece.sha256)fail('RETAINED_CREDENTIAL_REQUIRED');text+=retained;}}
        if(await sha(text)!==entry.sha256)fail('FULL_BACKUP_HASH');parse(text);result[k]=text;
      }return result;
    }
    function safeRows(rows){if(!Array.isArray(rows)||rows.length!==3||rows.some(r=>r.safeToPreserveWithoutPublication!==true))fail('UNRESOLVED_STAFF_DIRECTORY');}
    function reserveCapacity(characters){const key=KEY+'_capacity_probe_v2';
      if(!Number.isSafeInteger(characters)||characters>16*1024*1024)fail('INSUFFICIENT_STORAGE');
      const leftover=io.storage.getItem(key);if(leftover!==null){if(!/^0*$/.test(leftover))fail('CAPACITY_PROBE_CONFLICT');io.storage.removeItem(key);}
      try{const probe='0'.repeat(characters);io.storage.setItem(key,probe);if(io.storage.getItem(key)!==probe)fail('CAPACITY_READBACK');}
      catch(_){try{io.storage.removeItem(key);}catch(_){}fail('INSUFFICIENT_STORAGE');}
      io.storage.removeItem(key);if(io.storage.getItem(key)!==null)fail('CAPACITY_CLEANUP');
    }
    function capacityFor(c,target,j){const possible=Object.assign(clone(c.db),clone(target||c.db));
      for(const f of LOCAL_DATABASE_FIELDS)if(own(c.db,f))possible[f]=clone(c.db[f]);
      const targetRaw=JSON.stringify(possible),applied=parse(c.raw.applied||'{}');
      for(const row of plan?.authority?.operations||[])applied[row.op_id]=row.seq;
      const appliedRaw=j?.receive?.target.applied||JSON.stringify(applied);
      const proposed=Object.assign({},j||{original:c.raw},{receive:{before:c.raw,target:{db:targetRaw,state:c.raw.state,applied:appliedRaw}}});
      // Measure actual JSON escaping and complete register/before/target copies,
      // with space for DB/register growth and a 64 KiB margin. Recheck each phase.
      const required=Math.max(JSON.stringify(proposed).length,j?JSON.stringify(j).length:0)+Math.max(0,targetRaw.length-(c.raw.db||'').length)+Math.max(0,appliedRaw.length-(c.raw.applied||'').length)+65536;
      const additional=Math.max(65536,required-(io.storage.getItem(KEY)||'').length);
      reserveCapacity(additional);
      return {tested:true,totalJournalAndGrowthCharacters:required,reservedCharacters:additional,utf16Bytes:additional*2};
    }
    const raw=()=>Object.fromEntries(Object.entries(KEYS).map(([k,v])=>[k,io.storage.getItem(v)]));
    function capture(){const r=raw(),state=parse(r.state),db=parse(r.db),queue=parse(r.queue),failed=parse(r.failed||'[]');
  const runtime=io.runtime();
  if(!state||state.deviceId!==DEVICE||state.deviceAccessMode!=='OWNER'||!state.syncOwnerId||!state.businessId||state.liveSyncEnabled!==false||state.liveSyncDesired===true||!state.initialized||!validInt(Number(state.cursor))||runtime.role!=='OWNER'||!runtime.staffId||runtime.deviceId!==DEVICE||runtime.cursor!==Number(state.cursor)||stable(runtime.queue)!==stable(queue)||stable(runtime.db)!==stable(db))fail('SHOP_OWNER_OR_RUNTIME');
  if(!Array.isArray(failed)||failed.length||r.apply)fail('UNRESOLVED_SYNC');
  const applied=parse(r.applied||'{}');
  if(!applied||Array.isArray(applied)||typeof applied!=='object'||Object.values(applied).some(v=>!validInt(v)))fail('APPLIED_REGISTER_SHAPE');
  return {raw:r,state,db,queue,staffId:runtime.staffId};
  }
    function unchanged(c){if(stable(raw())!==stable(c.raw))fail('LOCAL_CHANGED');
  const n=capture();
  if(n.staffId!==c.staffId)fail('OWNER_CHANGED');
  }
    const journal=()=>{const r=io.storage.getItem(KEY);
  if(!r)return null;
  const j=parse(r);
  if(j.version!==1||j.deviceId!==DEVICE||!j.archiveSha256||!j.manifest||!j.original||!j.checksum)fail('JOURNAL_INVALID');
  const copy=clone(j);
  delete copy.checksum;
  if(io.operationHash(copy)!==j.checksum)fail('JOURNAL_CORRUPT');
  return j;
  };
    function put(key,value){io.storage.setItem(key,value);
  if(io.storage.getItem(key)!==value)fail('STORAGE_READBACK');
  }
    function writeJournal(j){delete j.checksum;
  j.checksum=io.operationHash(j);
  put(KEY,JSON.stringify(j));
  }
    async function cloud(c){const result=await io.readCloud(c.state);
  authority(result,c.state);
  if(!Number.isFinite(Date.parse(result.checkedAt)))fail('CLOUD_CHECK_TIME');
  io.verifyCheckpoint(result.checkpoint.payload,result.checkpoint.payload_hash);
  let last=result.checkpoint.checkpoint_cursor;
  const ids=new Set();
  for(const row of result.operations){const op=row.payload;
  if(!validInt(row.seq)||row.seq<=last||row.seq>result.head||!op||op.opId!==row.op_id||ids.has(row.op_id)||op.protocolVersion!=='M4/3'||!op.payloadHash||io.operationHash(op)!==op.payloadHash)fail('CLOUD_OPERATION_INTEGRITY');
  io.validateOperation(op);
  for(const p of op.patches||[]){if(p.collection&&!COLLECTIONS.includes(p.collection)||p.root&&!ROOTS.includes(p.root))fail('UNKNOWN_CLOUD_EFFECT');
  }ids.add(row.op_id);
  last=row.seq;
  }if(last!==result.head)fail('CLOUD_WINDOW_INCOMPLETE');
  return result;
  }
    const bundle=c=>({baseline:c.checkpoint.payload,baselineCursor:c.checkpoint.checkpoint_cursor,headSeq:c.head,operations:c.operations,protocolVersion:'M4/3',checkpoint:{cursor:c.checkpoint.checkpoint_cursor}});
    function project(c,until){const b=bundle(c);
  if(until!==undefined){b.headSeq=until;
  b.operations=b.operations.filter(o=>o.seq<=until);
  }const p=io.integrity.projectCloud(b);
  if(p.conflicts.length)fail('REPLAY_CONFLICT');
  const wallets=p.database.cashBalances;
  if(!wallets||typeof wallets!=='object'||Array.isArray(wallets)||Object.values(wallets).some(v=>!['number','string'].includes(typeof v)||String(v).trim()===''||!Number.isFinite(Number(v))))fail('CLOUD_WALLET_VALUE');
  return p.database;
  }
    async function fingerprint(c){const copy=Object.assign({},c);
  delete copy.checkedAt;
  return sha(stable(copy));
  }
    async function preflight(){plan=null;
  backup=null;
  const c=capture();
  validateQueue(c.queue,c.state,io.operationHash);
  const a=await cloud(c),db=project(a);
  const rows=classify(c.queue,db.sharedDeviceDirectory,c.state.businessId,a.operations,Number(c.state.cursor));
  if(!Array.isArray(a.accepted))fail('CLOUD_OPERATION_LOOKUP_REQUIRED');
  for(const accepted of a.accepted){const original=c.queue.find(o=>o.opId===accepted.op_id);
  if(!original||!validInt(accepted.seq)||accepted.seq>a.head||accepted.payload?.opId!==accepted.op_id||io.operationHash(accepted.payload)!==original.payloadHash||accepted.payload.payloadHash!==original.payloadHash)fail('CLOUD_OPERATION_PAYLOAD_CONFLICT');
  }if(new Set(a.accepted.map(o=>o.op_id)).size!==a.accepted.length)fail('CLOUD_OPERATION_DUPLICATE');
  for(const row of rows){const accepted=a.accepted.find(o=>o.op_id===row.opId);
  row.cloudOperationStatus=accepted?'PRESENT_WITH_IDENTICAL_PAYLOAD':'NO_VISIBLE_MATCH_PRECHECKPOINT_HISTORY_UNPROVEN';
  row.cloudOperationCursor=accepted?accepted.seq:null;
  row.wouldOverwriteCurrentDirectory=directoryMeaning(c.queue.find(o=>o.opId===row.opId).patches[0].value)!==directoryMeaning(db.sharedDeviceDirectory);
  }for(let i=0;
  i<rows.length;
  i++){rows[i].beforeSha256=await sha(stable(c.queue[i].patches[0].before));
  rows[i].valueSha256=await sha(stable(c.queue[i].patches[0].value));
  rows[i].cloudDirectorySha256=await sha(stable(db.sharedDeviceDirectory));
  }const token=await fingerprint(a);
  unchanged(c);
  const operations=c.queue.map(o=>({opId:o.opId,payloadHash:o.payloadHash,deviceSeq:o.deviceSeq,createdAt:o.createdAt}));
  const rawSha256={};
  for(const [k,v]of Object.entries(c.raw))rawSha256[k]=await sha(v===null?'null':v);
  const manifest={backupVersion:2,classificationSha256:await sha(stable(rows)),rawSha256,deviceId:DEVICE,businessId:c.state.businessId,ownerId:c.state.syncOwnerId,queueSha256:await sha(c.raw.queue),operations,cloudEvidenceSha256:token,head:a.head,checkpointId:a.checkpoint.checkpoint_id,checkpointCursor:a.checkpoint.checkpoint_cursor};
      plan={capture:c,authority:a,cloud:db,manifest,rows};
  backup=null;
  return {readOnly:true,deviceId:DEVICE,head:a.head,localCursor:Number(c.state.cursor),checkpointId:manifest.checkpointId,rows,manifest,quarantineAuthorized:false,dispositionEligible:rows.every(r=>r.safeToPreserveWithoutPublication),authority:'AUTHENTICATED_OWNER_ACTIVE_LIFECYCLE',directoryMeaning:'Staff authorization root; not a hardware enrollment registry'};
  }
    const b64=b=>{let s='';
  for(let i=0;
  i<b.length;
  i+=16384)s+=String.fromCharCode(...b.subarray(i,i+16384));
  return btoa(s);
  };
    const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
    async function key(pass,salt,usages){if(typeof pass!=='string'||pass.length<20||pass.length>1024)fail('PASSPHRASE');
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:600000,hash:'SHA-256'},await crypto.subtle.importKey('raw',enc.encode(pass),'PBKDF2',false,['deriveKey']),{name:'AES-GCM',length:256},false,usages);
  }
    async function open(text,pass){let e=parse(text);
  if(e.format!=='ZEZMS_SHOP_DIRECTORY_ENCRYPTED_V2'||e.iterations!==600000||e.cipher!=='AES-256-GCM'||text.length>64*1024*1024)fail('ARCHIVE_FORMAT');
  let payload;
  try{payload=parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(e.iv),additionalData:enc.encode('ZEZMS_SHOP_DIRECTORY_V1|'+DEVICE)},await key(pass,bytes(e.salt),['decrypt']),bytes(e.ciphertext))));
  }catch(_){fail('ARCHIVE_AUTHENTICATION');
  }if(payload.format!=='ZEZMS_SHOP_DIRECTORY_FULL_BACKUP_V2'||payload.manifest.backupVersion!==2||payload.manifest.deviceId!==DEVICE||await sha(payload.originalQueueRaw)!==payload.manifest.queueSha256||await sha(stable(payload.classification))!==payload.manifest.classificationSha256||await sha(stable(payload.fullState))!==payload.fullStateSha256)fail('ARCHIVE_MANIFEST');
  for(const [k,v]of Object.entries(payload.fullState.original))if((v===null?await sha('null'):v.sha256)!==payload.manifest.rawSha256[k])fail('FULL_BACKUP_MANIFEST');
  noSecrets(payload);
  return payload;
  }
    async function saveArchive(handle,pass){backup=null;
  if(!plan)fail('PREFLIGHT_REQUIRED');
  const p=plan;
  unchanged(p.capture);
  const prior=p.receive?p.originalBackup:null;
  const fullState={original:prior?prior.fullState.original:await sealSnapshot(p.capture.raw),point:await sealSnapshot(p.capture.raw),target:p.receive?await sealSnapshot(receiveTarget(p)):null};
  const data={format:'ZEZMS_SHOP_DIRECTORY_FULL_BACKUP_V2',stage:p.receive?'RECEIVE':'QUARANTINE',capturedAt:new Date().toISOString(),manifest:p.manifest,originalQueueRaw:prior?prior.originalQueueRaw:p.capture.raw.queue,cloudDirectory:p.receive?p.current.sharedDeviceDirectory:p.cloud.sharedDeviceDirectory,classification:p.rows,fullState,fullStateSha256:await sha(stable(fullState)),pointCloudToken:p.receive?p.token:null,previousArchiveSha256:p.receive?p.originalArchiveSha256:null};
  noSecrets(data);
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode('ZEZMS_SHOP_DIRECTORY_V1|'+DEVICE)},await key(pass,salt,['encrypt']),enc.encode(JSON.stringify(data)));
  const text=JSON.stringify({format:'ZEZMS_SHOP_DIRECTORY_ENCRYPTED_V2',cipher:'AES-256-GCM',iterations:600000,salt:b64(salt),iv:b64(iv),ciphertext:b64(new Uint8Array(ciphertext))});
  unchanged(p.capture);
  const writable=await handle.createWritable();
  await writable.write(text);
  await writable.close();
  const saved=await(await handle.getFile()).text();
  if(saved!==text)fail('ARCHIVE_READBACK');
  const verified=await open(saved,pass);
  if(stable(verified)!==stable(data))fail('ARCHIVE_DECRYPT_READBACK');
  unchanged(p.capture);
  backup={sha256:await sha(saved),data:verified};
  return {savedReadbackAndDecryptionVerified:true,completeOriginalBusinessBackup:true,stage:data.stage,archiveSha256:backup.sha256,manifest:p.manifest};
  }
    async function verifyArchive(file,pass){backup=null;
  const text=await file.text(),data=await open(text,pass);let j=null,damaged=false;try{j=journal();}catch(_){damaged=true;}
  const hash=await sha(text);
  if(j&&((hash!==j.archiveSha256&&data.previousArchiveSha256!==j.archiveSha256)||stable(data.manifest)!==stable(j.manifest)||data.originalQueueRaw!==j.original.queue))fail('WRONG_ARCHIVE');
  if(!j&&plan&&(stable(data.manifest)!==stable(plan.manifest)||data.originalQueueRaw!==plan.capture.raw.queue))fail('WRONG_ARCHIVE');
  const c=capture();if(c.state.syncOwnerId!==data.manifest.ownerId||c.state.businessId!==data.manifest.businessId)fail('WRONG_ARCHIVE_OWNER');
  await unsealSnapshot(data.fullState.original,c.raw);unchanged(c);
  backup={sha256:hash,data};
  return {savedReadbackAndDecryptionVerified:true,archiveSha256:hash,externalRestoreRequired:!j&&!plan,journalDamaged:damaged};
  }
    async function archiveFor(j){if(!backup||(backup.sha256!==j.archiveSha256&&backup.data.previousArchiveSha256!==j.archiveSha256)||stable(backup.data.manifest)!==stable(j.manifest)||!backup.data.fullState?.original)fail('EXTERNAL_ARCHIVE_REQUIRED');
  for(const [k,v]of Object.entries(j.original))if(await sha(v===null?'null':v)!==j.manifest.rawSha256[k])fail('ORIGINAL_SNAPSHOT_CORRUPT');
  if(stable(await unsealSnapshot(backup.data.fullState.original,raw()))!==stable(j.original))fail('FULL_BACKUP_ORIGINAL_MISMATCH');
  }
    async function quarantine(confirmed){if(confirmed!=='QUARANTINE EXACT THREE')fail('EXPLICIT_CONFIRMATION_REQUIRED');
  if(io.online())fail('OFFLINE_QUARANTINE_REQUIRED');
  await io.exclusive();
  let j=journal();
  const c=capture();
  if(backup)safeRows(backup.data.classification);
  if(j){await archiveFor(j);
  if(['QUARANTINED','VERIFIED_HOLD'].includes(j.phase)&&c.raw.queue==='[]')return {alreadyQuarantined:true};
  if(j.phase!=='QUARANTINE_PREPARED'||![j.original.queue,'[]'].includes(c.raw.queue))fail('INTERRUPTED_REVIEW_REQUIRED');
  }else{if(!plan||!backup)fail('VERIFIED_ARCHIVE_REQUIRED');
  safeRows(plan.rows);
  unchanged(plan.capture);
  if(Date.now()-Date.parse(plan.authority.checkedAt)>15*60*1000)fail('STALE_PREFLIGHT');
  j={version:1,deviceId:DEVICE,phase:'QUARANTINE_PREPARED',archiveSha256:backup.sha256,manifest:plan.manifest,original:plan.capture.raw,actor:c.staffId,createdAt:new Date().toISOString(),reason:'Owner chose current authenticated cloud staff directory; preserved local publications are not uploaded',events:[]};
  await archiveFor(j);
  unchanged(c);
  capacityFor(c,plan.cloud,j);
  writeJournal(j);
  }
      if(io.online())fail('OFFLINE_QUARANTINE_REQUIRED');
  unchanged(c);
  capacityFor(c,plan?.cloud||c.db,j);
  if(c.raw.queue!==j.original.queue&&c.raw.queue!=='[]')fail('QUEUE_CHANGED');
  const paused=Object.assign({},parse(j.original.state),{liveSyncEnabled:false,liveSyncDesired:false,configurationVerificationRequired:true,directoryOutboxReviewRequired:true});
  put(KEYS.state,JSON.stringify(paused));
  put(KEYS.queue,'[]');
  j.phase='QUARANTINED';
  j.events.push({action:'QUARANTINE_NO_UPLOAD',at:new Date().toISOString(),actor:c.staffId,operationIds:IDS});
  writeJournal(j);
  io.reloadRuntime();
  return {quarantinedCount:3,acknowledgedCount:0,liveSyncEnabled:false};
  }
    function compareBusiness(a,b,ignoreDirectory){const different=[];
  for(const root of ROOTS){if(ignoreDirectory&&root==='sharedDeviceDirectory')continue;
  if(stable(a[root])!==stable(b[root]))different.push('root:'+root);
  }for(const col of COLLECTIONS){const norm=db=>{const rows=db[col]||[];
  if(!Array.isArray(rows))fail('COLLECTION_SHAPE');
  const seen=new Set();
  return rows.map(r=>{const id=io.entityKey(col,r);
  if(!id||seen.has(id))fail('DUPLICATE_OR_INVALID_ID');
  seen.add(id);
  const v=clone(r);
  if(col==='undoLog')delete v.productId;
  return [id,v];
  }).sort((x,y)=>x[0].localeCompare(y[0]));
  };
  if(stable(norm(a))!==stable(norm(b)))different.push('collection:'+col);
  }if(different.length)fail('BUSINESS_DIFFERENCE_'+different.join('_').replace(/[^A-Za-z0-9_]/g,'_'));
  }
    async function prepareReceive(){plan=null;
  const c=capture(),j=journal();
  if(!j||!['QUARANTINED','VERIFIED_HOLD'].includes(j.phase)||c.raw.queue!=='[]')fail('QUARANTINE_REQUIRED');
  await archiveFor(j);
  safeRows(backup.data.classification);
  const a=await cloud(c),cursor=Number(c.state.cursor);
  if(cursor>a.head)fail('SHOP_CURSOR_AHEAD_OF_CLOUD');
  if(a.checkpoint.checkpoint_cursor>cursor)fail('CHECKPOINT_AHEAD_OF_SHOP');
  const at=project(a,cursor),current=project(a);
  compareBusiness(c.db,at,true);
  const localDir=stable(c.db.sharedDeviceDirectory),lastDir=stable(parse(j.original.queue)[2].patches[0].value);
  if(localDir!==lastDir&&localDir!==stable(at.sharedDeviceDirectory))fail('UNEXPECTED_LOCAL_DIRECTORY');
  const base=clone(c.db);
  base.sharedDeviceDirectory=clone(at.sharedDeviceDirectory);
  const tail=a.operations.filter(o=>o.seq>cursor);
  const p=io.integrity.projectCloud({baseline:base,operations:tail});
  if(p.conflicts.length)fail('LOCAL_REPLAY_CONFLICT');
  const candidate=p.database;
  compareBusiness(candidate,current,false);
  io.validateDatabase(candidate);
  directory(candidate.sharedDeviceDirectory,c.state.businessId);
  const report=io.integrity.compareDatabases(candidate,current,bundle(a));
  const bad=report.actionableDifferences.filter(r=>r.category!=='Orphan Reference');
  if(bad.length)fail('PRODUCTION_INTEGRITY');
  const cloudOrphans=io.integrity.findOrphans(current),localOrphans=io.integrity.findOrphans(candidate);
  if(stable(localOrphans)!==stable(cloudOrphans))fail('REFERENCE_DIVERGENCE');
  unchanged(c);
  plan={receive:true,capture:c,authority:a,token:await fingerprint(a),candidate,tail,current,report,manifest:j.manifest,rows:backup.data.classification,originalBackup:backup.data,originalArchiveSha256:j.archiveSha256};
  return {readOnly:true,head:a.head,cursor,receiveOperationCount:tail.length,productionDifferences:bad.length,authoritativeOrphanReferences:cloudOrphans.length,historicalReferences:report.historicalReferences.length,historicalMetadata:report.historicalMetadata.length,walletsMatch:true,requiresSeparateConfirmation:true,saveFreshFullBackupBeforeReceive:true};
  }
    function receiveTarget(p){const applied=parse(p.capture.raw.applied||'{}');for(const o of p.tail)applied[o.op_id]=o.seq;
      const state=Object.assign({},p.capture.state,{cursor:p.authority.head,cloudHeadSeq:p.authority.head,liveSyncEnabled:false,liveSyncDesired:false,configurationVerificationRequired:true});
      return Object.assign({},p.capture.raw,{db:JSON.stringify(p.candidate),applied:JSON.stringify(applied),state:JSON.stringify(state)});
    }
    async function receive(confirmed){if(confirmed!=='RECEIVE ONLY')fail('EXPLICIT_CONFIRMATION_REQUIRED');
  await io.exclusive();
  let j=journal();
  if(!j)fail('QUARANTINE_REQUIRED');
  await archiveFor(j);
  if(j.phase==='RECEIVE_PREPARED')return resume(confirmed);
  if(!plan?.receive)fail('RECEIVE_PREFLIGHT_REQUIRED');
  const p=plan;
  if(backup.data.stage!=='RECEIVE'||backup.data.pointCloudToken!==p.token||stable(await unsealSnapshot(backup.data.fullState.point,p.capture.raw))!==stable(p.capture.raw)||stable(await unsealSnapshot(backup.data.fullState.target,p.capture.raw))!==stable(receiveTarget(p)))fail('FRESH_FULL_RECEIVE_BACKUP_REQUIRED');
  unchanged(p.capture);
  const latest=await cloud(p.capture);
  if(await fingerprint(latest)!==p.token)fail('CLOUD_CHANGED');
  unchanged(p.capture);
  await io.exclusive();
  unchanged(p.capture);
  const applied=parse(p.capture.raw.applied||'{}');
  for(const o of p.tail)applied[o.op_id]=o.seq;
  const nextState=Object.assign({},p.capture.state,{cursor:p.authority.head,cloudHeadSeq:p.authority.head,liveSyncEnabled:false,liveSyncDesired:false,configurationVerificationRequired:true});
  j.phase='RECEIVE_PREPARED';
  j.receive={before:p.capture.raw,target:{db:JSON.stringify(p.candidate),applied:JSON.stringify(applied),state:JSON.stringify(nextState)},cloudToken:p.token,head:p.authority.head,events:p.tail.map(o=>({seq:o.seq,opId:o.op_id,payloadHash:o.payload.payloadHash}))};
  j.archiveSha256=backup.sha256;
  capacityFor(p.capture,p.candidate,j);
  writeJournal(j);
  return resume(confirmed);
  }
    async function resume(confirmed){if(confirmed!=='RECEIVE ONLY')fail('EXPLICIT_CONFIRMATION_REQUIRED');
  await io.exclusive();
  const j=journal();
  if(j?.phase!=='RECEIVE_PREPARED')fail('NO_INTERRUPTED_RECEIVE');
  await archiveFor(j);
  const c=capture();
  if(c.raw.queue!=='[]')fail('QUEUE_NOT_EMPTY');
  const a=await cloud(c);
  if(await fingerprint(a)!==j.receive.cloudToken)fail('CLOUD_CHANGED_DURING_INTERRUPTION');
  const originalDb=parse(j.receive.before.db),originalState=parse(j.receive.before.state),at=project(a,Number(originalState.cursor));
  compareBusiness(originalDb,at,true);
  const base=clone(originalDb);
  base.sharedDeviceDirectory=clone(at.sharedDeviceDirectory);
  const tail=a.operations.filter(o=>o.seq>Number(originalState.cursor));
  const expected=io.integrity.projectCloud({baseline:base,operations:tail});
  if(expected.conflicts.length||stable(expected.database)!==stable(parse(j.receive.target.db)))fail('PREPARED_TARGET_CORRUPT');
  compareBusiness(expected.database,project(a),false);
  const expectedApplied=parse(j.receive.before.applied||'{}');
  for(const row of tail)expectedApplied[row.op_id]=row.seq;
  const expectedState=Object.assign({},originalState,{cursor:a.head,cloudHeadSeq:a.head,liveSyncEnabled:false,liveSyncDesired:false,configurationVerificationRequired:true});
  if(stable(expectedApplied)!==stable(parse(j.receive.target.applied))||stable(expectedState)!==stable(parse(j.receive.target.state)))fail('PREPARED_METADATA_CORRUPT');
  unchanged(c);
  capacityFor(c,expected.database,j);
  for(const k of ['db','applied','state']){const now=io.storage.getItem(KEYS[k]);
  if(![j.receive.before[k],j.receive.target[k]].some(v=>knownValue(k,now,v)))fail('CONCURRENT_LOCAL_CHANGE');
  }for(const k of ['db','applied','state'])put(KEYS[k],k==='db'?preserveLocalMetadata(j.receive.target.db,c.raw.db):j.receive.target[k]);
  j.phase='VERIFIED_HOLD';
  j.events.push({action:'RECEIVE_ONLY_COMMITTED',at:new Date().toISOString(),head:j.receive.head});
  writeJournal(j);
  io.reloadRuntime();
  plan=null;
  return {head:j.receive.head,liveSyncEnabled:false,postAuditRequired:true};
  }
    async function verifyCurrent(){const c=capture(),j=journal();
  if(j?.phase!=='VERIFIED_HOLD'||c.raw.queue!=='[]')fail('COMPLETE_RECEIVE_FIRST');
  await archiveFor(j);
  const a=await cloud(c);
  if(Number(c.state.cursor)!==a.head)fail('CLOUD_HAS_NEW_OPERATIONS');
  const current=project(a);
  compareBusiness(c.db,current,false);
  const report=io.integrity.compareDatabases(c.db,current,bundle(a));
  if(report.actionableDifferences.some(r=>r.category!=='Orphan Reference')||report.unappliedCloudOperations.length||report.unacknowledgedLocalOperations.length)fail('POST_AUDIT');
  unchanged(c);
  return {readOnly:true,head:a.head,missingLocal:0,missingCloud:0,payloadMismatches:0,duplicates:0,failedOperations:0,queueCount:0,replayConflicts:0,walletsEqual:true,authoritativeOrphanReferences:io.integrity.findOrphans(current).length,historicalReferences:report.historicalReferences.length,historicalMetadata:report.historicalMetadata.length,liveSyncEnabled:false};
  }
    async function rollback(confirmed){if(confirmed!=='RESTORE PRESERVED LOCAL STATE')fail('EXPLICIT_CONFIRMATION_REQUIRED');
  if(io.online())fail('OFFLINE_ROLLBACK_REQUIRED');
  await io.exclusive();
  const j=journal();
  if(!j)fail('NO_JOURNAL');
  await archiveFor(j);
  const c=capture();
  if(j.phase==='ROLLED_BACK'&&c.raw.queue===j.original.queue)return {alreadyRestored:true};
  if(!['QUARANTINE_PREPARED','QUARANTINED','RECEIVE_PREPARED','VERIFIED_HOLD','ROLLBACK_PREPARED'].includes(j.phase))fail('ROLLBACK_STATE');
  if(![j.original.queue,'[]'].includes(c.raw.queue))fail('UNRELATED_QUEUE');
  const before=j.original;
  for(const k of ['db','applied'])if(![before[k],j.receive?.before[k],j.receive?.target[k]].some(v=>knownValue(k,c.raw[k],v)))fail('LATER_LOCAL_DATA');
  j.phase='ROLLBACK_PREPARED';
  capacityFor(c,parse(before.db),j);
  writeJournal(j);
  for(const k of ['db','applied']){
  if(before[k]!==null)put(KEYS[k],k==='db'?preserveLocalMetadata(before[k],c.raw.db):before[k]);
  else{io.storage.removeItem(KEYS[k]);
  if(io.storage.getItem(KEYS[k])!==null)fail('STORAGE_READBACK');
  }}
  const paused=Object.assign({},parse(j.original.state),{liveSyncEnabled:false,liveSyncDesired:false,configurationVerificationRequired:true});
  put(KEYS.state,JSON.stringify(paused));
  put(KEYS.queue,j.original.queue);
  j.phase='ROLLED_BACK';
  j.events.push({action:'RESTORE_PRESERVED_LOCAL_STATE_NO_UPLOAD',at:new Date().toISOString()});
  writeJournal(j);
  io.reloadRuntime();
  return {restoredOperations:3,uploadBlocked:true};
  }
    function knownValue(k,now,expected){if(now===expected)return true;if(!now||!expected)return false;
      if(k==='state'){const normalize=text=>{const s=parse(text);delete s.status;delete s.pending;return stable(s);};return normalize(now)===normalize(expected);}
      if(k!=='db')return false;
      const normalize=text=>{const d=parse(text);for(const f of LOCAL_DATABASE_FIELDS)delete d[f];for(const row of d.undoLog||[])delete row.productId;return stable(d);};
      return normalize(now)===normalize(expected);
    }
    function preserveLocalMetadata(original,current){const result=parse(original),local=parse(current);
      for(const k of LOCAL_DATABASE_FIELDS){if(own(local,k))result[k]=local[k];else delete result[k];}return JSON.stringify(result);
    }
    async function restoreExternal(confirmed){if(confirmed!=='RESTORE VERIFIED EXTERNAL BACKUP')fail('EXPLICIT_CONFIRMATION_REQUIRED');
      if(io.online())fail('OFFLINE_ROLLBACK_REQUIRED');await io.exclusive();
      if(!backup?.data.fullState?.original)fail('VERIFIED_FULL_EXTERNAL_BACKUP_REQUIRED');
      let existing=null;try{existing=journal();}catch(_){}
      if(existing){if(existing.externalRestoration&&['ROLLBACK_PREPARED','ROLLED_BACK'].includes(existing.phase))return rollback('RESTORE PRESERVED LOCAL STATE');fail('USE_JOURNALED_ROLLBACK');}
      const c=capture(),data=backup.data;
      if(c.state.syncOwnerId!==data.manifest.ownerId||c.state.businessId!==data.manifest.businessId)fail('WRONG_ARCHIVE_OWNER');
      const original=await unsealSnapshot(data.fullState.original,c.raw),point=await unsealSnapshot(data.fullState.point,c.raw),target=data.fullState.target?await unsealSnapshot(data.fullState.target,c.raw):null;
      validateQueue(parse(original.queue),parse(original.state),io.operationHash);
      const paused=JSON.stringify(Object.assign({},parse(original.state),{liveSyncEnabled:false,liveSyncDesired:false,configurationVerificationRequired:true,directoryOutboxReviewRequired:true}));
      const restored=JSON.stringify(Object.assign({},parse(original.state),{liveSyncEnabled:false,liveSyncDesired:false,configurationVerificationRequired:true}));
      for(const k of Object.keys(KEYS)){const allowed=[original[k],point[k],target?target[k]:original[k]];
        if(k==='queue')allowed.push('[]');if(k==='state')allowed.push(paused,restored);
        if(!allowed.some(v=>knownValue(k,c.raw[k],v)))fail('EXTERNAL_RESTORE_UNRECOGNIZED_LOCAL_STATE_'+k.toUpperCase());
      }
      unchanged(c);const displaced=io.storage.getItem(KEY);
      const j={version:1,deviceId:DEVICE,phase:'ROLLBACK_PREPARED',archiveSha256:backup.sha256,manifest:data.manifest,original,actor:c.staffId,createdAt:new Date().toISOString(),externalRestoration:true,displacedJournal:displaced,reason:'Owner-confirmed restoration from authenticated full external backup; no cloud call or upload',events:[]};
      if(target)j.receive={before:point,target:{db:target.db,state:target.state,applied:target.applied}};
      capacityFor(c,parse(original.db),j);writeJournal(j);return rollback('RESTORE PRESERVED LOCAL STATE');
    }
    async function serial(fn,...args){if(busy)fail('BUSY');
  busy=true;
  try{return await fn(...args);
  }finally{busy=false;
  let j=null;try{j=journal();}catch(_){}
  if(j&&['RECEIVE_PREPARED','ROLLBACK_PREPARED'].includes(j.phase))io.reloadRuntime();
  }}
    return Object.freeze({preflight:()=>serial(preflight),saveArchive:(...a)=>serial(saveArchive,...a),verifyArchive:(...a)=>serial(verifyArchive,...a),quarantine:(...a)=>serial(quarantine,...a),prepareReceive:()=>serial(prepareReceive),receive:(...a)=>serial(receive,...a),resume:(...a)=>serial(resume,...a),verifyCurrent:()=>serial(verifyCurrent),rollback:(...a)=>serial(rollback,...a),restoreExternal:(...a)=>serial(restoreExternal,...a)});
  }
  return Object.freeze({DEVICE,IDS,KEY,KEYS,ROOTS,COLLECTIONS,stable,validateQueue,classify,create});
});
