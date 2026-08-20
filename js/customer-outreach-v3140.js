/* ZEZMS TradeFlow Owner Edition v3.14.0
   Stage 5E — manual customer outreach and contact-action helpers. */
(function () {
  'use strict';

  var VERSION = '3.14.0';
  var BUILD = '20260820-customer-outreach-r48';
  var RELEASE = 'Customer Outreach & Contact Actions';
  var MAX_MESSAGE = 1000;
  var CONTACT_METHODS = Object.freeze(['Phone Call', 'WhatsApp', 'In Person', 'SMS', 'Email', 'Other']);
  var MESSAGE_TYPES = Object.freeze([
    'General Follow-up', 'Product Availability', 'After-Sale Check', 'Quotation Follow-up',
    'Corporate/B2B Follow-up', 'Payment Follow-up', 'Customer Enquiry Response', 'Custom Message'
  ]);
  var runtime = { openedActions:0, lastActionType:'', lastCustomerId:'' };

  function clean(value) { return value == null ? '' : String(value).trim(); }
  function list(value) { return Array.isArray(value) ? value : []; }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[character];
    });
  }
  function attr(value) { return esc(value).replace(/[\r\n]/g, ' '); }
  function notify(message, type) { if (typeof toast === 'function') toast(message, type); }
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
  function phoneKey(value) {
    try {
      if (ZEZMS.customerMaster && typeof ZEZMS.customerMaster.phoneKey === 'function') {
        return clean(ZEZMS.customerMaster.phoneKey(value));
      }
    } catch (_error) {}
    var raw = clean(value);
    if (!raw || !/^[+\d\s().-]+$/.test(raw)) return '';
    var digits = raw.replace(/\D/g, '');
    if (/^00233\d{9}$/.test(digits)) digits = digits.slice(2);
    if (/^0\d{9}$/.test(digits)) digits = '233' + digits.slice(1);
    return /^\d{7,15}$/.test(digits) && !/^0+$/.test(digits) ? digits : '';
  }
  function whatsappDigits(customerOrPhone) {
    if (customerOrPhone && typeof customerOrPhone === 'object') {
      return phoneKey(customerOrPhone.phoneKey || customerOrPhone.phone || '');
    }
    return phoneKey(customerOrPhone);
  }
  function displayPhone(customer) { return clean(customer && customer.phone); }
  function businessName() {
    try { if (typeof BUSINESS !== 'undefined' && BUSINESS && clean(BUSINESS.name)) return clean(BUSINESS.name); } catch (_error) {}
    try { if (window.ZEZMS_CONFIG && clean(window.ZEZMS_CONFIG.businessName)) return clean(window.ZEZMS_CONFIG.businessName); } catch (_error2) {}
    return 'our business';
  }
  function firstName(customer) {
    var name = clean(customer && customer.name);
    return name ? name.split(/\s+/)[0] : 'Customer';
  }
  function preparedMessage(type, customer, identity) {
    var greeting = 'Hello ' + firstName(customer) + ',';
    var business = clean(identity) || businessName();
    var signoff = '\n\nRegards,\n' + business;
    var bodies = {
      'General Follow-up':'we are following up to check how we may assist you.',
      'Product Availability':'we are contacting you regarding the availability of the product you requested.',
      'After-Sale Check':'we are checking that your recent purchase is serving you well. Please let us know if you need assistance.',
      'Quotation Follow-up':'we are following up on the quotation shared with you. Please let us know if you need any clarification.',
      'Corporate/B2B Follow-up':'we are following up regarding your business enquiry and would be pleased to assist with the next steps.',
      'Payment Follow-up':'we are following up regarding the payment arrangement previously discussed. Please contact us when convenient.',
      'Customer Enquiry Response':'thank you for your enquiry. We are ready to assist with the information or next steps you require.'
    };
    if (type === 'Custom Message') return '';
    var body = bodies[type] || bodies['General Follow-up'];
    return (greeting + '\n\n' + body.charAt(0).toUpperCase() + body.slice(1) + signoff).slice(0, MAX_MESSAGE);
  }
  function messageOptions(selected) {
    return MESSAGE_TYPES.map(function (type) {
      return '<option value="' + attr(type) + '"' + (type === selected ? ' selected' : '') + '>' + esc(type) + '</option>';
    }).join('');
  }
  function recordAction(type, customerId) {
    runtime.openedActions += 1;
    runtime.lastActionType = type;
    runtime.lastCustomerId = clean(customerId);
  }
  function openExternal(url, type, customerId) {
    try {
      var opened = window.open(url, '_blank', 'noopener,noreferrer');
      if (!opened) {
        notify(type + ' could not be opened. Check the device handler or browser pop-up permission.', 'warn');
        return false;
      }
      try { opened.opener = null; } catch (_error) {}
      recordAction(type, customerId);
      notify('Contact action opened. Complete the follow-up only after confirming what actually happened.', 'ok');
      return true;
    } catch (_error2) {
      notify(type + ' could not be opened on this device. No follow-up status was changed.', 'warn');
      return false;
    }
  }
  function callCustomer(customerId) {
    if (!ownerAdmin()) { notify('Only Owner or Admin can contact customers.', 'err'); return false; }
    var customer = customerById(customerId), digits = whatsappDigits(customer);
    if (!customer || !digits) { notify('Usable telephone required', 'warn'); return false; }
    return openExternal('tel:+' + digits, 'Call', customerId);
  }
  async function copyTelephone(customerId) {
    if (!ownerAdmin()) { notify('Only Owner or Admin can copy customer telephone details.', 'err'); return false; }
    var customer = customerById(customerId), phone = displayPhone(customer);
    if (!phone) { notify('Usable telephone required', 'warn'); return false; }
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(phone);
      } else {
        var area = document.createElement('textarea');
        area.value = phone; area.setAttribute('readonly', ''); area.style.position = 'fixed'; area.style.opacity = '0';
        document.body.appendChild(area); area.select();
        if (!document.execCommand || !document.execCommand('copy')) throw new Error('Clipboard unavailable');
        area.remove();
      }
      notify('Telephone copied', 'ok');
      return true;
    } catch (_error) {
      notify('Telephone could not be copied on this device.', 'warn');
      return false;
    }
  }
  function openMessageEditor(customerId, followupId, selectedType) {
    if (!ownerAdmin()) { notify('Only Owner or Admin can prepare customer messages.', 'err'); return; }
    var customer = customerById(customerId), digits = whatsappDigits(customer);
    if (!customer || !digits) { notify('Usable telephone required', 'warn'); return; }
    var type = MESSAGE_TYPES.indexOf(selectedType) >= 0 ? selectedType : 'General Follow-up';
    var message = preparedMessage(type, customer, businessName());
    openModal('<h3>Prepare WhatsApp Message</h3><p class="muted">The text remains editable and is not saved. WhatsApp still requires the Owner to review and send it.</p>'
      + '<div class="field"><label>Customer</label><input value="' + attr(customer.name || 'Unnamed customer') + ' — ' + attr(customer.phone || '') + '" readonly></div>'
      + '<div class="field"><label>Message Type</label><select id="outreachMessageType" onchange="ZEZMS.customerOutreach.changeTemplate(\'' + attr(customerId) + '\')">' + messageOptions(type) + '</select></div>'
      + '<div class="field"><label>Prepared Message</label><textarea id="outreachMessage" rows="10" maxlength="' + MAX_MESSAGE + '">' + esc(message) + '</textarea><div class="muted" style="font-size:11px">Maximum ' + MAX_MESSAGE + ' characters. Message content is runtime-only.</div></div>'
      + '<div class="row"><button class="btn" onclick="ZEZMS.customerOutreach.openWhatsAppFromEditor(\'' + attr(customerId) + '\',\'' + attr(followupId || '') + '\')">Open WhatsApp</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>');
  }
  function changeTemplate(customerId) {
    var customer = customerById(customerId), select = document.getElementById('outreachMessageType'), area = document.getElementById('outreachMessage');
    if (!customer || !select || !area) return;
    area.value = preparedMessage(clean(select.value), customer, businessName());
    area.focus();
  }
  function openWhatsAppFromEditor(customerId) {
    if (!ownerAdmin()) { notify('Only Owner or Admin can open customer communication.', 'err'); return false; }
    var customer = customerById(customerId), digits = whatsappDigits(customer);
    if (!customer || !digits) { notify('Usable telephone required', 'warn'); return false; }
    var area = document.getElementById('outreachMessage');
    var message = clean(area && area.value).slice(0, MAX_MESSAGE);
    var url = 'https://wa.me/' + digits + (message ? '?text=' + encodeURIComponent(message) : '');
    return openExternal(url, 'WhatsApp', customerId);
  }
  function contactButtonsHTML(customerId, followupId) {
    if (!ownerAdmin()) return '';
    var customer = customerById(customerId), usable = !!whatsappDigits(customer), disabled = usable ? '' : ' disabled title="Usable telephone required"';
    return '<button class="btn sm ghost"' + disabled + ' onclick="ZEZMS.customerOutreach.callCustomer(\'' + attr(customerId) + '\')">Call</button>'
      + '<button class="btn sm ghost"' + disabled + ' onclick="ZEZMS.customerOutreach.openMessageEditor(\'' + attr(customerId) + '\',\'' + attr(followupId || '') + '\')">WhatsApp</button>'
      + (usable ? '' : '<span class="muted" style="font-size:10px">Usable telephone required</span>');
  }
  function customerDetailHTML(customerId) {
    if (!ownerAdmin()) return '';
    var customer = customerById(customerId), usable = !!whatsappDigits(customer), disabled = usable ? '' : ' disabled title="Usable telephone required"';
    return '<div class="card" style="margin-top:12px" data-customer-outreach="' + VERSION + '"><h3>Contact Customer</h3><p class="muted">Every contact action is manual. Opening an external handler never completes a follow-up.</p>'
      + '<div class="row"><button class="btn"' + disabled + ' onclick="ZEZMS.customerOutreach.callCustomer(\'' + attr(customerId) + '\')">Call</button>'
      + '<button class="btn"' + disabled + ' onclick="ZEZMS.customerOutreach.openMessageEditor(\'' + attr(customerId) + '\',\'\')">WhatsApp</button>'
      + '<button class="btn ghost"' + (displayPhone(customer) ? '' : ' disabled') + ' onclick="ZEZMS.customerOutreach.copyTelephone(\'' + attr(customerId) + '\')">Copy Telephone</button>'
      + '<button class="btn ghost" onclick="ZEZMS.customerFollowups.openSchedule(\'' + attr(customerId) + '\')">Schedule Follow-up</button></div>'
      + (usable ? '' : '<div class="notice" style="margin-top:10px">Usable telephone required</div>') + '</div>';
  }
  function validContactMethod(value) { return CONTACT_METHODS.indexOf(clean(value)) >= 0; }
  function contactMethodText(record) {
    if (!record || !validContactMethod(record.contactMethod)) return '—';
    return record.contactMethod === 'Other' && clean(record.contactMethodOther)
      ? 'Other — ' + clean(record.contactMethodOther) : record.contactMethod;
  }
  function completedRecords(followups, customerId) {
    return list(followups != null ? followups : (typeof DB !== 'undefined' && DB && DB.customerFollowups)).filter(function (record) {
      return record && record.status === 'Completed' && (!customerId || clean(record.customerId) === clean(customerId)) && validContactMethod(record.contactMethod);
    });
  }
  function completedCounts(followups) {
    var counts = {};
    CONTACT_METHODS.forEach(function (method) { counts[method] = 0; });
    completedRecords(followups).forEach(function (record) { counts[record.contactMethod] += 1; });
    return counts;
  }
  function mostUsedContactMethod(customerId, followups) {
    var counts = completedCounts(completedRecords(followups, customerId));
    var ranked = CONTACT_METHODS.map(function (method, order) { return {method:method,count:counts[method],order:order}; })
      .filter(function (item) { return item.count > 0; })
      .sort(function (left,right) { return right.count - left.count || left.order - right.order; });
    return ranked.length ? ranked[0].method : '—';
  }
  function relationshipSummaryHTML(customerId) {
    return '<div class="statline"><span>Most Used Contact Method</span><b>' + esc(mostUsedContactMethod(customerId)) + '</b></div>';
  }
  function dashboardSummaryHTML(followups) {
    if (!ownerAdmin()) return '';
    var counts = completedCounts(followups);
    return '<div class="card" style="margin-top:12px"><h3>Completed Contacts by Method</h3><p class="muted">All-history count of Completed follow-ups with a recorded Contact Method.</p><div class="table-wrap"><table><thead><tr><th>Contact Method</th><th class="right">Completed Contacts</th></tr></thead><tbody>'
      + CONTACT_METHODS.map(function (method) { return '<tr><td>' + esc(method) + '</td><td class="right">' + counts[method] + '</td></tr>'; }).join('')
      + '</tbody></table></div></div>';
  }

  window.ZEZMS = window.ZEZMS || {};
  ZEZMS.customerOutreach = Object.freeze({
    version:VERSION, build:BUILD, release:RELEASE, maxMessage:MAX_MESSAGE,
    contactMethods:CONTACT_METHODS, messageTypes:MESSAGE_TYPES,
    phoneDigits:whatsappDigits, preparedMessage:preparedMessage,
    callCustomer:callCustomer, copyTelephone:copyTelephone,
    openMessageEditor:openMessageEditor, changeTemplate:changeTemplate,
    openWhatsAppFromEditor:openWhatsAppFromEditor, contactButtonsHTML:contactButtonsHTML,
    customerDetailHTML:customerDetailHTML, validContactMethod:validContactMethod,
    contactMethodText:contactMethodText, mostUsedContactMethod:mostUsedContactMethod,
    completedCounts:completedCounts, relationshipSummaryHTML:relationshipSummaryHTML,
    dashboardSummaryHTML:dashboardSummaryHTML,
    getRuntimeSnapshot:function () { return Object.assign({}, runtime); },
    _test:Object.freeze({ phoneKey:phoneKey, businessName:businessName, firstName:firstName, openExternal:openExternal, completedRecords:completedRecords })
  });
}());
