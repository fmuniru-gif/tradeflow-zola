'use strict';
// Delivery metadata only. Never rewrites an embedded module or business file.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const DELIVERY='20261026-pr11-cache-r1';
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
      output=output.replace(before,'js/'+asset+'?v='+DELIVERY);
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
const normalized=source=>source.replace(/\r\n/g,'\n');
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
function canonicalFile(file){
  const bytes=fs.readFileSync(path.join(root,file));
  return /\.(?:js|json|html|css)$/.test(file)?Buffer.from(normalized(bytes.toString('utf8'))):bytes;
}
function workerHashes(worker,shell){
  const assets=[...worker.match(/const ASSETS = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);
  return Object.fromEntries([...new Set(assets)].map(url=>{
    const name=url==='./'?'index.html':url.replace(/^\.\//,'').split('?')[0];
    return [url,sha(name==='index.html'?Buffer.from(shell):canonicalFile(name))];
  }));
}
function finishWorker(worker,shell){
  const runtime=[...assembledShell(shell).matchAll(/<script\b[^>]*\bsrc="([^"#]+)"/g)].map(m=>m[1]).filter(url=>!/^https?:/.test(url));
  const current=new Map(runtime.map(url=>[url.split('?')[0].replace(/^\.\//,''),'./'+url.replace(/^\.\//,'')]));
  const oldAssets=[...worker.match(/const ASSETS = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);
  const assets=[...new Set(oldAssets.map(url=>current.get(url.split('?')[0].replace(/^\.\//,''))||url).concat(runtime.map(url=>'./'+url.replace(/^\.\//,'')),['./PR11_DELIVERY_UPDATE.html']))];
  worker=worker.replace(/const ASSETS = \[[\s\S]*?\];/,'const ASSETS = [\n'+assets.map(url=>"  '"+url+"',").join('\n')+'\n];');
  const hashes=workerHashes(worker,shell),bundle=sha(JSON.stringify(hashes));
  const hashBlock='// PR11_VERIFIED_ASSETS_BEGIN\nconst VERIFIED_ASSETS = Object.freeze('+JSON.stringify(hashes,null,2)+');\n// PR11_VERIFIED_ASSETS_END';
  return worker.replace(/const CACHE = '[^']+';/,"const CACHE = 'zezms-pr11-delivery-20261026-"+bundle.slice(0,16)+"';")
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
module.exports={DELIVERY,normalized,stripDelivery,applyDelivery,assembledShell,finishShell,finishWorker,workerHashes,canonicalFile,sha,build};
if(require.main===module)console.log(JSON.stringify(build(process.argv.includes('--check'))));
