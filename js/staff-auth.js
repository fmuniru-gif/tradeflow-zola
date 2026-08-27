/* ZEZMS v3.6.5 — Invitation Runtime Fix */
(function () {
  'use strict';

  window.ZEZMS = window.ZEZMS || {};

  const BUILD = '20260808-owner-maintenance-r32';
  const STATE_KEY = 'zezms_m5a2_staff_auth_state';
  const PENDING_INVITE_KEY = 'zezms_m5a2_pending_invite';
  const AUTH_STORAGE_KEY = 'zezms-m5a2-staff-auth';

  const VIEW_ACTIONS = {
    dashboard: 'VIEW_DASHBOARD',
    pos: 'SALE_OUT',
    receipts: 'VIEW_RECEIPTS',
    stockin: 'STOCK_IN',
    products: 'VIEW_PRODUCTS',
    stock: 'VIEW_STOCK',
    cash: 'VIEW_CASH',
    expenses: 'VIEW_EXPENSES',
    accounts: 'VIEW_ACCOUNTS',
    reports: 'VIEW_REPORTS',
    sync: 'MANAGE_SYNC',
    integrity: 'MANAGE_SYNC',
    settings: 'MANAGE_SETTINGS'
  };

  const ROLE_ACTIONS = {
    OWNER: ['*'],
    ADMIN: [
      'LOGIN','VIEW_DASHBOARD','SALE_OUT','VIEW_RECEIPTS','STOCK_IN',
      'VIEW_PRODUCTS','MANAGE_PRODUCTS','VIEW_STOCK','VIEW_CASH','MANAGE_CASH',
      'VIEW_EXPENSES','MANAGE_EXPENSES','VIEW_ACCOUNTS','MANAGE_ACCOUNTS',
      'VIEW_REPORTS','MANAGE_SYNC','MANAGE_SETTINGS','MANAGE_STAFF',
      'UNDO_TRANSACTION','PRICE_ADJUSTMENT','EXPORT_BACKUP','IMPORT_DATA',
      'RESET_DATA','MANAGE_DOCUMENTS','VIEW_AUDIT'
    ],
    MANAGER: [
      'LOGIN','VIEW_DASHBOARD','SALE_OUT','VIEW_RECEIPTS','STOCK_IN',
      'VIEW_PRODUCTS','MANAGE_PRODUCTS','VIEW_STOCK','VIEW_CASH','MANAGE_CASH',
      'VIEW_EXPENSES','MANAGE_EXPENSES','VIEW_ACCOUNTS','MANAGE_ACCOUNTS',
      'VIEW_REPORTS','UNDO_TRANSACTION','PRICE_ADJUSTMENT','EXPORT_BACKUP',
      'MANAGE_DOCUMENTS'
    ],
    CASHIER: ['LOGIN','SALE_OUT','VIEW_RECEIPTS'],
    READ_ONLY: [
      'LOGIN','VIEW_DASHBOARD','VIEW_RECEIPTS','VIEW_PRODUCTS','VIEW_STOCK',
      'VIEW_CASH','VIEW_EXPENSES','VIEW_ACCOUNTS','VIEW_REPORTS','EXPORT_BACKUP'
    ],
    AUDITOR: [
      'LOGIN','VIEW_DASHBOARD','VIEW_RECEIPTS','VIEW_PRODUCTS','VIEW_STOCK',
      'VIEW_CASH','VIEW_EXPENSES','VIEW_ACCOUNTS','VIEW_REPORTS',
      'EXPORT_BACKUP','VIEW_AUDIT'
    ]
  };

  const ACTION_WRAPPERS = {
    quickSaleOut: 'SALE_OUT',
    printReceiptSale: 'SALE_OUT',
    doStockIn: 'STOCK_IN',
    addProduct: 'MANAGE_PRODUCTS',
    saveEditProduct: 'MANAGE_PRODUCTS',
    delProduct: 'MANAGE_PRODUCTS',
    doCashMove: 'MANAGE_CASH',
    addExpense: 'MANAGE_EXPENSES',
    delExpense: 'MANAGE_EXPENSES',
    addAccount: 'MANAGE_ACCOUNTS',
    applySettle: 'MANAGE_ACCOUNTS',
    deleteAccountHolder: 'MANAGE_ACCOUNTS',
    saveElectronicInvoice: 'MANAGE_DOCUMENTS',
    saveElectronicWaybill: 'MANAGE_DOCUMENTS',
    voidCommercialDocument: 'MANAGE_DOCUMENTS',
    waybillFromInvoice: 'MANAGE_DOCUMENTS',
    undoLast: 'UNDO_TRANSACTION',
    undoInventoryTransaction: 'UNDO_TRANSACTION',
    undoLastInventoryTransaction: 'UNDO_TRANSACTION',
    undoAccountTransaction: 'UNDO_TRANSACTION',
    undoLastAccountTransaction: 'UNDO_TRANSACTION',
    undoSelectedAccountTransaction: 'UNDO_TRANSACTION',
    undoCashTransaction: 'UNDO_TRANSACTION',
    undoLastCashTransaction: 'UNDO_TRANSACTION',
    undoSelectedCashTransaction: 'UNDO_TRANSACTION',
    unlockPriceAdj: 'PRICE_ADJUSTMENT',
    saveBiz: 'MANAGE_SETTINGS',
    savePINs: 'MANAGE_SETTINGS',
    addUser: 'MANAGE_STAFF',
    editUser: 'MANAGE_STAFF',
    saveEditUser: 'MANAGE_STAFF',
    deleteUser: 'MANAGE_STAFF',
    resetAll: 'RESET_DATA',
    importDB: 'IMPORT_DATA',
    importExcelWorkbook: 'IMPORT_DATA',
    restoreFromLocal: 'IMPORT_DATA',
    restoreCloudBackupAt: 'IMPORT_DATA',
    m4SaveConfiguration: 'MANAGE_SYNC',
    m4CreateCloudAccount: 'MANAGE_SYNC',
    m4SignIn: 'MANAGE_SYNC',
    m4SignOut: 'MANAGE_SYNC',
    m4BootstrapThisDevice: 'MANAGE_SYNC',
    m4DownloadCloudMaster: 'MANAGE_SYNC'
  };

  const HIGH_RISK = new Set([
    'MANAGE_STAFF','MANAGE_SETTINGS','MANAGE_SYNC','UNDO_TRANSACTION',
    'IMPORT_DATA','RESET_DATA'
  ]);

  let client = null;
  let authSubscription = null;
  let authSession = null;
  let context = null;
  let members = [];
  let invitations = [];
  let factors = [];
  let running = false;
  let wrapped = false;
  let signInFlowPromise = null;
  let mfaPromptPromise = null;
  let authEventTimer = null;
  let explicitPasswordSignIn = false;
  let pendingInlineFactorId = '';
  let pendingInlineFactorName = '';
  let pendingInlineFactors = [];
  let pendingInlineEmail = '';
  let state = loadState();

  function defaults() {
    return {
      version: 2,
      build: BUILD,
      active: false,
      businessId: '',
      lastVerifiedAt: '',
      lastError: '',
      signedInEmail: '',
      contextCache: null
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

  function saveState(patch) {
    state = Object.assign({}, state, patch || {});
    try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch];
    });
  }

  function attr(value) {
    return esc(value).replace(/\n/g, '');
  }

  function normalizeRow(data) {
    return Array.isArray(data) ? (data[0] || null) : (data || null);
  }

  function cloudState() {
    const sync = window.ZEZMS && ZEZMS.cloudSync;
    return sync && typeof sync.getState === 'function' ? sync.getState() : {};
  }

  function m5a1State() {
    try {
      return JSON.parse(localStorage.getItem('zezms_commercial_m5a1_state') || '{}');
    } catch (_) {
      return {};
    }
  }

  function deviceArgs() {
    const cs = cloudState();
    return {
      p_device_id: String(cs.deviceId || ''),
      p_device_name: String(cs.deviceName || 'ZEZMS Device'),
      p_platform: String(navigator.userAgent || '').slice(0, 240),
      p_app_version: typeof APP_VERSION !== 'undefined' ? String(APP_VERSION) : '3.6.5'
    };
  }

  function businessId() {
    if (context && context.business_id) return context.business_id;
    if (state.businessId) return state.businessId;
    if (typeof DB !== 'undefined' && DB && DB.commercialSecurity && DB.commercialSecurity.businessId) {
      return String(DB.commercialSecurity.businessId);
    }
    const foundation = m5a1State();
    return String(foundation.businessId || '');
  }

  function localAuthActive() {
    return !!(
      state.active
      || (typeof DB !== 'undefined' && DB && DB.commercialSecurity
        && DB.commercialSecurity.authMode === 'M5A2')
    );
  }

  function configAvailable() {
    const cs = cloudState();
    return !!(cs.supabaseUrl && cs.publishableKey && window.supabase);
  }

  function redirectUrl(mode) {
    const base = location.origin + location.pathname;
    return base + (mode ? ('?m5a2=' + encodeURIComponent(mode)) : '?m5a2=auth');
  }

  async function buildClient() {
    if (!configAvailable()) {
      client = null;
      return null;
    }
    if (client) return client;

    const cs = cloudState();
    client = window.supabase.createClient(
      String(cs.supabaseUrl).replace(/\/$/, ''),
      String(cs.publishableKey),
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: AUTH_STORAGE_KEY
        }
      }
    );

    const listener = client.auth.onAuthStateChange(function (event, nextSession) {
      authSession = nextSession || null;
      saveState({
        signedInEmail: authSession && authSession.user ? authSession.user.email || '' : ''
      });

      if (event === 'PASSWORD_RECOVERY') {
        setTimeout(openPasswordRecoveryModal, 150);
        return;
      }

      // Login continuation is intentionally controlled by the visible staged
      // buttons. Auth events only keep the stored session current.
      if (event === 'SIGNED_OUT') {
        context = null;
        showLoginMode();
        showPasswordStage('The secure session is signed out. Enter your password to continue.');
      }
    });
    authSubscription = listener && listener.data ? listener.data.subscription : null;

    const current = await client.auth.getSession();
    if (current.error) throw current.error;
    authSession = current.data && current.data.session ? current.data.session : null;
    return client;
  }

  async function waitForClient(timeoutMs) {
    const started = Date.now();
    while (!configAvailable() && Date.now() - started < (timeoutMs || 10000)) {
      await new Promise(function (resolve) { setTimeout(resolve, 150); });
    }
    return buildClient();
  }

  function role() {
    return String(context && context.member_role || session && session.commercialRole || '').toUpperCase();
  }

  function can(action) {
    if (!localAuthActive()) return true;
    const r = role();
    const allowed = ROLE_ACTIONS[r] || [];
    return allowed.indexOf('*') >= 0 || allowed.indexOf(String(action || '').toUpperCase()) >= 0;
  }

  function canView(view) {
    return can(VIEW_ACTIONS[view] || 'LOGIN');
  }

  function fallbackView() {
    if (canView('pos')) return 'pos';
    if (canView('dashboard')) return 'dashboard';
    if (canView('receipts')) return 'receipts';
    return 'pos';
  }

  function isElevatedForViewing() {
    return ['OWNER','ADMIN','MANAGER','READ_ONLY','AUDITOR'].indexOf(role()) >= 0;
  }

  function roleLabel(r) {
    return String(r || '').replace('_', ' ');
  }

  function databaseErrorText(error) {
    if (!error) return 'Unknown error';
    const parts = [];
    if (error.code) parts.push('Code: ' + String(error.code));
    if (error.message) parts.push(String(error.message));
    if (error.details) parts.push('Details: ' + String(error.details));
    if (error.hint) parts.push('Hint: ' + String(error.hint));
    return parts.join(' · ') || String(error);
  }

  function friendlyError(error) {
    const message = databaseErrorText(error);
    const map = [
      [/ZEZMS_INVITATION_INVALID_OR_EXPIRED/i, 'The invitation code is invalid, expired, already used, or belongs to another email address.'],
      [/ZEZMS_MEMBER_EMAIL_EXISTS/i, 'A staff member with that email already exists.'],
      [/ZEZMS_DEVICE_REVOKED/i, 'This device has been revoked for this business.'],
      [/ZEZMS_MEMBER_SUSPENDED/i, 'This staff account is suspended.'],
      [/ZEZMS_MEMBER_REVOKED/i, 'This staff account has been revoked.'],
      [/ZEZMS_PERMISSION_DENIED|ROLE_DENIED/i, 'Your staff role does not permit this action.'],
      [/ZEZMS_LAST_OWNER_PROTECTED/i, 'The final active Owner cannot be suspended or revoked.'],
      [/MFA_REQUIRED/i, 'Authenticator verification is required for this action.'],
      [/mfa_factor_name_conflict|factor with a friendly name.*exist/i, 'An authenticator with that label already exists. This release generates a unique label automatically; press Add authenticator app again.'],
      [/invalid.*(totp|verification code)|challenge.*expired|code.*invalid/i, 'The authenticator code was not accepted. Wait for a fresh code and try again.'],
      [/session.*missing|refresh_token.*not found|invalid refresh token/i, 'The secure session is stale. Select Reset secure login session only, then sign in again.'],
      [/ZEZMS_PGCRYPTO_NOT_INSTALLED|gen_random_bytes.*does not exist|digest.*does not exist|ZEZMS_INVITATION_HASH_FAILED/i, 'The invitation RPC is installed, but its cryptographic runtime could not be resolved. Run SUPABASE_M5A2_INVITATION_CRYPTO_RUNTIME_FIX.sql once.'],
      [/PGRST202|could not find the function.*zezms_m5a2_create_invitation|schema cache.*zezms_m5a2_create_invitation/i, 'The invitation RPC is not visible to the Data API. Run SUPABASE_M5A2_INVITATION_CRYPTO_RUNTIME_FIX.sql once, wait 30 seconds, and retry.']
    ];
    for (const item of map) {
      if (item[0].test(message)) return item[1];
    }
    return message;
  }

  function handleError(error) {
    const message = friendlyError(error);
    console.error('M5A-2:', error);
    saveState({ lastError: message });
    setLoginStatus(message, 'error');
    if (typeof toast === 'function') toast(message, 'err');
  }

  function showLoginMode() {
    const secure = document.getElementById('m5a2SecureLoginPanel');
    const legacy = document.getElementById('m5a2LegacyLoginPanel');
    const active = localAuthActive();
    if (secure) secure.style.display = active ? '' : 'none';
    if (legacy) legacy.style.display = active ? 'none' : '';
  }

  function setLoginStatus(message, type) {
    const box = document.getElementById('m5a2LoginStatus');
    if (!box) return;
    const styles = {
      ok: ['#052e2b', '#2dd4bf', '#ccfbf1'],
      error: ['#3f1017', '#fb7185', '#ffe4e6'],
      working: ['#172554', '#60a5fa', '#dbeafe'],
      info: ['#1e293b', '#475569', '#cbd5e1']
    };
    const chosen = styles[type] || styles.info;
    box.style.background = chosen[0];
    box.style.borderColor = chosen[1];
    box.style.color = chosen[2];
    box.textContent = String(message || '');
  }

  function showPasswordStage(message) {
    const passwordStage = document.getElementById('m5a2PasswordStage');
    const mfaStage = document.getElementById('m5a2AuthenticatorStage');
    if (passwordStage) passwordStage.style.display = '';
    if (mfaStage) mfaStage.style.display = 'none';
    pendingInlineFactorId = '';
    pendingInlineFactorName = '';
    pendingInlineFactors = [];
    if (message) setLoginStatus(message, 'info');
  }

  function factorCreatedAt(factor) {
    const value = factor && (factor.created_at || factor.updated_at);
    const time = value ? new Date(value).getTime() : 0;
    return Number.isFinite(time) ? time : 0;
  }

  function factorDisplayName(factor, index) {
    return String(
      factor && factor.friendly_name
      || ('Authenticator app ' + (Number(index || 0) + 1))
    );
  }

  function selectInlineFactorById(factorId) {
    const selected = pendingInlineFactors.find(function (factor) {
      return String(factor.id || '') === String(factorId || '');
    }) || null;

    pendingInlineFactorId = selected ? String(selected.id || '') : '';
    pendingInlineFactorName = selected
      ? factorDisplayName(selected, pendingInlineFactors.indexOf(selected))
      : '';

    const hint = document.getElementById('m5a2SelectedFactorHint');
    if (hint) {
      hint.textContent = pendingInlineFactorName
        ? 'Use the current code from: ' + pendingInlineFactorName
        : 'Select the exact named entry whose code you will use.';
    }

    const code = document.getElementById('m5a2InlineMfaCode');
    if (code) code.value = '';
    return selected;
  }

  function renderInlineFactorOptions() {
    const select = document.getElementById('m5a2InlineFactorSelect');
    if (!select) return;

    select.innerHTML = pendingInlineFactors.map(function (factor, index) {
      const name = factorDisplayName(factor, index);
      const newest = index === 0 && pendingInlineFactors.length > 1
        ? ' — newest'
        : '';
      return '<option value="' + attr(factor.id || '') + '">'
        + esc(name + newest)
        + '</option>';
    }).join('');

    if (pendingInlineFactors.length) {
      select.value = String(pendingInlineFactors[0].id || '');
      selectInlineFactorById(select.value);
    } else {
      pendingInlineFactorId = '';
      pendingInlineFactorName = '';
    }
  }

  function showAuthenticatorStage(factorList, email) {
    pendingInlineFactors = (Array.isArray(factorList) ? factorList : [])
      .slice()
      .sort(function (a, b) {
        return factorCreatedAt(b) - factorCreatedAt(a);
      });
    pendingInlineEmail = String(email || '');
    const passwordStage = document.getElementById('m5a2PasswordStage');
    const mfaStage = document.getElementById('m5a2AuthenticatorStage');
    if (passwordStage) passwordStage.style.display = 'none';
    if (mfaStage) mfaStage.style.display = '';
    renderInlineFactorOptions();

    const code = document.getElementById('m5a2InlineMfaCode');
    if (code) {
      code.value = '';
      setTimeout(function () { code.focus(); }, 50);
    }

    setLoginStatus(
      'Password accepted for ' + (pendingInlineEmail || 'this account')
      + '. Choose the exact authenticator entry, then enter its current code.',
      'working'
    );
  }

  function setPasswordButtonBusy(busy) {
    const button = document.getElementById('m5a2PasswordSignInBtn');
    if (!button) return;
    button.disabled = !!busy;
    button.textContent = busy ? 'Checking password…' : 'Continue with password';
  }

  function setMfaButtonBusy(busy) {
    const button = document.getElementById('m5a2InlineMfaBtn');
    if (!button) return;
    button.disabled = !!busy;
    button.textContent = busy ? 'Verifying authenticator…' : 'Verify authenticator and open app';
  }

  function purgeLegacySecrets() {
    if (typeof DB === 'undefined' || !DB) return;
    DB.commercialSecurity = Object.assign({}, DB.commercialSecurity || {}, {
      authMode: 'M5A2',
      businessId: businessId(),
      activatedAt: new Date().toISOString()
    });
    if (!DB.security || typeof DB.security !== 'object') DB.security = {};
    if (Array.isArray(DB.security.cashiers)) {
      DB.security.cashiers.forEach(function (cashier) {
        if (!cashier || typeof cashier !== 'object') return;
        delete cashier.password;
        cashier.legacyLoginDisabled = true;
      });
    }
    DB.security.adminPIN = '';
    DB.security.pricePIN = '';
    DB.security.m5a2SecretsPurged = true;
    if (typeof saveDB === 'function') saveDB();
  }

  async function activateOwner() {
    if (running) return;
    const foundation = window.ZEZMS && ZEZMS.commercialFoundation;
    const fs = foundation && typeof foundation.getState === 'function'
      ? foundation.getState()
      : m5a1State();
    const foundationContext = fs.context || {};
    const bid = String(foundationContext.business_id || fs.businessId || businessId());
    if (!bid) {
      if (typeof toast === 'function') toast('Initialize M5A-1 first.', 'err');
      return;
    }
    if (!confirm(
      'Activate individual Supabase Auth staff login for this business?\n\n'
      + 'Local cashier passwords and PINs will be permanently removed from this local database. '
      + 'The OWNER will then sign in using the existing Supabase cloud email and password.'
    )) return;

    running = true;
    try {
      const sync = ZEZMS.cloudSync;
      if (sync && typeof sync.waitUntilReady === 'function') await sync.waitUntilReady(8000);
      const m4Client = sync && typeof sync.getClient === 'function' ? sync.getClient() : null;
      const m4Session = sync && typeof sync.getSession === 'function' ? sync.getSession() : null;
      if (!m4Client || !m4Session || !m4Session.user) {
        throw new Error('Sign in to the existing OWNER cloud account in Cloud Sync M4 first.');
      }

      const displayName = String(
        (document.getElementById('m5a2OwnerName') || {}).value
        || session.cashier || ''
      ).trim();
      const telephone = String(
        (document.getElementById('m5a2OwnerTel') || {}).value
        || session.tel || ''
      ).trim();

      const result = await m4Client.rpc('zezms_m5a2_activate_owner', {
        p_business_id: bid,
        p_display_name: displayName,
        p_telephone: telephone,
        p_device_id: deviceArgs().p_device_id,
        p_app_version: '3.6.0'
      });
      if (result.error) throw result.error;

      saveState({
        active: true,
        businessId: bid,
        lastVerifiedAt: new Date().toISOString(),
        lastError: ''
      });
      purgeLegacySecrets();
      showLoginMode();
      if (typeof toast === 'function') {
        toast('M5A-2 activated. Log out, then use Secure staff sign in.');
      }
      renderSettingsSafely();
    } catch (error) {
      handleError(error);
    } finally {
      running = false;
    }
  }

  async function contextForSession() {
    if (!client || !authSession || !authSession.user) {
      throw new Error('Secure staff session is not available.');
    }
    const args = Object.assign({
      p_business_id: businessId() || null
    }, deviceArgs());
    const result = await client.rpc('zezms_m5a2_auth_context', args);
    if (result.error) throw result.error;
    const row = normalizeRow(result.data);
    if (!row) throw new Error('This Auth account is not an active member of an M5A-2 business.');
    if (String(row.auth_mode) !== 'M5A2') throw new Error('M5A-2 has not been activated for this business.');
    if (String(row.member_status) === 'SUSPENDED') throw new Error('ZEZMS_MEMBER_SUSPENDED');
    if (String(row.member_status) === 'REVOKED') throw new Error('ZEZMS_MEMBER_REVOKED');
    if (String(row.device_status) === 'REVOKED') throw new Error('ZEZMS_DEVICE_REVOKED');
    context = row;
    saveState({
      active: true,
      businessId: row.business_id,
      contextCache: row,
      signedInEmail: row.email || '',
      lastVerifiedAt: new Date().toISOString(),
      lastError: ''
    });
    if (typeof DB !== 'undefined' && DB) {
      DB.commercialSecurity = Object.assign({}, DB.commercialSecurity || {}, {
        authMode: 'M5A2',
        businessId: row.business_id
      });
      if (typeof saveDB === 'function') saveDB();
    }
    return row;
  }

  function mfaRequiredFor(ctx) {
    if (!ctx) return false;
    const policy = String(ctx.mfa_policy || 'OPTIONAL');
    return !!ctx.member_mfa_required
      || policy === 'ALL_REQUIRED'
      || (policy === 'PRIVILEGED_REQUIRED' && ['OWNER','ADMIN'].indexOf(String(ctx.member_role)) >= 0);
  }

  function verifiedTotpFactors(data) {
    const source = data && data.totp ? data.totp : [];
    return (Array.isArray(source) ? source : []).filter(function (factor) {
      return factor && (!factor.status || factor.status === 'verified');
    });
  }

  async function listMfaFactors() {
    if (!client) return [];
    const result = await client.auth.mfa.listFactors();
    if (result.error) throw result.error;
    factors = verifiedTotpFactors(result.data || {}).slice().sort(function (a, b) {
      return factorCreatedAt(b) - factorCreatedAt(a);
    });
    return factors;
  }

  async function prepareInlineMfaOrContinue() {
    const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance.error) throw assurance.error;
    const level = assurance.data || {};

    if (level.currentLevel === 'aal2' || level.nextLevel !== 'aal2') {
      setLoginStatus('Password accepted. Verifying business membership and device…', 'working');
      return continueAfterVerifiedMfa();
    }

    const existing = await listMfaFactors();
    if (!existing.length) {
      throw new Error(
        'The account reports that MFA is required, but no verified authenticator factor was returned.'
      );
    }

    showAuthenticatorStage(
      existing,
      authSession && authSession.user ? authSession.user.email || pendingInlineEmail : pendingInlineEmail
    );
    return false;
  }

  async function continueAfterVerifiedMfa() {
    const pendingRaw = localStorage.getItem(PENDING_INVITE_KEY);
    if (pendingRaw) {
      const pending = JSON.parse(pendingRaw);
      if (pending && pending.code) {
        const claim = await client.rpc(
          'zezms_m5a2_claim_invitation',
          Object.assign({ p_invite_code: pending.code }, deviceArgs())
        );
        if (claim.error) throw claim.error;
        localStorage.removeItem(PENDING_INVITE_KEY);
        context = normalizeRow(claim.data);
        saveState({
          active: true,
          businessId: context.business_id,
          contextCache: context
        });
      }
    }

    const ctx = await contextForSession();
    const mfaOk = await ensureMfa(ctx, false);
    if (!mfaOk) return false;
    const refreshed = await contextForSession();

    setLoginStatus('Identity, role and device verified. Opening ZEZMS…', 'ok');
    await establishAppSession(refreshed);
    return true;
  }

  async function challengeFactor(factorId, title) {
    if (mfaPromptPromise) return mfaPromptPromise;

    mfaPromptPromise = new Promise(function (resolve) {
      openModal(
        '<h3>' + esc(title || 'Authenticator verification') + '</h3>'
        + '<p class="muted">Enter the current six-digit code from your authenticator app.</p>'
        + '<div class="field"><label>Authenticator code</label>'
        + '<input id="m5a2MfaCode" inputmode="numeric" autocomplete="one-time-code" maxlength="8"></div>'
        + '<div class="row"><button class="btn" id="m5a2VerifyMfaBtn">Verify and continue</button>'
        + '<button class="btn ghost" id="m5a2CancelMfaBtn">Cancel</button></div>'
      );

      const codeField = document.getElementById('m5a2MfaCode');
      if (codeField) setTimeout(function () { codeField.focus(); }, 50);

      document.getElementById('m5a2CancelMfaBtn').onclick = function () {
        closeModal();
        mfaPromptPromise = null;
        resolve(false);
      };

      document.getElementById('m5a2VerifyMfaBtn').onclick = async function () {
        const code = String((document.getElementById('m5a2MfaCode') || {}).value || '').trim();
        if (!/^\d{6,8}$/.test(code)) {
          if (typeof toast === 'function') toast('Enter the current authenticator code.', 'err');
          return;
        }

        const button = document.getElementById('m5a2VerifyMfaBtn');
        if (button) button.disabled = true;

        try {
          const verified = await client.auth.mfa.challengeAndVerify({
            factorId: factorId,
            code: code
          });
          if (verified.error) throw verified.error;

          if (verified.data && verified.data.session) {
            authSession = verified.data.session;
          } else {
            const current = await client.auth.getSession();
            if (!current.error && current.data) {
              authSession = current.data.session || authSession;
            }
          }

          closeModal();
          mfaPromptPromise = null;
          resolve(true);
        } catch (error) {
          if (button) button.disabled = false;
          if (typeof toast === 'function') toast(friendlyError(error), 'err');
        }
      };
    });

    return mfaPromptPromise;
  }

  async function ensureExistingFactorMfa() {
    if (!client) return false;
    const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance.error) throw assurance.error;
    const level = assurance.data || {};

    if (level.currentLevel === 'aal2') return true;
    if (level.nextLevel !== 'aal2') return true;

    const existing = await listMfaFactors();
    if (!existing.length) return true;
    return challengeFactor(existing[0].id, 'Complete secure staff sign in');
  }

  async function ensureMfa(ctx, force) {
    if (!client) return false;

    const existingVerified = await ensureExistingFactorMfa();
    if (!existingVerified) return false;

    const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance.error) throw assurance.error;
    const level = assurance.data || {};
    const required = force || mfaRequiredFor(ctx);

    if (!required || level.currentLevel === 'aal2') return true;

    const existing = await listMfaFactors();
    if (existing.length) {
      return challengeFactor(existing[0].id, 'Authenticator verification required');
    }

    const enrolled = await enrollMfa(true);
    if (!enrolled) return false;
    const retry = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    return !retry.error && retry.data && retry.data.currentLevel === 'aal2';
  }

  async function establishAppSession(ctx) {
    const commercialRole = String(ctx.member_role || 'CASHIER').toUpperCase();
    session.cashier = ctx.display_name || ctx.email || 'Staff';
    session.tel = ctx.telephone || '';
    session.role = ['OWNER','ADMIN','MANAGER','READ_ONLY','AUDITOR'].indexOf(commercialRole) >= 0
      ? 'ADMIN'
      : 'CASHIER2';
    session.sig = ctx.signature_file || '';
    session.isCashier2 = commercialRole === 'CASHIER';
    session.adminMode = false;
    session.commercialRole = commercialRole;
    session.authUserId = ctx.user_id;
    session.businessId = ctx.business_id;
    session.branchId = ctx.branch_id;
    session.staffEmail = ctx.email || '';

    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appShell').style.display = 'flex';
    updateUserBadge();
    applyRoleUI();
    updatePeriodUI();
    const landing = fallbackView();
    nav(landing);
    if (typeof toast === 'function') toast('Welcome, ' + String(session.cashier).split(' ')[0] + '!');
  }

  async function signInFromLogin() {
    if (running) {
      setLoginStatus('A login request is already in progress. Please wait.', 'working');
      return;
    }

    running = true;
    explicitPasswordSignIn = true;
    setPasswordButtonBusy(true);

    try {
      setLoginStatus('Connecting to the secure authentication service…', 'working');
      await waitForClient(10000);
      if (!client) throw new Error('Supabase configuration is unavailable on this device.');

      const email = String((document.getElementById('m5a2LoginEmail') || {}).value || '').trim();
      const password = String((document.getElementById('m5a2LoginPassword') || {}).value || '');
      if (!email || !password) throw new Error('Enter your staff email and password.');

      pendingInlineEmail = email;
      setLoginStatus('Checking the email and password…', 'working');

      const result = await client.auth.signInWithPassword({
        email: email,
        password: password
      });
      if (result.error) throw result.error;
      if (!result.data || !result.data.session) {
        throw new Error('Password authentication did not return a usable session.');
      }

      authSession = result.data.session;
      saveState({ signedInEmail: email, lastError: '' });
      setLoginStatus('Password accepted. Checking authenticator requirements…', 'ok');
      await prepareInlineMfaOrContinue();
    } catch (error) {
      const message = friendlyError(error);
      setLoginStatus(message, 'error');
      handleError(error);
      showPasswordStage();
    } finally {
      explicitPasswordSignIn = false;
      running = false;
      setPasswordButtonBusy(false);
    }
  }

  async function verifyInlineMfa() {
    if (running) {
      setLoginStatus('A verification request is already in progress. Please wait.', 'working');
      return;
    }

    const code = String((document.getElementById('m5a2InlineMfaCode') || {}).value || '').trim();
    const select = document.getElementById('m5a2InlineFactorSelect');
    if (select && select.value) selectInlineFactorById(select.value);

    if (!pendingInlineFactorId) {
      setLoginStatus('Select an authenticator entry before entering its code.', 'error');
      return;
    }
    if (!/^\d{6,8}$/.test(code)) {
      setLoginStatus('Enter the current six-digit code from the authenticator app.', 'error');
      return;
    }

    running = true;
    setMfaButtonBusy(true);
    setLoginStatus(
      'Verifying the code for ' + (pendingInlineFactorName || 'the selected authenticator') + '…',
      'working'
    );

    try {
      const verified = await client.auth.mfa.challengeAndVerify({
        factorId: pendingInlineFactorId,
        code: code
      });
      if (verified.error) throw verified.error;

      if (verified.data && verified.data.session) {
        authSession = verified.data.session;
      } else {
        const current = await client.auth.getSession();
        if (current.error) throw current.error;
        authSession = current.data && current.data.session ? current.data.session : authSession;
      }

      const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assurance.error) throw assurance.error;
      if (!assurance.data || assurance.data.currentLevel !== 'aal2') {
        throw new Error('Authenticator verification completed, but the session was not promoted to aal2.');
      }

      const verifiedFactorName = pendingInlineFactorName;
      pendingInlineFactorId = '';
      pendingInlineFactorName = '';
      setLoginStatus(
        'Authenticator accepted: ' + (verifiedFactorName || 'selected factor')
        + '. Verifying business membership and device…',
        'ok'
      );
      await continueAfterVerifiedMfa();
    } catch (error) {
      const message = friendlyError(error);
      setLoginStatus(message, 'error');
      handleError(error);
      const field = document.getElementById('m5a2InlineMfaCode');
      if (field) {
        field.value = '';
        field.focus();
      }
    } finally {
      running = false;
      setMfaButtonBusy(false);
    }
  }

  async function resumeSignIn() {
    try {
      setLoginStatus('Checking the existing secure session…', 'working');
      await waitForClient(10000);
      const current = await client.auth.getSession();
      if (current.error) throw current.error;
      authSession = current.data && current.data.session ? current.data.session : null;

      if (!authSession) {
        throw new Error('No pending secure session exists. Enter your email and password first.');
      }

      pendingInlineEmail = authSession.user && authSession.user.email
        ? authSession.user.email
        : pendingInlineEmail;
      await prepareInlineMfaOrContinue();
    } catch (error) {
      const message = friendlyError(error);
      setLoginStatus(message, 'error');
      handleError(error);
      showPasswordStage();
    }
  }

  function selectInlineFactor() {
    const select = document.getElementById('m5a2InlineFactorSelect');
    if (!select) return;
    const selected = selectInlineFactorById(select.value);
    if (selected) {
      setLoginStatus(
        'Selected: ' + pendingInlineFactorName
        + '. Enter the current code from that exact authenticator entry.',
        'info'
      );
    }
  }

  async function refreshInlineFactors() {
    try {
      setLoginStatus('Refreshing verified authenticator entries…', 'working');
      const existing = await listMfaFactors();
      if (!existing.length) {
        throw new Error('No verified authenticator factor was returned.');
      }
      showAuthenticatorStage(existing, pendingInlineEmail);
    } catch (error) {
      handleError(error);
    }
  }

  function returnToPassword() {
    showPasswordStage('Enter the password again to create a fresh authenticator challenge.');
  }

  function clearStaffAuthStorage() {
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key === AUTH_STORAGE_KEY || key.indexOf(AUTH_STORAGE_KEY) === 0)) {
          keys.push(key);
        }
      }
      keys.forEach(function (key) { localStorage.removeItem(key); });
    } catch (_) {}
  }

  async function resetSecureSession() {
    if (!confirm(
      'Reset only the secure staff-login session on this device?\n\n'
      + 'This does not clear ZEZMS business data, M4 cloud configuration, backups, or the enrolled authenticator.'
    )) return;

    try {
      if (client) await client.auth.signOut({ scope: 'local' });
    } catch (_) {}

    clearStaffAuthStorage();
    authSession = null;
    context = null;
    signInFlowPromise = null;
    mfaPromptPromise = null;
    saveState({ signedInEmail: '', lastError: '' });
    showLoginMode();
    showPasswordStage('Secure login session reset on this device. Enter your email and password.');

    if (typeof toast === 'function') {
      toast('Secure login session reset on this device.');
    }
  }

  async function signOut() {
    try {
      // Supabase defaults to global sign-out. Use local scope so other devices
      // and the separate M4 session are not revoked.
      if (client) await client.auth.signOut({ scope: 'local' });
    } catch (_) {}

    authSession = null;
    context = null;
    session = {
      cashier:null, tel:null, role:null, adminMode:false,
      sig:null, isCashier2:false
    };
    cart = [];
    priceAdjUnlocked = false;

    document.getElementById('appShell').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';

    const pass = document.getElementById('m5a2LoginPassword');
    if (pass) pass.value = '';
    showLoginMode();
    showPasswordStage('Signed out on this device. Enter your email and password to continue.');
  }

  async function forgotPassword() {
    try {
      await waitForClient(10000);
      const emailField = document.getElementById('m5a2LoginEmail');
      let email = String(emailField && emailField.value || '').trim();
      if (!email) email = String(prompt('Staff email for password recovery', '') || '').trim();
      if (!email) return;
      const result = await client.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl('recovery')
      });
      if (result.error) throw result.error;
      if (typeof toast === 'function') toast('Password recovery email sent. Check the inbox.');
    } catch (error) {
      handleError(error);
    }
  }

  function openPasswordRecoveryModal() {
    openModal(
      '<h3>Set a new staff password</h3>'
      + '<div class="field"><label>New password</label>'
      + '<input id="m5a2RecoveryPassword" type="password" autocomplete="new-password"></div>'
      + '<div class="field"><label>Confirm new password</label>'
      + '<input id="m5a2RecoveryConfirm" type="password" autocomplete="new-password"></div>'
      + '<div class="row"><button class="btn" onclick="m5a2CompletePasswordRecovery()">Update password</button>'
      + '<button class="btn ghost" onclick="closeModal()">Cancel</button></div>'
    );
  }

  async function completePasswordRecovery() {
    try {
      const password = String((document.getElementById('m5a2RecoveryPassword') || {}).value || '');
      const confirmPassword = String((document.getElementById('m5a2RecoveryConfirm') || {}).value || '');
      if (password.length < 8) throw new Error('Password must be at least 8 characters.');
      if (password !== confirmPassword) throw new Error('The two passwords do not match.');
      const result = await client.auth.updateUser({ password: password });
      if (result.error) throw result.error;
      closeModal();
      if (typeof toast === 'function') toast('Password updated successfully.');
    } catch (error) {
      handleError(error);
    }
  }

  function openInvitation() {
    openModal(
      '<h3>Accept staff invitation</h3>'
      + '<p class="muted">Use the email and one-time code supplied by the business Owner or Admin.</p>'
      + '<div class="field"><label>Invitation code</label>'
      + '<input id="m5a2InviteCode" placeholder="TF-XXXX-XXXX-XXXX" autocomplete="one-time-code"></div>'
      + '<div class="field"><label>Invited email</label>'
      + '<input id="m5a2InviteEmail" type="email" autocomplete="username"></div>'
      + '<div class="field"><label>Password</label>'
      + '<input id="m5a2InvitePassword" type="password" autocomplete="new-password"></div>'
      + '<div class="row" style="gap:8px;flex-wrap:wrap">'
      + '<button class="btn" onclick="m5a2CreateAccountAndClaim()">Create account</button>'
      + '<button class="btn ghost" onclick="m5a2SignInAndClaim()">I already have an account</button>'
      + '<button class="btn ghost" onclick="closeModal()">Cancel</button></div>'
    );
  }

  function invitationValues() {
    return {
      code: String((document.getElementById('m5a2InviteCode') || {}).value || '').trim(),
      email: String((document.getElementById('m5a2InviteEmail') || {}).value || '').trim(),
      password: String((document.getElementById('m5a2InvitePassword') || {}).value || '')
    };
  }

  async function claimCurrentInvitation(code) {
    const result = await client.rpc(
      'zezms_m5a2_claim_invitation',
      Object.assign({ p_invite_code: code }, deviceArgs())
    );
    if (result.error) throw result.error;
    localStorage.removeItem(PENDING_INVITE_KEY);
    context = normalizeRow(result.data);
    saveState({
      active: true,
      businessId: context.business_id,
      contextCache: context
    });
    closeModal();
    const mfaOk = await ensureMfa(context, false);
    if (!mfaOk) return;
    await establishAppSession(await contextForSession());
  }

  async function createAccountAndClaim() {
    try {
      await waitForClient(10000);
      const values = invitationValues();
      if (!values.code || !values.email || values.password.length < 8) {
        throw new Error('Enter the invitation code, invited email and a password of at least 8 characters.');
      }
      localStorage.setItem(PENDING_INVITE_KEY, JSON.stringify({
        code: values.code,
        email: values.email,
        createdAt: new Date().toISOString()
      }));
      const result = await client.auth.signUp({
        email: values.email,
        password: values.password,
        options: { emailRedirectTo: redirectUrl('invitation') }
      });
      if (result.error) throw result.error;
      authSession = result.data && result.data.session ? result.data.session : null;
      if (authSession) {
        await claimCurrentInvitation(values.code);
      } else {
        closeModal();
        if (typeof toast === 'function') {
          toast('Account created. Confirm the email, then return and sign in to complete the invitation.');
        }
      }
    } catch (error) {
      handleError(error);
    }
  }

  async function signInAndClaim() {
    try {
      await waitForClient(10000);
      const values = invitationValues();
      if (!values.code || !values.email || !values.password) {
        throw new Error('Enter the invitation code, email and password.');
      }
      const signIn = await client.auth.signInWithPassword({
        email: values.email,
        password: values.password
      });
      if (signIn.error) throw signIn.error;
      authSession = signIn.data.session;
      await claimCurrentInvitation(values.code);
    } catch (error) {
      handleError(error);
    }
  }

  function safeFactorLabelPart(value, fallback) {
    const cleaned = String(value || '')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return (cleaned || fallback || '').slice(0, 42);
  }

  function allTotpFactors(data) {
    const list = data && data.totp ? data.totp : [];
    return Array.isArray(list) ? list.filter(Boolean) : [];
  }

  async function uniqueMfaFriendlyName() {
    const businessName = safeFactorLabelPart(
      context && context.trading_name,
      'ZEZMS Business'
    );
    const cloudDevice = cloudState();
    const deviceName = safeFactorLabelPart(
      cloudDevice && cloudDevice.deviceName,
      'Backup'
    );

    const base = 'ZEZMS ' + businessName;
    const preferred = base + ' · ' + deviceName;

    const listed = await client.auth.mfa.listFactors();
    if (listed.error) throw listed.error;

    const used = new Set(
      allTotpFactors(listed.data || {}).map(function (factor) {
        return String(factor.friendly_name || '').trim().toLowerCase();
      }).filter(Boolean)
    );

    if (!used.has(preferred.toLowerCase())) return preferred;

    for (let number = 2; number <= 20; number++) {
      const candidate = preferred + ' ' + number;
      if (!used.has(candidate.toLowerCase())) return candidate;
    }

    return preferred + ' ' + Date.now().toString(36).toUpperCase().slice(-6);
  }

  async function enrollTotpWithUniqueName() {
    let friendlyName = await uniqueMfaFriendlyName();
    let result = await client.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: friendlyName
    });

    const conflict = result.error && (
      String(result.error.code || '').toLowerCase() === 'mfa_factor_name_conflict'
      || /factor with a friendly name.*exist/i.test(String(result.error.message || ''))
    );

    if (conflict) {
      friendlyName = await uniqueMfaFriendlyName();
      friendlyName += ' ' + Date.now().toString(36).toUpperCase().slice(-4);
      result = await client.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: friendlyName
      });
    }

    return {
      result: result,
      friendlyName: friendlyName
    };
  }

  async function enrollMfa(required) {
    try {
      await waitForClient(10000);
      if (!authSession) throw new Error('Sign in before enrolling an authenticator.');
      const enrollment = await enrollTotpWithUniqueName();
      const enrolled = enrollment.result;
      const friendlyName = enrollment.friendlyName;
      if (enrolled.error) throw enrolled.error;
      const data = enrolled.data || {};
      const qr = data.totp && data.totp.qr_code ? data.totp.qr_code : '';
      const secret = data.totp && data.totp.secret ? data.totp.secret : '';
      const factorId = data.id;

      return new Promise(function (resolve) {
        openModal(
          '<h3>Set up an authenticator app</h3>'
          + '<p class="muted">Scan the QR code using an authenticator app, then enter its six-digit code.</p>'
          + '<div class="statline"><span>Factor label</span><b>' + esc(friendlyName) + '</b></div>'
          + (qr ? '<div style="text-align:center"><img alt="MFA QR code" src="' + attr(qr) + '" style="width:210px;max-width:100%;background:white;padding:10px;border-radius:12px"></div>' : '')
          + (secret ? '<div class="field"><label>Manual secret</label><input value="' + attr(secret) + '" readonly class="mono"></div>' : '')
          + '<div class="field"><label>Verification code</label><input id="m5a2EnrollMfaCode" inputmode="numeric" autocomplete="one-time-code" maxlength="8"></div>'
          + '<div class="row"><button class="btn" id="m5a2EnableMfaBtn">Enable</button>'
          + '<button class="btn ghost" id="m5a2CancelEnrollMfaBtn">' + (required ? 'Not now' : 'Cancel') + '</button></div>'
        );

        document.getElementById('m5a2CancelEnrollMfaBtn').onclick = async function () {
          try { await client.auth.mfa.unenroll({ factorId: factorId }); } catch (_) {}
          closeModal();
          resolve(false);
        };
        document.getElementById('m5a2EnableMfaBtn').onclick = async function () {
          try {
            const code = String((document.getElementById('m5a2EnrollMfaCode') || {}).value || '').trim();
            const challenge = await client.auth.mfa.challenge({ factorId: factorId });
            if (challenge.error) throw challenge.error;
            const verify = await client.auth.mfa.verify({
              factorId: factorId,
              challengeId: challenge.data.id,
              code: code
            });
            if (verify.error) throw verify.error;
            closeModal();
            await listMfaFactors();
            if (typeof toast === 'function') toast('Authenticator MFA enabled: ' + friendlyName);
            renderSettingsSafely();
            resolve(true);
          } catch (error) {
            handleError(error);
          }
        };
      });
    } catch (error) {
      handleError(error);
      return false;
    }
  }

  async function unenrollMfa(factorId) {
    try {
      if (mfaRequiredFor(context) && factors.length <= 1) {
        throw new Error('MFA is required for this account. Enroll a replacement factor before removing the final factor.');
      }
      if (!confirm('Remove this authenticator factor?')) return;
      const result = await client.auth.mfa.unenroll({ factorId: factorId });
      if (result.error) throw result.error;
      await listMfaFactors();
      renderSettingsSafely();
      if (typeof toast === 'function') toast('Authenticator factor removed.');
    } catch (error) {
      handleError(error);
    }
  }

  async function serverAuthorize(action, forceAal2) {
    if (!localAuthActive()) return true;
    if (!can(action)) {
      if (typeof toast === 'function') toast('Your staff role cannot perform this action.', 'err');
      return false;
    }

    if (!navigator.onLine && HIGH_RISK.has(action)) {
      if (typeof toast === 'function') toast('This high-risk action requires an online staff authorization check.', 'err');
      return false;
    }

    if (!navigator.onLine) return true;
    try {
      await waitForClient(6000);
      if (!client || !authSession || !context) return false;
      const result = await client.rpc('zezms_m5a2_authorize', {
        p_business_id: context.business_id,
        p_action: action,
        p_device_id: deviceArgs().p_device_id,
        p_require_aal2: !!forceAal2
      });
      if (result.error) throw result.error;
      const row = normalizeRow(result.data);
      if (!row || !row.allowed) {
        if (row && row.reason === 'MFA_REQUIRED') {
          const ok = await ensureMfa(context, true);
          if (!ok) return false;
          return serverAuthorize(action, forceAal2);
        }
        throw new Error(row && row.reason || 'Authorization denied.');
      }
      return true;
    } catch (error) {
      handleError(error);
      return false;
    }
  }

  async function confirmSensitive(title) {
    const action = /price/i.test(String(title || '')) ? 'PRICE_ADJUSTMENT' : 'UNDO_TRANSACTION';
    if (!await serverAuthorize(action, HIGH_RISK.has(action))) return false;
    return confirm(
      String(title || 'Confirm action') + '\n\n'
      + 'Authorized staff: ' + (context && context.display_name || session.cashier || '')
      + '\nRole: ' + roleLabel(role())
    );
  }

  function wrapAction(name, action) {
    const original = window[name];
    if (typeof original !== 'function' || original.__m5a2Wrapped) return;
    const wrapper = async function () {
      if (!localAuthActive()) return original.apply(this, arguments);
      const allowed = await serverAuthorize(action, HIGH_RISK.has(action));
      if (!allowed) return false;
      return original.apply(this, arguments);
    };
    wrapper.__m5a2Wrapped = true;
    wrapper.__m5a2Original = original;
    window[name] = wrapper;
  }

  function installActionGuards() {
    if (wrapped) return;
    Object.keys(ACTION_WRAPPERS).forEach(function (name) {
      wrapAction(name, ACTION_WRAPPERS[name]);
    });
    wrapped = true;
  }

  function applyRoleUI() {
    const currentRole = role();
    document.querySelectorAll('#mainNav button[data-view]').forEach(function (button) {
      button.style.display = canView(button.dataset.view) ? '' : 'none';
    });
    document.querySelectorAll('#mainNav .sec').forEach(function (section) {
      section.style.display = currentRole === 'CASHIER' ? 'none' : '';
    });
    const adminButton = document.getElementById('navAdminMode');
    if (adminButton) adminButton.style.display = 'none';
    updateUserBadge();
  }

  function updateUserBadge() {
    const name = document.getElementById('uiUserName');
    const badge = document.getElementById('uiUserRole');
    if (name) name.textContent = session.cashier || context && context.display_name || '—';
    if (badge) {
      badge.textContent = roleLabel(role());
      badge.className = role() === 'CASHIER' ? 'badge cashier' : 'badge admin';
    }
  }

  function afterRender() {
    const legacyPins = document.getElementById('legacyPinSecurityCard');
    const legacyUsers = document.getElementById('legacyLocalUsersCard');
    if (legacyPins) legacyPins.remove();
    if (legacyUsers) legacyUsers.remove();

    if (['READ_ONLY','AUDITOR'].indexOf(role()) >= 0) {
      const mutationNames = Object.keys(ACTION_WRAPPERS);
      document.querySelectorAll('#viewRoot button[onclick]').forEach(function (button) {
        const code = String(button.getAttribute('onclick') || '');
        if (mutationNames.some(function (name) { return code.indexOf(name + '(') >= 0; })) {
          button.style.display = 'none';
        }
      });
      document.querySelectorAll('#viewRoot input:not([type="search"]), #viewRoot select, #viewRoot textarea').forEach(function (field) {
        if (!field.closest('.period-selector') && !field.id.startsWith('receiptNameSearch') && !field.id.startsWith('stockSearch')) {
          field.disabled = true;
        }
      });
    }
  }

  async function loadAdministrationData() {
    if (!client || !context || !can('MANAGE_STAFF')) {
      members = [];
      invitations = [];
      return;
    }
    const memberResult = await client
      .from('zezms_business_members')
      .select('business_id,user_id,email,display_name,telephone,role,status,mfa_required,last_login_at,last_device_id,default_branch_id,created_at')
      .eq('business_id', context.business_id)
      .order('created_at', { ascending: true });
    if (memberResult.error) throw memberResult.error;
    members = Array.isArray(memberResult.data) ? memberResult.data : [];

    const inviteResult = await client
      .from('zezms_business_invitations')
      .select('id,email,display_name,telephone,role,status,mfa_required,expires_at,created_at')
      .eq('business_id', context.business_id)
      .order('created_at', { ascending: false });
    if (inviteResult.error) throw inviteResult.error;
    invitations = Array.isArray(inviteResult.data) ? inviteResult.data : [];
  }

  function memberRowsHtml() {
    return members.map(function (member) {
      const isSelf = authSession && authSession.user && member.user_id === authSession.user.id;
      const canManage = can('MANAGE_STAFF') && !(role() === 'ADMIN' && member.role === 'OWNER');
      return '<tr>'
        + '<td>' + esc(member.display_name || '—') + (isSelf ? ' <span class="badge ok">YOU</span>' : '') + '</td>'
        + '<td>' + esc(member.email || '—') + '</td>'
        + '<td>' + esc(roleLabel(member.role)) + '</td>'
        + '<td>' + esc(member.status) + '</td>'
        + '<td>' + (member.mfa_required ? 'Required' : 'Optional') + '</td>'
        + '<td style="font-size:11px">' + esc(member.last_login_at ? new Date(member.last_login_at).toLocaleString() : 'Never') + '</td>'
        + '<td>' + (canManage
          ? '<button class="btn sm ghost" onclick="m5a2EditMember(\'' + attr(member.user_id) + '\')">Manage</button>'
          : '—') + '</td>'
        + '</tr>';
    }).join('') || '<tr><td colspan="7" class="empty">No staff members returned.</td></tr>';
  }

  function invitationRowsHtml() {
    return invitations.slice(0, 30).map(function (invite) {
      return '<tr>'
        + '<td>' + esc(invite.display_name || '—') + '</td>'
        + '<td>' + esc(invite.email) + '</td>'
        + '<td>' + esc(roleLabel(invite.role)) + '</td>'
        + '<td>' + esc(invite.status) + '</td>'
        + '<td style="font-size:11px">' + esc(invite.expires_at ? new Date(invite.expires_at).toLocaleString() : '—') + '</td>'
        + '<td>' + (invite.status === 'PENDING'
          ? '<button class="btn sm danger" onclick="m5a2RevokeInvitation(\'' + attr(invite.id) + '\')">Revoke</button>'
          : '—') + '</td>'
        + '</tr>';
    }).join('') || '<tr><td colspan="6" class="empty">No invitations yet.</td></tr>';
  }

  function factorRowsHtml() {
    const sorted = factors.slice().sort(function (a, b) {
      return factorCreatedAt(b) - factorCreatedAt(a);
    });
    return sorted.map(function (factor, index) {
      const newest = index === 0 && sorted.length > 1
        ? ' <span class="badge ok">NEWEST</span>'
        : '';
      return '<div class="statline"><span>'
        + esc(factor.friendly_name || 'Authenticator app')
        + newest
        + '</span><span><b>' + esc(factor.status || 'verified') + '</b> '
        + '<button class="btn sm danger" onclick="m5a2UnenrollMfa(\'' + attr(factor.id) + '\')">Remove</button></span></div>';
    }).join('') || '<p class="muted" style="font-size:12px">No authenticator factor enrolled.</p>';
  }

  function settingsCardHtml() {
    if (!localAuthActive()) {
      const foundation = m5a1State();
      return '<div class="card" style="margin-top:12px">'
        + '<div class="row" style="justify-content:space-between"><h3 style="margin:0">M5A-2 Auth and Staff Security</h3>'
        + '<span class="badge warn">NOT ACTIVATED</span></div>'
        + '<p class="muted" style="font-size:12px;line-height:1.5">'
        + 'Replaces local cashier passwords and PINs with individual Supabase Auth identities. '
        + 'Run <code>SUPABASE_M5A2_AUTH_STAFF_SECURITY.sql</code> before activation.'
        + '</p>'
        + '<div class="grid g2">'
        + '<div class="field"><label>Owner display name</label><input id="m5a2OwnerName" value="' + attr(session.cashier || '') + '"></div>'
        + '<div class="field"><label>Owner telephone</label><input id="m5a2OwnerTel" value="' + attr(session.tel || '') + '"></div>'
        + '</div>'
        + '<div class="statline"><span>M5A-1 Tenant ID</span><b class="mono" style="font-size:10px">' + esc(foundation.businessId || 'Not detected') + '</b></div>'
        + '<button class="btn warn" onclick="m5a2ActivateOwner()">Activate secure staff login</button>'
        + '<p class="muted" style="font-size:11px;margin-top:10px">'
        + 'Activation removes passwords and PINs from the local database. Make a fresh backup first.'
        + '</p></div>';
    }

    if (!context) {
      return '<div class="card" style="margin-top:12px"><h3>M5A-2 Auth and Staff Security</h3>'
        + '<p class="muted">Secure login is active. Sign in through the login page to manage staff security.</p></div>';
    }

    const adminSection = can('MANAGE_STAFF')
      ? '<hr class="hr"><h3>Invite staff</h3>'
        + '<div class="grid g2">'
        + '<div class="field"><label>Full name</label><input id="m5a2InviteNewName"></div>'
        + '<div class="field"><label>Email</label><input id="m5a2InviteNewEmail" type="email"></div>'
        + '<div class="field"><label>Telephone</label><input id="m5a2InviteNewTel"></div>'
        + '<div class="field"><label>Role</label><select id="m5a2InviteNewRole">'
        + '<option>ADMIN</option><option>MANAGER</option><option selected>CASHIER</option>'
        + '<option>READ_ONLY</option><option>AUDITOR</option></select></div>'
        + '<div class="field"><label>MFA requirement</label><select id="m5a2InviteNewMfa">'
        + '<option value="0">Optional</option><option value="1">Required</option></select></div>'
        + '<div class="field"><label>Expires after</label><select id="m5a2InviteNewExpiry">'
        + '<option value="24">24 hours</option><option value="72">3 days</option>'
        + '<option value="168" selected>7 days</option><option value="336">14 days</option></select></div>'
        + '</div><button class="btn" onclick="m5a2CreateInvitation()">Create invitation code</button>'
        + '<hr class="hr"><h3>Staff members</h3>'
        + '<div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th>'
        + '<th>Status</th><th>MFA</th><th>Last login</th><th>Action</th></tr></thead>'
        + '<tbody>' + memberRowsHtml() + '</tbody></table></div>'
        + '<hr class="hr"><h3>Invitations</h3>'
        + '<div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th>'
        + '<th>Status</th><th>Expires</th><th>Action</th></tr></thead>'
        + '<tbody>' + invitationRowsHtml() + '</tbody></table></div>'
      : '';

    const policySection = role() === 'OWNER'
      ? '<hr class="hr"><h3>Business MFA policy</h3>'
        + '<div class="row" style="gap:8px;flex-wrap:wrap">'
        + '<select id="m5a2MfaPolicy">'
        + '<option value="OPTIONAL" ' + (context.mfa_policy === 'OPTIONAL' ? 'selected' : '') + '>Optional</option>'
        + '<option value="PRIVILEGED_REQUIRED" ' + (context.mfa_policy === 'PRIVILEGED_REQUIRED' ? 'selected' : '') + '>Required for Owner/Admin</option>'
        + '<option value="ALL_REQUIRED" ' + (context.mfa_policy === 'ALL_REQUIRED' ? 'selected' : '') + '>Required for all staff</option>'
        + '</select><button class="btn ghost" onclick="m5a2SaveMfaPolicy()">Save MFA policy</button></div>'
      : '';

    return '<div class="card" style="margin-top:12px">'
      + '<div class="row" style="justify-content:space-between"><h3 style="margin:0">M5A-2 Auth and Staff Security</h3>'
      + '<span class="badge ok">SECURE LOGIN ACTIVE</span></div>'
      + '<div class="statline"><span>Signed-in staff</span><b>' + esc(context.display_name) + '</b></div>'
      + '<div class="statline"><span>Email</span><b>' + esc(context.email) + '</b></div>'
      + '<div class="statline"><span>Role</span><b>' + esc(roleLabel(context.member_role)) + '</b></div>'
      + '<div class="statline"><span>Branch</span><b>' + esc(context.branch_name || 'Not assigned') + '</b></div>'
      + '<div class="statline"><span>MFA policy</span><b>' + esc(context.mfa_policy) + '</b></div>'
      + '<hr class="hr"><h3>My authenticator factors</h3>'
      + factorRowsHtml()
      + '<button class="btn ghost" onclick="m5a2EnrollMfa()">Add authenticator app</button>'
      + policySection + adminSection
      + '<p class="muted" style="font-size:11px;margin-top:12px">'
      + 'M5A-2 uses an individual staff-auth session. Cloud Sync M4 remains on its separate legacy OWNER session until M5A-3.'
      + '</p></div>';
  }

  function installSettingsCard() {
    const original = window.viewSettings;
    if (typeof original !== 'function' || original.__m5a2Wrapped) return;
    const wrapper = function () {
      return original.apply(this, arguments) + settingsCardHtml();
    };
    wrapper.__m5a2Wrapped = true;
    window.viewSettings = wrapper;
  }

  function renderSettingsSafely() {
    try {
      if (typeof currentView !== 'undefined' && currentView === 'settings' && typeof render === 'function') {
        render();
      }
    } catch (_) {}
  }

  async function refreshAdministration() {
    try {
      if (!context) return;
      await listMfaFactors();
      await loadAdministrationData();
      renderSettingsSafely();
    } catch (error) {
      handleError(error);
    }
  }

  async function createInvitation() {
    try {
      if (!await serverAuthorize('MANAGE_STAFF', true)) return;
      const email = String((document.getElementById('m5a2InviteNewEmail') || {}).value || '').trim();
      const name = String((document.getElementById('m5a2InviteNewName') || {}).value || '').trim();
      const tel = String((document.getElementById('m5a2InviteNewTel') || {}).value || '').trim();
      const inviteRole = String((document.getElementById('m5a2InviteNewRole') || {}).value || 'CASHIER');
      const mfa = String((document.getElementById('m5a2InviteNewMfa') || {}).value || '0') === '1';
      const expiry = Number((document.getElementById('m5a2InviteNewExpiry') || {}).value || 168);
      if (!email || !name) throw new Error('Full name and email are required.');

      const result = await client.rpc('zezms_m5a2_create_invitation', {
        p_business_id: context.business_id,
        p_email: email,
        p_role: inviteRole,
        p_display_name: name,
        p_telephone: tel,
        p_default_branch_id: context.branch_id || null,
        p_mfa_required: mfa,
        p_expires_hours: expiry
      });
      if (result.error) throw result.error;
      const row = normalizeRow(result.data);
      await loadAdministrationData();
      renderSettingsSafely();

      openModal(
        '<h3>Staff invitation created</h3>'
        + '<p class="muted">Share the email and one-time code privately with the invited staff member.</p>'
        + '<div class="field"><label>Invited email</label><input value="' + attr(row.invited_email) + '" readonly></div>'
        + '<div class="field"><label>One-time invitation code</label>'
        + '<input id="m5a2GeneratedInviteCode" class="mono" value="' + attr(row.invitation_code) + '" readonly></div>'
        + '<div class="field"><label>Role</label><input value="' + attr(row.invited_role) + '" readonly></div>'
        + '<div class="row"><button class="btn" onclick="m5a2CopyInvitationCode()">Copy code</button>'
        + '<button class="btn ghost" onclick="closeModal()">Close</button></div>'
      );
    } catch (error) {
      handleError(error);
      const raw = databaseErrorText(error);
      openModal(
        '<h3>Invitation could not be created</h3>'
        + '<p class="muted">The exact database response is shown below.</p>'
        + '<div style="white-space:pre-wrap;word-break:break-word;padding:12px;border:1px solid #475569;border-radius:10px;background:#0f172a;color:#fecaca;font-size:11px;line-height:1.5">'
        + esc(raw)
        + '</div>'
        + '<p class="muted" style="font-size:11px;margin-top:10px">'
        + 'When the message mentions pgcrypto, digest, gen_random_bytes or a missing invitation RPC, run '
        + '<code>SUPABASE_M5A2_INVITATION_CRYPTO_RUNTIME_FIX.sql</code>.'
        + '</p>'
        + '<button class="btn ghost" onclick="closeModal()">Close</button>'
      );
    }
  }

  async function copyInvitationCode() {
    const value = String((document.getElementById('m5a2GeneratedInviteCode') || {}).value || '');
    try {
      await navigator.clipboard.writeText(value);
      if (typeof toast === 'function') toast('Invitation code copied.');
    } catch (_) {
      prompt('Copy the invitation code', value);
    }
  }

  function editMember(userId) {
    const member = members.find(function (item) { return item.user_id === userId; });
    if (!member) return;
    openModal(
      '<h3>Manage staff member</h3>'
      + '<div class="statline"><span>Name</span><b>' + esc(member.display_name || '') + '</b></div>'
      + '<div class="statline"><span>Email</span><b>' + esc(member.email || '') + '</b></div>'
      + '<div class="field"><label>Role</label><select id="m5a2EditMemberRole">'
      + ['ADMIN','MANAGER','CASHIER','READ_ONLY','AUDITOR'].map(function (r) {
        return '<option value="' + r + '" ' + (member.role === r ? 'selected' : '') + '>' + r + '</option>';
      }).join('')
      + (member.role === 'OWNER' ? '<option value="OWNER" selected>OWNER</option>' : '')
      + '</select></div>'
      + '<div class="field"><label>Status</label><select id="m5a2EditMemberStatus">'
      + ['ACTIVE','SUSPENDED','REVOKED'].map(function (s) {
        return '<option value="' + s + '" ' + (member.status === s ? 'selected' : '') + '>' + s + '</option>';
      }).join('') + '</select></div>'
      + '<div class="field"><label>MFA requirement</label><select id="m5a2EditMemberMfa">'
      + '<option value="0" ' + (!member.mfa_required ? 'selected' : '') + '>Optional</option>'
      + '<option value="1" ' + (member.mfa_required ? 'selected' : '') + '>Required</option></select></div>'
      + '<div class="row"><button class="btn" onclick="m5a2SaveMember(\'' + attr(userId) + '\')">Save</button>'
      + '<button class="btn ghost" onclick="closeModal()">Cancel</button></div>'
    );
  }

  async function saveMember(userId) {
    try {
      if (!await serverAuthorize('MANAGE_STAFF', true)) return;
      const newRole = String((document.getElementById('m5a2EditMemberRole') || {}).value || '');
      const status = String((document.getElementById('m5a2EditMemberStatus') || {}).value || 'ACTIVE');
      const mfa = String((document.getElementById('m5a2EditMemberMfa') || {}).value || '0') === '1';
      if (!confirm('Save this staff role/status change?')) return;
      const result = await client.rpc('zezms_m5a2_update_member', {
        p_business_id: context.business_id,
        p_user_id: userId,
        p_role: newRole,
        p_status: status,
        p_mfa_required: mfa,
        p_default_branch_id: null
      });
      if (result.error) throw result.error;
      closeModal();
      await loadAdministrationData();
      renderSettingsSafely();
      if (typeof toast === 'function') toast('Staff member updated.');
    } catch (error) {
      handleError(error);
    }
  }

  async function revokeInvitation(invitationId) {
    try {
      if (!await serverAuthorize('MANAGE_STAFF', true)) return;
      if (!confirm('Revoke this pending invitation?')) return;
      const result = await client.rpc('zezms_m5a2_revoke_invitation', {
        p_business_id: context.business_id,
        p_invitation_id: invitationId
      });
      if (result.error) throw result.error;
      await loadAdministrationData();
      renderSettingsSafely();
    } catch (error) {
      handleError(error);
    }
  }

  async function saveMfaPolicy() {
    try {
      if (!await serverAuthorize('MANAGE_STAFF', true)) return;
      const policy = String((document.getElementById('m5a2MfaPolicy') || {}).value || 'OPTIONAL');
      const result = await client.rpc('zezms_m5a2_set_mfa_policy', {
        p_business_id: context.business_id,
        p_policy: policy
      });
      if (result.error) throw result.error;
      context.mfa_policy = result.data;
      saveState({ contextCache: context });
      renderSettingsSafely();
      if (typeof toast === 'function') toast('MFA policy updated.');
    } catch (error) {
      handleError(error);
    }
  }

  async function init() {
    installSettingsCard();
    installActionGuards();
    showLoginMode();

    try {
      await waitForClient(12000);
      if (!client) return;

      if (authSession && localAuthActive()) {
        setLoginStatus(
          'A secure session exists on this device. Press Continue with password or Continue authenticator verification.',
          'info'
        );
      } else {
        showPasswordStage('Ready for secure staff sign-in.');
      }
    } catch (error) {
      saveState({ lastError: friendlyError(error) });
      showLoginMode();
    }
  }

  window.m5a2SecureSignIn = function () { signInFromLogin(); };
  window.m5a2VerifyInlineMfa = function () { verifyInlineMfa(); };
  window.m5a2SelectInlineFactor = function () { selectInlineFactor(); };
  window.m5a2RefreshInlineFactors = function () { refreshInlineFactors(); };
  window.m5a2ReturnToPassword = function () { returnToPassword(); };
  window.m5a2ResumeSignIn = function () { resumeSignIn(); };
  window.m5a2ResetSecureSession = function () { resetSecureSession(); };
  window.m5a2ForgotPassword = function () { forgotPassword(); };
  window.m5a2OpenInvitation = openInvitation;
  window.m5a2CreateAccountAndClaim = function () { createAccountAndClaim(); };
  window.m5a2SignInAndClaim = function () { signInAndClaim(); };
  window.m5a2CompletePasswordRecovery = function () { completePasswordRecovery(); };
  window.m5a2ActivateOwner = function () { activateOwner(); };
  window.m5a2EnrollMfa = function () { enrollMfa(false); };
  window.m5a2UnenrollMfa = function (factorId) { unenrollMfa(factorId); };
  window.m5a2CreateInvitation = function () { createInvitation(); };
  window.m5a2CopyInvitationCode = copyInvitationCode;
  window.m5a2EditMember = editMember;
  window.m5a2SaveMember = function (userId) { saveMember(userId); };
  window.m5a2RevokeInvitation = function (invitationId) { revokeInvitation(invitationId); };
  window.m5a2SaveMfaPolicy = function () { saveMfaPolicy(); };

  ZEZMS.staffAuth = {
    version: 'M5A-2',
    build: BUILD,
    init: init,
    isActive: localAuthActive,
    can: can,
    canView: canView,
    fallbackView: fallbackView,
    isElevatedForViewing: isElevatedForViewing,
    signInFromLogin: signInFromLogin,
    verifyInlineMfa: verifyInlineMfa,
    selectInlineFactor: selectInlineFactor,
    refreshInlineFactors: refreshInlineFactors,
    returnToPassword: returnToPassword,
    resumeSignIn: resumeSignIn,
    resetSecureSession: resetSecureSession,
    signOut: signOut,
    confirmSensitive: confirmSensitive,
    applyRoleUI: applyRoleUI,
    updateUserBadge: updateUserBadge,
    afterRender: afterRender,
    refreshAdministration: refreshAdministration,
    getContext: function () { return context ? Object.assign({}, context) : null; },
    getSession: function () { return authSession; },
    getClient: function () { return client; },
    getState: function () {
      return Object.assign({}, state, {
        context: context ? Object.assign({}, context) : null,
        members: members.slice(),
        invitations: invitations.slice(),
        factors: factors.slice()
      });
    }
  };

  window.addEventListener('zezms-cloud-ready', function () {
    setTimeout(function () {
      if (!client) init();
    }, 250);
  });

  setTimeout(init, 500);
}());
