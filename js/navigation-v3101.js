/* ZEZMS TradeFlow Owner Edition v3.10.1
   Grouped business navigation and direct Management view host.
   Presentation/routing only: existing calculation and transaction engines are reused unchanged. */
(function () {
  'use strict';

  var VERSION = '3.12.0';
  var BUILD = '20260815-customer-master-print-readiness-r45';
  window.ZEZMS = window.ZEZMS || {};

  if (window.ZEZMS.navigationV3101 && window.ZEZMS.navigationV3101.build === BUILD) {
    if (typeof window.ZEZMS.navigationV3101.rebuildNavigation === 'function') {
      window.ZEZMS.navigationV3101.rebuildNavigation();
    }
    return;
  }

  var legacyDashboard = window.viewDashboard;
  var legacyRender = window.render;
  var legacyNav = window.nav;
  var auth = window.ZEZMS.staffAuth || null;
  var originalCanView = auth && typeof auth.canView === 'function' ? auth.canView : null;
  var originalApplyRoleUI = auth && typeof auth.applyRoleUI === 'function' ? auth.applyRoleUI : null;

  var MANAGEMENT_ROUTES = Object.freeze({
    'management-intelligence': { title: 'Management Intelligence', targetId: 'managementIntelligence' },
    'margin-intelligence': { title: 'Margin & Pricing Intelligence', targetId: 'marginPricingIntelligence' },
    'pricing-guidance': { title: 'Current Stock Pricing Guidance', targetId: 'pricingGuidance' },
    'pricing-policy': { title: 'Pricing Policy Lab', targetId: 'pricingPolicyLab' },
    'stock-velocity': { title: 'Stock Velocity & Reorder Planning', targetId: 'stockVelocityLab' },
    'portfolio-signals': { title: 'Portfolio Signals & Capital Allocation', targetId: 'portfolioSignalsLab' },
    'customer-master': { title: 'Customer Master', renderer: 'customerMaster' },
    'customer-intelligence': { title: 'Customer Relationship Intelligence', targetId: 'customerIntelligenceLab' }
  });

  var ANALYTIC_IDS = Object.keys(MANAGEMENT_ROUTES).map(function (key) {
    return MANAGEMENT_ROUTES[key].targetId;
  }).filter(Boolean);

  var GROUPS = Object.freeze([
    {
      key: 'sales', label: 'Sales', icon: '🛒', children: [
        { view: 'pos', label: 'Sale Out', icon: '🛒' },
        { view: 'receipts', label: 'Sales Records', icon: '🧾' },
        { view: 'invoices', label: 'Invoices', icon: '📄' },
        { view: 'waybills', label: 'Waybills', icon: '🚚' }
      ]
    },
    {
      key: 'purchases', label: 'Purchases', icon: '📥', children: [
        { view: 'stockin', label: 'Stock In', icon: '📥', permissionView: 'stockin' },
        { view: 'purchaseorders', label: 'Purchase Orders', icon: '📝', permissionView: 'stockin' }
      ]
    },
    {
      key: 'stock', label: 'Stock', icon: '📦', children: [
        { view: 'products', label: 'Products', icon: '📦', permissionView: 'products' },
        { view: 'stock', label: 'Stock Balance', icon: '📋', permissionView: 'stock' }
      ]
    },
    {
      key: 'finance', label: 'Finance', icon: '💵', children: [
        { view: 'cash', label: 'Cash Balances', icon: '💵', permissionView: 'cash' },
        { view: 'expenses', label: 'Expenses', icon: '🧾', permissionView: 'expenses' },
        { view: 'accounts', label: 'Accounts', icon: '👥', permissionView: 'accounts' }
      ]
    },
    {
      key: 'management', label: 'Management', icon: '📊', children: [
        { view: 'dashboard', label: 'Dashboard KPIs', icon: '📊', permissionView: 'dashboard' },
        { view: 'kpiCharts', label: 'KPI Bar Charts', icon: '📉', permissionView: 'dashboard' },
        { view: 'reports', label: 'Reports', icon: '📈', permissionView: 'reports' },
        { view: 'management-intelligence', label: 'Management Intelligence', icon: '◈', permissionView: 'dashboard' },
        { view: 'margin-intelligence', label: 'Margin & Pricing Intelligence', icon: '◈', permissionView: 'dashboard' },
        { view: 'pricing-guidance', label: 'Current Stock Pricing Guidance', icon: '◈', permissionView: 'dashboard' },
        { view: 'pricing-policy', label: 'Pricing Policy Lab', icon: '◈', permissionView: 'dashboard' },
        { view: 'stock-velocity', label: 'Stock Velocity & Reorder Planning', icon: '◈', permissionView: 'dashboard' },
        { view: 'portfolio-signals', label: 'Portfolio Signals & Capital Allocation', icon: '◈', permissionView: 'dashboard' },
        { view: 'customer-master', label: 'Customer Master', icon: '👤', permissionView: 'dashboard' },
        { view: 'customer-intelligence', label: 'Customer Relationship Intelligence', icon: '◈', permissionView: 'dashboard' }
      ]
    }
  ]);

  var GROUP_BY_VIEW = Object.create(null);
  var CHILD_BY_VIEW = Object.create(null);
  GROUPS.forEach(function (group) {
    group.children.forEach(function (child) {
      GROUP_BY_VIEW[child.view] = group.key;
      CHILD_BY_VIEW[child.view] = child;
    });
  });

  function addTitles() {
    if (typeof TITLES === 'undefined' || !TITLES) return;
    TITLES.purchaseorders = 'Purchase Orders';
    TITLES.invoices = 'Invoices';
    TITLES.waybills = 'Waybills';
    TITLES.kpiCharts = 'KPI Bar Charts';
    TITLES.undo = 'Undo Transactions';
    Object.keys(MANAGEMENT_ROUTES).forEach(function (route) {
      TITLES[route] = MANAGEMENT_ROUTES[route].title;
    });
  }

  function createTemplate(html) {
    var template = document.createElement('template');
    template.innerHTML = String(html == null ? '' : html);
    return template;
  }

  function removeAnalyticSections(root, keepId) {
    ANALYTIC_IDS.forEach(function (id) {
      if (id === keepId) return;
      var matches = root.querySelectorAll('[id="' + id + '"]');
      Array.prototype.forEach.call(matches, function (node) { node.remove(); });
    });
  }

  function fullDashboardHTML() {
    if (typeof legacyDashboard !== 'function') {
      throw new Error('The verified Dashboard renderer is unavailable.');
    }
    return legacyDashboard.apply(window, arguments);
  }

  function dashboardOnlyHTML() {
    var template = createTemplate(fullDashboardHTML.apply(window, arguments));
    removeAnalyticSections(template.content, '');
    return template.innerHTML;
  }

  function viewManagementSection(sectionKey) {
    var route = MANAGEMENT_ROUTES[sectionKey];
    if (!route) {
      return '<div class="card"><h3>Management view unavailable</h3><p class="muted">The requested Management section is not registered.</p></div>';
    }

    if (route.renderer === 'customerMaster') {
      if (!window.ZEZMS.customerMaster || typeof window.ZEZMS.customerMaster.viewHTML !== 'function') {
        return '<div class="card"><h3>Customer Master</h3><p class="muted">The Customer Master module could not be mounted.</p></div>';
      }
      return '<div class="management-direct-view" data-management-view="customer-master" data-build="' + BUILD + '">'
        + window.ZEZMS.customerMaster.viewHTML() + '</div>';
    }

    var template = createTemplate(fullDashboardHTML());
    var source = template.content.querySelector('[id="' + route.targetId + '"]');
    if (!source) {
      return '<div class="card"><h3>' + route.title + '</h3><p class="muted">This verified intelligence module could not be mounted. No transaction or calculation was changed.</p></div>';
    }

    var section = source.cloneNode(true);
    removeAnalyticSections(section, route.targetId);
    return '<div class="management-direct-view" data-management-view="' + sectionKey + '" data-build="' + BUILD + '">' + section.outerHTML + '</div>';
  }

  function canOpenView(view) {
    var child = CHILD_BY_VIEW[view];
    var permissionView = child && child.permissionView ? child.permissionView : view;

    if (view === 'undo' && auth && typeof auth.can === 'function') {
      return !!auth.can('UNDO_TRANSACTION');
    }
    if (view === 'customer-master') {
      try {
        if (auth && typeof auth.getContext === 'function') {
          var role = String((auth.getContext() || {}).role || '').toUpperCase();
          return role === 'OWNER' || role === 'ADMIN';
        }
      } catch (_error) {}
      try { return !!(session && (session.role === 'ADMIN' || session.adminMode === true)); } catch (_error2) { return false; }
    }
    if (originalCanView && auth && typeof auth.isActive === 'function' && auth.isActive()) {
      return !!originalCanView.call(auth, permissionView);
    }
    if (MANAGEMENT_ROUTES[view]) return typeof isElevated === 'function' && isElevated();
    if (view === 'purchaseorders' || view === 'undo') return typeof isElevated === 'function' && isElevated();
    return true;
  }

  function closeGroups(exceptKey) {
    document.querySelectorAll('#mainNav .nav-group').forEach(function (group) {
      if (exceptKey && group.getAttribute('data-group') === exceptKey) return;
      group.classList.remove('open');
      var toggle = group.querySelector('.nav-group-toggle');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
    });
  }

  function toggleGroup(key) {
    var group = document.querySelector('#mainNav .nav-group[data-group="' + key + '"]');
    if (!group) return;
    var shouldOpen = !group.classList.contains('open');
    closeGroups(shouldOpen ? key : '');
    group.classList.toggle('open', shouldOpen);
    var toggle = group.querySelector('.nav-group-toggle');
    if (toggle) toggle.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  }

  function childButton(child) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'nav-submenu-item';
    button.setAttribute('data-view', child.view);
    button.setAttribute('data-permission-view', child.permissionView || child.view);
    button.innerHTML = '<span class="nav-item-icon" aria-hidden="true">' + child.icon + '</span><span>' + child.label + '</span>';
    button.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      closeGroups('');
      window.nav(child.view);
    });
    return button;
  }

  function groupElement(group) {
    var wrapper = document.createElement('div');
    wrapper.className = 'nav-group';
    wrapper.setAttribute('data-group', group.key);

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'nav-group-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'nav-submenu-' + group.key);
    toggle.innerHTML = '<span class="nav-group-main"><span aria-hidden="true">' + group.icon + '</span><span class="nav-group-copy"><b>' + group.label + '</b><small class="nav-group-current"></small></span></span><span class="nav-group-caret" aria-hidden="true">⌄</span>';
    toggle.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      toggleGroup(group.key);
    });

    var submenu = document.createElement('div');
    submenu.className = 'nav-submenu';
    submenu.id = 'nav-submenu-' + group.key;
    group.children.forEach(function (child) { submenu.appendChild(childButton(child)); });

    wrapper.appendChild(toggle);
    wrapper.appendChild(submenu);
    return wrapper;
  }

  function undoButton() {
    var button = document.createElement('button');
    button.type = 'button';
    button.id = 'navUndoTransactions';
    button.className = 'nav-standalone';
    button.setAttribute('data-view', 'undo');
    button.setAttribute('data-permission-action', 'UNDO_TRANSACTION');
    button.innerHTML = '<span aria-hidden="true">↩️</span><span>Undo Transactions</span>';
    button.addEventListener('click', function () {
      closeGroups('');
      window.nav('undo');
    });
    return button;
  }

  function injectStyles() {
    if (document.getElementById('navigationV3101Styles')) return;
    var style = document.createElement('style');
    style.id = 'navigationV3101Styles';
    style.textContent = [
      '#mainNav .nav-group{margin:2px 0}',
      '#mainNav .nav-group-toggle{justify-content:space-between;gap:8px}',
      '#mainNav .nav-group-main{display:flex;align-items:center;gap:10px;min-width:0}',
      '#mainNav .nav-group-copy{display:flex;min-width:0;flex-direction:column;gap:2px}',
      '#mainNav .nav-group-copy b{font-size:13.5px;line-height:1.2}',
      '#mainNav .nav-group-current{display:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#99f6e4;font-size:10px;font-weight:600;max-width:165px}',
      '#mainNav .nav-group.is-active>.nav-group-toggle{background:rgba(15,118,110,.25);color:var(--teal2)}',
      '#mainNav .nav-group.is-active .nav-group-current{display:block}',
      '#mainNav .nav-group-caret{font-size:18px;line-height:1;transition:transform .18s ease}',
      '#mainNav .nav-group.open .nav-group-caret{transform:rotate(180deg)}',
      '#mainNav .nav-submenu{display:none;margin:2px 0 7px 18px;padding-left:8px;border-left:1px solid #334155}',
      '#mainNav .nav-group.open .nav-submenu{display:block}',
      '#mainNav .nav-submenu .nav-submenu-item{min-height:40px;padding:9px 10px;font-size:12.5px;line-height:1.25}',
      '#mainNav .nav-submenu .nav-submenu-item.active{background:rgba(20,184,166,.18);color:#99f6e4}',
      '#mainNav .nav-item-icon{flex:0 0 18px;text-align:center}',
      '#mainNav .nav-standalone{margin-top:6px}',
      '.management-direct-view{min-width:0}',
      '.management-direct-view>section,.management-direct-view>div{margin-top:0!important}',
      '@media(max-width:900px){#mainNav .nav-group-toggle{min-height:50px}#mainNav .nav-submenu{margin-left:20px}#mainNav .nav-submenu .nav-submenu-item{min-height:46px;font-size:14px;padding:11px 12px}#mainNav .nav-group-current{max-width:210px;font-size:11px}}',
      'html.zezms-phone-layout #mainNav{overflow-x:hidden}',
      'html.zezms-phone-layout #mainNav .nav-submenu{position:static;width:auto;max-width:100%;overflow:visible}',
      'html.zezms-phone-layout #mainNav .nav-submenu .nav-submenu-item{min-height:48px;white-space:normal}'
    ].join('');
    document.head.appendChild(style);
  }

  function syncVisibility() {
    var nav = document.getElementById('mainNav');
    if (!nav) return;

    nav.querySelectorAll('.nav-submenu-item[data-view]').forEach(function (button) {
      button.style.display = canOpenView(button.getAttribute('data-view')) ? '' : 'none';
    });

    nav.querySelectorAll('.nav-group').forEach(function (group) {
      var hasVisibleChild = Array.prototype.some.call(group.querySelectorAll('.nav-submenu-item'), function (button) {
        return button.style.display !== 'none';
      });
      group.style.display = hasVisibleChild ? '' : 'none';
      if (!hasVisibleChild) group.classList.remove('open');
    });

    var undo = document.getElementById('navUndoTransactions');
    if (undo) undo.style.display = canOpenView('undo') ? '' : 'none';
  }

  function syncActiveState() {
    var selected = typeof currentView === 'undefined' ? '' : currentView;
    document.querySelectorAll('#mainNav button[data-view]').forEach(function (button) {
      button.classList.toggle('active', button.getAttribute('data-view') === selected);
    });
    document.querySelectorAll('#mainNav .nav-group').forEach(function (group) {
      var key = group.getAttribute('data-group');
      var active = GROUP_BY_VIEW[selected] === key;
      group.classList.toggle('is-active', active);
      var current = group.querySelector('.nav-group-current');
      if (current) current.textContent = active && CHILD_BY_VIEW[selected] ? CHILD_BY_VIEW[selected].label : '';
    });
  }

  function rebuildNavigation() {
    var nav = document.getElementById('mainNav');
    if (!nav) return false;

    if (nav.getAttribute('data-navigation-build') === BUILD) {
      syncVisibility();
      syncActiveState();
      return true;
    }

    var businessViews = Object.keys(CHILD_BY_VIEW).concat(['undo']);
    var preserved = Array.prototype.filter.call(nav.children, function (node) {
      if (node.tagName !== 'BUTTON') return false;
      var view = node.getAttribute('data-view');
      return !view || businessViews.indexOf(view) < 0;
    });
    preserved.forEach(function (node) { node.remove(); });
    nav.innerHTML = '';

    GROUPS.forEach(function (group) { nav.appendChild(groupElement(group)); });
    nav.appendChild(undoButton());

    var section = document.createElement('div');
    section.className = 'sec';
    section.textContent = 'System';
    nav.appendChild(section);
    preserved.forEach(function (node) { nav.appendChild(node); });

    nav.setAttribute('data-navigation-version', VERSION);
    nav.setAttribute('data-navigation-build', BUILD);
    syncVisibility();
    syncActiveState();
    return true;
  }

  function wrapAccessControl() {
    if (!auth || !originalCanView || auth.__navigationV3101AccessWrapped) return;
    auth.canView = function (view) {
      if (view === 'customer-master') return canOpenView(view);
      var child = CHILD_BY_VIEW[view];
      var permissionView = child && child.permissionView ? child.permissionView : view;
      if (view === 'undo' && typeof auth.can === 'function') return !!auth.can('UNDO_TRANSACTION');
      return !!originalCanView.call(auth, permissionView);
    };
    if (originalApplyRoleUI) {
      auth.applyRoleUI = function () {
        var result = originalApplyRoleUI.apply(auth, arguments);
        syncVisibility();
        syncActiveState();
        return result;
      };
    }
    auth.__navigationV3101AccessWrapped = true;
  }

  function renderWithManagementHost() {
    if (!MANAGEMENT_ROUTES[currentView]) {
      var result = legacyRender.apply(window, arguments);
      syncVisibility();
      syncActiveState();
      return result;
    }

    if (!canOpenView(currentView)) {
      if (typeof toast === 'function') toast('Your staff role cannot open this Management page.', 'err');
      currentView = auth && typeof auth.fallbackView === 'function' ? auth.fallbackView() : 'pos';
      if (document.getElementById('viewTitle')) document.getElementById('viewTitle').textContent = TITLES[currentView] || currentView;
      return legacyRender();
    }

    if (typeof updatePeriodUI === 'function') updatePeriodUI();
    if (typeof applyRoleUI === 'function') applyRoleUI();
    var root = document.getElementById('viewRoot');
    var mountedFromCurrentVelocity = false;
    if (currentView === 'portfolio-signals'
      && window.ZEZMS.stockVelocity
      && typeof window.ZEZMS.stockVelocity.getRuntimeSnapshot === 'function'
      && window.ZEZMS.portfolioSignals
      && typeof window.ZEZMS.portfolioSignals.refresh === 'function') {
      var velocityState = window.ZEZMS.stockVelocity.getRuntimeSnapshot();
      if (velocityState && velocityState.windowDays) {
        root.innerHTML = '<div class="management-direct-view" data-management-view="portfolio-signals" data-build="' + BUILD + '"><section id="portfolioSignalsLab"></section></div>';
        mountedFromCurrentVelocity = window.ZEZMS.portfolioSignals.refresh() === true;
      }
    }
    if (!mountedFromCurrentVelocity) root.innerHTML = viewManagementSection(currentView);
    if (auth && typeof auth.afterRender === 'function') auth.afterRender();
    syncVisibility();
    syncActiveState();
  }

  function navigateWithGroupedState(view) {
    closeGroups('');
    var result = legacyNav.apply(window, arguments);
    syncVisibility();
    syncActiveState();
    return result;
  }

  addTitles();
  injectStyles();
  wrapAccessControl();
  window.viewDashboard = dashboardOnlyHTML;
  window.viewManagementSection = viewManagementSection;
  window.render = renderWithManagementHost;
  window.nav = navigateWithGroupedState;

  window.ZEZMS.navigationV3101 = Object.freeze({
    version: VERSION,
    build: BUILD,
    directManagementViews: true,
    groups: GROUPS,
    managementRoutes: MANAGEMENT_ROUTES,
    viewManagementSection: viewManagementSection,
    rebuildNavigation: rebuildNavigation,
    closeGroups: closeGroups
  });

  rebuildNavigation();
  document.addEventListener('click', function (event) {
    if (!event.target.closest || !event.target.closest('#mainNav .nav-group')) closeGroups('');
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeGroups('');
  });
}());
