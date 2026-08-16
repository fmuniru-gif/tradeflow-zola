/* ZEZMS TradeFlow Owner Edition v3.12.1
   Device-local authenticated transport for the ZEZ Print Bridge. */
(function () {
  'use strict';

  var VERSION = '3.12.1';
  var BUILD = '20260816-direct-print-bridge-r46';
  var PROTOCOL = 'ZEZPRINT/1';
  var STORAGE_KEY = 'zezms_print_bridge_v1';
  var SYSTEM = 'system-dialog';
  var LOCAL = 'local-bridge';
  var MAX_PAYLOAD_BYTES = 4 * 1024 * 1024;
  var base = window.ZEZPrint;
  var inflight = new Map();
  var fallbacks = new Map();
  var fallbackSequence = 0;
  var watermarkPromise = null;
  var runtime = {
    connection: 'Not configured',
    printer: 'Unknown',
    printerReady: false,
    bridgeVersion: '',
    lastMessage: '',
    lastSuccessfulContact: ''
  };

  if (!base || typeof base.printHtml !== 'function') return;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch];
    });
  }

  function defaultConfig() {
    return { bridgeUrl:'', token:'', mode:SYSTEM, pairedAt:'', deviceName:'', lastContact:'' };
  }

  function loadConfig() {
    var config = defaultConfig();
    try {
      var parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (parsed && typeof parsed === 'object') {
        config.bridgeUrl = String(parsed.bridgeUrl || '');
        config.token = String(parsed.token || '');
        config.mode = parsed.mode === LOCAL ? LOCAL : SYSTEM;
        config.pairedAt = String(parsed.pairedAt || '');
        config.deviceName = String(parsed.deviceName || '');
        config.lastContact = String(parsed.lastContact || '');
      }
    } catch (_) {}
    return config;
  }

  function saveConfig(config) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      bridgeUrl:String(config.bridgeUrl || ''),
      token:String(config.token || ''),
      mode:config.mode === LOCAL ? LOCAL : SYSTEM,
      pairedAt:String(config.pairedAt || ''),
      deviceName:String(config.deviceName || ''),
      lastContact:String(config.lastContact || '')
    }));
  }

  function isPrivateV4(host) {
    var parts = String(host || '').split('.').map(Number);
    if (parts.length !== 4 || parts.some(function (part) { return !Number.isInteger(part) || part < 0 || part > 255; })) return false;
    return parts[0] === 10
      || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
      || (parts[0] === 192 && parts[1] === 168)
      || (parts[0] === 169 && parts[1] === 254)
      || parts[0] === 127;
  }

  function normalizeBridgeUrl(value) {
    var raw = String(value || '').trim().replace(/\/+$/, '');
    if (!raw) throw new Error('Enter the Bridge Address shown by ZEZ Print Bridge.');
    var url;
    try { url = new URL(raw); } catch (_) { throw new Error('Bridge Address must be a complete http:// or https:// address.'); }
    var host = url.hostname.toLowerCase();
    var localName = host === 'localhost' || host.endsWith('.local');
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Bridge Address must use HTTP or HTTPS.');
    if (!localName && !isPrivateV4(host) && host !== '::1' && host !== '[::1]') {
      throw new Error('Bridge Address must be localhost, a .local name, or a private shop-network IP address.');
    }
    if (url.username || url.password || (url.pathname && url.pathname !== '/') || url.search || url.hash) {
      throw new Error('Bridge Address must contain only the local bridge host and port.');
    }
    return url.origin;
  }

  function byteLength(value) {
    if (window.TextEncoder) return new TextEncoder().encode(String(value || '')).length;
    return unescape(encodeURIComponent(String(value || ''))).length;
  }

  function randomJobId() {
    if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    var bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    var hex = Array.from(bytes).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    return hex.slice(0,8) + '-' + hex.slice(8,12) + '-' + hex.slice(12,16) + '-' + hex.slice(16,20) + '-' + hex.slice(20);
  }

  async function bridgeFetch(path, options, timeoutMs) {
    var config = loadConfig();
    var baseUrl = normalizeBridgeUrl(config.bridgeUrl);
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs || 3000);
    options = options || {};
    options.signal = controller.signal;
    options.cache = 'no-store';
    options.targetAddressSpace = 'local';
    try {
      return await fetch(baseUrl + path, options);
    } catch (error) {
      if (error && error.name === 'AbortError') throw new Error('Print Bridge did not respond before the connection timed out.');
      var networkError = new Error('Print Bridge is not reachable on this network. Check that it is running, LAN mode is enabled for a phone, and Local Network Access permission is allowed.');
      networkError.cause = error;
      throw networkError;
    } finally {
      clearTimeout(timer);
    }
  }

  async function responseJson(response) {
    var body = {};
    try { body = await response.json(); } catch (_) {}
    if (!response.ok) {
      var error = new Error(body.message || body.error || ('Print Bridge returned HTTP ' + response.status + '.'));
      error.status = response.status;
      error.code = body.code || '';
      throw error;
    }
    return body;
  }

  function authHeaders(config) {
    return { 'Authorization':'Bearer ' + config.token, 'X-ZEZPrint-Protocol':PROTOCOL };
  }

  function noteContact() {
    var config = loadConfig();
    config.lastContact = new Date().toISOString();
    saveConfig(config);
    runtime.lastSuccessfulContact = config.lastContact;
  }

  function renderRuntimeStatus() {
    var connection = document.getElementById('zezBridgeConnectionStatus');
    var printer = document.getElementById('zezBridgePrinterStatus');
    var message = document.getElementById('zezBridgeRuntimeMessage');
    var contact = document.getElementById('zezBridgeLastContact');
    if (connection) connection.textContent = runtime.connection;
    if (printer) printer.textContent = runtime.printerReady ? ('Ready - ' + runtime.printer) : runtime.printer;
    if (message) message.textContent = runtime.lastMessage || '';
    if (contact) contact.textContent = runtime.lastSuccessfulContact ? new Date(runtime.lastSuccessfulContact).toLocaleString() : 'Never';
  }

  function setRuntime(connection, message) {
    if (connection) runtime.connection = connection;
    runtime.lastMessage = message || '';
    renderRuntimeStatus();
  }

  async function getHealth() {
    setRuntime('Connecting', 'Checking the local bridge...');
    var response = await bridgeFetch('/health', { method:'GET', headers:{ 'X-ZEZPrint-Protocol':PROTOCOL } }, 2800);
    var health = await responseJson(response);
    if (health.protocolVersion !== PROTOCOL) throw new Error('This Print Bridge uses an incompatible protocol. Expected ' + PROTOCOL + '.');
    runtime.bridgeVersion = String(health.bridgeVersion || '');
    runtime.printerReady = !!health.printerReady;
    runtime.printer = health.printerConfigured ? String(health.printerName || 'Configured printer') : 'No printer selected';
    runtime.connection = loadConfig().token ? 'Connected' : 'Pairing required';
    runtime.lastMessage = health.ready ? 'Bridge service is ready.' : 'Bridge is running but not ready to print.';
    noteContact();
    renderRuntimeStatus();
    return health;
  }

  async function getStatus() {
    var config = loadConfig();
    if (!config.token) throw new Error('Pair this device before requesting protected bridge status.');
    var response = await bridgeFetch('/status', { method:'GET', headers:authHeaders(config) }, 3000);
    var status = await responseJson(response);
    runtime.printerReady = !!status.printerReady;
    runtime.printer = status.printerConfigured ? String(status.printerName || 'Configured printer') : 'No printer selected';
    runtime.connection = 'Connected';
    runtime.lastMessage = status.lastPrintResult ? ('Last print: ' + status.lastPrintResult) : 'Authenticated bridge status received.';
    noteContact();
    renderRuntimeStatus();
    return status;
  }

  async function testConnection() {
    try {
      var health = await getHealth();
      if (loadConfig().token) await getStatus();
      if (typeof toast === 'function') toast(health.ready ? 'Print Bridge connected.' : 'Print Bridge found but not ready.', health.ready ? 'ok' : 'warn');
      return health;
    } catch (error) {
      runtime.printerReady = false;
      runtime.printer = 'Unknown';
      setRuntime(error.status === 401 ? 'Pairing required' : 'Bridge unavailable', error.message);
      if (typeof toast === 'function') toast(error.message, 'err');
      return null;
    }
  }

  async function pairDevice() {
    var address = document.getElementById('zezBridgeAddress');
    var codeInput = document.getElementById('zezBridgePairingCode');
    var deviceInput = document.getElementById('zezBridgeDeviceName');
    try {
      var config = loadConfig();
      config.bridgeUrl = normalizeBridgeUrl(address ? address.value : config.bridgeUrl);
      config.deviceName = String(deviceInput ? deviceInput.value : '').trim().slice(0, 80) || ('ZEZMS ' + (navigator.platform || 'Device'));
      saveConfig(config);
      var code = String(codeInput ? codeInput.value : '').trim();
      if (!/^\d{6}$/.test(code)) throw new Error('Enter the current six-digit pairing code shown by ZEZ Print Bridge.');
      setRuntime('Connecting', 'Pairing this browser/device...');
      var response = await bridgeFetch('/pair', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'X-ZEZPrint-Protocol':PROTOCOL },
        body:JSON.stringify({ pairingCode:code, deviceName:config.deviceName })
      }, 5000);
      var result = await responseJson(response);
      if (result.protocolVersion !== PROTOCOL || !result.deviceToken) throw new Error('The bridge returned an invalid pairing response.');
      config = loadConfig();
      config.token = String(result.deviceToken);
      config.pairedAt = new Date().toISOString();
      config.mode = LOCAL;
      config.lastContact = config.pairedAt;
      saveConfig(config);
      if (codeInput) codeInput.value = '';
      runtime.connection = 'Connected';
      runtime.printerReady = !!result.printerReady;
      runtime.printer = result.printerName || (result.printerConfigured ? 'Configured printer' : 'No printer selected');
      runtime.lastSuccessfulContact = config.lastContact;
      runtime.lastMessage = 'Pairing complete. The permanent token is stored only in this browser and is never displayed.';
      renderRuntimeStatus();
      if (typeof toast === 'function') toast('This device is paired for Direct One-Click Print.');
      if (typeof render === 'function') render();
      return true;
    } catch (error) {
      setRuntime(error.status === 403 || error.status === 401 ? 'Pairing required' : 'Bridge unavailable', error.message);
      if (typeof toast === 'function') toast(error.message, 'err');
      return false;
    }
  }

  async function forgetPairing() {
    var config = loadConfig();
    if (config.token && config.bridgeUrl) {
      try {
        await bridgeFetch('/pair', { method:'DELETE', headers:authHeaders(config) }, 3000);
      } catch (_) {}
    }
    config.token = '';
    config.pairedAt = '';
    config.mode = SYSTEM;
    saveConfig(config);
    runtime.connection = config.bridgeUrl ? 'Pairing required' : 'Not configured';
    runtime.printer = 'Unknown';
    runtime.printerReady = false;
    runtime.lastMessage = 'Pairing removed from this browser/device.';
    if (typeof toast === 'function') toast('Direct Print pairing forgotten. System Print Dialog restored.');
    if (typeof render === 'function') render(); else renderRuntimeStatus();
  }

  function setActiveTransport(name) {
    var mode = String(name || '').toLowerCase();
    if (mode !== SYSTEM && mode !== LOCAL) throw new Error('Unknown print mode.');
    var config = loadConfig();
    config.mode = mode;
    saveConfig(config);
    if (mode === LOCAL && !config.token) setRuntime('Pairing required', 'Enter the bridge address and pairing code before Direct Print can be used.');
    return mode;
  }

  function getActiveTransport() {
    return loadConfig().mode;
  }

  function isDirectReady() {
    var config = loadConfig();
    return config.mode === LOCAL && !!config.bridgeUrl && !!config.token;
  }

  function updateAddress() {
    var input = document.getElementById('zezBridgeAddress');
    var device = document.getElementById('zezBridgeDeviceName');
    try {
      var config = loadConfig();
      config.bridgeUrl = input && input.value.trim() ? normalizeBridgeUrl(input.value) : '';
      config.deviceName = String(device && device.value || config.deviceName || '').trim().slice(0,80);
      saveConfig(config);
      setRuntime(config.bridgeUrl ? (config.token ? 'Connected' : 'Pairing required') : 'Not configured', 'Device-local Direct Print settings saved.');
      if (typeof toast === 'function') toast('Direct Print settings saved on this device only.');
      return true;
    } catch (error) {
      if (typeof toast === 'function') toast(error.message, 'err');
      return false;
    }
  }

  function getEmbeddedWatermark() {
    if (watermarkPromise) return watermarkPromise;
    watermarkPromise = fetch(new URL('assets/zez-document-watermark.jpg', document.baseURI).href)
      .then(function (response) { if (!response.ok) throw new Error('The document watermark asset is unavailable.'); return response.blob(); })
      .then(function (blob) {
        return new Promise(function (resolve, reject) {
          var reader = new FileReader();
          reader.onload = function () { resolve(String(reader.result || '')); };
          reader.onerror = function () { reject(new Error('The document watermark could not be embedded.')); };
          reader.readAsDataURL(blob);
        });
      });
    return watermarkPromise;
  }

  function printFeedback(status, detail) {
    var textByStatus = {
      accepted:'Sending to printer...', rendering:'Rendering A5 document...', printing:'Printing...',
      printed:'Printed successfully', 'printer-unavailable':'Direct Print failed - printer is unavailable.', failed:'Direct Print failed.'
    };
    var message = textByStatus[status] || status;
    if (detail && status !== 'printed') message += ' ' + detail;
    runtime.lastMessage = message;
    renderRuntimeStatus();
    if (typeof toast === 'function') toast(message, status === 'printed' ? 'ok' : (status === 'failed' || status === 'printer-unavailable' ? 'err' : ''));
  }

  async function pollJob(jobId) {
    var config = loadConfig();
    var started = Date.now();
    var lastStatus = '';
    while (Date.now() - started < 45000) {
      var response = await bridgeFetch('/job/' + encodeURIComponent(jobId), { method:'GET', headers:authHeaders(config) }, 4500);
      var job = await responseJson(response);
      if (job.status !== lastStatus) { lastStatus = job.status; printFeedback(job.status, job.message || ''); }
      if (job.status === 'printed') { noteContact(); return job; }
      if (job.status === 'failed' || job.status === 'printer-unavailable') {
        var error = new Error(job.message || (job.status === 'printer-unavailable' ? 'Direct Print failed - printer is unavailable.' : 'Direct Print failed.'));
        error.code = job.status;
        throw error;
      }
      await new Promise(function (resolve) { setTimeout(resolve, 650); });
    }
    throw new Error('The bridge accepted the print job, but final printer status was not received in time. Check the Windows bridge.');
  }

  async function sendPrintJob(request) {
    var config = loadConfig();
    if (!config.bridgeUrl || !config.token) throw new Error('Direct Print is not paired on this device.');
    var html = String(request.html || '');
    if (byteLength(html) > MAX_PAYLOAD_BYTES) throw new Error('The printable document exceeds the 4 MB Direct Print limit.');
    var payload = {
      jobId:request.jobId,
      documentType:request.documentType,
      documentId:String(request.documentId || '').slice(0,160),
      copies:Math.min(5, Math.max(1, Number(request.copies) || 1)),
      html:html,
      page:{ size:'A5', orientation:'portrait' }
    };
    printFeedback('accepted');
    var response = await bridgeFetch('/print', {
      method:'POST', headers:Object.assign({ 'Content-Type':'application/json' }, authHeaders(config)), body:JSON.stringify(payload)
    }, 5000);
    var accepted = await responseJson(response);
    if (!accepted.jobId || accepted.jobId !== request.jobId) throw new Error('The bridge returned an invalid job acknowledgement.');
    noteContact();
    return pollJob(request.jobId);
  }

  function fallbackModal(error, descriptor) {
    var id = String(++fallbackSequence);
    fallbacks.set(id, descriptor);
    if (typeof openModal !== 'function') {
      if (typeof toast === 'function') toast('Direct Print unavailable. ' + error.message, 'err');
      return;
    }
    openModal('<h3>Direct Print unavailable.</h3><p>' + esc(error.message || String(error)) + '</p>'
      + '<p class="muted">The business transaction and saved document remain unchanged.</p>'
      + '<div class="row"><button class="btn" onclick="ZEZPrint.retryFallback(\'' + id + '\')">Retry</button>'
      + '<button class="btn ghost" onclick="ZEZPrint.useSystemFallback(\'' + id + '\')">Use System Print</button>'
      + '<button class="btn ghost" onclick="ZEZPrint.cancelFallback(\'' + id + '\')">Cancel</button></div>');
  }

  async function executeDescriptor(descriptor, showFallback) {
    var type = String(descriptor.documentType || '').toLowerCase();
    if (!/^(receipt|invoice|waybill|test)$/.test(type)) throw new Error('Unsupported Direct Print document type.');
    var lockKey = type + ':' + String(descriptor.documentId || '');
    if (inflight.has(lockKey)) {
      if (typeof toast === 'function') toast('This document is already being sent to the printer.', 'warn');
      return inflight.get(lockKey);
    }
    var task = (async function () {
      try {
        if (!isDirectReady()) throw new Error('Pair this device with ZEZ Print Bridge before using Direct Print.');
        var watermark = await getEmbeddedWatermark();
        var html = typeof descriptor.createHtml === 'function' ? await descriptor.createHtml(watermark) : String(descriptor.html || '');
        var result = await sendPrintJob({
          jobId:randomJobId(), documentType:type, documentId:descriptor.documentId,
          copies:descriptor.copies || 1, html:html
        });
        return result;
      } catch (error) {
        runtime.connection = error.status === 401 ? 'Pairing required' : 'Bridge unavailable';
        if (error.code === 'printer-unavailable') { runtime.connection = 'Connected'; runtime.printerReady = false; runtime.printer = 'Printer unavailable'; }
        runtime.lastMessage = error.message || String(error);
        renderRuntimeStatus();
        if (showFallback !== false) fallbackModal(error, descriptor);
        return { status:'failed', message:error.message || String(error) };
      } finally {
        inflight.delete(lockKey);
      }
    }());
    inflight.set(lockKey, task);
    return task;
  }

  function printDocument(descriptor) {
    descriptor = descriptor || {};
    if (getActiveTransport() === SYSTEM) {
      if (typeof descriptor.systemPrint === 'function') return descriptor.systemPrint();
      if (descriptor.html) return base.printHtml(descriptor.html, descriptor);
      throw new Error('System Print needs a printable document.');
    }
    return executeDescriptor(descriptor, true);
  }

  function printHtml(html, options) {
    options = options || {};
    if (getActiveTransport() === SYSTEM) return base.printHtml(html, options);
    return executeDescriptor({
      documentType:options.documentType || 'test', documentId:options.documentId || randomJobId(),
      copies:options.copies || 1, html:String(html || ''), systemPrint:function () { return base.printHtml(html, options); }
    }, true);
  }

  function printWithTransport(name, html, options) {
    if (name === LOCAL) {
      options = options || {};
      return executeDescriptor({ documentType:options.documentType || 'test', documentId:options.documentId || randomJobId(), copies:options.copies || 1, html:html, systemPrint:function () { return base.printHtml(html, options); } }, true);
    }
    return base.printWithTransport(name, html, options || {});
  }

  function directTestHtml(watermark) {
    var tested = esc(new Date().toLocaleString('en-GH'));
    return '<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light"><title>ZEZMS Direct A5 Test</title><style>'
      + '@page{size:A5 portrait;margin:0}*{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}html,body{width:148mm;height:210mm;margin:0;background:#fff;color:#111;font-family:Arial,sans-serif}.page{position:relative;width:148mm;height:210mm;overflow:hidden;padding:18mm 14mm;text-align:center}.wm{position:absolute;inset:0;background:url("' + watermark.replace(/"/g,'%22') + '") center/100% 100% no-repeat;opacity:.10}.content{position:relative;z-index:1}.boundary{position:absolute;inset:7mm;border:1px dashed #0f766e}h1{margin:28mm 0 4mm;font-size:28pt}.approved{display:inline-block;margin:12mm;padding:3mm 6mm;border:3px double #15803d;border-radius:5px;color:#15803d;font-size:22pt;font-weight:900;transform:rotate(-7deg)}footer{position:absolute;left:14mm;right:14mm;bottom:12mm;border-top:1px solid #64748b;padding-top:3mm;font-size:9pt}</style></head><body><main class="page"><div class="wm"></div><div class="boundary"></div><div class="content"><header><b>ZEZMS - Zola Electronics Zone</b></header><h1>A5 DIRECT PRINT TEST</h1><p>v' + VERSION + ' - ' + BUILD + '</p><div class="approved">APPROVED</div><p>No customer or transaction data is included.</p><p>Test created: ' + tested + '</p><footer>ZEZ Print Bridge - A5 portrait - 148 mm x 210 mm</footer></div></main></body></html>';
  }

  function directPrintTest() {
    return executeDescriptor({ documentType:'test', documentId:'test-' + randomJobId(), copies:1, createHtml:directTestHtml, systemPrint:base.openPrintTest }, true);
  }

  function retryFallback(id) {
    var descriptor = fallbacks.get(String(id));
    if (!descriptor) return;
    fallbacks.delete(String(id));
    if (typeof closeModal === 'function') closeModal();
    executeDescriptor(descriptor, true);
  }

  function useSystemFallback(id) {
    var descriptor = fallbacks.get(String(id));
    fallbacks.delete(String(id));
    if (typeof closeModal === 'function') closeModal();
    if (descriptor && typeof descriptor.systemPrint === 'function') descriptor.systemPrint();
  }

  function cancelFallback(id) {
    fallbacks.delete(String(id));
    if (typeof closeModal === 'function') closeModal();
  }

  function settingsHtml() {
    var config = loadConfig();
    runtime.lastSuccessfulContact = config.lastContact || runtime.lastSuccessfulContact;
    var paired = !!config.token;
    var mode = config.mode;
    return '<style>@media(max-width:520px){#printingWirelessReadiness .g2{grid-template-columns:minmax(0,1fr)!important}#printingWirelessReadiness input,#printingWirelessReadiness select{width:100%;min-width:0}#printingWirelessReadiness .row{align-items:stretch}#printingWirelessReadiness .row .btn{flex:1 1 140px}}</style>'
      + '<div class="card" id="printingWirelessReadiness" style="margin-top:12px" data-print-build="' + BUILD + '">'
      + '<h3>Printing &amp; Wireless Printer Readiness</h3>'
      + '<div class="grid g2"><div class="field"><label>Print Mode</label><select id="zezPrintMode" onchange="ZEZPrint.setActiveTransport(this.value);render()">'
      + '<option value="local-bridge"' + (mode === LOCAL ? ' selected' : '') + '>Direct One-Click Print</option><option value="system-dialog"' + (mode === SYSTEM ? ' selected' : '') + '>System Print Dialog</option></select></div>'
      + '<div class="statline"><span>Direct Print</span><b>' + (mode === LOCAL ? (paired ? 'Enabled' : 'Pairing required') : 'Disabled') + '</b></div></div>'
      + '<div class="grid g2"><div class="statline"><span>Connection Status</span><b id="zezBridgeConnectionStatus">' + esc(runtime.connection || (config.bridgeUrl ? (paired ? 'Configured' : 'Pairing required') : 'Not configured')) + '</b></div>'
      + '<div class="statline"><span>Windows Printer</span><b id="zezBridgePrinterStatus">' + esc(runtime.printer) + '</b></div></div>'
      + '<div class="grid g2" style="margin-top:10px"><div class="field"><label>Bridge Address</label><input id="zezBridgeAddress" inputmode="url" autocomplete="off" placeholder="http://192.168.1.25:43127" value="' + esc(config.bridgeUrl) + '"></div>'
      + '<div class="field"><label>This device name</label><input id="zezBridgeDeviceName" maxlength="80" autocomplete="off" placeholder="Owner phone" value="' + esc(config.deviceName) + '"></div></div>'
      + '<div class="row"><button class="btn ghost" type="button" onclick="ZEZPrint.updateAddress()">Save Address</button><button class="btn ghost" type="button" onclick="ZEZPrint.testConnection()">Test Connection</button></div>'
      + '<div class="grid g2" style="margin-top:10px"><div class="field"><label>Temporary Pairing Code</label><input id="zezBridgePairingCode" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" placeholder="6 digits"></div>'
      + '<div class="field"><label>Last successful bridge contact</label><div class="statline"><b id="zezBridgeLastContact">' + esc(config.lastContact ? new Date(config.lastContact).toLocaleString() : 'Never') + '</b></div></div></div>'
      + '<div class="row"><button class="btn" type="button" onclick="ZEZPrint.pairDevice()">Pair Device</button><button class="btn ghost" type="button" onclick="ZEZPrint.forgetPairing()"' + (paired ? '' : ' disabled') + '>Forget Pairing</button></div>'
      + '<div class="row" style="margin-top:10px"><button class="btn" type="button" onclick="ZEZPrint.directPrintTest()"' + (paired ? '' : ' disabled') + '>Direct Print Test</button><button class="btn ghost" type="button" onclick="ZEZPrint.openPrintTest()"' + (base.isSystemPrintSupported && base.isSystemPrintSupported() ? '' : ' disabled') + '>System A5 Test</button></div>'
      + '<p id="zezBridgeRuntimeMessage" class="muted" style="font-size:12px;line-height:1.5">' + esc(runtime.lastMessage || 'The bridge address, pairing token and mode are stored only in this browser/device. They are not part of business data or Cloud Sync.') + '</p>'
      + '<p class="muted" style="font-size:11px">On a phone, use the LAN address shown by the Windows bridge and allow the browser\'s Local Network Access prompt once. The app never scans the network.</p></div>';
  }

  var initialConfig = loadConfig();
  runtime.connection = initialConfig.bridgeUrl ? (initialConfig.token ? 'Configured' : 'Pairing required') : 'Not configured';
  runtime.lastSuccessfulContact = initialConfig.lastContact || '';

  try {
    if (base.listTransports().indexOf(LOCAL) < 0) {
      base.registerTransport(LOCAL, { name:LOCAL, label:'Direct One-Click Print', supported:function () { return true; }, printHtml:function (html, options) { return printWithTransport(LOCAL, html, options); } });
    }
  } catch (_) {}

  window.ZEZPrint = Object.freeze({
    version:VERSION, build:BUILD, protocol:PROTOCOL, transport:getActiveTransport(), storageKey:STORAGE_KEY,
    isSystemPrintSupported:base.isSystemPrintSupported, openPrintTest:base.openPrintTest,
    printHtml:printHtml, printDocument:printDocument, printWithTransport:printWithTransport,
    registerTransport:base.registerTransport, listTransports:base.listTransports,
    getActiveTransport:getActiveTransport, setActiveTransport:setActiveTransport,
    isDirectReady:isDirectReady, testTransport:testConnection, testConnection:testConnection,
    updateAddress:updateAddress, pairDevice:pairDevice, forgetPairing:forgetPairing,
    directPrintTest:directPrintTest, settingsHtml:settingsHtml,
    retryFallback:retryFallback, useSystemFallback:useSystemFallback, cancelFallback:cancelFallback,
    getEmbeddedWatermark:getEmbeddedWatermark,
    diagnostics:function () {
      var config = loadConfig();
      return Object.freeze({ version:VERSION, build:BUILD, protocol:PROTOCOL, mode:config.mode, configured:!!config.bridgeUrl, paired:!!config.token, connection:runtime.connection, printerReady:runtime.printerReady });
    }
  });
}());
