'use strict';
// Delivery metadata only. Never rewrites an embedded module or business file.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const DELIVERY='20261027-pr12-raw-bytes-r1';
const assetMemo=new Map();
const coupledModules=Object.fromEntries(['management-intelligence-v380.js','stock-velocity-v390.js'].map(file=>[file,assetBytes('js/'+file).toString('base64')]));
const oldConstants='  const PATCH_CACHE="zezms-ui-stock-review-patched-v1";\n  const PATCH_KEY=new Request(location.origin+location.pathname+\'?__zezms_r67i_patched=\'+RELEASE);';
const oldCache=`  async function cachePatched(source){
    if(!('caches' in window))return;
    const cache=await caches.open(PATCH_CACHE);
    await cache.put(PATCH_KEY,new Response(source,{headers:{'Content-Type':'text/html; charset=utf-8','X-ZEZMS-Build':RELEASE,'X-ZEZMS-Verified-Proof':R67I_PATCH_PROOF,'X-ZEZMS-Baseline-Blob':BASELINE_BLOB}}));
  }
  async function cachedPatched(){
    if(!('caches' in window))return null;
    const cache=await caches.open(PATCH_CACHE);
    const response=await cache.match(PATCH_KEY);
    if(!response)return null;
    if(response.headers.get('X-ZEZMS-Build')!==RELEASE||response.headers.get('X-ZEZMS-Verified-Proof')!==R67I_PATCH_PROOF||response.headers.get('X-ZEZMS-Baseline-Blob')!==BASELINE_BLOB)return null;
    return response.text();
  }`;
const constants=`  // PR11_DELIVERY_CONSTANTS_BEGIN
  const DELIVERY="${DELIVERY}";
  const DELIVERY_MODULES=Object.freeze(${JSON.stringify(coupledModules)});
  const PATCHED_SHA256="${'0'.repeat(64)}";
  const PATCH_CACHE="zezms-pr11-patched-pending";
  const PATCH_KEY=new Request(location.origin+location.pathname+'?__zezms_r67i_patched='+RELEASE+'&delivery='+DELIVERY);
  async function patchedSourceMatches(source){
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source));
    const hash=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
    return hash===PATCHED_SHA256;
  }
  // PR11_DELIVERY_CONSTANTS_END`;
const versions=`    // PR11_DELIVERY_URLS_BEGIN
    for(const asset of ['management-intelligence-v380.js','stock-velocity-v390.js']){
      const before='js/'+asset+'?v=20261008-r70q-phase-a-review';
      if(output.split(before).length!==2)throw new Error('PR11_DELIVERY_ASSET_MARKER_MISMATCH: '+asset);
      // Couple all changed PR11 code to this verified assembled page, including
      // when the still-active old worker would ignore a newer query parameter.
      const marker='<script src="'+before+'"></'+'script>';
      if(output.split(marker).length!==2)throw new Error('PR11_DELIVERY_SCRIPT_MARKER_MISMATCH: '+asset);
      output=output.replace(marker,'<script data-zezms-pr11-module="'+asset+'">\\n'+safeInline(decodeBase64(DELIVERY_MODULES[asset]))+'\\n</'+'script>');
    }
    output=output.replace('</head>','<meta name="zezms-delivery" content="'+DELIVERY+'"></head>');
    // PR11_DELIVERY_URLS_END
`;
const cache=`  // PR11_DELIVERY_CACHE_BEGIN
  async function cachePatched(source){
    if(!await patchedSourceMatches(source))throw new Error('ZEZMS_PATCHED_DELIVERY_MISMATCH');
    if(!('caches' in window))return;
    const cache=await caches.open(PATCH_CACHE);
    await cache.put(PATCH_KEY,new Response(source,{headers:{'Content-Type':'text/html; charset=utf-8','X-ZEZMS-Build':RELEASE,'X-ZEZMS-Verified-Proof':R67I_PATCH_PROOF,'X-ZEZMS-Baseline-Blob':BASELINE_BLOB,'X-ZEZMS-Delivery':DELIVERY}}));
  }
  async function cachedPatched(){
    if(!('caches' in window))return null;
    const cache=await caches.open(PATCH_CACHE);
    const response=await cache.match(PATCH_KEY);
    if(!response)return null;
    if(response.headers.get('X-ZEZMS-Build')!==RELEASE||response.headers.get('X-ZEZMS-Verified-Proof')!==R67I_PATCH_PROOF||response.headers.get('X-ZEZMS-Baseline-Blob')!==BASELINE_BLOB||response.headers.get('X-ZEZMS-Delivery')!==DELIVERY)return null;
    const source=await response.text();
    return await patchedSourceMatches(source)?source:null;
  }
  // PR11_DELIVERY_CACHE_END`;
