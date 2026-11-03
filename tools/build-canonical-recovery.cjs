// Embed only the reviewed recovery module sources and private sync bridge.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),file=path.join(root,'index.html');
let shell=fs.readFileSync(file,'utf8');
const cloudMatch=shell.match(/const CLOUD_B64="([^"]+)";/);
let cloud=Buffer.from(cloudMatch[1],'base64').toString('utf8');
const bridge=fs.readFileSync(path.join(root,'js/canonical-recovery-sync.js'),'utf8');
const inserted='/* CANONICAL_RECOVERY_BRIDGE_BEGIN */\n'+bridge+'/* CANONICAL_RECOVERY_BRIDGE_END */';
if(!cloud.includes('CANONICAL_RECOVERY_BRIDGE_BEGIN'))throw Error('Reviewed bridge insertion is missing');
cloud=cloud.replace(/\/\* CANONICAL_RECOVERY_BRIDGE_BEGIN \*\/[\s\S]*?\/\* CANONICAL_RECOVERY_BRIDGE_END \*\//,inserted);
shell=shell.replace(cloudMatch[0],'const CLOUD_B64="'+Buffer.from(cloud).toString('base64')+'";');
for(const [name,file]of [['CANONICAL_RESTORE','js/canonical-restore.js'],['SELF_SERVICE_RECOVERY_R62W','js/self-service-recovery.js']]){
 const pattern=new RegExp('const '+name+'_B64="[^"]+";');
 if(!pattern.test(shell))throw Error('Missing embedded module '+name);
 shell=shell.replace(pattern,'const '+name+'_B64="'+fs.readFileSync(path.join(root,file)).toString('base64')+'";');
}
fs.writeFileSync(file,shell);
