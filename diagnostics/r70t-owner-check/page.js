(function(){
  'use strict';
  var byId=function(id){return document.getElementById(id);};
  var signInButton=byId('signIn'),mfaButton=byId('verifyMfa'),runButton=byId('runCheck');
  var result=byId('result'),mfaSection=byId('mfaSection');
  var diagnostic=null,busy=false;
  var config=window.R70TOwnerDiagnosticConfig||{};
  var configured=false;
  byId('projectHost').textContent='Checking configuration';
  function show(text,kind){
    result.textContent=text;
    result.className='result'+(kind?' '+kind:'');
  }
  function reason(error){
    var message=String(error&&error.message||'');
    return /^R70T_OWNER_DIAG_[A-Z0-9_]+$/.test(message)?message:'R70T_OWNER_DIAG_CHECK_FAILED';
  }
  function showFailure(code){
    show('FAIL — '+code+'\nLifecycle: unavailable\nVerified cursor: unavailable\n'
      +'Current cloud head: unavailable\nNo permission result is available.','fail');
  }
  function setBusy(value){
    busy=!!value;
    signInButton.disabled=busy||!configured;
    mfaButton.disabled=busy;
    runButton.disabled=busy||!diagnostic||runButton.dataset.ready!=='true';
  }
  signInButton.addEventListener('click',async function(){
    if(busy)return;
    setBusy(true);runButton.dataset.ready='false';
    var input=Object.assign({},config,{email:byId('ownerEmail').value,
      password:byId('ownerPassword').value});
    try{
      diagnostic=window.R70TOwnerCheck.create(window.supabase,window.crypto,window.atob.bind(window));
      var state=await diagnostic.signIn(input);
      byId('ownerEmail').value='';
      if(state.mfaRequired){
        mfaSection.hidden=false;
        show('Owner password accepted. Enter the authenticator code. No database query has run.');
      }else{
        runButton.dataset.ready='true';
        show('Owner authenticated with MFA. The read-only check is ready.');
      }
    }catch(error){
      diagnostic=null;mfaSection.hidden=true;
      showFailure(reason(error));
    }finally{
      input.password='';input.publishableKey='';byId('ownerPassword').value='';
      setBusy(false);
    }
  });
  mfaButton.addEventListener('click',async function(){
    if(busy||!diagnostic)return;
    setBusy(true);
    var code=byId('mfaCode').value;
    try{
      await diagnostic.verifyMfa(code);
      mfaSection.hidden=true;runButton.dataset.ready='true';
      show('Owner authenticated with MFA. The read-only check is ready.');
    }catch(error){showFailure(reason(error));
    }finally{code='';byId('mfaCode').value='';setBusy(false);}
  });
  runButton.addEventListener('click',async function(){
    if(busy||!diagnostic||runButton.dataset.ready!=='true')return;
    setBusy(true);show('Running four read-only database requests…');
    try{
      var report=await diagnostic.run();
      show('PASS — Camon 17P permission check\n'
        +'Lifecycle: '+report.lifecycleState+'\n'
        +'Verified cursor: '+report.verifiedCursor+'\n'
        +'Current cloud head: '+report.cloudHead+'\n'
        +'Head matches verified cursor: '+(report.headMatchesVerifiedCursor?'YES':'NO')+'\n'
        +'Checked: '+report.checkedAt+'\n'
        +'Database writes: 0\n'
        +'Deployment and recovery remain NO-GO until every separate gate passes.','pass');
    }catch(error){showFailure(reason(error));
    }finally{setBusy(false);}
  });
  (async function(){
    try{
      var verified=await window.R70TOwnerCheck.validateConfig(config,window.crypto,
        window.atob.bind(window));
      byId('projectHost').textContent=verified.url;
      configured=true;
      show('Project configuration matches its independently recorded fingerprints. '
        +'Authenticate Owner to continue.');
    }catch(error){
      configured=false;
      byId('projectHost').textContent='Not configured or inconsistent';
      showFailure(reason(error));
    }finally{setBusy(false);}
  }());
}());
