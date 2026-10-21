/* Read-only gate for automatic business initialization during Safe Bootstrap. */
(function () {
  'use strict';
  window.ZEZMS = window.ZEZMS || {};
  const STAGE = 'zezms_m5a4_safe_bootstrap_stage_v1';
  const JOURNAL = 'zezms_m5a4_safe_bootstrap_journal_v2';

  function allowsEstablishedBusinessAccess() {
    try {
      const phase = ZEZMS.bootstrapPhaseA;
      if (!phase || typeof phase.inspect !== 'function' || phase.inspect().status !== 'ABSENT') return false;
      // A journal without a stage is an interrupted or inconsistent bootstrap.
      if (localStorage.getItem(STAGE) !== null || localStorage.getItem(JOURNAL) !== null) return false;
      const cloud = ZEZMS.cloudSync;
      if (!cloud || typeof cloud.getState !== 'function') return false;
      if (typeof cloud.isShopDirectoryRecoveryHeld === 'function' && cloud.isShopDirectoryRecoveryHeld()) return false;
      const state = cloud.getState();
      if (!state || state.initialized !== true || !state.deviceId ||
          state.configurationVerificationRequired || state.oldClientDetected) return false;
      const mode = String(state.deviceAccessMode || '').toUpperCase();
      const lifecycle = String(state.deviceLifecycleState || state.lifecycleState || state.deviceAccessStatus || '').toUpperCase();
      if (mode === 'PAIRED') return !!state.businessId && !!state.syncOwnerId && lifecycle === 'ACTIVE';
      // Established M4 Owner profiles can predate businessId, but must still
      // retain either their Owner binding or their existing business binding.
      if (mode === 'OWNER') return !!(state.syncOwnerId || state.businessId)
        && (lifecycle === '' || lifecycle === 'ACTIVE');
      return false;
    } catch (_) {
      return false;
    }
  }

  function allowsAutomaticBusinessWrites() {
    return allowsEstablishedBusinessAccess();
  }

  function allowsBusinessTransactions() {
    // Transaction wrappers have their own gate. Automatic maintenance rules
    // must not acquire the ability to disable established staff trading.
    return allowsEstablishedBusinessAccess();
  }

  ZEZMS.bootstrapStartupGuard = Object.freeze({
    build: '20261021-shop-chrome-bootstrap-guard-r1',
    allowsAutomaticBusinessWrites,
    allowsBusinessTransactions
  });
}());
