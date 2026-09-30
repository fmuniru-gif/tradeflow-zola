/* ZEZMS TradeFlow v3.30.1 r69A — MB2 Branch Management Auto-load Hotfix.
   This control-plane module manages branch metadata and device assignment only.
   It deliberately does not add operational branch switching, filtering, routing,
   transaction migration, a global branch selector, or an All Branches mode. */
(function () {
  'use strict';
  window.ZEZMS = window.ZEZMS || {};
  var BUILD = '20260930-r69a-branch-management-auto-load';
  var branches = [];
  var fleet = [];
  var loadStatus = 'LOADING';
  var loadError = '';
  var loadedBusinessId = '';
  var loadPromise = null;
  var hydrationScheduled = false;

  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]; }); }
  function attr(value) { return esc(value).replace(/[\r\n]/g, ''); }
  function row(value) { return Array.isArray(value) ? value[0] || null : value || null; }
  function cloud() { return window.ZEZMS && ZEZMS.cloudSync ? ZEZMS.cloudSync : null; }
  function foundation() { return window.ZEZMS && ZEZMS.commercialFoundation ? ZEZMS.commercialFoundation : null; }
  function state() { var service=cloud(); return service && service.getState ? service.getState() || {} : {}; }
  function businessId() { var f=foundation(), fs=f && f.getState ? f.getState() || {} : {}, s=state(); return String(fs.businessId || (fs.context && fs.context.business_id) || s.businessId || ''); }
  function notify(message, type) { try { if (typeof toast === 'function') toast(message, type); } catch (_) {} }
  function rpcError(error, fallback) { return String(error && (error.message || error.details || error.hint) || fallback || 'The branch-management request did not complete.'); }
  function role() {
    var candidates=[];
    try { candidates.push(session && (session.commercialRole || session.role)); } catch (_) {}
    try { candidates.push(window.ZEZMS.staffAuth && ZEZMS.staffAuth.getContext && (ZEZMS.staffAuth.getContext() || {}).role); } catch (_) {}
    try { candidates.push((foundation().getState() || {}).role); } catch (_) {}
    return String(candidates.find(function (value) { return value; }) || '').toUpperCase();
  }
  function canManage() { return ['OWNER','ADMIN'].indexOf(role()) >= 0; }
  function isOwner() { return role() === 'OWNER'; }
  async function readClient() {
    var service=cloud();
    if (!service) throw new Error('Cloud Sync M4/3 is unavailable.');
    if (service.waitUntilReady) await service.waitUntilReady(9000);
    var snapshot=service.getState ? service.getState() || {} : {}, client=service.getClient && service.getClient(), signedIn=service.getSession && service.getSession();
    if (snapshot.deviceAccessMode === 'PAIRED') throw new Error('Manage branches from an Owner or Admin device.');
    if (!client || !signedIn || !signedIn.user) throw new Error('Sign in to the Owner cloud account first.');
    if (!canManage()) throw new Error('Only an Owner or Admin can manage branches.');
    return { client:client, session:signedIn, service:service };
  }
  async function mutationClient() {
    var pair=await readClient();
    var service=pair.service;
    if (service.ensureMfa && !(await service.ensureMfa())) throw new Error('Authenticator verification was cancelled.');
    return pair;
  }
  function clearCache(id) {
    branches=[]; fleet=[]; loadError=''; loadStatus='LOADING'; loadedBusinessId=String(id || ''); loadPromise=null;
  }
  function alignBusinessContext() {
    var id=businessId();
    if (!id) {
      if (loadedBusinessId || loadStatus!=='ERROR') { branches=[]; fleet=[]; loadedBusinessId=''; loadPromise=null; loadStatus='ERROR'; loadError='Active business context is unavailable.'; }
      return '';
    }
    if (id!==loadedBusinessId) clearCache(id);
    return id;
  }
  function safeLoadError(error) { return rpcError(error,'Unable to load Branch Management.').replace(/[\r\n]+/g,' ').slice(0,280); }
  async function fetchCurrent(id) {
    var pair=await readClient();
    var branchResult=await pair.client.from('zezms_branches').select('id,business_id,name,code,is_primary,status,address,telephone,created_at,updated_at').eq('business_id',id).order('is_primary',{ascending:false}).order('name',{ascending:true}).order('id',{ascending:true});
    if (branchResult.error) throw branchResult.error;
    var fleetResult=await pair.client.rpc('zezms_m5a4_managed_fleet_with_branch',{p_business_id:id});
    if (fleetResult.error) throw fleetResult.error;
    branches=Array.isArray(branchResult.data) ? branchResult.data : [];
    fleet=Array.isArray(fleetResult.data) ? fleetResult.data : [];
    return { branches:branches, fleet:fleet };
  }
  function ensureLoaded(force) {
    var id=alignBusinessContext();
    if (!id) { refreshCard(); return Promise.reject(new Error(loadError)); }
    if (!force && loadStatus==='LOADED') return Promise.resolve({ branches:branches, fleet:fleet });
    if (!force && loadPromise) return loadPromise;
    if (force && loadPromise) return loadPromise.then(function () { return ensureLoaded(true); });
    loadStatus='LOADING'; loadError=''; refreshCard();
    var request=fetchCurrent(id).then(function (data) {
      if (businessId()!==id) return { branches:branches, fleet:fleet, stale:true };
      loadStatus='LOADED'; loadError=''; refreshCard(); return data;
    }).catch(function (error) {
      if (businessId()===id) { loadStatus='ERROR'; loadError=safeLoadError(error); refreshCard(); notify('Unable to load Branch Management: '+loadError,'err'); }
      throw error;
    }).finally(function () { if (loadPromise===request) loadPromise=null; });
    loadPromise=request;
    return request;
  }
  function scheduleHydration() {
    if (hydrationScheduled || !canManage()) return;
    if (!alignBusinessContext()) { refreshCard(); return; }
    hydrationScheduled=true;
    setTimeout(function () {
      hydrationScheduled=false;
      ensureLoaded(false).catch(function () { /* scoped ERROR state and toast are already set */ });
    },0);
  }
  function deviceCount(branchId) { return fleet.filter(function (device) { return String(device.lifecycle_state || '').toUpperCase() === 'ACTIVE' && String(device.branch_id || '') === String(branchId || ''); }).length; }
  function statusBadge(status) { var value=String(status || '').toUpperCase(), cls=value === 'ACTIVE' ? 'ok' : value === 'INACTIVE' ? 'warn' : 'bad'; return '<span class="badge '+cls+'">'+esc(value || 'UNKNOWN')+'</span>'; }
  function loadStatusHtml() {
    if (loadStatus==='LOADING') return '<span class="muted">Loading branches…</span>';
    if (loadStatus==='ERROR') return '<span class="danger-text">Unable to load Branch Management. '+esc(loadError || 'Retry the request.')+'</span>';
    return '<span class="muted">Branch registry loaded.</span>';
  }
  function tableRows() {
    if (loadStatus==='LOADING' && !branches.length) return '<tr><td colspan="8" class="empty">Loading branches…</td></tr>';
    if (loadStatus==='ERROR' && !branches.length) return '<tr><td colspan="8" class="empty"><b>Unable to load Branch Management.</b><br><span class="muted">'+esc(loadError || 'Retry the request.')+'</span><br><button class="btn sm ghost" style="margin-top:8px" onclick="ZEZMS.branchManagement.refresh()">Retry loading branches</button></td></tr>';
    if (!branches.length) return '<tr><td colspan="8" class="empty">No branches are available for this business.</td></tr>';
    return branches.map(function (branch) {
      var active=String(branch.status || '').toUpperCase() === 'ACTIVE';
      var actions='<button class="btn sm ghost" onclick="ZEZMS.branchManagement.edit('+attr(JSON.stringify(String(branch.id)))+')">Edit</button> ';
      actions+=active ? '<button class="btn sm ghost" onclick="ZEZMS.branchManagement.setStatus('+attr(JSON.stringify(String(branch.id)))+',\'INACTIVE\')">Set Inactive</button>' : '<button class="btn sm" onclick="ZEZMS.branchManagement.setStatus('+attr(JSON.stringify(String(branch.id)))+',\'ACTIVE\')">Reactivate</button>';
      if (isOwner() && active && !branch.is_primary) actions+=' <button class="btn sm ghost" onclick="ZEZMS.branchManagement.makePrimary('+attr(JSON.stringify(String(branch.id)))+')">Make Primary</button>';
      return '<tr><td><b>'+esc(branch.name)+'</b></td><td class="mono">'+esc(branch.code)+'</td><td>'+esc(branch.address || '—')+'</td><td>'+esc(branch.telephone || '—')+'</td><td>'+((branch.is_primary && active) ? '<span class="badge ok">Primary</span>' : '—')+'</td><td>'+statusBadge(branch.status)+'</td><td>'+deviceCount(branch.id)+'</td><td>'+actions+'</td></tr>';
    }).join('');
  }
  function cardHtml() {
    if (!canManage()) return '';
    alignBusinessContext();
    var html='<div class="card" style="margin-top:12px" data-zezms-branch-management="r69a">'
      +'<div class="row" style="justify-content:space-between;align-items:center;gap:8px"><h3 style="margin:0">Branch Management</h3><span class="badge ok">r69A / MB2</span></div>'
      +'<p class="muted" style="font-size:12px;line-height:1.45">Manage branch registry details and administrative device assignments. Operational branch data switching is not enabled in MB2.</p>'
      +'<p id="r69BranchLoadStatus" class="muted" style="font-size:12px;margin:0 0 8px">'+loadStatusHtml()+'</p>'
      +'<div class="table-wrap"><table><thead><tr><th>Branch Name</th><th>Code</th><th>Address</th><th>Telephone</th><th>Primary</th><th>Status</th><th>Devices Assigned</th><th>Action</th></tr></thead><tbody id="r69BranchRows">'+tableRows()+'</tbody></table></div>'
      +'<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn ghost" onclick="ZEZMS.branchManagement.refresh()">Refresh branches</button><button class="btn" onclick="ZEZMS.branchManagement.add()">Add branch</button></div>'
      +'<p class="muted" style="font-size:11px;margin:10px 0 0">Branches are never deleted here. A branch with active assigned devices cannot be made inactive. Device assignments do not alter operational records.</p>'
      +'</div>';
    scheduleHydration();
    return html;
  }
  function refreshCard() {
    var target=document.getElementById('r69BranchRows'); if (target) target.innerHTML=tableRows();
    var status=document.getElementById('r69BranchLoadStatus'); if (status) status.innerHTML=loadStatusHtml();
  }
  function inputForm(title, branch) {
    branch=branch || {};
    return '<h3>'+esc(title)+'</h3><p class="muted">Branch metadata only. This does not change operational branch data.</p>'
      +'<div class="field"><label>Branch Name</label><input id="r69BranchName" maxlength="120" value="'+attr(branch.name || '')+'"></div>'
      +'<div class="field"><label>Code</label><input id="r69BranchCode" maxlength="32" value="'+attr(branch.code || '')+'" placeholder="HQ"></div>'
      +'<div class="field"><label>Address</label><input id="r69BranchAddress" maxlength="300" value="'+attr(branch.address || '')+'"></div>'
      +'<div class="field"><label>Telephone</label><input id="r69BranchTelephone" maxlength="80" value="'+attr(branch.telephone || '')+'"></div>';
  }
  function formValues() { return { name:String((document.getElementById('r69BranchName') || {}).value || '').trim(), code:String((document.getElementById('r69BranchCode') || {}).value || '').trim().toUpperCase(), address:String((document.getElementById('r69BranchAddress') || {}).value || '').trim(), telephone:String((document.getElementById('r69BranchTelephone') || {}).value || '').trim() }; }
  function findBranch(id) { return branches.find(function (branch) { return String(branch.id) === String(id); }) || null; }
  function add() {
    if (typeof openModal !== 'function') throw new Error('Reload the app, then retry branch management.');
    openModal(inputForm('Add branch')+'<div class="row"><button class="btn" onclick="ZEZMS.branchManagement.saveNew()">Create branch</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>');
  }
  async function saveNew() {
    var values=formValues(); if (!values.name || !values.code) throw new Error('Enter a branch name and code.');
    if (!window.confirm('Create this branch? The first active branch becomes primary only if no active primary branch exists.')) return false;
    var pair=await mutationClient(), result=await pair.client.rpc('zezms_branch_create',{p_business_id:businessId(),p_name:values.name,p_code:values.code,p_address:values.address,p_telephone:values.telephone});
    if (result.error) throw result.error; if (typeof closeModal === 'function') closeModal(); await ensureLoaded(true); notify('Branch created.', 'ok'); return row(result.data);
  }
  function edit(id) {
    var branch=findBranch(id); if (!branch) throw new Error('That branch is no longer available. Refresh and retry.');
    if (typeof openModal !== 'function') throw new Error('Reload the app, then retry branch management.');
    openModal(inputForm('Edit branch',branch)+'<div class="row"><button class="btn" onclick="ZEZMS.branchManagement.saveEdit('+attr(JSON.stringify(String(id)))+')">Save branch</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>');
  }
  async function saveEdit(id) {
    var values=formValues(); if (!values.name || !values.code) throw new Error('Enter a branch name and code.');
    if (!window.confirm('Save this branch metadata?')) return false;
    var pair=await mutationClient(), result=await pair.client.rpc('zezms_branch_update',{p_branch_id:id,p_name:values.name,p_code:values.code,p_address:values.address,p_telephone:values.telephone});
    if (result.error) throw result.error; if (typeof closeModal === 'function') closeModal(); await ensureLoaded(true); notify('Branch updated.', 'ok'); return row(result.data);
  }
  async function setStatus(id, status) {
    var branch=findBranch(id); if (!branch) throw new Error('That branch is no longer available. Refresh and retry.');
    var target=String(status || '').toUpperCase();
    if (!window.confirm(target === 'INACTIVE' ? 'Set '+branch.name+' inactive? This is blocked if active devices are assigned.' : 'Reactivate '+branch.name+'?')) return false;
    var pair=await mutationClient(), result=await pair.client.rpc('zezms_branch_set_status',{p_branch_id:id,p_status:target});
    if (result.error) throw result.error; await ensureLoaded(true); notify(target === 'ACTIVE' ? 'Branch reactivated.' : 'Branch set inactive.', 'ok'); return row(result.data);
  }
  async function makePrimary(id) {
    var branch=findBranch(id); if (!branch) throw new Error('That branch is no longer available. Refresh and retry.');
    if (!isOwner()) throw new Error('Only an Owner can make a branch primary.');
    if (!window.confirm('Make '+branch.name+' the active primary branch? The current active primary will no longer be primary.')) return false;
    var pair=await mutationClient(), result=await pair.client.rpc('zezms_branch_set_primary',{p_branch_id:id});
    if (result.error) throw result.error; await ensureLoaded(true); notify('Primary branch updated.', 'ok'); return row(result.data);
  }
  function install() {
    var original=window.viewSettings;
    if (typeof original !== 'function' || original.__r69BranchManagementWrapped) return false;
    var wrapped=function () { return original.apply(this,arguments)+cardHtml(); };
    wrapped.__r69BranchManagementWrapped=true; window.viewSettings=wrapped;
    document.documentElement.setAttribute('data-zezms-branch-management','r69a');
    return true;
  }
  window.ZEZMS.branchManagement={ build:BUILD, refresh:function(){ return ensureLoaded(true).catch(function (error) { throw error; }); }, add:add, saveNew:function(){ return saveNew().catch(function (error) { notify(rpcError(error),'err'); throw error; }); }, edit:edit, saveEdit:function(id){ return saveEdit(id).catch(function (error) { notify(rpcError(error),'err'); throw error; }); }, setStatus:function(id,status){ return setStatus(id,status).catch(function (error) { notify(rpcError(error),'err'); throw error; }); }, makePrimary:function(id){ return makePrimary(id).catch(function (error) { notify(rpcError(error),'err'); throw error; }); }, _test:{ canManage:canManage, isOwner:isOwner, deviceCount:deviceCount, statusBadge:statusBadge, readClient:readClient, mutationClient:mutationClient, ensureLoaded:ensureLoaded, getState:function(){ return { status:loadStatus,error:loadError,businessId:loadedBusinessId,branchCount:branches.length,fleetCount:fleet.length,loading:!!loadPromise }; } } };
  setTimeout(install, 350);
}());
