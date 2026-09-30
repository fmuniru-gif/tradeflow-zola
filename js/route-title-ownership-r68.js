/* ZEZMS TradeFlow Owner Edition v3.29.5 / r68E.
   A rendered route is the sole owner of the application title and grouped-nav
   selection.  This is event-bound: there is no observer, polling loop or
   background DOM reconciliation. */
(function () {
  'use strict';

  var VERSION = '3.29.5';
  var BUILD = '20260930-r68e-account-cash-pdf-compact-kpi-charts';
  var TITLES_BY_ROUTE = Object.freeze({
    dashboard: 'Dashboard KPIs', pos: 'Sale Out', stockin: 'Stock In', products: 'Products',
    stock: 'Stock Balance', cash: 'Cash Balances', expenses: 'Expenses', accounts: 'Accounts',
    receipts: 'Sales Records', reports: 'Reports', sync: 'Sync / Backup', integrity: 'Data Integrity & Sync', settings: 'Settings',
    'working-capital': 'Cash Flow & Working Capital',
    'executive-performance': 'Executive Performance & Trends',
    'targets-forecasting': 'Targets, Forecasting & Scenario Planning',
    'management-alerts': 'Management Alerts & Priorities',
    'management-actions': 'Management Action Plans & Tasks',
    'decision-workflows': 'Controlled Decision Workflows',
    'customer-master': 'Customer Master',
    'customer-intelligence': 'Customer Relationship Intelligence',
    'warranty-management': 'Warranty Management',
    'stock-velocity': 'Stock Velocity & Reorder Planning',
    'portfolio-signals': 'Portfolio Signals & Capital Allocation',
    'promotion-intelligence': 'Promotion Intelligence',
    'management-intelligence': 'Management Intelligence',
    'margin-intelligence': 'Margin & Pricing Intelligence',
    'pricing-guidance': 'Current Stock Pricing Guidance',
    'pricing-policy': 'Pricing Policy Lab',
    purchaseorders: 'Purchase Orders', invoices: 'Invoices', 'proforma-invoices': 'Proforma Invoices', quotations: 'Quotations',
    waybills: 'Waybills', kpiCharts: 'KPI Bar Charts', undo: 'Undo Transactions'
  });

  function lexicalRoute() {
    /* currentView is an application-level lexical binding.  It is deliberately
       read before window.currentView: a few legacy wrappers created a property
       shadow which can otherwise preserve a previous route. */
    try { if (typeof currentView !== 'undefined' && currentView) return String(currentView); } catch (_) {}
    try { if (window.currentView) return String(window.currentView); } catch (_) {}
    return '';
  }

  function titleFor(route) {
    var key = String(route || '');
    try { if (typeof TITLES !== 'undefined' && TITLES && TITLES[key]) return String(TITLES[key]); } catch (_) {}
    return TITLES_BY_ROUTE[key] || key;
  }

  function routeButton(route) {
    try { return document.querySelector('#mainNav button[data-view="' + String(route).replace(/"/g, '\\"') + '"]'); } catch (_) { return null; }
  }

  function syncNavigation(route) {
    try {
      document.querySelectorAll('#mainNav button[data-view]').forEach(function (button) {
        button.classList.toggle('active', button.getAttribute('data-view') === route);
      });
      document.querySelectorAll('#mainNav .nav-group').forEach(function (group) {
        var selected = group.querySelector('button[data-view="' + String(route).replace(/"/g, '\\"') + '"]');
        var active = !!selected;
        group.classList.toggle('is-active', active);
        var current = group.querySelector('.nav-group-current');
        if (current) current.textContent = active ? selected.textContent.replace(/\s+/g, ' ').trim() : '';
      });
    } catch (_) {}
  }

  function commit(actualRoute) {
    var rendered = String(actualRoute || '');
    var authoritative = lexicalRoute();
    /* A delayed renderer may only update its own title while it is still the
       active route.  It must never reclaim a page that has already navigated. */
    if (rendered && authoritative && rendered !== authoritative) return false;
    var route = rendered || authoritative;
    if (!route) return false;
    var node = document.getElementById('viewTitle');
    if (node) {
      node.textContent = titleFor(route);
      if (typeof node.setAttribute === 'function') {
        node.setAttribute('data-zezms-title-route', route);
        node.setAttribute('data-zezms-title-build', BUILD);
      }
    }
    syncNavigation(route);
    return true;
  }

  function register(route, title) {
    try { if (typeof TITLES !== 'undefined' && TITLES && route && title) TITLES[route] = title; } catch (_) {}
  }

  function wrapFinalLifecycle() {
    var nav = window.nav;
    if (typeof nav === 'function' && !nav.__zezmsRouteTitleR67Y) {
      function routed() {
        var result = nav.apply(this, arguments);
        commit(lexicalRoute());
        return result;
      }
      routed.__zezmsRouteTitleR67Y = true;
      routed.__zezmsRouteTitleOriginal = nav;
      window.nav = routed;
    }
    var render = window.render;
    if (typeof render === 'function' && !render.__zezmsRouteTitleR67Y) {
      function rendered() {
        var result = render.apply(this, arguments);
        commit(lexicalRoute());
        return result;
      }
      rendered.__zezmsRouteTitleR67Y = true;
      rendered.__zezmsRouteTitleOriginal = render;
      window.render = rendered;
    }
  }

  Object.keys(TITLES_BY_ROUTE).forEach(function (route) { register(route, TITLES_BY_ROUTE[route]); });
  window.ZEZMS = window.ZEZMS || {};
  window.ZEZMS.routeTitleOwnership = Object.freeze({
    version: VERSION, build: BUILD, titles: TITLES_BY_ROUTE,
    activeRoute: lexicalRoute, titleFor: titleFor, commit: commit, rendered: commit,
    syncNavigation: syncNavigation, register: register, install: wrapFinalLifecycle,
    _test: Object.freeze({ activeRoute: lexicalRoute, titleFor: titleFor })
  });
  wrapFinalLifecycle();
}());
