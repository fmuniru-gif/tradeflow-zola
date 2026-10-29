const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),http=require('node:http'),zlib=require('node:zlib');
const {webcrypto}=require('node:crypto');
const {gitBytes,manifestAt,auditHTTP,sha}=require('../tools/verify-delivery-http.cjs');
const delivery=require('../tools/build-pr11-delivery.cjs'),{fixtureAsset}=require('./delivery-fixture.cjs');
const production='d2a91205e0c8974ad298b56b3b744a8588d32319';
const mismatchNames=['customer-intelligence-v3100','management-intelligence-v380','margin-intelligence-v381','portfolio-signals-v391','pricing-guidance-v382','pricing-policy-lab-v383','stock-velocity-v390'];
function verifier(ref){
  const context={URL,Request,Response,Uint8Array,crypto:webcrypto,setTimeout,self:{location:{origin:'https://bytes.invalid'},registration:{scope:'https://bytes.invalid/'},addEventListener(){}}};
  vm.createContext(context);vm.runInContext(gitBytes(ref,'sw.js').toString('utf8'),context);return context;
}

test('raw production Git blobs reproduce all seven original strict worker hash failures',async()=>{
  const manifest=manifestAt(production),bad=[];
  for(const [asset,expected] of Object.entries(manifest)){
    const file=asset==='./'?'index.html':asset.slice(2).split('?')[0],bytes=gitBytes(production,file);
    if(sha(bytes)!==expected){
      bad.push(file.replace(/^js\//,'').replace(/\.js$/,''));
      assert.equal(sha(Buffer.from(bytes.toString('utf8').replace(/\r\n/g,'\n'))),expected);
      const context=verifier(production);context.key=asset;context.response=new Response(bytes);
      await assert.rejects(vm.runInContext('verifyDelivery(key,response)',context),/ZEZMS_DELIVERY_HASH_MISMATCH/);
    }
  }
  assert.deepEqual(bad.sort(),mismatchNames.slice().sort());
  assert.equal(sha(gitBytes(production,'js/management-intelligence-v380.js')),'0fcacfe9043823f1528e68c5179c59f18b2a14045b9bc8c7b6fd4c2434f228b8');
  assert.equal(sha(gitBytes(production,'js/stock-velocity-v390.js')),'edbbefb5c0d20731feb8e99c01ee536ece68b3cf01e56623068d493c320605d0');
});

test('every candidate manifest entry and normal HTTP fixture preserves exact staged Git bytes',()=>{
  const manifest=manifestAt('');assert.equal(Object.keys(manifest).length,77);
  for(const [asset,expected] of Object.entries(manifest)){
    const file=asset==='./'?'index.html':asset.slice(2).split('?')[0],bytes=gitBytes('',file);
    assert.equal(expected,sha(bytes),asset);
    assert.deepEqual(fixtureAsset(file),bytes,'Fixture changed or re-signed '+file);
    assert.deepEqual(delivery.assetBytes(file),bytes,file);
  }
});

test('candidate HTTP bodies match all 77 raw blobs with identity, gzip and Brotli transport',async()=>{
  let encoding='identity';const memo=new Map();
  const server=http.createServer((req,res)=>{
    const name=new URL(req.url,'http://localhost').pathname.slice('/tradeflow-zola/'.length)||'index.html';
    if(!memo.has(name))memo.set(name,gitBytes('',name));
    const bytes=memo.get(name);res.setHeader('Content-Type',name.endsWith('.html')?'text/html':name.endsWith('.js')?'application/javascript':'application/octet-stream');
    if(encoding==='identity')res.end(bytes);
    else{res.setHeader('Content-Encoding',encoding);res.end(encoding==='gzip'?zlib.gzipSync(bytes):zlib.brotliCompressSync(bytes,{params:{[zlib.constants.BROTLI_PARAM_QUALITY]:1}}));}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{for(encoding of ['identity','gzip','br']){
    const audit=await auditHTTP({base:'http://127.0.0.1:'+server.address().port+'/tradeflow-zola/',ref:''});
    assert.equal(audit.ok,true,JSON.stringify(audit.summary));assert.equal(audit.summary.entries,77);
    console.log('RAW_BYTE_HTTP '+JSON.stringify({encoding,...audit.summary}));
  }}finally{await new Promise(resolve=>server.close(resolve));}
});

test('strict candidate verifier accepts raw CRLF assets and rejects equivalent normalized text and one-byte changes',async()=>{
  const context=verifier(''),key='./js/management-intelligence-v380.js?v='+delivery.DELIVERY;
  const raw=gitBytes('','js/management-intelligence-v380.js');context.key=key;context.response=new Response(raw);
  await assert.doesNotReject(vm.runInContext('verifyDelivery(key,response)',context));
  for(const bytes of [Buffer.from(raw.toString('utf8').replace(/\r\n/g,'\n')),Buffer.concat([raw,Buffer.from('\n')])]){
    context.response=new Response(bytes);await assert.rejects(vm.runInContext('verifyDelivery(key,response)',context),/ZEZMS_DELIVERY_HASH_MISMATCH/);
  }
});

test('worker verification, install, activation and recovery code changes only in generated metadata',()=>{
  const outsideMetadata=bytes=>bytes.toString('utf8')
    .replace(/const CACHE = '[^']+';/,'CACHE_METADATA')
    .replace(/const PATCHED_INDEX_CACHE = '[^']+';/,'PATCHED_METADATA')
    .replace(/const DELIVERY = '[^']+';/,'DELIVERY_METADATA')
    .replace(/const ASSETS = \[[\s\S]*?\];/,'ASSETS_METADATA')
    .replace(/\/\/ PR11_VERIFIED_ASSETS_BEGIN[\s\S]*?\/\/ PR11_VERIFIED_ASSETS_END/,'DIGEST_METADATA');
  assert.equal(outsideMetadata(gitBytes('','sw.js')),outsideMetadata(gitBytes(production,'sw.js')));
  assert.deepEqual(gitBytes('','PR11_DELIVERY_UPDATE.html'),gitBytes(production,'PR11_DELIVERY_UPDATE.html'));
});

test('all protected production Git blobs remain byte-identical, including every business and recovery module',()=>{
  const {execFileSync}=require('node:child_process');
  const files=execFileSync('git',['ls-tree','-r','--name-only',production,'js','manifest.json','FORCE_UPDATE_MOBILE.html'],{cwd:require('node:path').resolve(__dirname,'..'),encoding:'utf8'}).trim().split('\n');
  for(const file of files.filter(file=>file!=='js/owner-maintenance-v373.js'))assert.deepEqual(gitBytes('',file),gitBytes(production,file),file);
});
