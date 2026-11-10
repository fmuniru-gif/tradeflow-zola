/* Pure, evidence-bound restoration of the two effects of one existing Main operation. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ZEZMSMainCashProjection=factory();})(globalThis,function(){
 'use strict';
 const MAIN='9a5ab8eb-f67e-425c-866d-574b641295f0',SOURCE_SEQ=4293;
 const OMIT=['backupHistory','backupSettings','syncSettings','syncMeta','syncRejectedTransactions','syncReconciliationLog','sharedDeviceAuth'];
 const MANAGEMENT=['managementTargets','managementTargetHistory','managementScenarios','managementAlertStates','managementAlertHistory','managementActionPlans','managementActionTasks','managementActionHistory','managementExecutionHandoffs'];
 const OPERATIONAL=['sales','inventoryTxns','stockRows','cashLog','expenses','accountTxns','debtors','creditors','depositors','purchaseOrders','products','customers'];
 const COLLECTIONS=['products','customers','customerFollowups','salesOpportunities','quotations','stockRows','stockCorrections','warranties','warrantyClaims','debtors','creditors','depositors','sales','receipts','invoices','waybills','purchaseOrders','saleLines','accountTxns','cashLog','expenses','inventoryTxns','undoLog','debtorsMonthly','creditorsMonthly','depositorsMonthly','kpiHistory','monthRollovers',...MANAGEMENT];
 const clone=x=>JSON.parse(JSON.stringify(x)),stop=m=>{throw Error('STOP_'+m);};
 function stable(v){if(v===undefined)return 'undefined';if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(stable).join(',')+']';return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';}
 function cents(n){if(typeof n!=='number'||!Number.isFinite(n)||Math.abs(n*100-Math.round(n*100))>1e-6)stop('NON_CURRENCY_VALUE');return Math.round(n*100);}
 async function verifyAnchor(envelope,expected,sha){
  if(!envelope||Object.keys(envelope).some(k=>!['report','sha256'].includes(k))||envelope.sha256!==expected||await sha(JSON.stringify(envelope.report))!==expected)stop('REVIEW_REPORT_CHECKSUM');
  const a=envelope.report,t=a.target,h=t&&t.history;
  if(a.format!=='ZEZMS_MAIN_SINGLE_CASH_REVIEW_V1'||a.reviewRevision!=='20261110-r2'||a.readOnly!==true||a.repairAuthorized!==false||a.deviceId!==MAIN||a.localCursor!==4305||a.cloudHead!==4305||t.selectionStatus!=='UNIQUE_MISSING_CASH_RECORD'||t.mainCount!==0||t.cloudCount!==1||!t.id?.startsWith('CB-20261109-183110-271-')||!Array.isArray(h)||h.length!==1||h[0].seq!==SOURCE_SEQ||h[0].deviceId!==MAIN||h[0].payloadHashValid!==true||h[0].recordedAsApplied!==true||h[0].otherEffects.length)stop('REVIEW_REPORT_SCOPE');
  return a;
 }
 function sorted(db,c,N){return (db[c]||[]).slice().sort((a,b)=>N.entityKey(c,a).localeCompare(N.entityKey(c,b))||stable(a).localeCompare(stable(b)));}
 function operational(db,N){const p={};for(const c of OPERATIONAL)p[c]={count:(db[c]||[]).length,hash:N.fingerprint(sorted(db,c,N))};p.cashBalances={count:Object.keys(db.cashBalances||{}).length,hash:N.fingerprint(db.cashBalances||{})};return N.fingerprint(p);}
 function owners(db,cloud,business){
  const auth=db.sharedDeviceAuth,dir=cloud.sharedDeviceDirectory;
  if(!auth?.enabled||auth.businessId!==business||!dir?.enabled||dir.businessId!==business||!Array.isArray(auth.users)||!Array.isArray(dir.users))stop('LOCAL_OWNER_AUTHORITY');
  const credential=u=>stable({algorithm:String(u.passwordAlgorithm||'PBKDF2-SHA256'),iterations:Number(u.passwordIterations)||210000,salt:String(u.passwordSalt||''),hash:String(u.passwordHash||''),changedAt:String(u.passwordChangedAt||'')});
  const result=auth.users.filter(u=>u&&u.active===true&&u.role==='OWNER'&&String(u.passwordAlgorithm||'PBKDF2-SHA256')==='PBKDF2-SHA256'&&Number.isSafeInteger(Number(u.passwordIterations)||210000)&&(Number(u.passwordIterations)||210000)>=100000&&(Number(u.passwordIterations)||210000)<=2000000&&dir.users.filter(v=>v&&v.id===u.id&&v.active===true&&v.role==='OWNER'&&credential(v)===credential(u)).length===1);
  if(!result.length)stop('LOCAL_OWNER_AUTHORITY');return result;
 }
 async function normalize(candidate,cloud,report,anchor,N,sha){
  const a=clone(candidate),b=clone(cloud),notes=[];for(const k of OMIT){delete a[k];delete b[k];}
  for(const k of ['security','version'])if(stable(a[k])!==stable(b[k])){const p=anchor.rootDifferences.before.filter(x=>x.root===k);if(p.length!==1||await sha(stable(a[k]))!==p[0].mainSha256||await sha(stable(b[k]))!==p[0].cloudSha256)stop('CHANGED_'+k.toUpperCase());delete a[k];delete b[k];notes.push(k+' retained exactly as reviewed');}
  for(const k of MANAGEMENT)if((a[k]===undefined&&Array.isArray(b[k])&&!b[k].length)||(b[k]===undefined&&Array.isArray(a[k])&&!a[k].length)){a[k]=[];b[k]=[];notes.push(k+' empty initialization');}
  const allowedZero=new Set(anchor.wallets.filter(w=>w.mainPresent!==w.cloudPresent&&(w.mainPresent?w.mainValue:w.cloudValue)===0).map(w=>w.wallet));
  for(const k of new Set([...Object.keys(a.cashBalances),...Object.keys(b.cashBalances)])){
   const ah=Object.hasOwn(a.cashBalances,k),bh=Object.hasOwn(b.cashBalances,k);if(ah===bh)continue;
   const av=a.settings?.cashWallets?.filter(w=>w&&w.balanceKey===k)||[],bv=b.settings?.cashWallets?.filter(w=>w&&w.balanceKey===k)||[];
   if(!allowedZero.has(k)||(ah?a.cashBalances[k]:b.cashBalances[k])!==0||av.length!==1||bv.length!==1||stable(av[0])!==stable(bv[0]))stop('UNVERIFIED_WALLET_KEY');
   a.cashBalances[k]=0;b.cashBalances[k]=0;notes.push('registered zero wallet '+k+' preserved');
  }
  const la=new Map((a.undoLog||[]).map(x=>[N.entityKey('undoLog',x),x])),lb=new Map((b.undoLog||[]).map(x=>[N.entityKey('undoLog',x),x]));
  for(const m of report.historicalMetadata||[]){if(m.collection!=='undoLog'||m.fields?.length!==1||m.fields[0]!=='productId'||!la.has(m.id)||!lb.has(m.id))stop('UNDO_METADATA_SCOPE');delete la.get(m.id).productId;delete lb.get(m.id).productId;}
  for(const c of COLLECTIONS)if(Array.isArray(a[c])&&Array.isArray(b[c])){a[c]=sorted(a,c,N);b[c]=sorted(b,c,N);}
  const different=[...new Set([...Object.keys(a),...Object.keys(b)])].filter(k=>stable(a[k])!==stable(b[k]));if(different.length)stop('OTHER_BUSINESS_ROOTS_'+different.join(','));
  return {cloud:b,notes};
 }
 function assertScope(original,candidate,id,wallet,added){const inverse=clone(candidate);if(added){const rows=inverse.cashLog.filter(x=>x?.id===id);if(rows.length!==1)stop('CANDIDATE_RECORD_COUNT');inverse.cashLog=inverse.cashLog.filter(x=>x?.id!==id);}inverse.cashBalances[wallet]=original.cashBalances[wallet];if(JSON.stringify(inverse)!==JSON.stringify(original))stop('CANDIDATE_SCOPE');return true;}
 async function plan(input,N,R,H,sha){
  const {anchor,db,state,applied,bundle,history}=input;
  if(state.deviceId!==MAIN||state.deviceAccessMode!=='OWNER'||state.initialized!==true||state.syncOwnerId!==anchor.ownerId||state.businessId!==anchor.businessId||bundle.ownerId!==anchor.ownerId||state.cursor!==bundle.headSeq||bundle.headSeq<anchor.cloudHead)stop('MAIN_OWNER_AT_HEAD_REQUIRED');
  const projection=N.projectCloud(bundle),cloud=projection.database,report=N.compareDatabases(db,cloud,bundle),id=anchor.target.id,recordRows=(cloud.cashLog||[]).filter(x=>x?.id===id),localRows=(db.cashLog||[]).filter(x=>x?.id===id);
  if(projection.conflicts.length||recordRows.length!==1||localRows.length>1||report.unappliedCloudOperations.length||report.unacknowledgedLocalOperations.length||report.oldProtocolOperations.length)stop('UNRESOLVED_SYNC_OR_RECORD');
  const record=recordRows[0],source=anchor.target.history[0],touches=history.filter(row=>(row.payload.patches||[]).some(p=>p.collection==='cashLog'&&(p.key===id||[p.value,p.before,p.fallback].some(v=>v?.id===id))));
  if(touches.length!==1||touches[0].seq!==SOURCE_SEQ||touches[0].op_id!==source.operationId||touches[0].owner_id!==anchor.ownerId||touches[0].device_id!==MAIN||!applied[source.operationId]||!R.opHash(touches[0].payload,H)||await sha(stable(touches[0].payload))!==source.operationSha256||await sha(stable(record))!==anchor.target.cloudRecordSha256)stop('ORIGINAL_OPERATION_PROVENANCE');
  const op=touches[0].payload,insert=op.patches.filter(p=>p.action==='insert'&&p.collection==='cashLog'&&p.key===id),wallet=record.walletKey||record.cashType,wp=op.patches.filter(p=>p.action==='root-object'&&p.root==='cashBalances'&&p.key===wallet&&p.mode==='delta');
  if(op.deviceId!==MAIN||(op.originDeviceId&&op.originDeviceId!==MAIN)||op.protocolVersion!=='M4/3'||op.patches.length!==2||insert.length!==1||wp.length!==1||stable(insert[0].value)!==stable(record)||record.action!=='Deduct'||record.status!=='ACTIVE'||record.meta?.source!=='DIRECT_CASH'||record.id!==id||record.cashType!==wallet||record.meta.walletKey!==wallet||cents(record.amount)<=0||cents(record.before)-cents(record.after)!==cents(record.amount)||cents(wp[0].value)!==-cents(record.amount)||cents(wp[0].before)!==cents(record.before))stop('ORIGINAL_CASH_EFFECT');
  if(localRows.length&&stable(localRows[0])!==stable(record))stop('LOCAL_RECORD_CHANGED');
  const cash=db.cashBalances,cc=cloud.cashBalances;if(!cash||!cc||!Object.hasOwn(cash,wallet)||!Object.hasOwn(cc,wallet)||cents(cc[wallet])!==cents(record.after)||![cents(record.before),cents(record.after)].includes(cents(cash[wallet])))stop('WALLET_PRECONDITION');
  const other=report.actionableDifferences.filter(d=>!(d.category==='Missing Locally'&&d.collection==='cashLog'&&d.id===id)&&d.category!=='Orphan Reference');if(other.length)stop('OTHER_RECORD_DIFFERENCES');
  const orphanKey=x=>[x.collection,x.id,x.detail].join('|'),oa=N.findOrphans(db).map(orphanKey).sort(),ob=N.findOrphans(cloud).map(orphanKey).sort();if(stable(oa)!==stable(ob))stop('UNSHARED_ORPHAN_REFERENCES');
  const candidate=clone(db),added=!localRows.length;if(added){const at=(cloud.cashLog||[]).findIndex(x=>x?.id===id),next=(cloud.cashLog||[]).slice(at+1).map(x=>x?.id),index=candidate.cashLog.findIndex(x=>next.includes(x?.id));candidate.cashLog.splice(index<0?candidate.cashLog.length:index,0,clone(record));}
  candidate.cashBalances[wallet]=cc[wallet];assertScope(db,candidate,id,wallet,added);
  const normalized=await normalize(candidate,cloud,report,anchor,N,sha),candidateHash=operational(candidate,N),cloudHash=operational(normalized.cloud,N);if(candidateHash!==cloudHash)stop('CANDIDATE_OPERATIONAL_HASH');
  const ownerAccounts=owners(db,cloud,state.businessId),walletChanged=cash[wallet]!==cc[wallet];
  return {candidate,ownerAccounts,summary:{ready:added||walletChanged,alreadyRestored:!added&&!walletChanged,deviceId:MAIN,deviceName:state.deviceName,ownerId:state.syncOwnerId,cloudHead:bundle.headSeq,operationId:source.operationId,sourceSeq:SOURCE_SEQ,recordId:id,recordSha256:anchor.target.cloudRecordSha256,addCashRecord:added,walletChanged,wallet,walletLabel:record.walletLabelSnapshot||record.meta.walletLabelSnapshot||wallet,walletBefore:cash[wallet],walletAfter:cc[wallet],amount:record.amount,note:record.note,recordedAt:record.at,candidateOperationalHash:candidateHash,normalizedCloudOperationalHash:cloudHash,sharedOrphanReferenceCount:oa.length,actionableSharedOrphanCount:report.actionableDifferences.filter(x=>x.category==='Orphan Reference').length,retainedHistoricalMetadataCount:report.historicalMetadata.length,normalizations:normalized.notes}};
 }
 return Object.freeze({MAIN,SOURCE_SEQ,stable,cents,verifyAnchor,plan,assertScope,operational});
});
