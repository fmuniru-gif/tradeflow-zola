'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),manifestName='RELEASE_FILE_MANIFEST.json';
function filesBelow(folder){
  return fs.readdirSync(folder,{withFileTypes:true}).flatMap(entry=>{
    const full=path.join(folder,entry.name);
    return entry.isDirectory()?filesBelow(full):[full];
  });
}
const files=filesBelow(root).filter(file=>path.basename(file)!==manifestName).map(file=>{
  const bytes=fs.readFileSync(file);
  return {path:path.relative(root,file).split(path.sep).join('/'),bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
}).sort((a,b)=>a.path.localeCompare(b.path,'en'));
const manifest={
  version:'3.12.0',
  build:'20260815-customer-master-print-readiness-r45',
  release:'Persistent Customer Master & Wireless Print Readiness',
  sql_required:false,
  sql_baseline:'M5A3',
  anonymous_signins_required:true,
  operational_baseline:'3.11.1-r44',
  database_key:'tradeflow_v321_zola',
  customer_sync:'M4 JSON operations / CUSTOMER_UPSERT',
  print_transport:'system-dialog',
  protected_baseline_zip_sha256:'50e38d10a6c39913331409dbda9b0c3b3aaa4a88d59b02cd320870c4636d462a',
  files
};
fs.writeFileSync(path.join(root,manifestName),JSON.stringify(manifest,null,2)+'\n','utf8');
console.log(`Release manifest generated: ${files.length} hashed files`);
