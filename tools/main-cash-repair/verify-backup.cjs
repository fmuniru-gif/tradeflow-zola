#!/usr/bin/env node
/* Offline verifier for the exact Main cash repair backup. No browser or cloud access. */
const fs=require('node:fs');
const crypto=require('node:crypto');
const {MAIN}=require('../../diagnostics/main-cash-repair/repair-core.js');
const sha=text=>crypto.createHash('sha256').update(text).digest('hex');
function decrypt(text,passphrase){
  const box=JSON.parse(text);
  if(box.format!=='ZEZMS_MAIN_CASH_REPAIR_ENCRYPTED_V1'||box.kdf!=='PBKDF2-SHA256'||
    box.iterations!==600000||box.cipher!=='AES-256-GCM')throw Error('STOP_BACKUP_FORMAT');
  const salt=Buffer.from(box.salt,'base64'),iv=Buffer.from(box.iv,'base64'),bytes=Buffer.from(box.ciphertext,'base64');
  if(salt.length!==16||iv.length!==12||bytes.length<17||bytes.length>64*1024*1024)
    throw Error('STOP_BACKUP_BYTES');
  const key=crypto.pbkdf2Sync(passphrase,salt,600000,32,'sha256');
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,iv);
  decipher.setAuthTag(bytes.subarray(-16));
  const snapshot=JSON.parse(Buffer.concat([decipher.update(bytes.subarray(0,-16)),decipher.final()]).toString('utf8'));
  if(snapshot.format!=='ZEZMS_MAIN_CASH_REPAIR_BACKUP_V1'||snapshot.deviceId!==MAIN||
    !snapshot.raw||typeof snapshot.raw.tradeflow_v321_zola!=='string')throw Error('STOP_BACKUP_IDENTITY');
  JSON.parse(snapshot.raw.tradeflow_v321_zola);
  return snapshot;
}
async function passphrase(){
  if(!process.stdin.isTTY)throw Error('Interactive terminal required');
  process.stderr.write('Backup passphrase: ');
  return new Promise((resolve,reject)=>{let value='';process.stdin.setRawMode(true);process.stdin.resume();
    const done=error=>{process.stdin.off('data',read);process.stdin.setRawMode(false);process.stderr.write('\n');
      error?reject(error):resolve(value);};
    const read=bytes=>{for(const c of bytes.toString('utf8')){
      if(c==='\r'||c==='\n'){done();return;}
      if(c==='\u0003'){done(Error('Cancelled'));return;}
      if(c==='\b'||c==='\u007f'){value=value.slice(0,-1);continue;}
      value+=c;
    }};process.stdin.on('data',read);});
}
if(require.main===module)(async()=>{
  if(process.argv.length!==3)throw Error('Usage: node verify-backup.cjs ENCRYPTED_FILE.json');
  const text=fs.readFileSync(process.argv[2],'utf8');
  const snapshot=decrypt(text,await passphrase());
  process.stdout.write(JSON.stringify({verified:true,deviceId:snapshot.deviceId,
    cloudHead:snapshot.cloudHead,capturedAt:snapshot.at,encryptedSha256:sha(text),
    databaseSha256:sha(snapshot.raw.tradeflow_v321_zola)})+'\n');
})().catch(error=>{process.stderr.write('STOP: '+error.message+'\n');process.exitCode=1;});
module.exports={decrypt};
