(function () {
  'use strict';

  window.ZEZMS = window.ZEZMS || {};

  var VERSION = '1.1.0';
  var BUILD = '20261103-canonical-recovery-r1';
  var FLAG_KEY = 'zezms_canonical_restore_pending_v1';
  var VERIFY_KEY = 'zezms_canonical_restore_last_verified_v1';
  var APPLY_JOURNAL_KEY = 'zezms_cloud_sync_m4_apply_journal_v2';
  var LOCAL_ONLY_ROOTS = [
    'backupHistory', 'backupSettings', 'syncSettings', 'syncMeta',
    'syncRejectedTransactions', 'syncReconciliationLog', 'security'
  ];
  // Business roots must match the reconstructed Cloud state exactly.
  // sharedDeviceDirectory is Cloud-managed control data: an otherwise-canonical
  // backup may contain a stale local copy, so Canonical Restore replaces that
  // root from the current Cloud projection instead of rejecting the backup.
  var STRICT_SHARED_ROOTS = [
    'cashBalances', 'selectedYear', 'selectedMonth', 'business', 'settings',
    'warrantySettings'
  ];
  var POST_RESTORE_SHARED_ROOTS = STRICT_SHARED_ROOTS.concat(['sharedDeviceDirectory']);

  var backup = ZEZMS.backup;
  if (!backup || typeof backup.restoreCloudBackupAt !== 'function' || typeof backup.restoreFromLocal !== 'function') {
    console.error('ZEZMS Canonical Restore r60: backup manager is unavailable.');
    return;
  }

  var originalCloudRestore = backup.restoreCloudBackupAt;
  var originalLocalRestore = backup.restoreFromLocal;
  var originalGlobalSaveDB = null;
  var originalFetch = window.fetch;
  var originalStart = ZEZMS.cloudSync && ZEZMS.cloudSync.start;
  var originalPush = ZEZMS.cloudSync && ZEZMS.cloudSync.pushNow;
  var originalPull = ZEZMS.cloudSync && ZEZMS.cloudSync.pullNow;
  var originalGlobalStart = window.m4StartLiveSync;
  var originalGlobalPush = window.m4PushNow;
  var originalGlobalPull = window.m4PullNow;
  var activeCloudRestore = null;
  var verifying = false;
  var pendingRestoreRequests=0;

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function notify(message, type) {
    if (typeof toast === 'function') toast(message, type || 'ok');
    else console.log(message);
  }

  function currentDatabase() {
    try { return typeof DB !== 'undefined' ? DB : null; } catch (_) { return null; }
  }

  function rawSaveDatabase() {
    var database = currentDatabase();
    if (!database) throw new Error('The local database is unavailable.');
    if (!(ZEZMS.db && typeof ZEZMS.db.save === 'function')) {
      throw new Error('The raw database save service is unavailable.');
    }
    if (typeof DB_KEY === 'undefined') throw new Error('The ZEZMS database key is unavailable.');
    ZEZMS.db.save(DB_KEY, database);
  }

  function canonicalize(value) {
    if (value === undefined) return null;
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(canonicalize);
    var result = {};
    Object.keys(value).sort().forEach(function (key) {
      result[key] = canonicalize(value[key]);
    });
    return result;
  }

  function stableText(value) {
    return JSON.stringify(canonicalize(value));
  }

  function readFlag() {
    try {
      var raw = localStorage.getItem(FLAG_KEY);
      if (raw === null) return null;
      var flag = JSON.parse(raw);
      return flag && typeof flag === 'object' && !Array.isArray(flag) ? flag : {invalid:true};
    } catch (_) { return {invalid:true}; }
  }

  function writeFlag(value) {
    try { localStorage.setItem(FLAG_KEY, JSON.stringify(value)); } catch (error) {
      throw new Error('Canonical restore could not create its verification lock: ' + (error && error.message || error));
    }
  }

  function clearFlag(verified) {
    try {
      localStorage.removeItem(FLAG_KEY);
      if (verified) localStorage.setItem(VERIFY_KEY, JSON.stringify(verified));
    } catch (_) {}
  }

  function captureLocalRoots(database) {
    var roots = {};
    LOCAL_ONLY_ROOTS.forEach(function (key) {
      if (database && database[key] !== undefined) roots[key] = clone(database[key]);
    });
    return roots;
  }

  function mergeRestoreHistory(restored, preservedRoots, startedAt) {
    var previous = Array.isArray(preservedRoots.backupHistory) ? clone(preservedRoots.backupHistory) : [];
    var incoming = restored && Array.isArray(restored.backupHistory) ? restored.backupHistory : [];
    var startedMs = Date.parse(startedAt || '') || 0;
    var fresh = incoming.filter(function (item) {
      if (!item || String(item.type || '').toLowerCase() !== 'restore') return false;
      var time = Date.parse(item.createdAt || '') || 0;
      return !startedMs || time >= startedMs - 2000;
    });
    var seen = new Set();
    var merged = fresh.concat(previous).filter(function (item) {
      if (!item) return false;
      var key = String(item.id || [item.type,item.createdAt,item.fileName,item.destination].join('|'));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    var retention = Math.max(1, Math.min(30, Number(preservedRoots.backupSettings && preservedRoots.backupSettings.keepLocalBackups) || 30));
    return merged.slice(0, retention);
  }

  function preserveLocalRoots(restored, preservedRoots, startedAt) {
    if (!restored || typeof restored !== 'object') return restored;
    var restoredSettings = restored.backupSettings && typeof restored.backupSettings === 'object'
      ? clone(restored.backupSettings) : {};
    var localSettings = preservedRoots.backupSettings && typeof preservedRoots.backupSettings === 'object'
      ? clone(preservedRoots.backupSettings) : {};

    LOCAL_ONLY_ROOTS.forEach(function (key) {
      if (key === 'backupHistory' || key === 'backupSettings') return;
      if (preservedRoots[key] !== undefined) restored[key] = clone(preservedRoots[key]);
      else delete restored[key];
    });

    restored.backupHistory = mergeRestoreHistory(restored, preservedRoots, startedAt);
    restored.backupSettings = Object.assign({}, restoredSettings, localSettings, {
      lastRestoreAt: restoredSettings.lastRestoreAt || new Date().toISOString(),
      cloudConnected: !!localSettings.cloudConnected
    });
    return restored;
  }

  function syncState() {
    var sync = ZEZMS.cloudSync;
    return sync && typeof sync.getState === 'function' ? sync.getState() : null;
  }

  function assertRestoreEnvironment(state, allowQueuedRollovers) {
    var sync = ZEZMS.cloudSync || {};
    if (!state) throw new Error('Cloud Sync state is unavailable.');
    if (String(sync.protocolVersion || state.protocolVersion || '') !== 'M4/3') {
      throw new Error('Canonical Restore requires the M4/3 sync protocol.');
    }
    if (!state.initialized || !state.deviceId) throw new Error('This device is not initialized for Cloud Sync.');
    if (!allowQueuedRollovers && Number(state.queueLength || 0) !== 0) throw new Error('Canonical Restore is blocked because this device has queued operations.');
    if (Number(state.failedCount || 0) !== 0) throw new Error('Canonical Restore is blocked because this device has failed sync operations.');
    if (state.oldClientDetected || state.lastRejected || String(state.lastError || '').trim()) {
      throw new Error('Canonical Restore is blocked because a current sync warning is active.');
    }
    try {
      if (localStorage.getItem(APPLY_JOURNAL_KEY)) {
        throw new Error('Canonical Restore is blocked because an interrupted sync-apply journal exists. Reload and resolve it first.');
      }
    } catch (error) {
      if (error && /interrupted sync-apply/.test(String(error.message || error))) throw error;
    }
  }

  async function preflight(options) {
    var allowQueuedRollovers = !!(options && options.allowQueuedRollovers);
    var sync = ZEZMS.cloudSync;
    if (!sync || typeof sync.waitUntilReady !== 'function' || typeof sync.fetchCloudAuditBundle !== 'function') {
      throw new Error('The M4/3 Cloud audit service is unavailable.');
    }
    await sync.waitUntilReady(10000);
    var state = syncState();
    assertRestoreEnvironment(state, allowQueuedRollovers);
    // Recovery authority is the fresh canonical audit bundle, never an
    // optional device-local checkpoint cache.
    var bundle = await sync.fetchCloudAuditBundle();
    var checkpoint = bundle && bundle.checkpoint && typeof bundle.checkpoint === 'object' ? bundle.checkpoint : null;
    if (!(checkpoint && String(checkpoint.checkpointId || '').trim()
        && Number(checkpoint.cursor) > 0 && String(checkpoint.payloadHash || '').trim())) {
      throw new Error('Canonical Restore requires the verified M4/3 checkpoint on Cloud.');
    }
    var after = syncState();
    assertRestoreEnvironment(after, allowQueuedRollovers);
    if (Number(after.cursor || 0) !== Number(bundle.headSeq || 0)) {
      throw new Error('This device is not at the current Cloud head. Current cursor: ' + Number(after.cursor || 0)
        + '; Cloud head: ' + Number(bundle.headSeq || 0) + '. Do not restore until the cursor is current.');
    }
    if (Number(bundle.baselineCursor || 0) !== Number(checkpoint.cursor || 0)) {
      throw new Error('Checkpoint boundary mismatch. Canonical Restore stopped without changing data.');
    }
    var queuePlan = allowQueuedRollovers ? sync.inspectCanonicalRecoveryQueue(bundle) : {count:0,operations:[]};
    return { state:after, checkpoint:checkpoint, bundle:bundle, queuePlan:queuePlan, checkpointSource:'cloud-audit-bundle' };
  }

  async function pauseLiveSyncForRestore(check) {
    var sync = ZEZMS.cloudSync;
    if (!sync || typeof sync.pauseForCanonicalRecovery !== 'function')
      throw new Error('Reload the complete recovery update before replacement.');
    await sync.pauseForCanonicalRecovery();
    var paused = syncState();
    assertRestoreEnvironment(paused, true);
    if (paused.liveSyncEnabled || paused.liveSyncDesired === true)
      throw new Error('Live Sync did not pause. No replacement was made.');
    sync.inspectCanonicalRecoveryQueue(check.bundle);
    return paused;
  }

  function registeredZeroCashEqual(candidate, cloudDatabase) {
    var a = candidate && candidate.cashBalances, b = cloudDatabase && cloudDatabase.cashBalances;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) || Array.isArray(b)) return false;
    var la = candidate.settings && candidate.settings.cashWallets;
    var lb = cloudDatabase.settings && cloudDatabase.settings.cashWallets;
    if (!Array.isArray(la) || !Array.isArray(lb)) return false;
    var left = clone(a), right = clone(b);
    var keys = Array.from(new Set(Object.keys(left).concat(Object.keys(right))));
    for (var key of keys) {
      var ah = Object.prototype.hasOwnProperty.call(left,key), bh = Object.prototype.hasOwnProperty.call(right,key);
      if (ah === bh) continue;
      var av = la.filter(function(w){return w && w.balanceKey === key;});
      var bv = lb.filter(function(w){return w && w.balanceKey === key;});
      if (av.length !== 1 || bv.length !== 1 || stableText(av[0]) !== stableText(bv[0]) || (ah ? left[key] : right[key]) !== 0) return false;
      delete left[key]; delete right[key];
    }
    return stableText(left) === stableText(right);
  }

  function representationCandidate(candidate, cloudDatabase) {
    var result = clone(candidate), byId = new Map(), duplicate = new Set();
    (cloudDatabase.stockRows || []).forEach(function(row){
      if (!row || !row.id) return;
      if (byId.has(row.id)) duplicate.add(row.id);
      byId.set(row.id,row);
    });
    (result.stockRows || []).forEach(function(row){
      var cloud = row && byId.get(row.id);
      if (!cloud || duplicate.has(row.id)) return;
      var a = row.profit, b = cloud.profit;
      if (typeof a !== 'number' || typeof b !== 'number' || !Number.isFinite(a) || !Number.isFinite(b)) return;
      var tolerance = Math.min(1e-9, Number.EPSILON * Math.max(1,Math.abs(a),Math.abs(b)) * 8);
      if (Math.round(a*100) === Math.round(b*100) && Math.abs(a-b) <= tolerance) row.profit = b;
    });
    return result;
  }

  function rootDifferences(candidate, cloudDatabase, roots) {
    return (roots || POST_RESTORE_SHARED_ROOTS).filter(function (root) {
      if (root === 'cashBalances' && registeredZeroCashEqual(candidate,cloudDatabase)) return false;
      return stableText(candidate && candidate[root]) !== stableText(cloudDatabase && cloudDatabase[root]);
    });
  }

  function normalizeCloudManagedRoots(candidate, cloudDatabase) {
    if (!candidate || typeof candidate !== 'object') return candidate;
    if (cloudDatabase && cloudDatabase.sharedDeviceDirectory !== undefined) {
      candidate.sharedDeviceDirectory = clone(cloudDatabase.sharedDeviceDirectory);
    } else {
      delete candidate.sharedDeviceDirectory;
    }
    return candidate;
  }

  function validateCandidateAgainstCloud(candidate, preflightResult) {
    backup.validateBackup(candidate);
    var integrity = ZEZMS.syncIntegrity;
    if (!(integrity && integrity._test && typeof integrity._test.projectCloud === 'function'
        && typeof integrity._test.compareDatabases === 'function' && typeof integrity._test.localAudit === 'function')) {
      throw new Error('Integrity Core v2 is unavailable. Canonical Restore stopped without changing data.');
    }

    var projection = integrity._test.projectCloud(preflightResult.bundle);
    candidate = representationCandidate(candidate, projection.database);
    var report = integrity._test.compareDatabases(candidate, projection.database, preflightResult.bundle);
    var audit = integrity._test.localAudit(candidate);
    var roots = rootDifferences(candidate, projection.database, STRICT_SHARED_ROOTS);
    var invariantProblems = (audit.invariants || []).filter(function (item) {
      return item && (item.status === 'FAIL' || item.status === 'WARNING');
    });
    var problems = [];
    if ((projection.conflicts || []).length) problems.push((projection.conflicts || []).length + ' Cloud projection conflict(s)');
    if ((report.actionableDifferences || []).length) problems.push(report.actionableDifferences.length + ' actionable record difference(s)');
    if ((report.unappliedCloudOperations || []).length) problems.push(report.unappliedCloudOperations.length + ' unapplied Cloud operation(s)');
    var outbox = report.unacknowledgedLocalOperations || [];
    var plan = preflightResult.queuePlan || {count:0,operations:[]};
    var certified = new Set((plan.operations || []).map(function(item){return item.opId;}));
    var unresolved = outbox;
    // Candidate comparison also reports this device's outbox. Only the exact
    // read-only certified duplicate set may proceed to Owner-confirmed staging.
    // The third preflight and post-restore verification still require zero.
    if (plan.count === certified.size && plan.count === outbox.length) {
      unresolved = outbox.filter(function(operation){return !certified.has(operation.opId);});
    }
    if (unresolved.length) problems.push(unresolved.length + ' unacknowledged local operation(s)');
    if ((report.oldProtocolOperations || []).length) problems.push(report.oldProtocolOperations.length + ' legacy protocol operation(s)');
    if (invariantProblems.length) problems.push(invariantProblems.length + ' invariant warning/failure(s)');
    if (roots.length) problems.push('shared root mismatch: ' + roots.join(', '));

    if (problems.length) {
      throw new Error('Selected backup is NOT the current canonical Cloud business state: ' + problems.join('; ') + '. No business data was changed.');
    }
    return { candidate:candidate, projection:projection, report:report, audit:audit, rootDifferences:roots, cloudManagedRoot:'sharedDeviceDirectory' };
  }

  function restoreEntry(source, fileName) {
    return {
      id:'RESTORE-' + new Date().toISOString().replace(/[-:.TZ]/g,'') + '-' + Math.random().toString(36).slice(2,7),
      type:'restore',
      createdAt:new Date().toISOString(),
      destination:source,
      status:'completed',
      fileName:fileName || 'Canonical backup',
      size:0,
      note:'Canonical business-state restore completed after M4/3 Cloud verification. Device identity/local-only settings were preserved and Cloud-managed directory data was normalized from the current Cloud projection.'
    };
  }

  function markPending(preflightResult, source, fileName) {
    var state = syncState() || preflightResult.state || {};
    var flag = {
      version:1,
      build:BUILD,
      deviceId:String(state.deviceId || ''),
      deviceName:String(state.deviceName || 'ZEZMS Device'),
      source:String(source || ''),
      fileName:String(fileName || ''),
      restoredAt:new Date().toISOString(),
      expectedCursor:Number(preflightResult.bundle && preflightResult.bundle.headSeq || state.cursor || 0),
      checkpointCursor:Number(preflightResult.checkpoint && preflightResult.checkpoint.cursor || 0),
      checkpointHash:String(preflightResult.checkpoint && preflightResult.checkpoint.payloadHash || ''),
      status:'VERIFY_REQUIRED'
    };
    writeFlag(flag);
    return flag;
  }

  function readFileText(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(new Error('The selected backup file could not be read.')); };
      reader.readAsText(file);
    });
  }

  async function canonicalRestoreFromLocalCore() {
    try {
      var input = document.getElementById('restoreBackupFile');
      var file = input && input.files && input.files[0];
      if (!file) {
        notify('Choose a ZEZMS JSON backup first.', 'err');
        return false;
      }

      notify('Checking M4/3 safety conditions and verifying the selected backup against Cloud…');
      var data = JSON.parse(await readFileText(file));
      var firstCheck = await preflight({allowQueuedRollovers:true});
      validateCandidateAgainstCloud(data, firstCheck);

      // Canonical Restore owns the one final destructive confirmation. The
      // Self-Service layer has already verified the certificate read-only.
      if (!confirm(
        'Canonical Restore this verified backup and replace the BUSINESS DATA on this device?\n\n'
        + 'A safety backup will be downloaded first. This device keeps its identity and local controls. Live Sync will pause and remain locked until post-restore verification passes.'
      )) return false;

      // Never mutate against an old preflight: re-read Cloud head/checkpoint
      // and revalidate the candidate immediately before pausing/replacement.
      var check = await preflight({allowQueuedRollovers:true});
      var candidateCheck = validateCandidateAgainstCloud(data, check);
      await pauseLiveSyncForRestore(check);

      var safetyName = 'ZEZMS_PreCanonicalRestore_' + new Date().toISOString().replace(/[-:.TZ]/g,'') + '.tradeflow.json';
      var priorPreparation = ZEZMS.cloudSync.getCanonicalRecoveryPreparation();
      if (!priorPreparation && !backup.backupNow({ fileName:safetyName, skipHistory:true, silent:true })) {
        throw new Error('Safety backup could not be created. Canonical Restore stopped.');
      }

      await ZEZMS.cloudSync.prepareCanonicalRecovery(priorPreparation ? priorPreparation.safetyBackupName : safetyName);
      check = await preflight();
      candidateCheck = validateCandidateAgainstCloud(data, check);
      data = candidateCheck.candidate;

      var current = currentDatabase();
      if (!current) throw new Error('The local database is unavailable.');
      var preserved = captureLocalRoots(current);
      var localSettings = current.backupSettings && typeof current.backupSettings === 'object' ? clone(current.backupSettings) : {};
      if (!(backup._test && typeof backup._test.normalizeRestoredDatabase === 'function')) {
        throw new Error('Backup normalization service is unavailable.');
      }

      var startedAt = new Date().toISOString();
      var restored = backup._test.normalizeRestoredDatabase(data, localSettings);
      normalizeCloudManagedRoots(restored, candidateCheck.projection.database);
      restored.backupHistory = [restoreEntry('canonical-local-file', file.name)].concat(
        Array.isArray(preserved.backupHistory) ? clone(preserved.backupHistory) : []
      );
      preserveLocalRoots(restored, preserved, startedAt);
      markPending(check, 'local-file', file.name);
      DB = restored;
      rawSaveDatabase();

      notify('Canonical Restore completed locally. Reloading for automatic Cloud verification…');
      setTimeout(function () { location.reload(); }, 700);
      return true;
    } catch (error) {
      console.error('Canonical local restore failed', error);
      notify('Canonical Restore stopped: ' + (error && error.message || error), 'err');
      return false;
    }
  }

  function installSaveProxy(context) {
    if (typeof window.saveDB !== 'function') throw new Error('The database save function is unavailable.');
    originalGlobalSaveDB = window.saveDB;
    var originalDb = currentDatabase();
    context.originalDb = originalDb;
    context.preservedRoots = captureLocalRoots(originalDb);
    context.replacementSeen = false;

    window.saveDB = function () {
      if (!activeCloudRestore || activeCloudRestore !== context) {
        return originalGlobalSaveDB.apply(this, arguments);
      }
      var database = currentDatabase();
      if (!database) throw new Error('The local database is unavailable during Canonical Restore.');
      if (database === context.originalDb) {
        context.preservedRoots = captureLocalRoots(database);
        rawSaveDatabase();
        return;
      }

      preserveLocalRoots(database, context.preservedRoots, context.startedAt);
      markPending(context.preflight, 'google-drive', context.fileName || 'Google Drive canonical backup');
      rawSaveDatabase();
      context.replacementSeen = true;
    };
  }

  function restoreSaveProxy() {
    if (originalGlobalSaveDB) window.saveDB = originalGlobalSaveDB;
    originalGlobalSaveDB = null;
  }

  function installCandidateFetchGuard(context) {
    originalFetch = window.fetch;
    context.candidateVerified = false;
    window.fetch = async function () {
      var args = Array.prototype.slice.call(arguments);
      var input = args[0];
      var url = typeof input === 'string' ? input : (input && input.url ? String(input.url) : '');
      var response = await originalFetch.apply(window, args);
      if (!context.candidateVerified && response && response.ok
          && /www\.googleapis\.com\/drive\/v3\/files\//i.test(url)
          && /(?:\?|&)alt=media(?:&|$)/i.test(url)) {
        var data = await response.clone().json();
        context.preflight = await preflight();
        var candidateCheck = validateCandidateAgainstCloud(data, context.preflight);
        data = candidateCheck.candidate;
        normalizeCloudManagedRoots(data, candidateCheck.projection.database);
        context.candidateVerified = true;
        return new Response(JSON.stringify(data), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      }
      return response;
    };
  }

  function restoreFetchGuard() {
    if (originalFetch) window.fetch = originalFetch;
  }

  async function canonicalRestoreCloudBackupAtCore(index) {
    if (activeCloudRestore) {
      notify('A Canonical Restore is already in progress.', 'err');
      return false;
    }
    var context = null;
    try {
      notify('Checking M4/3 safety conditions and verifying the Google Drive backup against Cloud…');
      var check = await preflight();
      await pauseLiveSyncForRestore(check);
      var files = await backup.listCloudBackups();
      var file = Array.isArray(files) ? files[Number(index)] : null;
      if (!file) throw new Error('The selected Google Drive backup is unavailable. Refresh the cloud list and try again.');

      context = {
        startedAt:new Date().toISOString(),
        preflight:check,
        fileName:String(file.name || 'Google Drive backup')
      };
      activeCloudRestore = context;
      installSaveProxy(context);
      installCandidateFetchGuard(context);

      var result = await originalCloudRestore.call(backup, index);
      if (!result) {
        restoreFetchGuard();
        restoreSaveProxy();
        activeCloudRestore = null;
        return false;
      }
      if (!context.candidateVerified) {
        throw new Error('Google Drive backup content could not be verified before replacement.');
      }
      if (!context.replacementSeen) {
        throw new Error('Canonical Restore did not confirm a durable local database replacement.');
      }

      restoreFetchGuard();
      notify('Canonical Restore completed locally. Reloading for automatic Cloud verification…');
      setTimeout(function () { location.reload(); }, 650);
      return true;
    } catch (error) {
      console.error('Canonical Google Drive restore failed', error);
      restoreFetchGuard();
      restoreSaveProxy();
      activeCloudRestore = null;
      notify('Canonical Restore stopped: ' + (error && error.message || error), 'err');
      return false;
    }
  }

  async function canonicalRestoreFromLocal(){if(pendingRestoreRequests||activeCloudRestore||verifying){notify('A Canonical Restore is already in progress.', 'err');return false;}pendingRestoreRequests++;try{return await canonicalRestoreFromLocalCore();}finally{pendingRestoreRequests--;}}
  async function canonicalRestoreCloudBackupAt(index){if(pendingRestoreRequests||activeCloudRestore||verifying){notify('A Canonical Restore is already in progress.', 'err');return false;}pendingRestoreRequests++;try{return await canonicalRestoreCloudBackupAtCore(index);}finally{pendingRestoreRequests--;}}
  function pendingMessage() {
    var flag = readFlag();
    var prep = ZEZMS.cloudSync && ZEZMS.cloudSync.getCanonicalRecoveryPreparation && ZEZMS.cloudSync.getCanonicalRecoveryPreparation();
    if (!flag && prep) return '<div class="notice warn"><b>Canonical recovery preparation preserved</b><p>Trading and sync remain held. Select and verify a current backup, then resume Canonical Restore. Preserved outbox evidence has not been uploaded.</p></div>';
    if (flag) {
      return '<div style="margin:10px 0;padding:10px;border:1px solid #f59e0b;border-radius:10px;background:rgba(245,158,11,.08)">'
        + '<b>Canonical Restore verification pending</b><br><small>Source: '+String(flag.fileName || 'Canonical backup')+' · expected cursor '+Number(flag.expectedCursor || 0)+'. Live Sync, manual upload and manual receive remain locked until this restored business state is verified against the current M4/3 Cloud checkpoint.</small>'
        + '<div style="margin-top:8px"><button class="btn sm ghost" onclick="verifyCanonicalRestore()">Verify now</button></div></div>';
    }
    try {
      var raw = localStorage.getItem(VERIFY_KEY), verified = raw ? JSON.parse(raw) : null;
      if (!verified) return '';
      // The persisted record is recovery evidence, never an ephemeral selection.
      // Suppress only its obsolete success notice; leave evidence and locks intact.
      var live=syncState(), prior=verified.verifiedCursor;
      if (!pendingRestoreRequests&&!activeCloudRestore&&!verifying&&!readFlag()&&live&&live.liveSyncEnabled===true&&live.status==='live'&&live.queueLength===0&&live.failedCount===0&&Number.isSafeInteger(prior)&&Number.isSafeInteger(live.cursor)&&live.cursor>prior) return '';
      return '<div style="margin:10px 0;padding:10px;border:1px solid #10b981;border-radius:10px;background:rgba(16,185,129,.08)">'
        + '<b>Canonical Restore verified</b><br><small>Source: '+String(verified.fileName || 'Canonical backup')+' · cursor '+Number(verified.verifiedCursor || verified.expectedCursor || 0)+' · verified '+String(verified.verifiedAt || '')+'. Live Sync can be enabled.</small></div>';
    } catch (_) { return ''; }
  }

  function decorateBackupHtml(html) {
    var text = String(html || '');
    text = text.replace(/onclick="restoreFromLocal\(\)"/g, 'onclick="canonicalRestoreFromLocal()"');
    text = text.replace(/Restore selected backup/g, 'Canonical Restore selected backup');
    text = text.replace(/<h3>Restore from this device<\/h3>/g, '<h3>Canonical restore from this device</h3>');
    text = text.replace(/restore a validated backup/g, 'canonically restore a Cloud-verified backup');
    return pendingMessage() + text;
  }

  function relabelCloudButtons(root) {
    var scope = root && root.querySelectorAll ? root : document;
    try {
      scope.querySelectorAll('button[onclick*="restoreCloudBackupAt("]').forEach(function (button) {
        var action = button.getAttribute('onclick') || '';
        button.setAttribute('onclick', action.replace(/restoreCloudBackupAt\(/g, 'canonicalRestoreCloudBackupAt('));
        button.textContent = 'Canonical Restore';
        button.title = 'Cloud-verified Canonical Restore';
      });
      scope.querySelectorAll('button[onclick="restoreFromLocal()"]').forEach(function (button) {
        button.setAttribute('onclick', 'canonicalRestoreFromLocal()');
        button.textContent = 'Canonical Restore selected backup';
      });
    } catch (_) {}
  }

  function isVerificationClean(report, audit, projection, roots, bundle) {
    var state = syncState() || {};
    var badInvariant = (audit.invariants || []).some(function (item) {
      return item && (item.status === 'FAIL' || item.status === 'WARNING');
    });
    return !(report.actionableDifferences || []).length
      && !(report.unappliedCloudOperations || []).length
      && !(report.unacknowledgedLocalOperations || []).length
      && !(report.oldProtocolOperations || []).length
      && !(projection.conflicts || []).length
      && !roots.length
      && !badInvariant
      && Number(state.queueLength) === 0
      && Number(state.failedCount) === 0
      && Number(state.cursor) === Number(bundle.headSeq);
  }

  async function verifyCanonicalRestore(showNotice) {
    if (verifying) return false;
    var flag = readFlag();
    if (!flag) {
      if (ZEZMS.cloudSync.getCanonicalRecoveryPreparation && ZEZMS.cloudSync.getCanonicalRecoveryPreparation()) {
        if (showNotice !== false) notify('Recovery preparation is preserved. Select a verified backup and resume Canonical Restore.', 'err');
        return false;
      }
      if (showNotice !== false) notify('No Canonical Restore verification is pending.');
      return true;
    }
    verifying = true;
    try {
      if (flag.invalid) throw new Error('The Canonical Restore verification lock needs review. It has been preserved.');
      var check = await preflight();
      if (flag.deviceId && check.state.deviceId && String(flag.deviceId) !== String(check.state.deviceId)) {
        throw new Error('Device identity changed after Canonical Restore. Verification stopped.');
      }
      var integrity = ZEZMS.syncIntegrity;
      if (!(integrity && integrity._test && typeof integrity._test.projectCloud === 'function')) {
        throw new Error('Integrity Core v2 is unavailable.');
      }
      var projection = integrity._test.projectCloud(check.bundle);
      var compared = representationCandidate(currentDatabase(),projection.database);
      var report = integrity._test.compareDatabases(compared, projection.database, check.bundle);
      var audit = integrity._test.localAudit(compared);
      var roots = rootDifferences(compared, projection.database);

      if (!isVerificationClean(report, audit, projection, roots, check.bundle)) {
        var parts = [];
        if ((report.actionableDifferences || []).length) parts.push(report.actionableDifferences.length + ' actionable record difference(s)');
        if ((projection.conflicts || []).length) parts.push(projection.conflicts.length + ' Cloud projection conflict(s)');
        if (roots.length) parts.push('shared root mismatch: ' + roots.join(', '));
        if ((report.unappliedCloudOperations || []).length) parts.push(report.unappliedCloudOperations.length + ' unapplied operation(s)');
        if ((report.unacknowledgedLocalOperations || []).length) parts.push(report.unacknowledgedLocalOperations.length + ' local outbox operation(s)');
        throw new Error('Post-restore Cloud verification did not pass' + (parts.length ? ': ' + parts.join('; ') : '.')
          + ' Live Sync remains locked.');
      }

      var verified = Object.assign({}, flag, {
        status:'VERIFIED',
        verifiedAt:new Date().toISOString(),
        verifiedCursor:Number(check.bundle.headSeq || 0)
      });
      ZEZMS.cloudSync.completeCanonicalRecoveryPreparation();
      verified.verificationRule = 'REGISTERED_ZERO_CASH_AND_STOCK_PROFIT_ULP_R1';
      clearFlag(verified);
      if (ZEZMS.cloudSync && typeof ZEZMS.cloudSync.markIntegrityCheck === 'function') {
        ZEZMS.cloudSync.markIntegrityCheck(audit.generatedAt || new Date().toISOString(), false);
      }
      try {
        if (ZEZMS.convergence && typeof ZEZMS.convergence.refresh === 'function') {
          await ZEZMS.convergence.refresh();
        }
      } catch (fingerprintError) {
        console.warn('Canonical Restore verified; fleet fingerprint refresh will retry later.', fingerprintError);
      }
      if (showNotice !== false) notify('Canonical Restore verified: Local and Cloud match. Live Sync can now be enabled.');
      try { if (typeof render === 'function') render(); } catch (_) {}
      return true;
    } catch (error) {
      console.error('Canonical Restore verification failed', error);
      if (showNotice !== false) notify('Canonical Restore verification pending: ' + (error && error.message || error), 'err');
      return false;
    } finally {
      verifying = false;
    }
  }

  function blockIfPending(actionName) {
    if (!readFlag() && !(ZEZMS.cloudSync.getCanonicalRecoveryPreparation && ZEZMS.cloudSync.getCanonicalRecoveryPreparation())) return false;
    notify(actionName + ' is locked until Canonical Restore verification passes. Use “Verify now” or Data Integrity → Compare Local vs Cloud.', 'err');
    verifyCanonicalRestore(false);
    return true;
  }

  function installSyncGuards() {
    var sync = ZEZMS.cloudSync;
    if (!sync || sync._canonicalRestoreGuardInstalled) return;

    if (typeof originalStart === 'function') {
      sync.start = function () {
        if (blockIfPending('Live Sync')) return Promise.resolve(false);
        return originalStart.apply(sync, arguments);
      };
    }
    if (typeof originalPush === 'function') {
      sync.pushNow = function () {
        if (blockIfPending('Manual upload')) return Promise.resolve(false);
        return originalPush.apply(sync, arguments);
      };
    }
    if (typeof originalPull === 'function') {
      sync.pullNow = function () {
        if (blockIfPending('Manual receive')) return Promise.resolve(false);
        return originalPull.apply(sync, arguments);
      };
    }
    if (typeof originalGlobalStart === 'function') {
      window.m4StartLiveSync = function () {
        if (blockIfPending('Live Sync')) return false;
        return originalGlobalStart.apply(window, arguments);
      };
    }
    if (typeof originalGlobalPush === 'function') {
      window.m4PushNow = function () {
        if (blockIfPending('Manual upload')) return false;
        return originalGlobalPush.apply(window, arguments);
      };
    }
    if (typeof originalGlobalPull === 'function') {
      window.m4PullNow = function () {
        if (blockIfPending('Manual receive')) return false;
        return originalGlobalPull.apply(window, arguments);
      };
    }
    sync._canonicalRestoreGuardInstalled = true;
  }

  function installBackupUi() {
    if (backup._canonicalRestoreInstalled) return;
    var originalCard = backup.syncCardHtml;
    var originalSettings = backup.settingsHtml;
    if (typeof originalCard === 'function') {
      backup.syncCardHtml = function () { return decorateBackupHtml(originalCard.apply(backup, arguments)); };
    }
    if (typeof originalSettings === 'function') {
      backup.settingsHtml = function () { return decorateBackupHtml(originalSettings.apply(backup, arguments)); };
    }
    backup._canonicalRestoreInstalled = true;
  }

  backup.version = '3.0.0';
  backup.milestone = 'M2-CANONICAL';
  backup.restoreFromLocal = canonicalRestoreFromLocal;
  backup.restoreCloudBackupAt = canonicalRestoreCloudBackupAt;
  if (backup.adapters && backup.adapters.browserDownload) backup.adapters.browserDownload.restore = canonicalRestoreFromLocal;
  if (backup.adapters && backup.adapters.googleDrive) backup.adapters.googleDrive.restore = canonicalRestoreCloudBackupAt;

  window.restoreFromLocal = canonicalRestoreFromLocal;
  window.restoreCloudBackupAt = canonicalRestoreCloudBackupAt;
  window.canonicalRestoreFromLocal = canonicalRestoreFromLocal;
  window.canonicalRestoreCloudBackupAt = canonicalRestoreCloudBackupAt;
  window.verifyCanonicalRestore = function () { return verifyCanonicalRestore(true); };

  installBackupUi();
  installSyncGuards();

  if (typeof MutationObserver !== 'undefined' && document.body) {
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (node && node.nodeType === 1) relabelCloudButtons(node);
        });
      });
    });
    observer.observe(document.body, { childList:true, subtree:true });
    relabelCloudButtons(document);
  }

  window.addEventListener('load', function () {
    setTimeout(function () {
      installSyncGuards();
      installBackupUi();
      relabelCloudButtons(document);
      if (readFlag()) verifyCanonicalRestore(true);
    }, 2200);
  });

  ZEZMS.canonicalRestore = {
    version:VERSION,
    build:BUILD,
    flagKey:FLAG_KEY,
    restoreLocal:canonicalRestoreFromLocal,
    restoreGoogleDrive:canonicalRestoreCloudBackupAt,
    verify:function () { return verifyCanonicalRestore(true); },
    releaseCompatibility:'r70p',
    getState:function () { return { executing:pendingRestoreRequests>0||!!activeCloudRestore||verifying, pending:readFlag(), preparation:ZEZMS.cloudSync.getCanonicalRecoveryPreparation && ZEZMS.cloudSync.getCanonicalRecoveryPreparation(), lastVerified:(function(){ try { var raw=localStorage.getItem(VERIFY_KEY); return raw?JSON.parse(raw):null; } catch (_) { return null; } }()) }; },
    _test:{
      stableText:stableText,
      captureLocalRoots:captureLocalRoots,
      preserveLocalRoots:preserveLocalRoots,
      rootDifferences:rootDifferences,
      representationCandidate:representationCandidate,
      normalizeCloudManagedRoots:normalizeCloudManagedRoots,
      validateCandidateAgainstCloud:validateCandidateAgainstCloud,
      preflight:preflight,
      pauseLiveSyncForRestore:pauseLiveSyncForRestore,
      verifyCanonicalRestore:verifyCanonicalRestore
    }
  };
}());
