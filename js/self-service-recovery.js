(function () {
  'use strict';

  window.ZEZMS = window.ZEZMS || {};

  var VERSION = '3.23.7';
  // Recovery authority is the fresh, canonical Cloud audit bundle.  This
  // bridge deliberately does not depend on an optional local checkpoint-cache
  // accessor, because a clean device may not expose that diagnostic API.
  var BUILD = '20261103-canonical-recovery-r1';
  var APPLY_JOURNAL_KEY = 'zezms_cloud_sync_m4_apply_journal_v2';
  var RESTORE_INPUT_ID = 'restoreBackupFile';
  // A Sync render replaces its native <input type="file">.  Keep the File object
  // only for this page session so a normal M4/3 status refresh cannot discard a
  // just-selected recovery source.  It is never saved to DB/localStorage/Cloud.
  // pickerElement is an ephemeral reference to the native field that opened
  // the chooser. It is never stored in DB, localStorage, or Cloud.
  var state = { busy:'', message:'', messageType:'ok', certificate:null, lastVerifiedSource:null, diagnostic:[], selectedFile:null, selectedFileInfo:null, pickerOpen:false, pickerElement:null, pickerFallbackTimer:null, pickerFocusStartedAt:0, handledPickerInput:null, deferredRender:false, deferredViewHtml:null };

  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function database() { try { return typeof DB !== 'undefined' ? DB : null; } catch (_) { return null; } }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch];
    });
  }
  function now() { return new Date().toISOString(); }
  function notify(message, type) {
    state.message = String(message || ''); state.messageType = type || 'ok';
    if (typeof toast === 'function') toast(state.message, type || 'ok');
    try { if (typeof render === 'function') render(); } catch (_) {}
  }
  function syncState() {
    var sync = ZEZMS.cloudSync;
    return sync && typeof sync.getState === 'function' ? sync.getState() : {};
  }
  function fingerprint(value) {
    var text = JSON.stringify(value == null ? null : value), hash = 0x811c9dc5;
    for (var index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 0x01000193); }
    return ('00000000' + (hash >>> 0).toString(16)).slice(-8).toUpperCase();
  }
  function fileSignature(file, candidate) {
    return [String(file && file.name || ''), Number(file && file.size || 0), Number(file && file.lastModified || 0), fingerprint(candidate)].join('|');
  }
  function orphanReferenceKeys(database) {
    var keys = Object.create(null);
    function mark(collection, id, detail) { if (id) keys[[collection, String(id), detail].join('|')] = true; }
    (database && database.receipts || []).forEach(function (receipt) {
      var id = String(receipt.receiptNo || receipt.id || '');
      if (id && !(database.sales || []).some(function (sale) { return String(sale.receiptNo || sale.id || '') === id; })) mark('receipts', id, 'Receipt Without Sale');
    });
    (database && database.warranties || []).forEach(function (warranty) {
      var id = String(warranty.warrantyId || warranty.id || '');
      if (warranty.customerId && !(database.customers || []).some(function (customer) { return String(customer.customerId || customer.id || '') === String(warranty.customerId); })) mark('warranties', id, 'Missing Customer');
      if (warranty.productId && !(database.products || []).some(function (product) { return String(product.id || '') === String(warranty.productId); })) mark('warranties', id, 'Missing Product');
    });
    (database && database.warrantyClaims || []).forEach(function (claim) {
      var id = String(claim.warrantyClaimId || claim.claimId || claim.id || '');
      if (claim.warrantyId && !(database.warranties || []).some(function (warranty) { return String(warranty.warrantyId || warranty.id || '') === String(claim.warrantyId); })) mark('warrantyClaims', id, 'Missing Warranty');
    });
    (database && database.accountTxns || []).forEach(function (txn) {
      var accounts = [].concat(database.debtors || [], database.creditors || [], database.depositors || []);
      if (txn.accountID && !accounts.some(function (account) { return String(account.id || '') === String(txn.accountID); })) mark('accountTxns', String(txn._syncId || txn.id || ''), 'Missing Account');
    });
    return keys;
  }
  function classifyCloudCertifiedReferences(report, cloudDatabase) {
    if (!report || !Array.isArray(report.differences)) return report;
    var cloudReferences = orphanReferenceKeys(cloudDatabase), certified = [];
    report.differences.forEach(function (item) {
      var key = [String(item.collection || ''), String(item.id || ''), String(item.detail || '')].join('|');
      if (item.category === 'Orphan Reference' && cloudReferences[key]) {
        item.category = 'Cloud-Certified Reference'; item.info = true; certified.push(item);
        if (report.collections && report.collections[item.collection]) {
          report.collections[item.collection].orphanReference = Math.max(0, Number(report.collections[item.collection].orphanReference || 0) - 1);
          report.collections[item.collection].cloudCertifiedReference = Number(report.collections[item.collection].cloudCertifiedReference || 0) + 1;
        }
      }
    });
    if (certified.length) {
      report.actionableDifferences = report.differences.filter(function (item) {
        return item.category !== 'Historical Reference' && item.category !== 'Historical Derived Metadata' && item.category !== 'Cloud-Certified Reference';
      });
      report.cloudCertifiedReferences = certified;
    }
    return report;
  }
  function installCloudCertifiedReferenceClassification() {
    var integrity = ZEZMS.syncIntegrity, api = integrity && integrity._test;
    if (!api || typeof api.compareDatabases !== 'function' || api.compareDatabases.__r62TCloudCertifiedReferences) return;
    var original = api.compareDatabases;
    var wrapped = function (localDatabase, cloudDatabase, bundle) {
      return classifyCloudCertifiedReferences(original.apply(this, arguments), cloudDatabase);
    };
    wrapped.__r62TCloudCertifiedReferences = true;
    api.compareDatabases = wrapped;
  }
  function managedDevice() {
    var sync = ZEZMS.cloudSync, current = syncState();
    return !!(sync && current && current.initialized && current.deviceId);
  }
  function commercialRole() {
    try {
      if (ZEZMS.staffAuth && typeof ZEZMS.staffAuth.getContext === 'function') {
        var context = ZEZMS.staffAuth.getContext() || {};
        if (context.role) return String(context.role).toUpperCase();
      }
    } catch (_) {}
    try {
      if (window.session && session.commercialRole) return String(session.commercialRole).toUpperCase();
      if (window.session && String(session.role || '').toUpperCase() === 'ADMIN') return 'OWNER';
    } catch (_) {}
    return '';
  }
  function staffSession() {
    var role = commercialRole();
    return !!role && role !== 'OWNER';
  }
  function ownerRecoveryAllowed() {
    var current = syncState();
    return !staffSession() && String(current.deviceAccessMode || 'OWNER').toUpperCase() !== 'PAIRED';
  }
  function selectedBackupInput() { return document.getElementById(RESTORE_INPUT_ID); }
  function sameFile(first, second) {
    return !!(first && second
      && String(first.name || '') === String(second.name || '')
      && Number(first.size || 0) === Number(second.size || 0)
      && Number(first.lastModified || 0) === Number(second.lastModified || 0));
  }
  function cacheSelectedBackupFile(file) {
    if (!file) return false;
    state.selectedFile = file;
    state.selectedFileInfo = {
      name:String(file.name || 'ZEZMS backup'), size:Number(file.size || 0), lastModified:Number(file.lastModified || 0)
    };
    clearCertificate();
    return true;
  }
  function selectedBackupFile() {
    var input = selectedBackupInput();
    var file = input && input.files && input.files[0] ? input.files[0] : null;
    if (file) {
      if (!sameFile(file, state.selectedFile)) cacheSelectedBackupFile(file);
      return file;
    }
    return state.selectedFile || null;
  }
  function attachCachedFile(file) {
    var input = selectedBackupInput(), source = file || state.selectedFile;
    if (!input || !source) return false;
    if (input.files && input.files[0] && sameFile(input.files[0], source)) return true;
    try {
      var Transfer = window.DataTransfer || (typeof DataTransfer === 'function' ? DataTransfer : null);
      if (!Transfer) return false;
      var transfer = new Transfer();
      transfer.items.add(source);
      input.files = transfer.files;
      return !!(input.files && input.files[0] && sameFile(input.files[0], source));
    } catch (_) {
      return false;
    }
  }
  function retainSelectedBackupInput() {
    if (!state.selectedFile) return false;
    return attachCachedFile(state.selectedFile);
  }
  function installPickerRenderGate() {
    if (!window || !document || typeof document.addEventListener !== 'function'
        || !window.Element || window.Element.prototype.__zezmsRecoveryPickerGateR62W) return;
    var descriptor = Object.getOwnPropertyDescriptor(window.Element.prototype, 'innerHTML');
    if (!descriptor || typeof descriptor.get !== 'function' || typeof descriptor.set !== 'function') return;
    Object.defineProperty(window.Element.prototype, 'innerHTML', {
      configurable:true, enumerable:descriptor.enumerable, get:descriptor.get,
      set:function (value) {
        if (state.pickerOpen && this && this.id === 'viewRoot') {
          state.deferredRender = true;
          state.deferredViewHtml = String(value == null ? '' : value);
          return;
        }
        return descriptor.set.call(this, value);
      }
    });
    window.Element.prototype.__zezmsRecoveryPickerGateR62W = true;

    function clearPickerFallback() {
      if (state.pickerFallbackTimer) {
        try { clearTimeout(state.pickerFallbackTimer); } catch (_) {}
      }
      state.pickerFallbackTimer = null;
      state.pickerFocusStartedAt = 0;
    }
    function selectedNativeFile(input) {
      try { return input && input.files && input.files[0] ? input.files[0] : null; } catch (_) { return null; }
    }
    function noteSelectedRecoveryFile(file) {
      if (!file) return false;
      cacheSelectedBackupFile(file);
      state.message = 'Recovery backup selected. Its name is retained through a Sync-screen refresh; click Check selected backup next.';
      state.messageType = 'ok';
      return true;
    }
    function finishPicker(file, source) {
      if (!state.pickerOpen) return;
      // Selection must be captured before the deferred Sync HTML is replayed.
      // A focus event is never itself evidence that the native chooser ended.
      var selected = selectedNativeFile(state.pickerElement) || file || null;
      if (selected) noteSelectedRecoveryFile(selected);
      var original = state.pickerElement;
      if (selected && original) state.handledPickerInput = original;
      clearPickerFallback();
      state.pickerOpen = false;
      state.pickerElement = null;
      var redraw = !!state.deferredRender, html = state.deferredViewHtml;
      state.deferredRender = false;
      state.deferredViewHtml = null;
      if (redraw && html !== null) {
        var root = document.getElementById('viewRoot');
        if (root) descriptor.set.call(root, html);
      }
      // Reattach before and after the normal render. Browsers that prohibit a
      // visual native-field assignment still retain state.selectedFile for the
      // page session and Self-Service verification reads that retained File.
      if (selected) {
        retainSelectedBackupInput();
        try { if (typeof render === 'function') render(); } catch (_) {}
        retainSelectedBackupInput();
      } else {
        setTimeout(retainSelectedBackupInput, 0);
      }
      return source || 'complete';
    }
    function beginPicker(target) {
      if (!target || target.id !== RESTORE_INPUT_ID) return;
      if (state.pickerOpen) {
        if (!state.pickerElement) state.pickerElement = target;
        return;
      }
      state.pickerOpen = true;
      state.pickerElement = target;
      clearPickerFallback();
    }
    function scheduleFocusFallback() {
      if (!state.pickerOpen || state.pickerFallbackTimer) return;
      state.pickerFocusStartedAt = Date.now();
      var poll = function () {
        if (!state.pickerOpen) return;
        var file = selectedNativeFile(state.pickerElement);
        if (file) { finishPicker(file, 'focus-file'); return; }
        if (Date.now() - state.pickerFocusStartedAt >= 2000) {
          finishPicker(null, 'focus-timeout-cancel');
          return;
        }
        state.pickerFallbackTimer = setTimeout(poll, 100);
      };
      state.pickerFallbackTimer = setTimeout(poll, 100);
    }
    document.addEventListener('pointerdown', function (event) { beginPicker(event && event.target); }, true);
    document.addEventListener('click', function (event) { beginPicker(event && event.target); }, true);
    document.addEventListener('keydown', function (event) {
      var key = event && (event.key || event.code);
      if (key === 'Enter' || key === ' ' || key === 'Spacebar') beginPicker(event && event.target);
    }, true);
    document.addEventListener('change', function (event) {
      var target = event && event.target;
      if (!target || target.id !== RESTORE_INPUT_ID) return;
      var file = selectedNativeFile(target);
      if (state.pickerOpen) finishPicker(file, 'change');
    }, true);
    document.addEventListener('cancel', function (event) {
      var target = event && event.target;
      if (!target || target.id !== RESTORE_INPUT_ID || !state.pickerOpen) return;
      finishPicker(null, 'cancel');
    }, true);
    window.addEventListener('focus', function () {
      if (!state.pickerOpen) return;
      // Some Windows/Chrome versions emit focus before their delayed native
      // input change. Keep the original field alive through a conservative
      // grace period and inspect it before considering the picker cancelled.
      scheduleFocusFallback();
    });
  }
  function installFileSelectionRetention() {
    if (!document || !document.addEventListener || document.__zezmsRecoveryFileRetentionR62V) return;
    document.__zezmsRecoveryFileRetentionR62V = true;
    document.addEventListener('change', function (event) {
      var target = event && event.target;
      var file = target && target.id === RESTORE_INPUT_ID && target.files && target.files[0];
      if (!file) return;
      if (state.handledPickerInput === target) {
        state.handledPickerInput = null;
        return;
      }
      cacheSelectedBackupFile(file);
      state.message = 'Recovery backup selected. Its name is retained through a Sync-screen refresh; click Check selected backup next.';
      state.messageType = 'ok';
      try { if (typeof render === 'function') render(); } catch (_) {}
      setTimeout(retainSelectedBackupInput, 0);
    }, true);
    if (typeof MutationObserver !== 'undefined' && document.body) {
      var observer = new MutationObserver(function () { setTimeout(retainSelectedBackupInput, 0); });
      observer.observe(document.body, { childList:true, subtree:true });
    }
  }
  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        try { resolve(JSON.parse(String(reader.result || ''))); }
        catch (_) { reject(new Error('The selected file is not valid JSON.')); }
      };
      reader.onerror = function () { reject(new Error('The selected backup file could not be read.')); };
      reader.readAsText(file);
    });
  }
  function getServices() {
    var sync = ZEZMS.cloudSync, backup = ZEZMS.backup, canonical = ZEZMS.canonicalRestore, integrity = ZEZMS.syncIntegrity;
    if (!sync || typeof sync.waitUntilReady !== 'function' || typeof sync.fetchCloudAuditBundle !== 'function') {
      throw new Error('M4/3 Cloud Sync is unavailable. Connect this device and retry.');
    }
    if (!backup || typeof backup.validateBackup !== 'function' || typeof backup.backupNow !== 'function') {
      throw new Error('Backup validation is unavailable. Reload the current release.');
    }
    if (!canonical || !canonical._test || typeof canonical._test.validateCandidateAgainstCloud !== 'function' || typeof canonical.restoreLocal !== 'function') {
      throw new Error('Canonical Restore is unavailable. Reload the current release.');
    }
    if (!integrity || !integrity._test || typeof integrity._test.compareDatabases !== 'function' || typeof integrity._test.projectCloud !== 'function') {
      throw new Error('Integrity Core v2 is unavailable. Reload the current release.');
    }
    return { sync:sync, backup:backup, canonical:canonical, integrity:integrity };
  }
  async function preflight(allowQueuedRollovers) {
    if (!ownerRecoveryAllowed()) throw new Error('Self-Service Recovery is available only to an Owner device.');
    var services = getServices();
    var check = await services.canonical._test.preflight({allowQueuedRollovers:allowQueuedRollovers !== false});
    return Object.assign({services:services},check);
  }
  function clearCertificate() { state.certificate = null; }
  function recoveryDiagnostic(candidate, check) {
    try {
      var projection = check.services.integrity._test.projectCloud(check.bundle);
      var report = check.services.integrity._test.compareDatabases(candidate, projection.database, check.bundle);
      return (report.actionableDifferences || []).slice(0, 12).map(function (item) {
        return { category:String(item.category || 'Difference'), collection:String(item.collection || 'root'), id:String(item.id || item.detail || ''), fields:(item.fields || []).map(String) };
      });
    } catch (_) { return []; }
  }
  function diagnosticHtml(items) {
    if (!items || !items.length) return '';
    return '<div style="margin:10px 0;padding:10px;border:1px solid rgba(245,158,11,.55);border-radius:10px"><b>Read-only recovery evidence</b><br><small>The following actual Cloud-vs-local difference(s) still prevent a verified backup. No data was changed.</small><ul style="margin:7px 0 0;padding-left:18px;font-size:11px">'
      +items.map(function (item) { return '<li>'+esc(item.category)+' · '+esc(item.collection)+(item.id ? ' · '+esc(item.id) : '')+(item.fields.length ? ' · '+esc(item.fields.join(', ')) : '')+'</li>'; }).join('')
      +'</ul></div>';
  }
  function certificateText(certificate) {
    if (!certificate) return '<p class="muted" style="font-size:12px;margin:8px 0 0">No source backup has been verified in this page session. Checking a file is read-only.</p>';
    return '<div style="margin:10px 0;padding:10px;border:1px solid #10b981;border-radius:10px;background:rgba(16,185,129,.08)"><b>Recovery backup verified</b><br><small>'+esc(certificate.fileName)+' matches the canonical Cloud business state at cursor '+esc(certificate.headSeq)+'. This check changed no business data.</small></div>';
  }
  async function verifySelectedBackup() {
    if (state.busy) return false;
    state.diagnostic = [];
    state.busy = 'Verifying the selected backup against the canonical M4/3 Cloud state…';
    try {
      var file = selectedBackupFile();
      if (!file) throw new Error('Choose the source .tradeflow.json file in “Canonical restore from this device” first.');
      var candidate = await readFile(file), check = await preflight();
      check.services.backup.validateBackup(candidate);
      await check.services.canonical._test.validateCandidateAgainstCloud(candidate, check);
      state.certificate = {
        fileName:String(file.name || 'ZEZMS backup'), signature:fileSignature(file, candidate), verifiedAt:now(),
        headSeq:Number(check.bundle.headSeq || 0), checkpointCursor:Number(check.checkpoint.cursor || 0),
        sourceFingerprint:fingerprint(candidate), targetDeviceId:String(check.state.deviceId || '')
      };
      notify('Recovery backup verified. It matches canonical Cloud and can safely repair this device.', 'ok');
      return clone(state.certificate);
    } catch (error) {
      clearCertificate();
      state.diagnostic = typeof candidate !== 'undefined' && typeof check !== 'undefined' && check ? recoveryDiagnostic(candidate, check) : [];
      notify('Recovery backup was not accepted: ' + (error && error.message || error) + ' No data was changed.', 'err');
      return false;
    } finally { state.busy = ''; try { if (typeof render === 'function') render(); } catch (_) {} }
  }
  async function createVerifiedRecoveryBackup() {
    if (state.busy) return false;
    state.diagnostic = [];
    state.busy = 'Verifying this healthy device before creating a recovery backup…';
    try {
      var current = database();
      if (!current) throw new Error('The local database is unavailable.');
      var check = await preflight(false), candidate = clone(current);
      await check.services.canonical._test.validateCandidateAgainstCloud(candidate, check);
      var name = String(check.state.deviceName || 'ZEZMS_Device').replace(/[^a-z0-9_-]+/gi, '_');
      var fileName = 'ZEZMS_Verified_Recovery_' + name + '_cursor' + Number(check.bundle.headSeq || 0) + '_' + now().replace(/[-:.TZ]/g, '') + '.tradeflow.json';
      if (check.services.backup.backupNow({ fileName:fileName, skipHistory:false, silent:false }) === false) {
        throw new Error('The recovery backup could not be downloaded.');
      }
      state.lastVerifiedSource = { fileName:fileName, createdAt:now(), headSeq:Number(check.bundle.headSeq || 0), deviceId:String(check.state.deviceId || '') };
      notify('Verified recovery backup downloaded. Keep it safe and use it only through this Recovery Center or Canonical Restore.', 'ok');
      return clone(state.lastVerifiedSource);
    } catch (error) {
      state.diagnostic = typeof candidate !== 'undefined' && typeof check !== 'undefined' && check ? recoveryDiagnostic(candidate, check) : [];
      notify('Verified recovery backup was not created: ' + (error && error.message || error) + ' No data was changed.', 'err');
      return false;
    } finally { state.busy = ''; try { if (typeof render === 'function') render(); } catch (_) {} }
  }
  async function recoverThisDevice() {
    state.confirmationPending=true;
    try {
      var file = selectedBackupFile(), certificate = state.certificate;
      if (!file || !certificate) throw new Error('Verify the selected backup before recovery.');
      var candidate = await readFile(file);
      if (certificate.signature !== fileSignature(file, candidate)) throw new Error('The selected file changed after verification. Verify it again.');
      if (!attachCachedFile(file)) {
        throw new Error('The browser could not reattach the verified source to Canonical Restore after a screen refresh. Select the file again, confirm that its name appears in this card, then Check selected backup. No data was changed.');
      }
      var result = await getServices().canonical.restoreLocal();
      if (result) clearCertificate();
      return result;
    } catch (error) {
      notify('Self-Service Recovery stopped: ' + (error && error.message || error) + ' No data was changed.', 'err');
      return false;
    } finally { state.confirmationPending=false; }
  }
  function openTrustedRecovery() {
    if (typeof nav === 'function') nav('integrity');
    setTimeout(function () {
      var card = document.querySelector('[data-zezms-trusted-recovery]');
      if (card && typeof card.scrollIntoView === 'function') card.scrollIntoView({ behavior:'smooth', block:'start' });
    }, 400);
    return false;
  }
  function guardRawImport() {
    if (typeof window.importDB !== 'function' || window.importDB.__r62RecoveryGuard) return;
    var original = window.importDB;
    var guarded = function () {
      if (managedDevice()) {
        notify('Raw “Import & replace” is blocked for an active M4/3 managed device. Use Self-Service Recovery so the backup is verified and the device identity is preserved.', 'err');
        return false;
      }
      return original.apply(window, arguments);
    };
    guarded.__r62RecoveryGuard = true;
    window.importDB = guarded;
  }
  function expireVerifiedSelection() {
    var live=syncState(), c=state.certificate;
    var canonical=ZEZMS.canonicalRestore&&ZEZMS.canonicalRestore.getState?ZEZMS.canonicalRestore.getState():null;
    var staged=ZEZMS.managedDevices&&ZEZMS.managedDevices.getStage?ZEZMS.managedDevices.getStage():null;
    if(!c||state.busy||state.confirmationPending||state.pickerOpen||!canonical||canonical.pending||canonical.executing||staged) return false;
    if(live.liveSyncEnabled!==true||live.status!=='live'||live.queueLength!==0||live.failedCount!==0||!Number.isSafeInteger(c.headSeq)||!Number.isSafeInteger(live.cursor)||live.cursor<=c.headSeq) return false;
    state.certificate=null;state.selectedFile=null;state.selectedFileInfo=null;state.message='';
    var input=document.getElementById(RESTORE_INPUT_ID);if(input)input.value='';
    return true;
  }
  function recoveryCardHtml() {
    expireVerifiedSelection();
    if (!ownerRecoveryAllowed()) return '';
    var last = state.lastVerifiedSource ? '<p class="muted" style="font-size:11px;margin-top:10px">Last verified source backup: '+esc(state.lastVerifiedSource.fileName)+' · Cloud cursor '+esc(state.lastVerifiedSource.headSeq)+'</p>' : '';
    var selected = state.selectedFileInfo ? '<p class="muted" style="font-size:11px;margin-top:10px"><b>Selected recovery backup:</b> '+esc(state.selectedFileInfo.name)+' · retained for this page session</p>' : '';
    var message = state.message ? '<p class="'+(state.messageType === 'err' ? 'err' : 'muted')+'" style="font-size:12px"><b>'+esc(state.message)+'</b></p>' : '';
    return '<div class="card" style="grid-column:1/-1;border-color:rgba(20,184,166,.75);margin-top:12px" data-zezms-self-service-recovery="r62u">'
      +'<div class="row" style="justify-content:space-between;gap:8px;flex-wrap:wrap"><h3 style="margin:0;color:var(--teal2)">Self-Service Device Recovery</h3><span class="badge ok">r62U</span></div>'
      +'<p class="muted" style="font-size:12px;line-height:1.55">This is the safe backup workflow: make a verified recovery backup on a healthy device, then use it to repair a faulty device. It never copies a backup over an active device without Cloud, checkpoint and Integrity Core verification.</p>'
      +(state.busy ? '<p class="muted"><b>'+esc(state.busy)+'</b></p>' : '')+message+diagnosticHtml(state.diagnostic)
      +'<div class="grid g2" style="margin-top:10px">'
      +'<div style="padding:12px;border:1px solid rgba(148,163,184,.25);border-radius:10px"><b>1. Healthy device: create source backup</b><p class="muted" style="font-size:11px">Use this only on a device whose Cloud-vs-Local audit is clean. The download is rejected if this device is not at the verified Cloud head.</p><button class="btn" onclick="ZEZMS.selfServiceRecovery.createVerifiedBackup()">Create verified recovery backup</button></div>'
      +'<div style="padding:12px;border:1px solid rgba(148,163,184,.25);border-radius:10px"><b>2. Faulty device: verify, then repair</b><p class="muted" style="font-size:11px">Choose the source file in the existing <b>Canonical restore from this device</b> field above. Its selection is retained if the Sync screen refreshes. First check it here; only a Cloud-matching backup may replace this device.</p><button class="btn ghost" onclick="ZEZMS.selfServiceRecovery.verifySelectedBackup()">Check selected backup</button>'
      +certificateText(state.certificate)
      +'<button class="btn warn" style="margin-top:8px" onclick="ZEZMS.selfServiceRecovery.recoverThisDevice()">Recover this device</button></div>'
      +'</div>'
      +'<div style="margin-top:12px;padding:10px;border:1px solid rgba(245,158,11,.45);border-radius:10px"><b>When the healthy backup is ahead of Cloud</b><p class="muted" style="font-size:11px;margin:6px 0">Do not raw-import it into other devices. Open Owner Trusted Recovery to preview its exact business differences and, only after review, promote them through one audited M4/3 operation. Then repair the faulty device from the corrected Cloud state.</p><button class="btn ghost" onclick="ZEZMS.selfServiceRecovery.openTrustedRecovery()">Open guided Cloud recovery</button></div>'
      +'<p class="muted" style="font-size:11px;margin-top:10px">A reset/new browser profile is a replacement-device case: use <b>Repair / replace a device</b>. Never use Raw Import &amp; Replace on an active managed device.</p>'
      +last+selected+'</div>';
  }
  function installUi() {
    guardRawImport();
    if (typeof window.viewSync !== 'function' || window.viewSync.__r62SelfServiceRecovery) return;
    var original = window.viewSync;
    var wrapped = function () {
      var html = String(original.apply(window, arguments) || '');
      return html.indexOf('data-zezms-self-service-recovery=') >= 0 ? html : html + recoveryCardHtml();
    };
    wrapped.__r62SelfServiceRecovery = true;
    window.viewSync = wrapped;
  }
  function scheduleUi(attempts) {
    installUi();
    if (attempts > 0 && (typeof window.viewSync !== 'function' || !window.viewSync.__r62SelfServiceRecovery)) {
      setTimeout(function () { scheduleUi(attempts - 1); }, 500);
    }
  }

  installCloudCertifiedReferenceClassification();
  installPickerRenderGate();
  installFileSelectionRetention();

  ZEZMS.selfServiceRecovery = {
    version:VERSION, build:BUILD, expireVerifiedSelection:expireVerifiedSelection,
    createVerifiedBackup:createVerifiedRecoveryBackup, verifySelectedBackup:verifySelectedBackup,
    recoverThisDevice:recoverThisDevice, openTrustedRecovery:openTrustedRecovery,
    getState:function () { return { busy:state.busy, message:state.message, messageType:state.messageType, pickerOpen:state.pickerOpen, certificate:clone(state.certificate), lastVerifiedSource:clone(state.lastVerifiedSource), selectedBackup:clone(state.selectedFileInfo), diagnostic:clone(state.diagnostic) }; },
    _test:{ fingerprint:fingerprint, fileSignature:fileSignature, managedDevice:managedDevice, commercialRole:commercialRole, ownerRecoveryAllowed:ownerRecoveryAllowed, selectedBackupFile:selectedBackupFile, cacheSelectedBackupFile:cacheSelectedBackupFile, attachCachedFile:attachCachedFile, orphanReferenceKeys:orphanReferenceKeys, classifyCloudCertifiedReferences:classifyCloudCertifiedReferences, preflight:preflight }
  };

  setTimeout(function () { scheduleUi(8); }, 500);
  window.addEventListener('load', function () { setTimeout(function () { scheduleUi(8); }, 900); });
}());
