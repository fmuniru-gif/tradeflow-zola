/* Patch only the Shop insertion in the reviewed production M4/3 closure.
 * The old Shop builder starts from an obsolete cloud baseline; never use it. */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const base='3d4bce23f4ceba96114c73927c99f6085b7a3c7e';
const current=fs.readFileSync(path.join(root,'index.html'),'utf8');
const reviewed=execFileSync('git',['show',base+':index.html'],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024});
const shell=reviewed;
const normalized=text=>text.replace(/\r\n/g,'\n');
const pattern=/const CLOUD_B64="([A-Za-z0-9+/=]+)";/;
const match=shell.match(pattern);
if(!match)throw Error('Production embedded cloud closure missing');
const cloud=Buffer.from(match[1],'base64').toString('utf8');
const sha=text=>crypto.createHash('sha256').update(text).digest('hex');
if(sha(cloud)!=='238f75105ec724f044bce0d928569e6be7132c95abd187c291fc23a601701a59')
  throw Error('Reviewed embedded M4/3 closure changed');
const begin='/* SHOP_DIRECTORY_RECOVERY_INSERT_BEGIN */';
const end='/* SHOP_DIRECTORY_RECOVERY_INSERT_END */';
const a=cloud.indexOf(begin),b=cloud.indexOf(end);
if(a<0||b<=a||cloud.indexOf(begin,a+1)>=0||cloud.indexOf(end,b+1)>=0)
  throw Error('Shop insertion boundaries changed');
const oldInsert=cloud.slice(a+begin.length,b);
if(!oldInsert.includes('// Registered Owner devices may legitimately lack a separate device-access row.')||
   !oldInsert.includes("const registeredOwnerFallback=("))
  throw Error('Production authorization correction missing');
const core=fs.readFileSync(path.join(root,'js/shop-directory-recovery-core.js'),'utf8').replace(/\r\n/g,'\n');
const runtime=fs.readFileSync(path.join(root,'js/shop-directory-recovery-runtime.js'),'utf8').replace(/\r\n/g,'\n');
if(!core.includes("const registeredOwnerFallback=(")||!runtime.includes('var SHOP_TRADING_ACTIVATION_ENABLED=false;'))
  throw Error('Guarded Shop source missing');
const patched=cloud.slice(0,a+begin.length)+'\n'+core+'\n'+runtime+'\n'+cloud.slice(b);
let next=shell.replace(pattern,'const CLOUD_B64="'+Buffer.from(patched).toString('base64')+'";');
if(!next.includes('const SHOP_DIRECTORY_RECOVERY_BUILD="shop-directory-v2";')||
   !next.includes('const PATCH_CACHE="zezms-prebranch-functional-patched-v1";'))
  throw Error('Reviewed shell build markers changed');
next=next.replace('const SHOP_DIRECTORY_RECOVERY_BUILD="shop-directory-v2";',
  'const SHOP_DIRECTORY_RECOVERY_BUILD="shop-trading-readiness-v1";');
next=next.replace('const PATCH_CACHE="zezms-prebranch-functional-patched-v1";',
  'const PATCH_CACHE="zezms-shop-trading-readiness-patched-v1";');
if(normalized(current)===normalized(next)){
  console.log('Reviewed M4/3 Shop insertion already matches the candidate.');
  process.exit(0);
}
if(normalized(current)!==normalized(reviewed))throw Error('Shell differs from reviewed preimage');
fs.writeFileSync(path.join(root,'index.html'),next);
console.log('Patched reviewed M4/3 Shop insertion only; production cloud closure outside markers preserved.');
