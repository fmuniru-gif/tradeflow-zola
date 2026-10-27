'use strict';
// Read-only audit of the complete manifest against independent Git blobs and
// HTTP response bodies. Fetch decodes transport compression, as Response does
// in a service worker; source text and line endings are never transformed.
const {execFileSync}=require('node:child_process'),crypto=require('node:crypto'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function gitBytes(ref,file){return execFileSync('git',['show',ref+':'+file],{cwd:root,maxBuffer:32*1024*1024});}
function manifestAt(ref){return JSON.parse(gitBytes(ref,'sw.js').toString('utf8').match(/const VERIFIED_ASSETS = Object.freeze\(([\s\S]*?)\);/)[1]);}
async function auditHTTP({base,ref='HEAD'}){
  const origin=new URL(base);
  if(!origin.pathname.endsWith('/')||origin.search||origin.hash||origin.username||origin.password)throw Error('Use the application base URL ending in /');
  if(origin.protocol!=='https:'&&!(origin.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(origin.hostname)))throw Error('Use HTTPS or an isolated loopback HTTP fixture');
  const entries=Object.entries(manifestAt(ref)),rows=[],memo=new Map();
  await Promise.all(Array.from({length:4},async()=>{while(entries.length){
    const [asset,expectedSHA256]=entries.shift(),url=new URL(asset,origin);
    if(url.origin!==origin.origin||!url.pathname.startsWith(origin.pathname))throw Error('Manifest asset outside application scope');
    const file=asset==='./'?'index.html':asset.replace(/^\.\//,'').split('?')[0];
    if(!memo.has(file))memo.set(file,gitBytes(ref,file));
    const source=memo.get(file),gitSHA256=sha(source);
    const response=await fetch(url,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(30000)});
    const body=Buffer.from(await response.arrayBuffer()),httpSHA256=sha(body);
    rows.push({asset,file,expectedSHA256,gitSHA256,httpSHA256,status:response.status,gitBytes:source.length,httpBytes:body.length,contentEncoding:response.headers.get('content-encoding'),contentType:response.headers.get('content-type'),manifestMatchesGit:expectedSHA256===gitSHA256,httpMatchesGit:httpSHA256===gitSHA256,httpMatchesManifest:httpSHA256===expectedSHA256});
  }}));
  rows.sort((a,b)=>a.asset.localeCompare(b.asset));
  const summary={entries:rows.length,manifestGitMismatches:rows.filter(r=>!r.manifestMatchesGit).length,httpGitMismatches:rows.filter(r=>!r.httpMatchesGit).length,httpManifestMismatches:rows.filter(r=>!r.httpMatchesManifest).length,httpFailures:rows.filter(r=>r.status!==200).length};
  return {base:origin.href,ref,ok:Object.entries(summary).every(([key,value])=>key==='entries'||value===0),summary,assets:rows};
}
module.exports={gitBytes,manifestAt,auditHTTP,sha};
if(require.main===module)(async()=>{
  const args=process.argv.slice(2),value=name=>args[args.indexOf(name)+1];
  if(!args.includes('--base'))throw Error('Usage: node tools/verify-delivery-http.cjs --base https://host/app/ [--ref SHA] [--output evidence.json]');
  const result=await auditHTTP({base:value('--base'),ref:args.includes('--ref')?value('--ref'):'HEAD'});
  if(args.includes('--output'))require('node:fs').writeFileSync(value('--output'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({ok:result.ok,summary:result.summary,mismatches:result.assets.filter(r=>!r.manifestMatchesGit||!r.httpMatchesManifest||r.status!==200)},null,2));
  if(!result.ok)process.exitCode=1;
})().catch(error=>{console.error(error.message);process.exitCode=1;});
