#!/usr/bin/env node
/* Offline, read-only analysis of separately downloaded encrypted browser snapshots. */
const fs=require('node:fs');
const crypto=require('node:crypto');
const readline=require('node:readline');

function sha256(value){return crypto.createHash('sha256').update(value).digest('hex');}
function parse(value,label){try{return JSON.parse(value);}catch{throw Error(label+' is not valid JSON');}}
function decryptEvidence(envelope,passphrase){
  if(envelope?.format!=='ZEZMS_FINANCIAL_EVIDENCE_ENCRYPTED_V1'||envelope.kdf!=='PBKDF2-SHA256'||
    envelope.cipher!=='AES-256-GCM'||envelope.iterations!==600000)throw Error('Unsupported evidence envelope');
  const salt=Buffer.from(envelope.salt,'base64'),iv=Buffer.from(envelope.iv,'base64');
  const bytes=Buffer.from(envelope.ciphertext,'base64');
  if(salt.length!==16||iv.length!==12||bytes.length<17||bytes.length>64*1024*1024)throw Error('Evidence size or IV invalid');
  const key=crypto.pbkdf2Sync(passphrase,salt,600000,32,'sha256');
  const body=bytes.subarray(0,-16),tag=bytes.subarray(-16);
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,iv);decipher.setAuthTag(tag);
  const payload=parse(Buffer.concat([decipher.update(body),decipher.final()]).toString('utf8'),'Decrypted evidence');
  if(payload.format!=='ZEZMS_FINANCIAL_EVIDENCE_V1'||!payload.raw||
    sha256(JSON.stringify(payload.raw))!==payload.rawSha256)throw Error('Evidence checksum mismatch');
  return payload;
}
function contents(payload,label){
  const raw=payload.raw;
  const read=(key,defaultValue)=>raw[key]==null?defaultValue:parse(raw[key],label+' '+key);
  const db=read('tradeflow_v321_zola',null),state=read('zezms_cloud_sync_m4_state',null);
  const queue=read('zezms_cloud_sync_m4_queue',null);
  if(!db||!db.cashBalances||!Array.isArray(db.cashLog)||!state?.deviceId||!Array.isArray(queue))
    throw Error(label+' lacks database, state or queue');
  const failed=read('zezms_cloud_sync_m4_failed_v2',[]),rejected=read('zezms_cloud_sync_m4_rejected',[]);
  const applied=read('zezms_cloud_sync_m4_applied_v2',{});
  if(!Array.isArray(failed)||!Array.isArray(rejected)||!applied||typeof applied!=='object'||Array.isArray(applied))
    throw Error(label+' sync evidence has an unexpected shape');
  return {label,origin:payload.origin,capturedAt:payload.capturedAt,db,state,queue,
    failed,rejected,applied,applyJournal:read('zezms_cloud_sync_m4_apply_journal_v2',null)};
}
function cents(value){const n=Number(value);return Number.isFinite(n)?Math.round(n*100):null;}
function cashDelta(operation,wallet){return (operation?.patches||[]).filter(p=>p?.action==='root-object'&&
  p.root==='cashBalances'&&p.key===wallet&&p.mode==='delta').reduce((sum,p)=>sum+Number(p.value||0),0);}
