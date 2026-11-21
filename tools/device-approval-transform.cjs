'use strict';
const ownerPanel=`  function ownerLifecycleFallbackHtml() {
    if (isPaired() || !window.ZEZMS.deviceCards || !ZEZMS.deviceCards.allowed()) return '';
    primeFleetCard();
    return '<section class="card" id="managedDeviceLifecycle" style="margin-top:12px">'
      +'<h3>Managed Device Lifecycle</h3>'
      +'<p class="muted">Registration and bootstrap approval are separate. Approve a VERIFYING device here after checking its name, device ID and verified cursor.</p>'
      +'<div class="row" style="justify-content:space-between;gap:8px;flex-wrap:wrap"><span id="m5a4FleetStatus" role="status">'+esc(fleetStatusText())+'</span>'
      +'<button type="button" class="btn ghost" onclick="ZEZMS.managedDevices.refresh()">Refresh managed fleet</button></div>'
      +'<div class="table-wrap"><table><thead><tr><th>Device / ID</th><th>Mode</th><th>Lifecycle</th><th>Branch</th><th>Last seen</th><th>Verified cursor</th><th>App</th><th>Action</th></tr></thead>'
      +'<tbody id="m5a4DeviceRows">'+deviceRows()+'</tbody></table></div></section>';
  }

`;
function edits(){return [
 ['owner panel','  function deviceManagementSlotHtml() {',ownerPanel+'  function deviceManagementSlotHtml() {'],
 ['fallback',": '<p class=\"muted\">Preparing device-management service…</p>';",': ownerLifecycleFallbackHtml();'],
 ['fresh owner permission','  async function activate(lifecycleId, revision) {',"  async function activate(lifecycleId, revision) {\n    if (!window.ZEZMS.deviceCards || !ZEZMS.deviceCards.allowed()) throw new Error('Device activation requires a signed-in Owner or Admin on the existing Owner device.');"],
 ['login refresh','      setClaimBusy(false);',"      setClaimBusy(false);\n      try { if (ZEZMS.preloginVerifiedActivation) ZEZMS.preloginVerifiedActivation.refresh(); } catch (_) {}"]
];}
function transformDeviceApproval(source,changes){
 for(const [name,before,after] of changes){if(source.split(before).length!==2)throw Error('DEVICE_APPROVAL_MARKER: '+name);source=source.replace(before,()=>after);}
 return source;
}
function withoutDeviceApproval(source){
 if(!source.includes('  function ownerLifecycleFallbackHtml() {'))return source;
 for(const [name,before,after]of edits().reverse()){if(source.split(after).length!==2)throw Error('DEVICE_APPROVAL_REVERSE_MARKER: '+name);source=source.replace(after,()=>before);}
 return source;
}
module.exports={edits,transformDeviceApproval,withoutDeviceApproval};
