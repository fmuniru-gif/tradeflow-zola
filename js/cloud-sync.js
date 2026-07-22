(function () {
  'use strict';

  window.ZEZMS = window.ZEZMS || {};

  const STATE_KEY = 'zezms_cloud_sync_m3_state';
  const TABLE = 'zezms_sync_state';
  const PUSH_DEBOUNCE_MS = 1400;

  let state = loadState();
  let client = null;
  let session = null;
  let channel = null;
  let pushTimer = null;
  let pushInFlight = false;
  let pullInFlight = false;
  let applyingRemote = false;
  let authSubscription = null;

  function makeDeviceId() {
    if (window.crypto && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'DEV-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }

  function defaults() {
    const cfg = window.ZEZMS_CONFIG && ZEZMS_CONFIG.cloud && ZEZMS_CONFIG.cloud.supabase;
    return {
      version: 3,
      deviceId: makeDeviceId(),
      deviceName: 'ZEZMS Device',
      supabaseUrl: cfg && cfg.url ? cfg.url : '',
      publishableKey: cfg && cfg.publishableKey ? cfg.publishableKey : '',
      liveSyncEnabled: false,
      remoteRevision: 0,
      pending: false,
      status: 'not-configured',
      lastPushAt: '',
      lastPullAt: '',
      lastRemoteAt: '',
      signedInEmail: '',
      conflict: null,
      lastError: ''
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      return Object.assign(defaults(), raw ? JSON.parse(raw) : {});
    } catch (_) {
      return defaults();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn('Cloud sync state could not be saved', error);
    }
  }

  function setState(patch, shouldRender) {
    state = Object.assign({}, state, patch || {});
    saveState();
    if (shouldRender !== false) safeRender();
  }

  function safeRender() {
    try {
      if (typeof render === 'function' && typeof currentView !== 'undefined' && (currentView === 'sync' || currentView === 'settings')) {
        render();
      }
    } catch (_) {}
  }

  function notify(message, type) {
    if (typeof toast === 'function') toast(message, type || 'ok');
    else console.log(message);
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character];
    });
  }

  function whenText(value) {
    return value ? new Date(value).toLocaleString() : 'Never';
  }

  function statusLabel() {
    const labels = {
      'not-configured': 'Not configured',
      'library-unavailable': 'Sync library unavailable',
      'signed-out': 'Cloud account not signed in',
      'connecting': 'Connecting…',
      'ready': 'Ready',
      'live': 'Live sync connected',
      'syncing': 'Synchronising…',
      'pending-offline': 'Offline — change queued',
      'cloud-empty': 'Cloud has no ZEZMS data yet',
      'initial-choice': 'Choose the initial master copy',
      'conflict': 'Sync conflict — action required',
      'error': 'Sync error',
      'disabled': 'Live sync disabled'
    };
    return labels[state.status] || state.status || 'Unknown';
  }

  function configured() {
    return /^https:\/\/.+\.supabase\.co\/?$/i.test((state.supabaseUrl || '').trim())
      && !!(state.publishableKey || '').trim();
  }

  function libraryReady() {
    return !!(window.supabase && typeof window.supabase.createClient === 'function');
  }

  async function disposeClient() {
    stopRealtime();
    if (authSubscription) {
      try { authSubscription.unsubscribe(); } catch (_) {}
      authSubscription = null;
    }
    if (client && client.auth && typeof client.auth.stopAutoRefresh === 'function') {
      try { client.auth.stopAutoRefresh(); } catch (_) {}
    }
    client = null;
    session = null;
  }

  async function buildClient() {
    if (!configured()) {
      await disposeClient();
      setState({ status: 'not-configured', signedInEmail: '' }, false);
      return null;
    }
    if (!libraryReady()) {
      setState({ status: 'library-unavailable', lastError: 'Supabase JavaScript library did not load.' }, false);
      return null;
    }

    await disposeClient();
    client = window.supabase.createClient(
      state.supabaseUrl.replace(/\/$/, ''),
      state.publishableKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: 'zezms-m3-supabase-auth'
        }
      }
    );

    const authResult = client.auth.onAuthStateChange(function (_event, newSession) {
      session = newSession || null;
      const email = session && session.user ? session.user.email || '' : '';
      setState({
        signedInEmail: email,
        status: session ? (state.liveSyncEnabled ? 'connecting' : 'ready') : 'signed-out',
        lastError: session ? '' : state.lastError
      }, false);
      if (session && state.liveSyncEnabled) {
        startLiveSync(false).catch(handleError);
      } else if (!session) {
        stopRealtime();
      }
      safeRender();
    });
    authSubscription = authResult && authResult.data ? authResult.data.subscription : null;

    const result = await client.auth.getSession();
    if (result.error) throw result.error;
    session = result.data && result.data.session ? result.data.session : null;
    setState({
      signedInEmail: session && session.user ? session.user.email || '' : '',
      status: session ? (state.liveSyncEnabled ? 'connecting' : 'ready') : 'signed-out'
    }, false);
    return client;
  }

  function requireClient() {
    if (!client) throw new Error('Configure Supabase and save the Cloud Sync settings first.');
    if (!session || !session.user) throw new Error('Sign in to the ZEZMS cloud account first.');
  }

  function getDatabase() {
    try {
      if (typeof DB !== 'undefined' && DB) return DB;
    } catch (_) {}
    return null;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function preparePayload() {
    const database = getDatabase();
    if (!database) throw new Error('The local ZEZMS database is unavailable.');
    const payload = clone(database);
    try { if (typeof APP_VERSION !== 'undefined') payload.version = APP_VERSION; } catch (_) {}

    // Device-specific settings and local backup history are not shared.
    delete payload.syncSettings;
    delete payload.syncMeta;
    delete payload.backupHistory;
    delete payload.backupSettings;
    return payload;
  }

  function validatePayload(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('The cloud record is not a valid ZEZMS database.');
    }
    const expected = ['products', 'stockRows', 'sales', 'receipts'];
    const matches = expected.filter(function (key) { return Array.isArray(payload[key]); });
    if (matches.length < 2) {
      throw new Error('The cloud record does not contain the expected ZEZMS business data.');
    }
  }

  function persistRemoteDatabase(payload) {
    validatePayload(payload);
    const local = getDatabase();
    const localBackupSettings = local && local.backupSettings ? clone(local.backupSettings) : null;
    const localBackupHistory = local && Array.isArray(local.backupHistory) ? clone(local.backupHistory) : [];

    applyingRemote = true;
    try {
      if (typeof defaultDB !== 'function') throw new Error('Database initializer is unavailable.');
      DB = Object.assign(defaultDB(), clone(payload));
      if (localBackupSettings) DB.backupSettings = localBackupSettings;
      DB.backupHistory = localBackupHistory;
      if (window.ZEZMS && ZEZMS.db && typeof ZEZMS.db.save === 'function') {
        ZEZMS.db.save(DB_KEY, DB);
      } else if (typeof saveDB === 'function') {
        saveDB();
      } else {
        throw new Error('Database save service is unavailable.');
      }
    } finally {
      applyingRemote = false;
    }

    try { if (typeof populateLoginCashiers === 'function') populateLoginCashiers(); } catch (_) {}
    try { if (typeof render === 'function') render(); } catch (_) {}
  }

  function recordFromResult(data) {
    if (Array.isArray(data)) return data[0] || null;
    return data || null;
  }

  async function fetchRemote() {
    requireClient();
    const response = await client
      .from(TABLE)
      .select('owner_id,payload,revision,updated_at,updated_by')
      .eq('owner_id', session.user.id)
      .maybeSingle();
    if (response.error) throw response.error;
    return response.data || null;
  }

  async function pushSnapshot(expectedRevision, reason) {
    const payload = preparePayload();
    const response = await client.rpc('zezms_sync_push', {
      p_payload: payload,
      p_expected_revision: Number(expectedRevision) || 0,
      p_device_id: state.deviceId
    });
    if (response.error) throw response.error;
    const record = recordFromResult(response.data);
    if (!record) throw new Error('The cloud server did not return the new sync revision.');
    return record;
  }

  function isConflictError(error) {
    const text = String((error && (error.message || error.details || error.hint)) || error || '');
    return text.indexOf('ZEZMS_SYNC_CONFLICT') >= 0 || text.indexOf('P0001') >= 0;
  }

  async function pushNow(reason, forceRemoteRevision) {
    if (pushInFlight) return false;
    requireClient();
    if (!navigator.onLine) {
      setState({ pending: true, status: 'pending-offline' });
      return false;
    }

    pushInFlight = true;
    setState({ status: 'syncing', lastError: '' });
    try {
      let expected = Number(state.remoteRevision) || 0;
      if (forceRemoteRevision === true) {
        const remote = await fetchRemote();
        expected = remote ? Number(remote.revision) || 0 : 0;
      }
      const record = await pushSnapshot(expected, reason || 'manual');
      setState({
        remoteRevision: Number(record.revision) || expected + 1,
        lastPushAt: record.updated_at || new Date().toISOString(),
        lastRemoteAt: record.updated_at || new Date().toISOString(),
        pending: false,
        conflict: null,
        status: state.liveSyncEnabled ? 'live' : 'ready',
        lastError: ''
      });
      notify('Cloud sync upload completed.');
      return true;
    } catch (error) {
      if (isConflictError(error)) {
        const remote = await fetchRemote().catch(function () { return null; });
        setState({
          conflict: remote ? {
            revision: Number(remote.revision) || 0,
            updatedAt: remote.updated_at || '',
            updatedBy: remote.updated_by || ''
          } : { revision: 0 },
          status: 'conflict',
          lastError: 'Another device changed the cloud database before this device finished uploading.',
          pending: true
        });
        notify('Sync conflict detected. Choose “Keep this device” or “Use cloud copy”.', 'err');
        return false;
      }
      handleError(error);
      return false;
    } finally {
      pushInFlight = false;
    }
  }

  async function applyRemoteRecord(record, options) {
    if (!record || !record.payload) return false;
    const force = options && options.force;
    let hasOpenCart = false;
    try { hasOpenCart = typeof cart !== 'undefined' && Array.isArray(cart) && cart.length > 0; } catch (_) {}
    if (hasOpenCart && !force) {
      setState({
        status: 'conflict',
        conflict: {
          revision: Number(record.revision) || 0,
          updatedAt: record.updated_at || '',
          updatedBy: record.updated_by || ''
        },
        lastError: 'A newer cloud revision arrived while an unsaved sale was open on this device.'
      });
      notify('A cloud update is waiting. Complete or clear the open sale, then resolve the sync conflict.', 'err');
      return false;
    }
    if (state.pending && !force) {
      setState({
        status: 'conflict',
        conflict: {
          revision: Number(record.revision) || 0,
          updatedAt: record.updated_at || '',
          updatedBy: record.updated_by || ''
        },
        lastError: 'This device has unsent changes and a newer cloud copy is available.'
      });
      notify('Cloud changes arrived while this device had unsent changes. Resolve the conflict in Sync / Backup.', 'err');
      return false;
    }

    persistRemoteDatabase(record.payload);
    setState({
      remoteRevision: Number(record.revision) || 0,
      lastPullAt: new Date().toISOString(),
      lastRemoteAt: record.updated_at || new Date().toISOString(),
      pending: false,
      conflict: null,
      status: state.liveSyncEnabled ? 'live' : 'ready',
      lastError: ''
    });
    if (!(options && options.silent)) notify('This device has been updated from the cloud.');
    return true;
  }

  async function pullNow(force) {
    if (pullInFlight) return false;
    requireClient();
    if (!navigator.onLine) throw new Error('Internet connection is required to download cloud data.');

    pullInFlight = true;
    setState({ status: 'syncing', lastError: '' });
    try {
      const record = await fetchRemote();
      if (!record) {
        setState({ status: 'cloud-empty', remoteRevision: 0 });
        notify('No ZEZMS database exists in this cloud account yet.', 'err');
        return false;
      }
      return await applyRemoteRecord(record, { force: !!force });
    } catch (error) {
      handleError(error);
      return false;
    } finally {
      pullInFlight = false;
    }
  }

  function queuePush(reason) {
    if (applyingRemote || !state.liveSyncEnabled) return;
    setState({ pending: true, status: navigator.onLine ? 'ready' : 'pending-offline' }, false);
    if (!session || !configured()) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      pushTimer = null;
      pushNow(reason || 'local-save').catch(handleError);
    }, PUSH_DEBOUNCE_MS);
  }

  function stopRealtime() {
    if (channel && client) {
      try { client.removeChannel(channel); } catch (_) {}
    }
    channel = null;
  }

  function subscribeRealtime() {
    requireClient();
    stopRealtime();
    channel = client
      .channel('zezms-m3-' + session.user.id + '-' + state.deviceId)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: TABLE,
          filter: 'owner_id=eq.' + session.user.id
        },
        function (event) {
          const record = event && event.new ? event.new : null;
          if (!record) return;
          if (record.updated_by === state.deviceId) {
            setState({
              remoteRevision: Number(record.revision) || state.remoteRevision,
              lastRemoteAt: record.updated_at || state.lastRemoteAt,
              status: state.liveSyncEnabled ? 'live' : 'ready'
            });
            return;
          }
          if ((Number(record.revision) || 0) <= (Number(state.remoteRevision) || 0)) return;
          applyRemoteRecord(record, { silent: false }).catch(handleError);
        }
      )
      .subscribe(function (status) {
        if (status === 'SUBSCRIBED') setState({ status: 'live', lastError: '' });
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setState({ status: 'error', lastError: 'Realtime connection failed: ' + status });
        }
      });
  }

  async function startLiveSync(showNotice) {
    requireClient();
    setState({ liveSyncEnabled: true, status: 'connecting', lastError: '' });
    subscribeRealtime();

    const remote = await fetchRemote();
    if (!remote) {
      setState({ status: 'cloud-empty', remoteRevision: 0 });
      if (showNotice !== false) notify('Cloud sync is connected. Upload this device as the initial cloud master copy.');
      return true;
    }

    if (!state.remoteRevision) {
      setState({
        status: 'initial-choice',
        conflict: {
          revision: Number(remote.revision) || 0,
          updatedAt: remote.updated_at || '',
          updatedBy: remote.updated_by || ''
        }
      });
      if (showNotice !== false) notify('Cloud data already exists. Choose whether this device or the cloud copy is the master.', 'err');
      return true;
    }

    if ((Number(remote.revision) || 0) > (Number(state.remoteRevision) || 0)) {
      await applyRemoteRecord(remote, { silent: showNotice === false });
    } else {
      setState({ status: 'live', lastRemoteAt: remote.updated_at || state.lastRemoteAt });
      if (state.pending) queuePush('reconnected');
    }
    return true;
  }

  function stopLiveSync() {
    stopRealtime();
    setState({ liveSyncEnabled: false, status: session ? 'disabled' : 'signed-out' });
    notify('Live cloud sync disabled on this device.');
  }

  async function saveConfiguration() {
    const urlField = document.getElementById('m3SupabaseUrl');
    const keyField = document.getElementById('m3SupabaseKey');
    const nameField = document.getElementById('m3DeviceName');
    const next = {
      supabaseUrl: urlField ? urlField.value.trim().replace(/\/$/, '') : state.supabaseUrl,
      publishableKey: keyField ? keyField.value.trim() : state.publishableKey,
      deviceName: nameField && nameField.value.trim() ? nameField.value.trim() : state.deviceName,
      remoteRevision: 0,
      pending: false,
      conflict: null,
      liveSyncEnabled: false,
      lastError: ''
    };
    setState(next, false);
    try {
      await buildClient();
      notify('Cloud Sync configuration saved.');
      safeRender();
      return true;
    } catch (error) {
      handleError(error);
      return false;
    }
  }

  function credentialsFromUI() {
    const email = document.getElementById('m3CloudEmail');
    const password = document.getElementById('m3CloudPassword');
    return {
      email: email ? email.value.trim() : '',
      password: password ? password.value : ''
    };
  }

  async function signUp() {
    if (!client) await buildClient();
    if (!client) throw new Error('Save valid Supabase settings first.');
    const credentials = credentialsFromUI();
    if (!credentials.email || credentials.password.length < 8) {
      throw new Error('Enter a valid email and a cloud password of at least 8 characters.');
    }
    setState({ status: 'connecting', lastError: '' });
    const result = await client.auth.signUp({
      email: credentials.email,
      password: credentials.password,
      options: { data: { app: 'ZEZMS', business: 'Zola Electronics Zone' } }
    });
    if (result.error) throw result.error;
    session = result.data ? result.data.session : null;
    if (session) {
      setState({ signedInEmail: credentials.email, status: 'ready' });
      notify('Cloud account created and signed in.');
    } else {
      setState({ signedInEmail: credentials.email, status: 'signed-out' });
      notify('Cloud account created. Confirm the email, then sign in.', 'ok');
    }
    return true;
  }

  async function signIn() {
    if (!client) await buildClient();
    if (!client) throw new Error('Save valid Supabase settings first.');
    const credentials = credentialsFromUI();
    if (!credentials.email || !credentials.password) throw new Error('Enter the cloud email and password.');
    setState({ status: 'connecting', lastError: '' });
    const result = await client.auth.signInWithPassword(credentials);
    if (result.error) throw result.error;
    session = result.data.session;
    setState({
      signedInEmail: session && session.user ? session.user.email || credentials.email : credentials.email,
      status: state.liveSyncEnabled ? 'connecting' : 'ready',
      lastError: ''
    });
    notify('Signed in to the ZEZMS cloud account.');
    if (state.liveSyncEnabled) await startLiveSync(false);
    return true;
  }

  async function signOut() {
    stopRealtime();
    if (client) {
      const result = await client.auth.signOut();
      if (result.error) throw result.error;
    }
    session = null;
    setState({
      signedInEmail: '',
      liveSyncEnabled: false,
      status: 'signed-out',
      remoteRevision: 0,
      conflict: null,
      pending: false
    });
    notify('Signed out of cloud sync on this device.');
  }

  async function uploadInitialMaster() {
    requireClient();
    const remote = await fetchRemote();
    if (remote) {
      const confirmed = confirm('Cloud data already exists. Replace it with the complete database from this device?');
      if (!confirmed) return false;
      setState({ remoteRevision: Number(remote.revision) || 0, pending: true }, false);
      return pushNow('keep-local-master', true);
    }
    setState({ remoteRevision: 0, pending: true }, false);
    const ok = await pushNow('initial-master', false);
    if (ok && state.liveSyncEnabled) subscribeRealtime();
    return ok;
  }

  async function downloadCloudMaster() {
    requireClient();
    const confirmed = confirm('Replace this device’s business data with the current cloud copy? Local Google Drive backup settings will be preserved.');
    if (!confirmed) return false;
    setState({ pending: false }, false);
    return pullNow(true);
  }

  async function resolveKeepLocal() {
    const confirmed = confirm('Keep this device’s database and replace the newer cloud copy? Use this only when this device contains the correct transactions.');
    if (!confirmed) return false;
    return pushNow('conflict-keep-local', true);
  }

  async function resolveUseCloud() {
    const confirmed = confirm('Discard this device’s unsent changes and replace them with the cloud copy?');
    if (!confirmed) return false;
    setState({ pending: false }, false);
    return pullNow(true);
  }

  function handleError(error) {
    const message = (error && (error.message || error.details || error.hint)) || String(error || 'Unknown cloud sync error');
    console.error('ZEZMS Cloud Sync M3', error);
    setState({ status: 'error', lastError: message });
    notify('Cloud sync error: ' + message, 'err');
  }

  async function init() {
    state = loadState();
    if (!configured()) {
      setState({ status: 'not-configured' }, false);
      return false;
    }
    try {
      await buildClient();
      if (session && state.liveSyncEnabled) await startLiveSync(false);
      safeRender();
      return true;
    } catch (error) {
      handleError(error);
      return false;
    }
  }

  function onLocalSave(reason) {
    if (applyingRemote) return;
    queuePush(reason || 'database-save');
  }

  function conflictHtml() {
    if (!state.conflict && state.status !== 'initial-choice') return '';
    const detail = state.conflict || {};
    return '<div style="margin-top:10px;padding:10px;border:1px solid rgba(245,158,11,.55);border-radius:10px;background:rgba(245,158,11,.08)">'
      + '<b>Action required</b>'
      + '<p class="muted" style="font-size:12px;margin:6px 0">Cloud revision ' + esc(detail.revision || '—')
      + (detail.updatedAt ? ' · ' + esc(whenText(detail.updatedAt)) : '') + '. Choose the correct master copy.</p>'
      + '<button class="btn sm warn" onclick="m3KeepThisDevice()">Keep this device</button>'
      + '<button class="btn sm ghost" style="margin-left:8px" onclick="m3UseCloudCopy()">Use cloud copy</button>'
      + '</div>';
  }

  function syncCardHtml() {
    const signedIn = !!session || !!state.signedInEmail;
    return '<div class="card">'
      + '<div class="row" style="justify-content:space-between;align-items:center"><h3 style="margin:0">Live Cloud Sync</h3><span class="badge ok">M3 ACTIVE</span></div>'
      + '<p class="muted" style="font-size:13px">Automatically uploads saved transactions and applies newer cloud revisions on other signed-in devices.</p>'
      + '<div class="statline"><span>Status</span><b>' + esc(statusLabel()) + '</b></div>'
      + '<div class="statline"><span>Cloud account</span><b>' + esc(state.signedInEmail || 'Not signed in') + '</b></div>'
      + '<div class="statline"><span>Device</span><b>' + esc(state.deviceName) + '</b></div>'
      + '<div class="statline"><span>Cloud revision</span><b class="mono">' + esc(state.remoteRevision || 0) + '</b></div>'
      + '<div class="statline"><span>Unsent local changes</span><b>' + (state.pending ? 'Yes' : 'No') + '</b></div>'
      + '<div class="statline"><span>Last upload</span><b>' + esc(whenText(state.lastPushAt)) + '</b></div>'
      + '<div class="statline"><span>Last download</span><b>' + esc(whenText(state.lastPullAt)) + '</b></div>'
      + (state.lastError ? '<p style="font-size:12px;color:#fca5a5">' + esc(state.lastError) + '</p>' : '')
      + '<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:10px">'
      + (state.liveSyncEnabled
        ? '<button class="btn ghost" onclick="m3StopLiveSync()">Pause live sync</button>'
        : '<button class="btn" onclick="m3StartLiveSync()">Enable live sync</button>')
      + '<button class="btn ghost" onclick="m3PushNow()">Upload now</button>'
      + '<button class="btn ghost" onclick="m3PullNow()">Download now</button>'
      + '<button class="btn ghost" onclick="nav(\'settings\')">Cloud settings</button>'
      + '</div>'
      + (!signedIn ? '<p class="muted" style="font-size:11px;margin-top:8px">Configure and sign in under Settings before enabling live sync.</p>' : '')
      + conflictHtml()
      + '</div>';
  }

  function settingsHtml() {
    const configuredText = configured() ? 'Configured' : 'Not configured';
    return '<div class="card" style="margin-top:12px">'
      + '<div class="row" style="justify-content:space-between;align-items:center"><h3 style="margin:0">Cloud Sync M3</h3><span class="badge ok">M3 ACTIVE</span></div>'
      + '<p class="muted" style="font-size:12px">Use one Supabase project and one ZEZMS cloud account on every device. Run <code>SUPABASE_SETUP_M3.sql</code> in the Supabase SQL Editor before connecting.</p>'
      + '<div class="grid g2">'
      + '<div class="field"><label>Supabase project URL</label><input id="m3SupabaseUrl" value="' + esc(state.supabaseUrl) + '" placeholder="https://your-project.supabase.co"></div>'
      + '<div class="field"><label>Supabase publishable key</label><input id="m3SupabaseKey" type="password" value="' + esc(state.publishableKey) + '" placeholder="sb_publishable_..."></div>'
      + '<div class="field"><label>This device name</label><input id="m3DeviceName" value="' + esc(state.deviceName) + '" placeholder="Main till / Office laptop"></div>'
      + '<div class="field"><label>Configuration</label><input value="' + esc(configuredText) + '" disabled></div>'
      + '</div>'
      + '<button class="btn" onclick="m3SaveConfiguration()">Save cloud configuration</button>'
      + '<hr class="hr">'
      + '<h3>ZEZMS cloud account</h3>'
      + '<p class="muted" style="font-size:11px">Create the account once on the first device. On all other devices, sign in with the same email and password. The password is handled by Supabase Auth and is not stored inside the ZEZMS database.</p>'
      + '<div class="grid g2">'
      + '<div class="field"><label>Email</label><input id="m3CloudEmail" type="email" value="' + esc(state.signedInEmail) + '" autocomplete="username"></div>'
      + '<div class="field"><label>Cloud password</label><input id="m3CloudPassword" type="password" autocomplete="current-password" placeholder="At least 8 characters"></div>'
      + '</div>'
      + '<div class="row" style="gap:8px;flex-wrap:wrap">'
      + '<button class="btn" onclick="m3CreateCloudAccount()">Create cloud account</button>'
      + '<button class="btn ghost" onclick="m3SignIn()">Sign in</button>'
      + '<button class="btn ghost" onclick="m3SignOut()">Sign out</button>'
      + '</div>'
      + '<hr class="hr">'
      + '<h3>Initial master copy</h3>'
      + '<p class="muted" style="font-size:11px">On the device containing the complete and correct records, upload it as the cloud master. On every additional device, download the cloud master before recording transactions.</p>'
      + '<div class="row" style="gap:8px;flex-wrap:wrap">'
      + '<button class="btn warn" onclick="m3UploadInitialMaster()">Upload this device as cloud master</button>'
      + '<button class="btn ghost" onclick="m3DownloadCloudMaster()">Download cloud master to this device</button>'
      + '</div>'
      + '<hr class="hr">'
      + '<div class="statline"><span>Status</span><b>' + esc(statusLabel()) + '</b></div>'
      + '<div class="statline"><span>Live sync</span><b>' + (state.liveSyncEnabled ? 'Enabled' : 'Disabled') + '</b></div>'
      + '<div class="statline"><span>Device ID</span><b class="mono" style="font-size:10px">' + esc(state.deviceId) + '</b></div>'
      + conflictHtml()
      + '</div>';
  }

  window.m3SaveConfiguration = function () { saveConfiguration().catch(handleError); };
  window.m3CreateCloudAccount = function () { signUp().catch(handleError); };
  window.m3SignIn = function () { signIn().catch(handleError); };
  window.m3SignOut = function () { signOut().catch(handleError); };
  window.m3StartLiveSync = function () { startLiveSync(true).catch(handleError); };
  window.m3StopLiveSync = stopLiveSync;
  window.m3PushNow = function () { pushNow('manual-upload', false).catch(handleError); };
  window.m3PullNow = function () {
    if (state.pending) {
      notify('This device has unsent changes. Resolve the conflict or upload them before downloading.', 'err');
      return;
    }
    pullNow(false).catch(handleError);
  };
  window.m3UploadInitialMaster = function () { uploadInitialMaster().catch(handleError); };
  window.m3DownloadCloudMaster = function () { downloadCloudMaster().catch(handleError); };
  window.m3KeepThisDevice = function () { resolveKeepLocal().catch(handleError); };
  window.m3UseCloudCopy = function () { resolveUseCloud().catch(handleError); };

  window.addEventListener('online', function () {
    if (state.liveSyncEnabled && session) {
      startLiveSync(false).then(function () {
        if (state.pending && state.status !== 'conflict') queuePush('back-online');
      }).catch(handleError);
    }
  });
  window.addEventListener('offline', function () {
    if (state.liveSyncEnabled) setState({ status: state.pending ? 'pending-offline' : 'ready' });
  });

  ZEZMS.cloudSync = {
    version: 3,
    init: init,
    onLocalSave: onLocalSave,
    isApplyingRemote: function () { return applyingRemote; },
    getState: function () { return Object.assign({}, state); },
    syncCardHtml: syncCardHtml,
    settingsHtml: settingsHtml,
    pushNow: pushNow,
    pullNow: pullNow,
    start: startLiveSync,
    stop: stopLiveSync
  };
}());