function duplicateIds(rows){const seen=new Set(),duplicates=new Set();for(const row of rows){
  const id=String(row?.id||'');if(!id)continue;if(seen.has(id))duplicates.add(id);seen.add(id);
}return [...duplicates].sort();}
function linkedTransactions(database,cashLogId){
  const links=[];
  for(const collection of ['expenses','accountTxns','receipts','purchaseOrders','sales'])
    for(const row of Array.isArray(database[collection])?database[collection]:[]){
      const refs=[row?.cashLogId,row?.meta?.cashLogId,...(Array.isArray(row?.committedTransactionIds)?row.committedTransactionIds:[])];
      if(refs.some(ref=>String(ref||'')===cashLogId))
        links.push({collection,id:String(row?.id||row?.receiptNo||row?.poNo||'')});
    }
  return links;
}
function analyze(devices){
  if(devices.length!==3)throw Error('Exactly three working-device snapshots are required');
  const ids=new Set(devices.map(d=>d.state.deviceId));
  if(ids.size!==3)throw Error('Device identities are missing or repeated');
  const wallets=[...new Set(devices.flatMap(d=>Object.keys(d.db.cashBalances||{})))].sort();
  const perWallet=wallets.map(wallet=>{
    const local=Object.fromEntries(devices.map(d=>[d.label,
      Object.hasOwn(d.db.cashBalances,wallet)?Number(d.db.cashBalances[wallet]):null]));
    const pendingDelta=Object.fromEntries(devices.map(d=>[d.label,d.queue.reduce((sum,op)=>sum+cashDelta(op,wallet),0)]));
    const values=devices.map(d=>Object.hasOwn(d.db.cashBalances,wallet)?cents(d.db.cashBalances[wallet]):null);
    return {wallet,local,pendingDelta,maxMinusMin:values.every(v=>v!==null)?(Math.max(...values)-Math.min(...values))/100:null,
      cloudBalance:null,cloudStatus:'NOT_VERIFIED',firstDivergence:null,
      transactionLoss:'UNDETERMINED_WITHOUT_ORDERED_CLOUD_EVIDENCE'};
  });
  const allIds=new Set(devices.flatMap(d=>d.db.cashLog.map(row=>String(row?.id||'')).filter(Boolean)));
  return {format:'ZEZMS_FINANCIAL_COMPARISON_V1',decision:'INVESTIGATE_NO_MUTATION',
    limitation:'No authoritative cloud projection or ordered operation history was supplied; first divergence and transaction loss cannot be established.',
    devices:devices.map(d=>({label:d.label,deviceId:d.state.deviceId,cursor:d.state.cursor,
      capturedAt:d.capturedAt,origin:d.origin,queueCount:d.queue.length,failedCount:d.failed.length,
      rejectedCount:d.rejected.length,appliedCount:Object.keys(d.applied||{}).length,
      applyJournalPresent:!!d.applyJournal,queuedOperationIds:d.queue.map(op=>op.opId),
      duplicateCashLogIds:duplicateIds(d.db.cashLog),
      cashLogIdsMissingFromThisDevice:[...allIds].filter(id=>!d.db.cashLog.some(row=>String(row?.id||'')===id)).sort()})),
    perWallet,transactions:[...allIds].sort().map(id=>({id,presentOn:devices.filter(d=>d.db.cashLog.some(row=>String(row?.id||'')===id)).map(d=>d.label),
      entries:devices.flatMap(d=>d.db.cashLog.filter(row=>String(row?.id||'')===id).map(row=>({device:d.label,
        wallet:row.cashType||null,action:row.action||null,amount:row.amount??null,before:row.before??null,
        after:row.after??null,status:row.status||null,at:row.at||null,
        linkedTransactions:linkedTransactions(d.db,id)}))),
      cloudStatus:'NOT_VERIFIED'}))};
}
async function secret(prompt){
  if(!process.stdin.isTTY)throw Error('A local interactive terminal is required for the passphrase');
  process.stderr.write(prompt);
  return new Promise((resolve,reject)=>{
    let value='';process.stdin.setRawMode(true);process.stdin.resume();
    const finish=(error)=>{process.stdin.off('data',onData);process.stdin.setRawMode(false);process.stderr.write('\n');
      error?reject(error):resolve(value);};
    const onData=chunk=>{for(const ch of chunk.toString('utf8')){
      if(ch==='\r'||ch==='\n'){finish();return;}
      if(ch==='\u0003'){finish(Error('Cancelled'));return;}
      if(ch==='\u007f'||ch==='\b'){value=value.slice(0,-1);continue;}
      value+=ch;
    }};
    process.stdin.on('data',onData);
  });
}
if(require.main===module)(async()=>{
  const paths=process.argv.slice(2);
  if(paths.length!==3)throw Error('Usage: node analyze.cjs MAIN.json SHOP.json CAMON50.json');
  const labels=['Main','Shop','Camon 50 Pro'];
  const devices=[];
  for(let i=0;i<3;i++){
    const passphrase=await secret(labels[i]+' evidence passphrase: ');
    const envelope=parse(fs.readFileSync(paths[i],'utf8'),labels[i]+' encrypted file');
    devices.push(contents(decryptEvidence(envelope,passphrase),labels[i]));
  }
  process.stdout.write(JSON.stringify(analyze(devices),null,2)+'\n');
})().catch(error=>{process.stderr.write('STOP: '+error.message+'\n');process.exitCode=1;});
module.exports={decryptEvidence,contents,analyze,cashDelta};