function normalized(source){return source.replace(/\r\n/g,'\n');}
function replaceOnce(source,before,after){
  if(source.split(before).length!==2)throw Error('Delivery patch marker not unique: '+before.slice(0,80));
  return source.replace(before,after);
}
function stripDelivery(source){
  return normalized(source)
    .replace(/  \/\/ PR11_DELIVERY_CONSTANTS_BEGIN[\s\S]*?  \/\/ PR11_DELIVERY_CONSTANTS_END/,oldConstants)
    .replace(/    \/\/ PR11_DELIVERY_URLS_BEGIN[\s\S]*?    \/\/ PR11_DELIVERY_URLS_END\n/,'')
    .replace(/  \/\/ PR11_DELIVERY_CACHE_BEGIN[\s\S]*?  \/\/ PR11_DELIVERY_CACHE_END/,oldCache);
}
function applyDelivery(source){
  source=stripDelivery(source);
  source=replaceOnce(source,oldConstants,constants);
  source=replaceOnce(source,oldCache,cache);
  return replaceOnce(source,'    return output;\n  }\n  function renderSource',versions+'    return output;\n  }\n  function renderSource');
}
function assembledShell(shell){
  shell=normalized(shell);
  const first=shell.indexOf('<script>')+8,last=shell.lastIndexOf('</script>');
  let script=shell.slice(first,last);
  script=replaceOnce(script,'  boot();\n}());','  globalThis.__assembled=patchBaseline(decodeBase64(VERIFIED_BASELINE_B64));\n}());');
  const context={URL,Request,Response,TextEncoder,TextDecoder,Uint8Array,atob,btoa,
    location:{origin:'https://delivery.invalid',pathname:'/index.html'},window:{},performance:{now:()=>0,mark(){},measure(){}}};
  vm.createContext(context);vm.runInContext(script,context,{timeout:10000});
  return context.__assembled;
}
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function finishShell(source){
  const hash=sha(assembledShell(source));
  return source.replace(/const PATCHED_SHA256="[a-f0-9]{64}";/,'const PATCHED_SHA256="'+hash+'";')
    .replace(/const PATCH_CACHE="[^"]+";/,'const PATCH_CACHE="zezms-pr11-patched-'+hash.slice(0,16)+'";');
}
function assetBytes(file){
  // Pages publishes Git blobs, not an autocrlf-converted working copy. Read the
  // exact next-commit bytes from the index. Refuse unstaged asset edits rather
  // than silently signing an older version. No decoding or EOL conversion here.
  if(!assetMemo.has(file)){
    const changed=execFileSync('git',['diff','--name-only','--',file],{cwd:root,encoding:'utf8'}).trim();
    if(changed)throw Error('Stage asset changes before generating delivery metadata: '+file);
    assetMemo.set(file,execFileSync('git',['show',':'+file],{cwd:root,maxBuffer:32*1024*1024}));
  }
  return Buffer.from(assetMemo.get(file));
}
function workerHashes(worker,shell){
  const assets=[...worker.match(/const ASSETS = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);
  return Object.fromEntries([...new Set(assets)].map(url=>{
    const name=url==='./'?'index.html':url.replace(/^\.\//,'').split('?')[0];
    return [url,sha(name==='index.html'?Buffer.from(shell):assetBytes(name))];
  }));
}
function finishWorker(worker,shell){
  const runtime=[...assembledShell(shell).matchAll(/<script\b[^>]*\bsrc="([^"#]+)"/g)].map(m=>m[1]).filter(url=>!/^https?:/.test(url));
  const current=new Map(runtime.map(url=>[url.split('?')[0].replace(/^\.\//,''),'./'+url.replace(/^\.\//,'')]));
  for(const file of Object.keys(coupledModules))current.set('js/'+file,'./js/'+file+'?v='+DELIVERY);
  const oldAssets=[...worker.match(/const ASSETS = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);
  const assets=[...new Set(oldAssets.map(url=>current.get(url.split('?')[0].replace(/^\.\//,''))||url).concat(runtime.map(url=>'./'+url.replace(/^\.\//,'')),['./PR12_RAW_BYTE_UPDATE.html']))];
  worker=worker.replace(/const ASSETS = \[[\s\S]*?\];/,'const ASSETS = [\n'+assets.map(url=>"  '"+url+"',").join('\n')+'\n];');
  const hashes=workerHashes(worker,shell),bundle=sha(JSON.stringify(hashes));
  const hashBlock='// PR11_VERIFIED_ASSETS_BEGIN\nconst VERIFIED_ASSETS = Object.freeze('+JSON.stringify(hashes,null,2)+');\n// PR11_VERIFIED_ASSETS_END';
  return worker.replace(/const CACHE = '[^']+';/,"const CACHE = 'zezms-pr11-delivery-20261026-"+bundle.slice(0,16)+"';")
    .replace(/const DELIVERY = '[^']+';/,"const DELIVERY = '"+DELIVERY+"';")
    .replace(/const PATCHED_INDEX_CACHE = '[^']+';/,"const PATCHED_INDEX_CACHE = '"+shell.match(/const PATCH_CACHE="([^"]+)";/)[1]+"';")
    .replace(/\/\/ PR11_VERIFIED_ASSETS_BEGIN[\s\S]*?\/\/ PR11_VERIFIED_ASSETS_END/,hashBlock);
}
function build(check=false){
  const indexFile=path.join(root,'index.html'),workerFile=path.join(root,'sw.js');
  const beforeIndex=normalized(fs.readFileSync(indexFile,'utf8')),beforeWorker=normalized(fs.readFileSync(workerFile,'utf8'));
  const index=finishShell(applyDelivery(beforeIndex)),worker=finishWorker(beforeWorker,index);
  if(check){if(index!==beforeIndex||worker!==beforeWorker)throw Error('Generated delivery hashes are stale');}
  else{fs.writeFileSync(indexFile,index);fs.writeFileSync(workerFile,worker);}
  return {delivery:DELIVERY,patched:sha(assembledShell(index)),assets:Object.keys(workerHashes(worker,index)).length};
}
module.exports={DELIVERY,normalized,stripDelivery,applyDelivery,assembledShell,finishShell,finishWorker,workerHashes,assetBytes,sha,build};
if(require.main===module)console.log(JSON.stringify(build(process.argv.includes('--check'))));
