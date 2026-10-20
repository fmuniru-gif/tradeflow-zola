/* Patch only the Shop insertion in the deployed M4/3 cloud closure.
 * Never rebuild from the older standalone M4/2 source. */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const base='fe690cadf2419a0e43cbb79d02dd77e97e3bd16b';
const reviewed=execFileSync('git',['show',base+':index.html'],
  {cwd:root,encoding:'utf8',maxBuffer:32*1024*1024});
const current=fs.readFileSync(path.join(root,'index.html'),'utf8');
const normalized=text=>text.replace(/\r\n/g,'\n');
const pattern=/const CLOUD_B64="([A-Za-z0-9+/=]+)";/;
const match=reviewed.match(pattern);
if(!match)throw Error('Production embedded cloud closure missing');
const cloud=Buffer.from(match[1],'base64').toString('utf8');
const sha=text=>crypto.createHash('sha256').update(text).digest('hex');
if(sha(cloud)!=='5923f5db6c0db3ebbfe4d7797cadb0b89b724671540ed94448a3c396363a0009')
  throw Error('Production M4/3 closure changed');
const begin='/* SHOP_DIRECTORY_RECOVERY_INSERT_BEGIN */';
const end='/* SHOP_DIRECTORY_RECOVERY_INSERT_END */';
const a=cloud.indexOf(begin),b=cloud.indexOf(end);
if(a<0||b<=a||cloud.indexOf(begin,a+1)>=0||cloud.indexOf(end,b+1)>=0)
  throw Error('Shop insertion boundaries changed');
const oldInsert=cloud.slice(a+begin.length,b);
if(!oldInsert.includes('var SHOP_TRADING_ACTIVATION_ENABLED=false;')||
   !oldInsert.includes('const registeredOwnerFallback=('))
  throw Error('Production Shop protection or authorization guard missing');
const core=fs.readFileSync(path.join(root,'js/shop-directory-recovery-core.js'),'utf8').replace(/\r\n/g,'\n');
const runtime=fs.readFileSync(path.join(root,'js/shop-directory-recovery-runtime.js'),'utf8').replace(/\r\n/g,'\n');
if(!core.includes('async function receiveImages(')||
   !runtime.includes('var SHOP_TRADING_ACTIVATION_ENABLED=false;'))
  throw Error('Reviewed compact journal or Shop hold missing');
const patched=cloud.slice(0,a+begin.length)+'\n'+core+'\n'+runtime+'\n'+cloud.slice(b);
let next=reviewed.replace(pattern,'const CLOUD_B64="'+Buffer.from(patched).toString('base64')+'";');
if(!next.includes('const SHOP_DIRECTORY_RECOVERY_BUILD="shop-trading-readiness-v1";')||
   !next.includes('const PATCH_CACHE="zezms-shop-trading-readiness-patched-v1";'))
  throw Error('Production release markers changed');
next=next.replace('const SHOP_DIRECTORY_RECOVERY_BUILD="shop-trading-readiness-v1";',
  'const SHOP_DIRECTORY_RECOVERY_BUILD="shop-storage-capacity-v1";');
next=next.replace('const PATCH_CACHE="zezms-shop-trading-readiness-patched-v1";',
  'const PATCH_CACHE="zezms-shop-storage-capacity-patched-v1";');
if(normalized(current)===normalized(next)){
  console.log('Production M4/3 Shop insertion already matches the candidate.');
  process.exit(0);
}
if(normalized(current)!==normalized(reviewed))throw Error('Shell differs from verified production preimage');
fs.writeFileSync(path.join(root,'index.html'),next);
console.log('Patched Shop insertion only; M4/3 closure outside its markers remains unchanged.');
