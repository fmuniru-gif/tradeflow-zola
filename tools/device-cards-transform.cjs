'use strict';
// Exact reviewed device UI/auth changes. No lifecycle transition or record deletion.
function transformDeviceCards(source, helper) {
  function replace(before,after){if(source.split(before).length!==2)throw Error('DEVICE_CARDS_MARKER: '+before.slice(0,90));source=source.replace(before,()=>after);}
  function section(start,end,edit){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);if(a<0||b<0)throw Error('DEVICE_CARDS_SECTION: '+start);const before=source.slice(a,b),after=edit(before);if(before===after)throw Error('DEVICE_CARDS_UNCHANGED: '+start);replace(before,after);}
  replace("  function ownerRecoveryAllowed() {\n    var current = syncState();\n    return !staffSession() && String(current.deviceAccessMode || 'OWNER').toUpperCase() !== 'PAIRED';\n  }", "  function ownerRecoveryAllowed() { return ZEZMS.deviceCards.allowed(); }");
  replace("Self-Service Recovery is available only to an Owner device.","Self-Service Recovery requires an Owner or Admin on a registered active device.");
  section('/* CANONICAL_RECOVERY_BRIDGE_BEGIN */','/* CANONICAL_RECOVERY_BRIDGE_END */',block=>{
    if(block.split('requireLocalOwner();').length!==4)throw Error('DEVICE_CARDS_RECOVERY_GUARDS');
    return block.split('requireLocalOwner();').join('ZEZMS.deviceCards.requireManager();');
  });
  replace('  function ownerManagementContext() {\n    var staff=localOwnerStaff();',`  function deviceManagementStaff() {
    if(!window.ZEZMS || !ZEZMS.deviceCards || !ZEZMS.deviceCards.allowed())return null;
    return ZEZMS.staffAuth.getContext();
  }
  function ownerManagementContext() {
    var staff=deviceManagementStaff();`);
  replace('    var staff=requireLocalOwner();\n    if (String(state.deviceAccessMode',"    var staff=deviceManagementStaff();\n    if(!staff)throw new Error('Sign in as Owner or Admin on a registered active device.');\n    if (String(state.deviceAccessMode");
  replace('var localOwner=localOwnerStaff();','var localOwner=deviceManagementStaff();');
  replace('Sign in with the local Owner staff account to manage devices.','Sign in as Owner or Admin on a registered active device to manage devices.');
  replace('Sign in with the local Owner staff account to manage cloud configuration and devices.','Sign in with the local Owner staff account to manage cloud configuration.');
  // Commercial Foundation retains its server context/bootstrap behavior. Its
  // directory uses the shared, scoped reader and never attempts a paired JWT fleet read.
  section('  async function loadDevices(client, businessId) {','  async function refresh(options)',()=>`  async function loadDevices(client, businessId) {
    devices = await ZEZMS.deviceCards.load(false);
  }

`);
  section('  function devicesHtml() {','  function settingsCardHtml()',()=>`  function devicesHtml() { return ZEZMS.deviceCards.html('registered'); }

`);
  section('  async function revokeDevice(deviceId) {','  function badge()',()=>`  async function revokeDevice(deviceId) {
    ZEZMS.deviceCards.assertRevocation(deviceId);
    const device=ZEZMS.deviceCards.records().find(function(row){return String(row.device_id)===String(deviceId);});
    if(!device)throw Error('Refresh the device directory before revocation.');
    return window.secureDeviceEnrollmentOpenRevocation(deviceId,device.device_name);
  }

`);
  replace('  function settingsCardHtml() {\n    const context = state.context;',`  function settingsCardHtml() {
    if(!ZEZMS.deviceCards.allowed())return '';
    ZEZMS.deviceCards.schedule('registered',async function(){devices=await ZEZMS.deviceCards.load(false);});
    if(cloudState().deviceAccessMode==='PAIRED')return '<div class="card" style="margin-top:12px">'+devicesHtml()+'</div>';
    const context = state.context;`);
  // Use the existing MFA/Cloud-owner verification boundary for any enrolled
  // Owner/Admin device; do not elevate the paired transport JWT.
  section('  async function ownerClient() {','  async function loadBranches()',()=>`  async function ownerClient() { return ZEZMS.deviceCards.requireActor(true); }

`);
  replace('  let branches = [];\n  let lastPairing = null;',"  let branches = [];\n  let branchesContextKey='',branchesError='';\n  let lastPairing = null;");
  section('  async function loadBranches() {\n    const pair=await ownerClient();','  function deviceBusinessId(',block=>block.replace('const pair=await ownerClient();','const pair=await ZEZMS.deviceCards.requireActor(false);').replace('    const f=foundationState();','    const key=ZEZMS.deviceCards.contextKey();\n    const f=foundationState();').replace('    branches=Array.isArray(result.data)?result.data:[];',"    if(key!==ZEZMS.deviceCards.contextKey())return [];\n    branches=Array.isArray(result.data)?result.data:[];\n    branchesContextKey=key;branchesError='';"));
  replace('  function deviceBusinessId(pair) {',`  function branchOptionsHtml() {
    if(!ZEZMS.deviceCards.actor().ready)return '<option value="">Verify Owner access first</option>';
    if(branchesContextKey!==ZEZMS.deviceCards.contextKey())return '<option value="">Loading branches…</option>';
    if(branchesError)return '<option value="">'+esc(branchesError)+'</option>';
    const field=document.getElementById('devicePairBranch'),f=foundationState();
    const selected=String(field&&field.value||f.context&&f.context.branch_id||'');
    return branches.map(b=>'<option value="'+attr(b.id)+'"'+(String(b.id)===selected?' selected':'')+'>'+esc(b.name)+(b.code?' ('+esc(b.code)+')':'')+'</option>').join('')||'<option value="">No active branches returned</option>';
  }
  function deviceBusinessId(pair) {`);
  replace('<select id="devicePairBranch"><option value="">Loading branches…</option></select>','<select id="devicePairBranch">\' + branchOptionsHtml() + \'</select>');
  replace("      select.innerHTML=branches.map(b=>'<option value=\"'+attr(b.id)+'\">'+esc(b.name)+(b.code?' ('+esc(b.code)+')':'')+'</option>').join('');\n      if(f.context&&f.context.branch_id)select.value=String(f.context.branch_id);",'      select.innerHTML=branchOptionsHtml();');
  replace("const businessId=String(f.businessId||f.context&&f.context.business_id||pair.state.businessId||'');","const businessId=String(pair.state.businessId||f.businessId||f.context&&f.context.business_id||'');");
  replace("return String(f.businessId||f.context&&f.context.business_id||pair&&pair.state&&pair.state.businessId||'');","return String(pair&&pair.state&&pair.state.businessId||f.businessId||f.context&&f.context.business_id||'');");
  replace("const businessId=String(f.businessId||f.context&&f.context.business_id||'');","const businessId=deviceBusinessId(pair);");
  section('  function enrolledDeviceRows() {','  function revokeStatus(',()=>`  function enrolledDeviceRows() { return ZEZMS.deviceCards.rows('enrolled'); }
  function refreshEnrolledDeviceTable() { ZEZMS.deviceCards.paint(); }
  function enrolledDevicesHtml() { return ZEZMS.deviceCards.html('enrolled'); }
  async function loadEnrolledDevices(force) {
    if(enrolledDevicesLoading)return enrolledDevices;
    enrolledDevicesLoading=true;
    try{enrolledDevices=await ZEZMS.deviceCards.load(force!==false);enrolledDevicesLoaded=true;enrolledDevicesError='';return enrolledDevices;}
    catch(error){enrolledDevicesError=String(error.message||error);return [];}
    finally{enrolledDevicesLoading=false;refreshEnrolledDeviceTable();}
  }
`);
  replace("const device=enrolledDevices.find(function(row)","const device=ZEZMS.deviceCards.records().find(function(row)");
  replace("  function openDeviceRevocation(deviceId,deviceName) {\n    const device=", "  function openDeviceRevocation(deviceId,deviceName) {\n    ZEZMS.deviceCards.assertRevocation(deviceId);\n    const device=");
  replace('    if(!pendingRevocation)return;\n    const reason=', '    if(!pendingRevocation)return;\n    ZEZMS.deviceCards.assertRevocation(pendingRevocation.deviceId);\n    const reason=');
  replace("pendingRevocation={deviceId:String(deviceId||''),deviceName:String(deviceName||device.device_name||'ZEZMS Device')};","pendingRevocation={deviceId:String(deviceId||''),deviceName:String(deviceName||device.device_name||'ZEZMS Device'),contextKey:ZEZMS.deviceCards.contextKey()};");
  replace('    ZEZMS.deviceCards.assertRevocation(pendingRevocation.deviceId);\n    const reason=',"    try{ZEZMS.deviceCards.assertRevocation(pendingRevocation.deviceId);\n    if(pendingRevocation.contextKey!==ZEZMS.deviceCards.contextKey())throw Error('Device administration context changed. Reopen the revocation dialog.');}\n    catch(error){revokeStatus(error.message||String(error),true);return;}\n    const reason=");
  section('  function ownerCardHtml() {','    return \'<div class="card" style="margin-top:12px">\'\n      + \'<div class="row" style="justify-content:space-between;align-items:center"><h3 style="margin:0">Secure Device Enrollment',()=>`  function ownerCardHtml() {
    if(!ZEZMS.deviceCards.allowed())return '';
`);
  const old="    const wrapped=function(){const result=original.apply(this,arguments)+ownerCardHtml();setTimeout(function(){const branchLoad=document.getElementById('devicePairBranch')?loadBranches().catch(function(error){const s=document.getElementById('devicePairBranch');if(s)s.innerHTML='<option value=\"\">'+esc(error.message||error)+'</option>';}):Promise.resolve();branchLoad.then(function(){if(document.getElementById('enrolledDeviceRows'))loadEnrolledDevices();});},30);return result;};";
  replace(old,`    const wrapped=function(){
      const result=original.apply(this,arguments)+ownerCardHtml();
      ZEZMS.deviceCards.schedule('enrollment',async function(){
        if(document.getElementById('devicePairBranch'))await loadBranches().catch(function(error){branchesContextKey=ZEZMS.deviceCards.contextKey();branchesError=String(error.message||error);branches=[];const field=document.getElementById('devicePairBranch');if(field)field.innerHTML=branchOptionsHtml();});
        if(document.getElementById('deviceRows-enrolled'))await loadEnrolledDevices(false);
      });
      return result;
    };`);
  if(source.includes('data-zezms-device-cards'))throw Error('DEVICE_CARDS_ALREADY_APPLIED');
  return source.replace('</head>','<script data-zezms-device-cards>\n'+helper+'\n</script></head>');
}
module.exports={transformDeviceCards};
