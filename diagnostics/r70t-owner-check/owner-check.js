/* Standalone r70T Owner RLS diagnostic. No application state or storage access. */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.R70TOwnerCheck=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var DEVICE='60d23b2e-531f-479b-b96f-c8d463f207db';
  var LIFECYCLE='c6dd588c-c902-4b96-b9f8-6af6e5334c92';
  function fail(code){throw new Error('R70T_OWNER_DIAG_'+code);}
  function integer(value){return value!==null&&value!==undefined&&value!==''&&
    Number.isSafeInteger(Number(value))&&Number(value)>=0?Number(value):null;}
  function validKey(key,decode){
    if(/^sb_publishable_[A-Za-z0-9_-]{12,}$/.test(key))return true;
    var parts=key.split('.');
    if(parts.length!==3||typeof decode!=='function')return false;
    try{
      var body=JSON.parse(decode(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
      return body.role==='anon';
    }catch(_){return false;}
  }
  async function sha256(value,crypto){
    if(!crypto||!crypto.subtle||typeof crypto.subtle.digest!=='function')fail('CRYPTO_UNAVAILABLE');
    var result=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
    return Array.from(new Uint8Array(result)).map(function(x){
      return x.toString(16).padStart(2,'0');
    }).join('');
  }
  async function validateConfig(input,crypto,decode){
    var url=String(input&&input.supabaseUrl||input&&input.url||'').trim().replace(/\/$/,'');
    var key=String(input&&input.publishableKey||'').trim();
    var urlHash=String(input&&input.expectedProjectUrlSha256||'').trim().toLowerCase();
    var keyHash=String(input&&input.expectedPublishableKeySha256||'').trim().toLowerCase();
    if(!url&&!key&&!urlHash&&!keyHash)fail('PROJECT_NOT_CONFIGURED');
    if(!url||!key||!urlHash||!keyHash)fail('CONFIG_INCOMPLETE');
    if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url))fail('PROJECT_URL_INVALID');
    if(!validKey(key,decode))fail('PUBLISHABLE_OR_ANON_KEY_REQUIRED');
    if(!/^[a-f0-9]{64}$/.test(urlHash)||!/^[a-f0-9]{64}$/.test(keyHash))
      fail('CONFIG_FINGERPRINTS_INVALID');
    if(await sha256(url,crypto)!==urlHash||await sha256(key,crypto)!==keyHash)
      fail('CONFIG_FINGERPRINT_MISMATCH');
    return Object.freeze({url:url,publishableKey:key});
  }
  function create(supabase,crypto,decode){
    if(!supabase||typeof supabase.createClient!=='function')fail('PINNED_CLIENT_UNAVAILABLE');
    var client=null,userId='',factorId='',ready=false,busy=false;
    async function response(promise,code){
      var result;
      try{result=await promise;}catch(_){fail(code);}
      if(!result||result.error)fail(code);
      return result.data;
    }
    function requireIdle(){if(busy)fail('BUSY');}
    function checkUser(user){
      if(!user||!/^[-0-9a-f]{36}$/i.test(String(user.id||''))||user.is_anonymous===true||
        (user.app_metadata&&user.app_metadata.provider==='anonymous'))fail('AUTHENTICATED_OWNER_REQUIRED');
      return String(user.id);
    }
    async function assurance(){
      var level=await response(client.auth.mfa.getAuthenticatorAssuranceLevel(),'MFA_STATUS_FAILED');
      return {current:String(level&&level.currentLevel||'').toLowerCase(),
        next:String(level&&level.nextLevel||'').toLowerCase()};
    }
    async function signIn(input){
      requireIdle();busy=true;ready=false;factorId='';userId='';client=null;
      try{
        var verified=await validateConfig(input,crypto,decode);
        var url=verified.url,key=verified.publishableKey;
        var email=String(input&&input.email||'').trim();
        var password=String(input&&input.password||'');
        if(!email||!password)fail('CREDENTIALS_REQUIRED');
        var memory=new Map();
        var storage={getItem:function(name){return memory.get(name)||null;},
          setItem:function(name,value){memory.set(name,value);},
          removeItem:function(name){memory.delete(name);}};
        try{
          client=supabase.createClient(url,key,{auth:{persistSession:false,
            autoRefreshToken:false,detectSessionInUrl:false,
            storageKey:'zezms-r70t-owner-diagnostic-isolated-v1',storage:storage}});
        }catch(_){fail('CLIENT_INITIALIZATION_FAILED');}
        var data=await response(client.auth.signInWithPassword({email:email,password:password}),
          'OWNER_SIGN_IN_FAILED');
        userId=checkUser(data&&data.user);
        var level=await assurance();
        if(level.current==='aal2'){ready=true;return {authenticated:true,mfaRequired:false};}
        if(level.next!=='aal2')fail('OWNER_MFA_REQUIRED');
        var factors=await response(client.auth.mfa.listFactors(),'MFA_FACTORS_FAILED');
        var verified=(factors&&factors.totp||[]).filter(function(item){
          return item&&item.status==='verified'&&item.id;
        });
        if(verified.length!==1)fail('EXACTLY_ONE_VERIFIED_TOTP_REQUIRED');
        factorId=String(verified[0].id);
        return {authenticated:true,mfaRequired:true};
      }catch(error){client=null;userId='';factorId='';ready=false;throw error;
      }finally{busy=false;}
    }
    async function verifyMfa(code){
      requireIdle();busy=true;
      try{
        if(!client||!userId||!factorId||!/^\d{6,8}$/.test(String(code||'').trim()))
          fail('AUTHENTICATOR_CODE_REQUIRED');
        await response(client.auth.mfa.challengeAndVerify({factorId:factorId,
          code:String(code).trim()}),'MFA_VERIFICATION_FAILED');
        var level=await assurance();
        if(level.current!=='aal2')fail('MFA_AAL2_REQUIRED');
        factorId='';ready=true;
        return {authenticated:true,mfaRequired:false};
      }finally{busy=false;}
    }
    async function head(){
      var data=await response(client.from('zezms_sync_operations').select('seq')
        .eq('owner_id',userId).order('seq',{ascending:false}).limit(1),'HEAD_SELECT_FAILED');
      if(!Array.isArray(data)||data.length>1)fail('HEAD_INVALID');
      var value=data.length?integer(data[0]&&data[0].seq):0;
      if(value===null)fail('HEAD_INVALID');
      return value;
    }
    async function run(){
      requireIdle();busy=true;
      try{
        if(!ready||!client||!userId)fail('OWNER_MFA_REQUIRED');
        var sessionData=await response(client.auth.getSession(),'SESSION_UNAVAILABLE');
        var session=sessionData&&sessionData.session;
        if(!session||checkUser(session.user)!==userId||
          !Number.isFinite(Number(session.expires_at))||
          Number(session.expires_at)*1000<=Date.now()+300000)fail('SESSION_EXPIRED');
        if((await assurance()).current!=='aal2')fail('MFA_AAL2_REQUIRED');
        var firstHead=await head();
        if(firstHead<3245)fail('HEAD_BEHIND_STAGED_BASELINE');
        var life=await response(client.from('zezms_device_lifecycle')
          .select('id,device_id,owner_id,business_id,lifecycle_state,revision,verified_cursor')
          .eq('id',LIFECYCLE).maybeSingle(),'LIFECYCLE_SELECT_FAILED');
        var verifiedCursor=integer(life&&life.verified_cursor);
        if(!life||String(life.id)!==LIFECYCLE||String(life.device_id)!==DEVICE||
          String(life.owner_id)!==userId||!String(life.business_id||'')||
          !['VERIFYING','ACTIVE'].includes(String(life.lifecycle_state).toUpperCase())||
          integer(life.revision)===null||integer(life.revision)<1||
          verifiedCursor===null||verifiedCursor<3245)fail('LIFECYCLE_ROW_MISMATCH');
        var master=await response(client.from('zezms_sync_state')
          .select('owner_id,revision,operation_cursor,sync_mode,updated_at,payload')
          .eq('owner_id',userId).maybeSingle(),'MASTER_SELECT_FAILED');
        var masterCursor=integer(master&&master.operation_cursor);
        if(!master||String(master.owner_id)!==userId||master.sync_mode!=='operations'||
          integer(master.revision)===null||integer(master.revision)<1||
          masterCursor===null||!master.payload||typeof master.payload!=='object'||
          Array.isArray(master.payload))fail('MASTER_ROW_MISMATCH');
        var secondHead=await head();
        if(firstHead!==secondHead||secondHead<masterCursor)fail('HEAD_MOVED_OR_BEHIND_MASTER');
        if(!crypto||!crypto.subtle||typeof crypto.subtle.digest!=='function')fail('CRYPTO_UNAVAILABLE');
        await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(master.payload)));
        return Object.freeze({decision:'PASS',checkedAt:new Date().toISOString(),
          lifecycleState:String(life.lifecycle_state).toUpperCase(),
          verifiedCursor:verifiedCursor,cloudHead:secondHead,
          masterCursor:masterCursor,headMatchesVerifiedCursor:secondHead===verifiedCursor,
          mutationsPerformed:0});
      }finally{busy=false;}
    }
    return Object.freeze({signIn:signIn,verifyMfa:verifyMfa,run:run});
  }
  return Object.freeze({create:create,validateConfig:validateConfig});
}));
