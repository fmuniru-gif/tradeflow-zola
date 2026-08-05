/* ZEZMS v3.6.0 — M5A-1 Foundation retained for M5A-2 */
(function () {
  'use strict';

  window.ZEZMS = window.ZEZMS || {};

  const BUILD = '20260805-shared-device-recovery-r24';
  const STATE_KEY = 'zezms_commercial_m5a1_state';

  let state = loadState();
  let devices = [];
  let running = false;

  function defaults() {
    return {
      version: 1,
      build: BUILD,
      status: 'not-checked',
      businessId: '',
      context: null,
      lastCheckedAt: '',
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

  function persist() {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  function setState(patch, rerender) {
    state = Object.assign({}, state, patch || {});
    persist();
    if (rerender !== false) renderSettingsSafely();
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch];
    });
  }

  function attr(value) {
    return esc(value).replace(/\n/g, '');
  }

  function when(value) {
    if (!value) return 'Never';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
  }

  function cloud() {
    return window.ZEZMS && ZEZMS.cloudSync ? ZEZMS.cloudSync : null;
  }

  function cloudState() {
    const sync = cloud();
    return sync && typeof sync.getState === 'function' ? sync.getState() : {};
  }

  async function getClientAndSession() {
    const sync = cloud();
    if (!sync) throw new Error('Cloud Sync M4 is unavailable.');

    if (typeof sync.waitUntilReady === 'function') {
      await sync.waitUntilReady(8000);
    }

    const client = typeof sync.getClient === 'function' ? sync.getClient() : null;
    const session = typeof sync.getSession === 'function' ? sync.getSession() : null;

    if (!client) {
      throw new Error('Configure Supabase in Settings and sign in to the ZEZMS cloud account first.');
    }
    if (!session || !session.user) {
      throw new Error('Sign in to the ZEZMS cloud account before initializing the commercial foundation.');
    }

    return { client: client, session: session };
  }

  function deviceArgs() {
    const syncState = cloudState();
    return {
      p_device_id: String(syncState.deviceId || ''),
      p_device_name: String(syncState.deviceName || 'ZEZMS Device'),
      p_platform: String(navigator.userAgent || '').slice(0, 240),
      p_app_version: typeof APP_VERSION !== 'undefined' ? String(APP_VERSION) : '3.6.0'
    };
  }

  function normalizeRow(data) {
    if (Array.isArray(data)) return data[0] || null;
    return data || null;
  }

  function sqlMissing(error) {
    const message = String(error && (error.message || error.details || error.hint) || '');
    return /function .* does not exist|could not find the function|PGRST202|schema cache/i.test(message);
  }

  function friendlyError(error) {
    const rawMessage = String(error && (error.message || error.details || error.hint) || error || '');
    if (/column reference ["']business_id["'] is ambiguous/i.test(rawMessage)) {
      return 'The original M5A-1 RPC needs the v3.5.1 correction. Run SUPABASE_M5A1_FIX_AMBIGUOUS_BUSINESS_ID.sql once, then press Check SQL/status.';
    }
    if (sqlMissing(error)) {
      return 'M5A-1 SQL has not been installed. Run SUPABASE_M5A1_COMMERCIAL_FOUNDATION.sql in the Supabase SQL Editor.';
    }
    const message = String(error && (error.message || error.details || error.hint) || error || 'Unknown error');
    if (/ZEZMS_DEVICE_REVOKED/i.test(message)) {
      return 'This device has been revoked for the selected business.';
    }
    if (/ZEZMS_AUTH_REQUIRED/i.test(message)) {
      return 'The Supabase cloud session has expired. Sign in again.';
    }
    return message;
  }

  async function loadDevices(client, businessId) {
    devices = [];
    if (!businessId) return;
    const result = await client
      .from('zezms_business_devices')
      .select('device_id,device_name,platform,app_version,last_seen_at,revoked_at,revocation_reason,user_id')
      .eq('business_id', businessId)
      .order('last_seen_at', { ascending: false });

    if (result.error) throw result.error;
    devices = Array.isArray(result.data) ? result.data : [];
  }

  async function refresh(options) {
    if (running) return state.context;
    running = true;
    const silent = options && options.silent;
    try {
      const pair = await getClientAndSession();
      const args = Object.assign({
        p_business_id: state.businessId || null
      }, deviceArgs());

      const result = await pair.client.rpc('zezms_commercial_context', args);
      if (result.error) throw result.error;

      const context = normalizeRow(result.data);
      if (!context) {
        devices = [];
        setState({
          status: 'not-initialized',
          context: null,
          lastCheckedAt: new Date().toISOString(),
          lastError: ''
        }, !silent);
        return null;
      }

      await loadDevices(pair.client, context.business_id);
      setState({
        status: 'ready',
        businessId: context.business_id,
        context: context,
        lastCheckedAt: new Date().toISOString(),
        lastError: ''
      }, !silent);
      return context;
    } catch (error) {
      const message = friendlyError(error);
      const status = sqlMissing(error) ? 'sql-required' : 'error';
      setState({
        status: status,
        lastCheckedAt: new Date().toISOString(),
        lastError: message
      }, !silent);
      if (!silent && typeof toast === 'function') toast(message, 'err');
      return null;
    } finally {
      running = false;
    }
  }

  async function bootstrap() {
    if (running) return;
    const tradingName = String((document.getElementById('m5TradingName') || {}).value || '').trim();
    const legalName = String((document.getElementById('m5LegalName') || {}).value || '').trim();
    const branchName = String((document.getElementById('m5BranchName') || {}).value || '').trim();
    if (!tradingName) {
      if (typeof toast === 'function') toast('Business trading name is required.', 'err');
      return;
    }

    if (!confirm(
      'Initialize the commercial foundation for "' + tradingName + '"?\n\n'
      + 'This creates the tenant, owner membership, primary branch, device register and audit record. '
      + 'It does not move or delete the current M4 operational records.'
    )) return;

    running = true;
    try {
      const pair = await getClientAndSession();
      const args = Object.assign({
        p_trading_name: tradingName,
        p_legal_name: legalName,
        p_branch_name: branchName || 'Main Branch'
      }, deviceArgs());

      const result = await pair.client.rpc('zezms_commercial_bootstrap', args);
      if (result.error) throw result.error;

      const context = normalizeRow(result.data);
      if (!context) throw new Error('Supabase did not return the new business context.');

      await loadDevices(pair.client, context.business_id);
      setState({
        status: 'ready',
        businessId: context.business_id,
        context: context,
        lastCheckedAt: new Date().toISOString(),
        lastError: ''
      });

      if (typeof toast === 'function') toast('M5A-1 commercial foundation initialized.');
    } catch (error) {
      const message = friendlyError(error);
      setState({
        status: sqlMissing(error) ? 'sql-required' : 'error',
        lastError: message,
        lastCheckedAt: new Date().toISOString()
      });
      if (typeof toast === 'function') toast(message, 'err');
    } finally {
      running = false;
    }
  }

  async function revokeDevice(deviceId) {
    const context = state.context;
    if (!context || !context.business_id) return;
    if (!['OWNER','ADMIN'].includes(String(context.member_role || ''))) {
      if (typeof toast === 'function') toast('Only an Owner or Admin can revoke devices.', 'err');
      return;
    }
    if (!confirm(
      'Revoke this device?\n\nDevice ID: ' + deviceId
      + '\n\nThe device will be blocked when M5A tenant enforcement is activated.'
    )) return;

    const reason = String(prompt('Reason for revocation (optional)', 'Device no longer authorised') || '').trim();

    try {
      const pair = await getClientAndSession();
      const result = await pair.client.rpc('zezms_revoke_business_device', {
        p_business_id: context.business_id,
        p_device_id: deviceId,
        p_reason: reason
      });
      if (result.error) throw result.error;
      await refresh({ silent: false });
      if (typeof toast === 'function') toast('Device revoked.');
    } catch (error) {
      const message = friendlyError(error);
      if (typeof toast === 'function') toast(message, 'err');
    }
  }

  function badge() {
    const map = {
      ready: ['ok', 'FOUNDATION READY'],
      'not-initialized': ['warn', 'NOT INITIALIZED'],
      'sql-required': ['bad', 'SQL REQUIRED'],
      error: ['bad', 'CHECK REQUIRED'],
      'not-checked': ['warn', 'NOT CHECKED']
    };
    const item = map[state.status] || map['not-checked'];
    return '<span class="badge ' + item[0] + '">' + item[1] + '</span>';
  }

  function devicesHtml() {
    if (!state.context) return '';
    const role = String(state.context.member_role || '');
    const canRevoke = role === 'OWNER' || role === 'ADMIN';
    const syncState = cloudState();
    const currentDeviceId = String(syncState.deviceId || '');

    const rows = devices.map(function (device) {
      const revoked = !!device.revoked_at;
      const current = String(device.device_id || '') === currentDeviceId;
      return '<tr>'
        + '<td>' + esc(device.device_name || 'ZEZMS Device')
        + (current ? ' <span class="badge ok">THIS DEVICE</span>' : '') + '</td>'
        + '<td class="mono" style="font-size:10px">' + esc(device.device_id || '') + '</td>'
        + '<td>' + esc(device.app_version || '—') + '</td>'
        + '<td style="font-size:11px">' + esc(when(device.last_seen_at)) + '</td>'
        + '<td>' + (revoked
          ? '<span class="badge bad">REVOKED</span>'
          : '<span class="badge ok">ACTIVE</span>') + '</td>'
        + '<td>' + (!revoked && canRevoke
          ? '<button class="btn sm danger" onclick="m5a1RevokeDevice(\'' + attr(device.device_id) + '\')">Revoke</button>'
          : '—') + '</td>'
        + '</tr>';
    }).join('') || '<tr><td colspan="6" class="empty">No registered device has been returned yet.</td></tr>';

    return '<hr class="hr"><h3>Registered devices</h3>'
      + '<div class="table-wrap"><table>'
      + '<thead><tr><th>Device</th><th>Device ID</th><th>App</th><th>Last seen</th><th>Status</th><th>Action</th></tr></thead>'
      + '<tbody>' + rows + '</tbody></table></div>';
  }

  function settingsCardHtml() {
    const context = state.context;
    const syncState = cloudState();
    const localName = typeof DB !== 'undefined' && DB && DB.business
      ? String(DB.business.name || 'Zola Electronics Zone')
      : 'Zola Electronics Zone';

    const summary = context
      ? '<div class="statline"><span>Business</span><b>' + esc(context.trading_name) + '</b></div>'
        + '<div class="statline"><span>Tenant ID</span><b class="mono" style="font-size:10px">' + esc(context.business_id) + '</b></div>'
        + '<div class="statline"><span>Cloud role</span><b>' + esc(context.member_role) + '</b></div>'
        + '<div class="statline"><span>Primary branch</span><b>' + esc(context.branch_name || 'Not assigned') + '</b></div>'
        + '<div class="statline"><span>Device status</span><b>' + esc(context.device_status || 'ACTIVE') + '</b></div>'
      : '<div class="grid g2">'
        + '<div class="field"><label>Trading name</label><input id="m5TradingName" value="' + attr(localName) + '"></div>'
        + '<div class="field"><label>Legal name (optional)</label><input id="m5LegalName" value="' + attr(localName) + '"></div>'
        + '<div class="field"><label>Primary branch</label><input id="m5BranchName" value="Main Branch"></div>'
        + '<div class="field"><label>Cloud account</label><input value="' + attr(syncState.signedInEmail || 'Not signed in') + '" disabled></div>'
        + '</div>';

    const actions = context
      ? '<button class="btn ghost" onclick="m5a1RefreshCommercialFoundation()">Refresh commercial context</button>'
      : '<button class="btn" onclick="m5a1InitializeCommercialFoundation()">Initialize M5A-1 foundation</button>'
        + '<button class="btn ghost" style="margin-left:8px" onclick="m5a1RefreshCommercialFoundation()">Check SQL/status</button>';

    return '<div class="card" style="margin-top:12px">'
      + '<div class="row" style="justify-content:space-between;align-items:center">'
      + '<h3 style="margin:0">Commercial Foundation M5A-1</h3>' + badge() + '</div>'
      + '<p class="muted" style="font-size:12px;line-height:1.55">'
      + 'Creates the commercial tenant, owner membership, primary branch, registered-device list and immutable audit foundation. '
      + '<b>Cloud Sync M4 remains unchanged in this phase</b>, so the accepted operational system continues to work while the commercial structure is verified.'
      + '</p>'
      + (state.lastError ? '<p style="font-size:12px;color:#fca5a5">' + esc(state.lastError) + '</p>' : '')
      + summary
      + '<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:10px">' + actions + '</div>'
      + '<p class="muted" style="font-size:11px;margin-top:10px">'
      + 'M5A-2 will replace local staff passwords with Supabase Auth identities and enforce tenant roles. '
      + 'Do not onboard an unrelated customer business into this production project until that enforcement release is deployed.'
      + '</p>'
      + devicesHtml()
      + '</div>';
  }

  function installSettingsCard() {
    const original = window.viewSettings;
    if (typeof original !== 'function' || original.__m5a1Wrapped) return;
    const wrapped = function () {
      return original.apply(this, arguments) + settingsCardHtml();
    };
    wrapped.__m5a1Wrapped = true;
    window.viewSettings = wrapped;
  }

  function renderSettingsSafely() {
    try {
      if (typeof currentView !== 'undefined' && currentView === 'settings'
          && typeof render === 'function') render();
    } catch (_) {}
  }

  window.m5a1InitializeCommercialFoundation = function () {
    bootstrap().catch(function (error) {
      if (typeof toast === 'function') toast(friendlyError(error), 'err');
    });
  };
  window.m5a1RefreshCommercialFoundation = function () {
    refresh({ silent: false }).catch(function (error) {
      if (typeof toast === 'function') toast(friendlyError(error), 'err');
    });
  };
  window.m5a1RevokeDevice = function (deviceId) {
    revokeDevice(deviceId).catch(function (error) {
      if (typeof toast === 'function') toast(friendlyError(error), 'err');
    });
  };

  function init() {
    installSettingsCard();
    setTimeout(function () { refresh({ silent: true }); }, 1800);
  }

  window.addEventListener('zezms-cloud-ready', function () {
    setTimeout(function () { refresh({ silent: true }); }, 300);
  });

  ZEZMS.commercialFoundation = {
    version: 'M5A-1',
    build: BUILD,
    refresh: refresh,
    initialize: bootstrap,
    getState: function () {
      return Object.assign({}, state, { devices: devices.slice() });
    },
    settingsCardHtml: settingsCardHtml
  };

  init();
}());
