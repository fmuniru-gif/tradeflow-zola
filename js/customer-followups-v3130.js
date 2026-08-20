/* ZEZMS TradeFlow Owner Edition v3.14.0
   Stage 5D/5E — persistent follow-up management with manually confirmed contact method. */
(function () {
  'use strict';

  var VERSION = '3.14.0';
  var BUILD = '20260820-customer-outreach-r48';
  var RELEASE = 'Customer Outreach & Contact Actions';
  var PURPOSES = Object.freeze([
    'General Follow-up', 'Product Availability', 'After-Sale Check', 'Quotation Follow-up',
    'Corporate/B2B Follow-up', 'Payment Follow-up', 'Customer Enquiry', 'Other'
  ]);
  var STATUSES = Object.freeze(['Planned', 'Completed', 'Cancelled']);
  var OUTCOMES = Object.freeze([
    'Contacted Successfully', 'Customer Interested', 'Customer Not Ready', 'No Response',
    'Product Requested', 'Purchase Completed', 'Follow-up Again', 'Other'
  ]);
  var MAX_NOTES = 1200;
  var runtime = { selectedCustomerId:'', renderCount:0 };

  function clean(value) { return value == null ? '' : String(value).trim(); }
  function list(value) { return Array.isArray(value) ? value : []; }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[character];
    });
  }
  function attr(value) { return esc(value).replace(/[\r\n]/g, ' '); }
  function finite(value) { var number = Number(value); return Number.isFinite(number) ? number : 0; }
  function now() { return new Date().toISOString(); }
  function notify(message, type) { if (typeof toast === 'function') toast(message, type); }
  function moneyValue(value) {
    try { if (typeof money === 'function') return money(value); } catch (_error) {}
    try { if (typeof fmt === 'function') return fmt(value); } catch (_error2) {}
    return 'GH₵ ' + finite(value).toLocaleString('en-GH', {minimumFractionDigits:2, maximumFractionDigits:2});
  }

  function ownerAdmin() {
    try {
      if (window.ZEZMS && ZEZMS.staffAuth && typeof ZEZMS.staffAuth.getContext === 'function') {
        var role = clean((ZEZMS.staffAuth.getContext() || {}).role).toUpperCase();
        return role === 'OWNER' || role === 'ADMIN';
      }
    } catch (_error) {}
    try {
      var fallbackRole = clean(session && (session.commercialRole || session.role)).toUpperCase();
      return fallbackRole === 'OWNER' || fallbackRole === 'ADMIN';
    } catch (_error2) { return false; }
  }

  function makeId() {
    try { return 'FU-' + crypto.randomUUID().replace(/-/g, '').slice(0, 14).toUpperCase(); }
    catch (_error) { return 'FU-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 8).toUpperCase(); }
  }

  function localDay(value) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    if (value == null || clean(value) === '') return '';
    var date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  }
  function dayNumber(day) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(clean(day))) return NaN;
    var parts = day.split('-').map(Number);
    var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    if (date.getUTCFullYear() !== parts[0] || date.getUTCMonth() !== parts[1] - 1 || date.getUTCDate() !== parts[2]) return NaN;
    return Math.floor(date.getTime() / 86400000);
  }
  function formatDay(day) {
    var number = dayNumber(day);
    if (!Number.isFinite(number)) return '—';
    return new Date(number * 86400000).toLocaleDateString('en-GB', {timeZone:'UTC'});
  }
  function formatTimestamp(value) {
    var date = new Date(value || '');
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-GH');
  }

  function ensureDB() {
    if (typeof DB === 'undefined' || !DB) return [];
    if (!Array.isArray(DB.customerFollowups)) DB.customerFollowups = [];
    DB.customerFollowups.forEach(function (record) {
      if (!record || typeof record !== 'object') return;
      if (!record.followupId) record.followupId = makeId();
      if (STATUSES.indexOf(record.status) < 0) record.status = 'Planned';
      if (PURPOSES.indexOf(record.purpose) < 0) record.purpose = 'General Follow-up';
      if (!record.createdAt) record.createdAt = record.updatedAt || now();
      if (!record.updatedAt) record.updatedAt = record.createdAt;
    });
    return DB.customerFollowups;
  }

  function customerById(customerId) {
    var id = clean(customerId);
    if (!id) return null;
    try {
      if (ZEZMS.customerMaster && typeof ZEZMS.customerMaster.findById === 'function') return ZEZMS.customerMaster.findById(id);
    } catch (_error) {}
    return list(typeof DB !== 'undefined' && DB && DB.customers).find(function (customer) {
      return customer && clean(customer.customerId) === id;
    }) || null;
  }

  function relationshipRows() {
    try {
      if (ZEZMS.customerMaster && typeof ZEZMS.customerMaster.getRelationshipSnapshot === 'function') {
        return ZEZMS.customerMaster.getRelationshipSnapshot().rows || [];
      }
      if (ZEZMS.customerMaster && ZEZMS.customerMaster._test && typeof ZEZMS.customerMaster._test.preparedModel === 'function') {
        return ZEZMS.customerMaster._test.preparedModel().rows || [];
      }
    } catch (_error) {}
    return list(typeof DB !== 'undefined' && DB && DB.customers).map(function (customer) {
      return { customer:customer, transactions:0, lifetimeSales:0, lastPurchase:'', daysSince:null, mostUsedChannel:'Unspecified', repeat:false };
    });
  }

  function normalizedFollowup(record, todayNumber) {
    var dueNumber = dayNumber(record.dueDate);
    var delta = Number.isFinite(dueNumber) ? dueNumber - todayNumber : null;
    var derived = record.status;
    if (record.status === 'Planned' && delta != null) derived = delta < 0 ? 'Overdue' : (delta === 0 ? 'Due Today' : 'Upcoming');
    return Object.assign({}, record, { dueNumber:dueNumber, dayDelta:delta, derivedStatus:derived });
  }

  function deriveModel(options) {
    options = options || {};
    var today = localDay(options.today || new Date());
    var todayNumber = dayNumber(today);
    var rows = options.relationshipRows || relationshipRows();
    var followups = list(options.followups != null ? options.followups : ensureDB()).filter(function (record) {
      return record && clean(record.followupId) && clean(record.customerId);
    }).map(function (record) { return normalizedFollowup(record, todayNumber); });
    var byCustomer = new Map();
    rows.forEach(function (row) { if (row && row.customer) byCustomer.set(clean(row.customer.customerId), row); });
    var usable = followups.filter(function (record) { return byCustomer.has(clean(record.customerId)); });
    var planned = usable.filter(function (record) { return record.status === 'Planned' && Number.isFinite(record.dayDelta); });
    var overdue = planned.filter(function (record) { return record.dayDelta < 0; }).sort(function (a,b) { return a.dueNumber - b.dueNumber || clean(a.followupId).localeCompare(clean(b.followupId)); });
    var dueToday = planned.filter(function (record) { return record.dayDelta === 0; }).sort(function (a,b) { return clean(a.followupId).localeCompare(clean(b.followupId)); });
    var upcoming = planned.filter(function (record) { return record.dayDelta > 0; }).sort(function (a,b) { return a.dueNumber - b.dueNumber || clean(a.followupId).localeCompare(clean(b.followupId)); });
    var completed = usable.filter(function (record) { return record.status === 'Completed'; });
    var monthKey = today.slice(0, 7);
    var completedThisMonth = completed.filter(function (record) { return localDay(record.completedAt).slice(0, 7) === monthKey; });
    var plannedCustomerIds = new Set(planned.map(function (record) { return clean(record.customerId); }));
    var overdueCustomerIds = new Set(overdue.map(function (record) { return clean(record.customerId); }));
    var repeatRows = rows.filter(function (row) { return finite(row.transactions) >= 2; });
    var repeatWithoutPlanned = repeatRows.filter(function (row) { return !plannedCustomerIds.has(clean(row.customer.customerId)); });
    var overdueSales = 0;
    overdueCustomerIds.forEach(function (customerId) {
      var row = byCustomer.get(customerId);
      if (row) overdueSales += finite(row.lifetimeSales);
    });
    var noPurchase90 = rows.filter(function (row) { return finite(row.transactions) > 0 && Number.isFinite(row.daysSince) && row.daysSince >= 90; });

    var contacts = new Map();
    completed.forEach(function (record) {
      var current = contacts.get(record.customerId);
      if (!current || Date.parse(record.completedAt || '') > Date.parse(current.completedAt || '')) contacts.set(record.customerId, record);
    });
    var next = new Map();
    rows.forEach(function (row) {
      var customerId = clean(row.customer.customerId);
      var customerPlanned = planned.filter(function (record) { return clean(record.customerId) === customerId; });
      var customerOverdue = customerPlanned.filter(function (record) { return record.dayDelta < 0; }).sort(function (a,b) { return a.dueNumber - b.dueNumber; });
      var currentOrFuture = customerPlanned.filter(function (record) { return record.dayDelta >= 0; }).sort(function (a,b) { return a.dueNumber - b.dueNumber; });
      if (customerOverdue[0] || currentOrFuture[0]) next.set(customerId, customerOverdue[0] || currentOrFuture[0]);
    });

    var review = repeatRows.slice().sort(function (left, right) {
      var leftDays = Number.isFinite(left.daysSince) ? left.daysSince : -1;
      var rightDays = Number.isFinite(right.daysSince) ? right.daysSince : -1;
      return rightDays - leftDays || finite(right.lifetimeSales) - finite(left.lifetimeSales)
        || clean(left.customer.name).localeCompare(clean(right.customer.name));
    });

    var quartileAvailable = repeatRows.length >= 4;
    var q4Rows = [];
    if (quartileAvailable) {
      var descending = repeatRows.slice().sort(function (left,right) {
        return finite(right.lifetimeSales) - finite(left.lifetimeSales) || clean(left.customer.name).localeCompare(clean(right.customer.name));
      });
      q4Rows = descending.slice(0, Math.ceil(descending.length / 4)).filter(function (row) {
        return !plannedCustomerIds.has(clean(row.customer.customerId));
      });
    }

    var buckets = [
      {label:'0–30 days since purchase', min:0, max:30, customerCount:0, lifetimeSales:0, plannedCustomers:0},
      {label:'31–90 days', min:31, max:90, customerCount:0, lifetimeSales:0, plannedCustomers:0},
      {label:'91–180 days', min:91, max:180, customerCount:0, lifetimeSales:0, plannedCustomers:0},
      {label:'181–365 days', min:181, max:365, customerCount:0, lifetimeSales:0, plannedCustomers:0},
      {label:'More than 365 days', min:366, max:Infinity, customerCount:0, lifetimeSales:0, plannedCustomers:0}
    ];
    rows.filter(function (row) { return finite(row.transactions) > 0 && Number.isFinite(row.daysSince); }).forEach(function (row) {
      var bucket = buckets.find(function (candidate) { return row.daysSince >= candidate.min && row.daysSince <= candidate.max; });
      if (!bucket) return;
      bucket.customerCount += 1;
      bucket.lifetimeSales += finite(row.lifetimeSales);
      if (plannedCustomerIds.has(clean(row.customer.customerId))) bucket.plannedCustomers += 1;
    });

    return {
      today:today, rows:rows, customerById:byCustomer, followups:usable, planned:planned,
      overdue:overdue, dueToday:dueToday, upcoming:upcoming, completed:completed,
      completedThisMonth:completedThisMonth, plannedCustomerIds:plannedCustomerIds,
      overdueCustomerIds:overdueCustomerIds, repeatRows:repeatRows, repeatWithoutPlanned:repeatWithoutPlanned,
      overdueSales:overdueSales, noPurchase90:noPurchase90, lastContactByCustomer:contacts,
      nextByCustomer:next, review:review, quartileAvailable:quartileAvailable, q4Rows:q4Rows,
      recencyBuckets:buckets
    };
  }

  function customerLabel(row) { return clean(row && row.customer && row.customer.name) || 'Unnamed customer'; }
  function customerPhone(row) { return clean(row && row.customer && row.customer.phone) || '—'; }
  function statusBadge(status) {
    var cls = status === 'Overdue' ? 'bad' : (status === 'Due Today' || status === 'Upcoming' ? 'warn' : (status === 'Completed' ? 'ok' : ''));
    return '<span class="badge ' + cls + '">' + esc(status) + '</span>';
  }
  function purposeText(record) { return record.purpose === 'Other' && clean(record.purposeDetail) ? 'Other — ' + clean(record.purposeDetail) : record.purpose; }
  function dueText(record) {
    if (record.dayDelta < 0) return Math.abs(record.dayDelta) + ' day' + (Math.abs(record.dayDelta) === 1 ? '' : 's') + ' overdue';
    if (record.dayDelta === 0) return 'Due today';
    return record.dayDelta + ' day' + (record.dayDelta === 1 ? '' : 's') + ' remaining';
  }
  function contactMethods() {
    return ZEZMS.customerOutreach && Array.isArray(ZEZMS.customerOutreach.contactMethods)
      ? ZEZMS.customerOutreach.contactMethods : [];
  }
  function contactMethodText(record) {
    return ZEZMS.customerOutreach && typeof ZEZMS.customerOutreach.contactMethodText === 'function'
      ? ZEZMS.customerOutreach.contactMethodText(record) : '—';
  }

  function queueRows(records, model, label) {
    if (!records.length) return '<tr><td colspan="10" class="empty">No ' + esc(label.toLowerCase()) + ' follow-ups.</td></tr>';
    return records.map(function (record) {
      var row = model.customerById.get(record.customerId);
      var contactButtons = ZEZMS.customerOutreach && typeof ZEZMS.customerOutreach.contactButtonsHTML === 'function'
        ? ZEZMS.customerOutreach.contactButtonsHTML(record.customerId, record.followupId) : '';
      return '<tr><td>' + esc(customerLabel(row)) + '</td>'
        + '<td>' + esc(customerPhone(row)) + '</td><td>' + formatDay(record.dueDate) + '</td><td>' + esc(dueText(record)) + '</td>'
        + '<td>' + esc(purposeText(record)) + '</td><td>' + (row && row.lastPurchase ? formatDay(localDay(row.lastPurchase)) : '—') + '</td>'
        + '<td class="right">' + (row && Number.isFinite(row.daysSince) ? row.daysSince : '—') + '</td><td class="right mono">' + esc(moneyValue(row && row.lifetimeSales)) + '</td>'
        + '<td>' + statusBadge(record.derivedStatus) + '</td><td><div class="row" style="gap:5px">' + contactButtons
        + '<button class="btn sm ghost" onclick="ZEZMS.customerFollowups.openCustomer(\'' + attr(record.customerId) + '\')">Open Customer</button>'
        + '<button class="btn sm" onclick="ZEZMS.customerFollowups.openComplete(\'' + attr(record.followupId) + '\')">Complete Follow-up</button>'
        + '<button class="btn sm danger" onclick="ZEZMS.customerFollowups.cancel(\'' + attr(record.followupId) + '\')">Cancel</button></div></td></tr>';
    }).join('');
  }

  function retentionRows(model) {
    if (!model.review.length) return '<tr><td colspan="9" class="empty">No repeat customers are available for retention review.</td></tr>';
    return model.review.map(function (row) {
      var id = clean(row.customer.customerId), contact = model.lastContactByCustomer.get(id), next = model.nextByCustomer.get(id);
      return '<tr><td><button class="btn sm ghost" onclick="ZEZMS.customerFollowups.openCustomer(\'' + attr(id) + '\')">' + esc(customerLabel(row)) + '</button></td>'
        + '<td>' + esc(customerPhone(row)) + '</td><td class="right">' + finite(row.transactions) + '</td><td class="right mono">' + esc(moneyValue(row.lifetimeSales)) + '</td>'
        + '<td>' + (row.lastPurchase ? formatDay(localDay(row.lastPurchase)) : '—') + '</td><td class="right">' + (Number.isFinite(row.daysSince) ? row.daysSince : '—') + '</td>'
        + '<td>' + (contact ? formatTimestamp(contact.completedAt) : '—') + '</td><td>' + (next ? formatDay(next.dueDate) + (next.dayDelta < 0 ? ' (overdue)' : '') : '—') + '</td>'
        + '<td>' + esc(row.mostUsedChannel || 'Unspecified') + '</td></tr>';
    }).join('');
  }

  function q4HTML(model) {
    if (!model.quartileAvailable) {
      return '<div class="card" style="margin-top:12px"><h3>High-Value Customers Without Planned Follow-up</h3><div class="empty">Quartile classification is omitted because fewer than four identified repeat customers are available.</div></div>';
    }
    var rows = model.q4Rows.map(function (row) {
      return '<tr><td>' + esc(customerLabel(row)) + '</td><td>' + esc(customerPhone(row)) + '</td><td class="right">' + finite(row.transactions) + '</td><td class="right mono">' + esc(moneyValue(row.lifetimeSales)) + '</td><td>' + (row.lastPurchase ? formatDay(localDay(row.lastPurchase)) : '—') + '</td></tr>';
    }).join('') || '<tr><td colspan="5" class="empty">Every Q4 repeat customer currently has a planned follow-up.</td></tr>';
    return '<div class="card" style="margin-top:12px"><h3>High-Value Customers Without Planned Follow-up</h3><p class="muted">Highest relative customer-sales quartile with no planned follow-up.</p><div class="table-wrap"><table><thead><tr><th>Customer</th><th>Telephone</th><th>Transactions</th><th>Lifetime Sales</th><th>Last Purchase</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }

  function viewHTML() {
    if (!ownerAdmin()) return '<div class="card"><div class="empty">Customer Follow-ups are available only to Owner or Admin.</div></div>';
    var model = deriveModel();
    runtime.renderCount += 1;
    var recency = model.recencyBuckets.map(function (bucket) {
      return '<tr><td>' + esc(bucket.label) + '</td><td class="right">' + bucket.customerCount + '</td><td class="right mono">' + esc(moneyValue(bucket.lifetimeSales)) + '</td><td class="right">' + bucket.plannedCustomers + '</td></tr>';
    }).join('');
    return '<div data-customer-followups-version="' + VERSION + '" data-build="' + BUILD + '"><div class="row" style="justify-content:space-between;align-items:center;margin-bottom:12px"><div><h2 style="margin:0">Customer Follow-ups</h2><p class="muted" style="margin:4px 0 0">Owner/Admin CRM workflow only. No automatic customer contact or financial transaction is created.</p></div><button class="btn" onclick="ZEZMS.customerFollowups.openSchedule()">Schedule Follow-up</button></div>'
      + '<div class="kpis"><div class="kpi"><small>Due Today</small><b>' + model.dueToday.length + '</b></div><div class="kpi"><small>Overdue</small><b>' + model.overdue.length + '</b></div><div class="kpi"><small>Upcoming</small><b>' + model.upcoming.length + '</b></div><div class="kpi"><small>Completed This Month</small><b>' + model.completedThisMonth.length + '</b></div></div>'
      + '<div class="kpis" style="margin-top:12px"><div class="kpi"><small>Customers with Planned Follow-up</small><b>' + model.plannedCustomerIds.size + '</b></div><div class="kpi"><small>Repeat Customers with No Planned Follow-up</small><b>' + model.repeatWithoutPlanned.length + '</b></div><div class="kpi"><small>Sales Value of Overdue-Follow-up Customers</small><b style="font-size:18px">' + esc(moneyValue(model.overdueSales)) + '</b></div><div class="kpi"><small>No Purchase in 90+ Days</small><b>' + model.noPurchase90.length + '</b></div></div>'
      + (ZEZMS.customerOutreach && typeof ZEZMS.customerOutreach.dashboardSummaryHTML === 'function' ? ZEZMS.customerOutreach.dashboardSummaryHTML(model.followups) : '')
      + '<div class="card" style="margin-top:12px"><h3>Follow-up Queue</h3><div class="table-wrap"><table><thead><tr><th>Customer</th><th>Telephone</th><th>Due Date</th><th>Days Due / Remaining</th><th>Purpose</th><th>Last Purchase</th><th>Days Since Last Purchase</th><th>Lifetime Sales</th><th>Status</th><th>Action</th></tr></thead><tbody>'
      + '<tr><th colspan="10">1. Overdue</th></tr>' + queueRows(model.overdue, model, 'Overdue')
      + '<tr><th colspan="10">2. Due Today</th></tr>' + queueRows(model.dueToday, model, 'Due Today')
      + '<tr><th colspan="10">3. Upcoming</th></tr>' + queueRows(model.upcoming, model, 'Upcoming') + '</tbody></table></div></div>'
      + '<div class="card" style="margin-top:12px"><h3>Customer Retention Review</h3><p class="muted">Repeat customers, sorted by longest time since purchase, then lifetime sales and customer name.</p><div class="table-wrap"><table><thead><tr><th>Customer</th><th>Telephone</th><th>Transactions</th><th>Lifetime Sales</th><th>Last Purchase</th><th>Days Since Last Purchase</th><th>Last Contact</th><th>Next Follow-up</th><th>Most Used Sales Source</th></tr></thead><tbody>' + retentionRows(model) + '</tbody></table></div></div>'
      + q4HTML(model)
      + '<div class="card" style="margin-top:12px"><h3>Customer Recency Review</h3><div class="table-wrap"><table><thead><tr><th>Recency Bucket</th><th>Customer Count</th><th>Lifetime Sales Represented</th><th>Customers with Planned Follow-up</th></tr></thead><tbody>' + recency + '</tbody></table></div></div></div>';
  }

  function optionsHTML(values, blankLabel) {
    return '<option value="">' + esc(blankLabel || '— select —') + '</option>' + values.map(function (value) { return '<option value="' + attr(value) + '">' + esc(value) + '</option>'; }).join('');
  }
  function customerOptions(selectedId) {
    return relationshipRows().map(function (row) { return row.customer; }).sort(function (a,b) { return clean(a.name).localeCompare(clean(b.name)); }).map(function (customer) {
      return '<option value="' + attr(customer.customerId) + '"' + (clean(customer.customerId) === clean(selectedId) ? ' selected' : '') + '>' + esc(customer.name || 'Unnamed customer') + ' — ' + esc(customer.phone || customer.customerId) + '</option>';
    }).join('');
  }

  function openSchedule(customerId) {
    if (!ownerAdmin()) { notify('Only Owner or Admin can schedule customer follow-ups.', 'err'); return; }
    var choices = customerOptions(customerId);
    if (!choices) {
      if (typeof openModal === 'function') openModal('<h3>Schedule Follow-up</h3><div class="empty">Create or build an identifiable Customer Master record first.</div><div class="row"><button class="btn ghost" onclick="closeModal();nav(\'customer-master\')">Open Customer Master</button></div>');
      return;
    }
    openModal('<h3>Schedule Follow-up</h3><div class="field"><label>Customer *</label><select id="fuCustomer"><option value="">— select Customer Master record —</option>' + choices + '</select></div>'
      + '<div class="field"><label>Due Date *</label><input id="fuDueDate" type="date"></div>'
      + '<div class="field"><label>Purpose *</label><select id="fuPurpose" onchange="ZEZMS.customerFollowups.togglePurposeDetail()">' + optionsHTML(PURPOSES, '— select purpose —') + '</select></div>'
      + '<div class="field" id="fuPurposeDetailWrap" hidden><label>Other Purpose Detail (optional)</label><input id="fuPurposeDetail" maxlength="200"></div>'
      + '<div class="field"><label>Notes (optional)</label><textarea id="fuNotes" maxlength="' + MAX_NOTES + '" rows="4"></textarea></div>'
      + '<div class="row"><button class="btn" onclick="ZEZMS.customerFollowups.saveScheduled()">Save Planned Follow-up</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>');
  }
  function togglePurposeDetail() {
    var select = document.getElementById('fuPurpose'), wrap = document.getElementById('fuPurposeDetailWrap');
    if (wrap) wrap.hidden = !select || select.value !== 'Other';
  }
  function saveScheduled() {
    if (!ownerAdmin()) { notify('Only Owner or Admin can schedule customer follow-ups.', 'err'); return; }
    var customerId = clean((document.getElementById('fuCustomer') || {}).value);
    var dueDate = clean((document.getElementById('fuDueDate') || {}).value);
    var purpose = clean((document.getElementById('fuPurpose') || {}).value);
    if (!customerById(customerId)) { notify('Select an existing Customer Master customer.', 'err'); return; }
    if (!Number.isFinite(dayNumber(dueDate))) { notify('Due Date is required.', 'err'); return; }
    if (PURPOSES.indexOf(purpose) < 0) { notify('Purpose is required.', 'err'); return; }
    var timestamp = now();
    var record = {
      followupId:makeId(), customerId:customerId, dueDate:dueDate, purpose:purpose,
      purposeDetail:purpose === 'Other' ? clean((document.getElementById('fuPurposeDetail') || {}).value).slice(0, 200) : '',
      notes:clean((document.getElementById('fuNotes') || {}).value).slice(0, MAX_NOTES),
      status:'Planned', createdAt:timestamp, updatedAt:timestamp, completedAt:'', outcome:'', outcomeDetail:'',
      createdBy:(function () { try { return clean(session && session.cashier); } catch (_error) { return ''; } }())
    };
    ensureDB().push(record);
    saveDB();
    runtime.selectedCustomerId = customerId;
    closeModal();
    notify('Planned follow-up saved.');
    if (typeof render === 'function') render();
    try { window.dispatchEvent(new CustomEvent('zezms-customer-followups-updated')); } catch (_error2) {}
    return record;
  }

  function findFollowup(id) { return ensureDB().find(function (record) { return record && clean(record.followupId) === clean(id); }) || null; }
  function openComplete(id) {
    if (!ownerAdmin()) { notify('Only Owner or Admin can complete customer follow-ups.', 'err'); return; }
    var record = findFollowup(id);
    if (!record || record.status !== 'Planned') { notify('Only a Planned follow-up can be completed.', 'err'); return; }
    var customer = customerById(record.customerId);
    openModal('<h3>Complete Follow-up</h3><p class="muted">' + esc(customer && customer.name || record.customerId) + ' · ' + esc(purposeText(record)) + ' · due ' + formatDay(record.dueDate) + '</p>'
      + '<div class="field"><label>Contact Method *</label><select id="fuContactMethod" onchange="ZEZMS.customerFollowups.toggleContactMethodOther()">' + optionsHTML(contactMethods(), '— select actual contact method —') + '</select></div>'
      + '<div class="field" id="fuContactMethodOtherWrap" hidden><label>Other Contact Method</label><input id="fuContactMethodOther" maxlength="120"></div>'
      + '<div class="field"><label>Outcome (optional)</label><select id="fuOutcome" onchange="ZEZMS.customerFollowups.toggleOutcomeDetail()">' + optionsHTML(OUTCOMES, '— no outcome selected —') + '</select></div>'
      + '<div class="field" id="fuOutcomeDetailWrap" hidden><label>Other Outcome Detail (optional)</label><input id="fuOutcomeDetail" maxlength="240"></div>'
      + '<div class="row"><button class="btn" onclick="ZEZMS.customerFollowups.complete(\'' + attr(record.followupId) + '\')">Mark Completed</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>');
  }
  function toggleOutcomeDetail() {
    var select = document.getElementById('fuOutcome'), wrap = document.getElementById('fuOutcomeDetailWrap');
    if (wrap) wrap.hidden = !select || select.value !== 'Other';
  }
  function toggleContactMethodOther() {
    var select = document.getElementById('fuContactMethod'), wrap = document.getElementById('fuContactMethodOtherWrap');
    if (wrap) wrap.hidden = !select || select.value !== 'Other';
  }
  function complete(id) {
    if (!ownerAdmin()) { notify('Only Owner or Admin can complete customer follow-ups.', 'err'); return; }
    var record = findFollowup(id);
    if (!record || record.status !== 'Planned') { notify('Only a Planned follow-up can be completed.', 'err'); return; }
    var contactMethod = clean((document.getElementById('fuContactMethod') || {}).value);
    if (contactMethods().indexOf(contactMethod) < 0) { notify('Contact Method is required.', 'err'); return; }
    var outcome = clean((document.getElementById('fuOutcome') || {}).value);
    if (outcome && OUTCOMES.indexOf(outcome) < 0) { notify('Choose a valid Outcome.', 'err'); return; }
    var followAgain = outcome === 'Follow-up Again';
    record.status = 'Completed'; record.completedAt = now(); record.updatedAt = record.completedAt;
    record.contactMethod = contactMethod;
    record.contactMethodOther = contactMethod === 'Other' ? clean((document.getElementById('fuContactMethodOther') || {}).value).slice(0, 120) : '';
    record.outcome = outcome; record.outcomeDetail = outcome === 'Other' ? clean((document.getElementById('fuOutcomeDetail') || {}).value).slice(0, 240) : '';
    saveDB(); closeModal(); notify('Follow-up marked Completed.');
    if (typeof render === 'function') render();
    try { window.dispatchEvent(new CustomEvent('zezms-customer-followups-updated')); } catch (_error) {}
    if (followAgain) setTimeout(function () { openSchedule(record.customerId); }, 40);
    return record;
  }
  function cancel(id) {
    if (!ownerAdmin()) { notify('Only Owner or Admin can cancel customer follow-ups.', 'err'); return; }
    var record = findFollowup(id);
    if (!record || record.status !== 'Planned') { notify('Only a Planned follow-up can be cancelled.', 'err'); return; }
    if (!window.confirm('Cancel this planned follow-up? The cancelled record will remain in customer history.')) return;
    record.status = 'Cancelled'; record.updatedAt = now();
    saveDB(); notify('Follow-up cancelled and preserved in history.');
    if (typeof render === 'function') render();
    try { window.dispatchEvent(new CustomEvent('zezms-customer-followups-updated')); } catch (_error) {}
    return record;
  }

  function historyRows(customerId, includeCancelled) {
    var todayNumber = dayNumber(localDay(new Date()));
    var records = ensureDB().filter(function (record) { return clean(record.customerId) === clean(customerId) && (includeCancelled || record.status !== 'Cancelled'); })
      .map(function (record) { return normalizedFollowup(record, todayNumber); })
      .sort(function (a,b) { return b.dueNumber - a.dueNumber || Date.parse(b.updatedAt || '') - Date.parse(a.updatedAt || ''); });
    if (!records.length) return '<tr><td colspan="7" class="empty">No follow-up history for this customer.</td></tr>';
    return records.map(function (record) {
      return '<tr><td>' + formatDay(record.dueDate) + '</td><td>' + (record.completedAt ? formatTimestamp(record.completedAt) : '—') + '</td><td>' + esc(purposeText(record)) + '</td><td>' + esc(contactMethodText(record)) + '</td><td>' + esc(record.outcome ? record.outcome + (record.outcomeDetail ? ' — ' + record.outcomeDetail : '') : '—') + '</td><td>' + statusBadge(record.derivedStatus) + '</td><td>' + esc(record.notes || '—') + '</td></tr>';
    }).join('');
  }
  function customerDetailHTML(customerId) {
    if (!ownerAdmin()) return '';
    var id = clean(customerId), model = deriveModel(), customerRecords = model.followups.filter(function (record) { return clean(record.customerId) === id; });
    var planned = customerRecords.filter(function (record) { return record.status === 'Planned'; });
    var completed = customerRecords.filter(function (record) { return record.status === 'Completed'; });
    var last = model.lastContactByCustomer.get(id), next = model.nextByCustomer.get(id);
    return '<div class="card" style="margin-top:12px"><div class="row" style="justify-content:space-between;align-items:center"><div><h3 style="margin:0">Follow-up &amp; Contact History</h3><p class="muted" style="margin:5px 0 0">Last Purchase and Last Contact remain separate relationship facts.</p></div><div class="row"><button class="btn" onclick="ZEZMS.customerFollowups.openSchedule(\'' + attr(id) + '\')">Schedule Follow-up</button><button class="btn ghost" onclick="ZEZMS.customerFollowups.openHistory(\'' + attr(id) + '\')">View Follow-up History</button></div></div>'
      + '<div class="grid g2" style="margin-top:12px"><div class="statline"><span>Next Planned Follow-up</span><b>' + (next ? formatDay(next.dueDate) + (next.dayDelta < 0 ? ' · ' + Math.abs(next.dayDelta) + ' days overdue' : '') : '—') + '</b></div><div class="statline"><span>Last Completed Follow-up / Last Contact Date</span><b>' + (last ? formatTimestamp(last.completedAt) : '—') + '</b></div><div class="statline"><span>Planned Follow-ups</span><b>' + planned.length + '</b></div><div class="statline"><span>Completed Follow-ups</span><b>' + completed.length + '</b></div></div>'
      + '<div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>Due Date</th><th>Completed Date</th><th>Purpose</th><th>Contact Method</th><th>Outcome</th><th>Status</th><th>Notes</th></tr></thead><tbody>' + historyRows(id, false) + '</tbody></table></div></div>';
  }
  function openHistory(customerId) {
    if (!ownerAdmin()) { notify('Only Owner or Admin can view full follow-up history.', 'err'); return; }
    var customer = customerById(customerId);
    openModal('<h3>Follow-up History — ' + esc(customer && customer.name || customerId) + '</h3><p class="muted">Completed and cancelled records remain auditable. No delete action is provided.</p><div class="table-wrap"><table><thead><tr><th>Due Date</th><th>Completed Date</th><th>Purpose</th><th>Contact Method</th><th>Outcome</th><th>Status</th><th>Notes</th></tr></thead><tbody>' + historyRows(customerId, true) + '</tbody></table></div><div class="row" style="margin-top:12px"><button class="btn" onclick="closeModal();ZEZMS.customerFollowups.openSchedule(\'' + attr(customerId) + '\')">Schedule Follow-up</button><button class="btn ghost" onclick="closeModal()">Close</button></div>');
  }
  function openCustomer(customerId) {
    runtime.selectedCustomerId = clean(customerId);
    if (typeof nav === 'function') nav('customer-master');
    setTimeout(function () {
      if (ZEZMS.customerMaster && typeof ZEZMS.customerMaster.selectCustomer === 'function') ZEZMS.customerMaster.selectCustomer(customerId);
    }, 0);
  }

  window.ZEZMS = window.ZEZMS || {};
  ZEZMS.customerFollowups = Object.freeze({
    version:VERSION, build:BUILD, release:RELEASE, purposes:PURPOSES, statuses:STATUSES, outcomes:OUTCOMES,
    ensureDB:ensureDB, viewHTML:viewHTML, customerDetailHTML:customerDetailHTML,
    openSchedule:openSchedule, togglePurposeDetail:togglePurposeDetail, saveScheduled:saveScheduled,
    openComplete:openComplete, toggleOutcomeDetail:toggleOutcomeDetail, toggleContactMethodOther:toggleContactMethodOther, complete:complete, cancel:cancel,
    openHistory:openHistory, openCustomer:openCustomer, findById:findFollowup,
    getRuntimeSnapshot:function () { return {renderCount:runtime.renderCount, selectedCustomerId:runtime.selectedCustomerId, recordCount:ensureDB().length}; },
    _test:Object.freeze({ deriveModel:deriveModel, dayNumber:dayNumber, localDay:localDay, normalizedFollowup:normalizedFollowup, makeId:makeId, dueText:dueText })
  });
  ensureDB();
}());
