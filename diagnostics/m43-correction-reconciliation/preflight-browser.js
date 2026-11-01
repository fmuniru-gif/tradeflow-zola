(function(r,f){if(typeof module==='object')module.exports=f();else r.TradeFlowPreflightBrowser=f();})(globalThis,function(){
 'use strict';
 function create(root,core){
  if(root.navigator.serviceWorker?.controller)throw Error('SERVICE_WORKER_CONTROLLED_PAGE');
  const capture=()=>Object.fromEntries(core.KEYS.map(k=>[k,root.localStorage.getItem(k)]));
  const initial=capture(),s=JSON.parse(initial['zezms_cloud_sync_m4_state']||'null'),session=JSON.parse(initial['zezms-m3-supabase-auth']||'null');
  if(!s||!session?.access_token||!(session.expires_at*1000>Date.now())||!s.publishableKey)throw Error('SAVED_SESSION_UNAVAILABLE');
  const url=new URL(s.supabaseUrl);if(url.protocol!=='https:'||!/^([a-z0-9-]+)\.supabase\.co$/.test(url.hostname)||url.port||url.username||url.password||!['','/'].includes(url.pathname)||url.search||url.hash)throw Error('SUPABASE_ORIGIN_UNVERIFIED');
  const origin=url.origin;
  let claims;try{claims=JSON.parse(root.atob(session.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));}catch(_){throw Error('SAVED_SESSION_UNAVAILABLE');}
  if(claims.iss!==origin+'/auth/v1'||claims.sub!==s.syncOwnerId||claims.role!=='authenticated'||!(claims.exp*1000>Date.now()))throw Error('SAVED_SESSION_UNAVAILABLE');
  async function read(name,params){
   if(!Object.hasOwn(core.PATHS,name))throw Error('NETWORK_READ_UNAVAILABLE');
   const target=new URL(core.PATHS[name],origin);for(const [k,v]of Object.entries(params||{}))target.searchParams.set(k,v);
   let response;try{response=await root.fetch(target.href,{method:'GET',headers:{apikey:s.publishableKey,Authorization:'Bearer '+session.access_token,Accept:'application/json',Prefer:'count=exact'},cache:'no-store',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(20000)});}catch(_){throw Error('NETWORK_READ_UNAVAILABLE');}
   let data=null;if(response.ok){try{const text=await response.text();if(text.length>16*1024*1024)throw Error();data=JSON.parse(text);}catch(_){throw Error('NETWORK_READ_UNAVAILABLE');}}
   const m=(response.headers.get('content-range')||'').match(/\/(\d+)$/);
   return {ok:response.ok,status:response.status,data,count:m?Number(m[1]):null}; // Never expose error bodies/headers.
  }
  let observed=[];
  function existingResources(){const result=[];for(const target of [root,root.opener]){try{if(!target||target.location.origin!==root.location.origin)continue;for(const e of target.performance.getEntriesByType('resource'))result.push({url:e.name,status:e.responseStatus,method:'UNKNOWN'});}catch(_){}}return result;}
  function acceptTrace(text){if(typeof text!=='string'||text.length>10*1024*1024)throw Error('TRACE_NOT_USABLE');let parsed;try{parsed=JSON.parse(text);}catch(_){throw Error('TRACE_NOT_USABLE');}const rows=parsed.log?.entries;if(!Array.isArray(rows))throw Error('TRACE_NOT_USABLE');observed=rows.map(e=>({url:e.request?.url,status:e.response?.status,method:e.request?.method}));return core.trace(observed,origin).length;}
  return {origin,capture,read,now:()=>Date.now(),sha:async text=>Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),n=>n.toString(16).padStart(2,'0')).join(''),observedRequests:()=>[...existingResources(),...observed],acceptTrace};
 }
 return {create};
});
