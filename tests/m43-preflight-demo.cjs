'use strict';
// Disposable local fixtures only. Never proxies requests or reads a user profile.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {packet,response}=require('./m43-preflight-fixture.cjs');
const dir=path.resolve(__dirname,'../diagnostics/m43-correction-reconciliation');
async function start(port=8787){const p=await packet(),files=new Set(['preflight.html','preflight.css','preflight-core.js','preflight-browser.js','preflight-page.js']);
 const server=http.createServer((req,res)=>{
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  const u=new URL(req.url,'http://127.0.0.1');res.setHeader('Cache-Control','no-store');
  if(u.pathname==='/__synthetic_preflight'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({origin:p.origin,now:p.now,raw:p.raw,observed:p.observed}));return;}
  if(u.pathname==='/__synthetic_read'){try{const result=response(p,u.searchParams.get('name'),JSON.parse(u.searchParams.get('params')||'{}'));res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));}catch(_){res.writeHead(400);res.end('{}');}return;}
  const name=u.pathname.slice(1);if(!files.has(name)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(path.join(dir,name)));
 });
 await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));return {server,url:'http://127.0.0.1:'+server.address().port+'/preflight.html?synthetic=1'};
}
module.exports={start};if(require.main===module)start().then(({url})=>console.log('Synthetic fixtures only — '+url));
