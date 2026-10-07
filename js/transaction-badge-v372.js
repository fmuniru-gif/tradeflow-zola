/* ZEZMS Owner Edition v3.7.3 - remote transaction badge */
(function () {
  'use strict';

  window.ZEZMS = window.ZEZMS || {};
  const BUILD = '20260808-owner-maintenance-r32';
  const STORAGE_KEY = 'zezms-owner-remote-transaction-badge';
  const MAX_COUNT = 999;
  const MAX_RECENT = 30;
  let state = loadState();

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {
        count: Math.max(0, Math.min(MAX_COUNT, Number(parsed.count) || 0)),
        recent: Array.isArray(parsed.recent) ? parsed.recent.slice(0, MAX_RECENT) : []
      };
    } catch (_) {
      return { count: 0, recent: [] };
    }
  }

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  function applyAppBadge() {
    try {
      if (state.count > 0 && typeof navigator.setAppBadge === 'function') {
        Promise.resolve(navigator.setAppBadge(state.count)).catch(function () {});
      } else if (!state.count && typeof navigator.clearAppBadge === 'function') {
        Promise.resolve(navigator.clearAppBadge()).catch(function () {});
      }
    } catch (_) {}
  }

  function installButton() {
    const topbar = document.querySelector('.topbar');
    if (!topbar) return null;
    let button = document.getElementById('remoteTransactionBadgeButton');
    if (!button) {
      button = document.createElement('button');
      button.id = 'remoteTransactionBadgeButton';
      button.type = 'button';
      button.className = 'btn sm ghost';
      button.title = 'Transactions received from other devices';
      button.setAttribute('aria-label', 'Transactions received from other devices');
      button.addEventListener('click', function () { window.showRemoteTransactionNotifications(); });
      const refresh = topbar.querySelector('button[title="Refresh"]');
      if (refresh) topbar.insertBefore(button, refresh);
      else topbar.appendChild(button);
    }
    return button;
  }

  function renderBadge() {
    const button = installButton();
    if (button) {
      button.innerHTML = '🔔 <span class="badge ' + (state.count ? 'bad' : '') + '" style="min-width:22px">' + state.count + '</span>';
      button.style.display = '';
    }
    applyAppBadge();
  }

  function formatKind(kind) {
    return String(kind || 'TRANSACTION').replace(/_/g, ' ');
  }

  function receive(payload) {
    const transactions = payload && Array.isArray(payload.transactions) ? payload.transactions : [];
    const count = Math.max(0, Number(payload && payload.count) || transactions.length || 0);
    if (!count) return;
    const additions = transactions.length ? transactions : [{ kind:'TRANSACTION', deviceId:'Other device', createdAt:new Date().toISOString() }];
    state.count = Math.min(MAX_COUNT, state.count + count);
    state.recent = additions.slice().reverse().concat(state.recent).slice(0, MAX_RECENT);
    persist();
    renderBadge();
    try { if (typeof toast === 'function') toast(count + ' transaction' + (count === 1 ? '' : 's') + ' received from other device' + (count === 1 ? '' : 's') + '.', ''); } catch (_) {}
  }

  window.clearRemoteTransactionNotifications = function () {
    state.count = 0;
    persist();
    renderBadge();
    const count = document.getElementById('remoteNotificationModalCount');
    if (count) count.textContent = '0 unread';
  };

  window.showRemoteTransactionNotifications = function () {
    const rows = state.recent.map(function (item) {
      const date = item.createdAt ? new Date(item.createdAt) : null;
      return '<tr><td>' + esc(formatKind(item.kind)) + '</td><td class="mono">' + esc(item.deviceId || 'Other device') + '</td>'
        + '<td>' + (date && !Number.isNaN(date.getTime()) ? date.toLocaleString('en-GH') : '-') + '</td></tr>';
    }).join('') || '<tr><td colspan="3" class="empty">No remote transactions have been received on this installation yet.</td></tr>';
    openModal('<h3>Other-device transactions</h3><p class="muted">The badge counts M4 cloud transactions received from other enrolled devices while syncing.</p>'
      + '<div class="row" style="margin-bottom:10px"><span id="remoteNotificationModalCount" class="pill">' + state.count + ' unread</span>'
      + '<button class="btn ghost" onclick="clearRemoteTransactionNotifications()">Mark all read</button></div>'
      + '<div class="table-wrap"><table><thead><tr><th>Transaction</th><th>Device ID</th><th>Received</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      + '<div class="row" style="margin-top:12px"><button class="btn" onclick="closeModal()">Close</button></div>');
  };

  if (ZEZMS.events && typeof ZEZMS.events.on === 'function') {
    ZEZMS.events.on('sync:remote-transactions', receive);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) renderBadge(); });
  renderBadge();

  ZEZMS.transactionBadge = {
    version: '3.7.3', build: BUILD, getState: function () { return JSON.parse(JSON.stringify(state)); },
    receive: receive, clear: window.clearRemoteTransactionNotifications, render: renderBadge
  };
}());
