/* ZEZMS TradeFlow Owner Edition v3.12.1
   System-dialog print transport retained as the direct-print fallback. */
(function () {
  'use strict';

  var VERSION = '3.12.1';
  var BUILD = '20260816-direct-print-bridge-r46';
  var DEFAULT_TRANSPORT = 'system-dialog';
  var adapters = new Map();

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch];
    });
  }
  function isSystemPrintSupported() {
    return typeof window.print === 'function';
  }
  function systemDialogPrint(html, options) {
    options = options || {};
    if(!isSystemPrintSupported()) throw new Error('System print is unavailable in this browser.');
    if(typeof window.open !== 'function') throw new Error('A print window cannot be opened in this browser.');
    var popup = window.open('', '_blank', 'width=760,height=900,noopener=false');
    if(!popup) throw new Error('The print window was blocked. Allow pop-ups for this app and retry.');
    var title = esc(options.title || 'ZEZMS Print');
    var pageCss = options.styles || '@page{size:A5 portrait;margin:0}';
    popup.document.open();
    popup.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + title + '</title><style>'
      + pageCss + '</style></head><body>' + String(html || '')
      + '<script>window.addEventListener("load",function(){setTimeout(function(){try{window.focus();window.print();}catch(e){console.error(e);}},250)});window.addEventListener("afterprint",function(){try{window.close()}catch(e){}});<\/script></body></html>');
    popup.document.close();
    return popup;
  }
  adapters.set(DEFAULT_TRANSPORT, Object.freeze({
    name:DEFAULT_TRANSPORT,
    label:'System Print Dialog',
    supported:isSystemPrintSupported,
    printHtml:systemDialogPrint
  }));

  function printHtml(html, options) {
    return adapters.get(DEFAULT_TRANSPORT).printHtml(html, options || {});
  }
  function printWithTransport(name, html, options) {
    var adapter = adapters.get(String(name || '').trim().toLowerCase());
    if(!adapter) throw new Error('The requested print transport is not registered.');
    return adapter.printHtml(html, options || {});
  }
  function registerTransport(name, adapter) {
    name = String(name || '').trim().toLowerCase();
    if(!name || name === DEFAULT_TRANSPORT) throw new Error('A distinct future transport name is required.');
    if(!adapter || typeof adapter.printHtml !== 'function') throw new Error('A print adapter must expose printHtml().');
    adapters.set(name, adapter);
    return true;
  }
  function listTransports() {
    return Array.from(adapters.keys());
  }
  function openPrintTest() {
    try {
      var watermark = new URL('assets/zez-document-watermark.jpg', document.baseURI).href;
      var testedAt = new Date().toLocaleString('en-GH', { dateStyle:'medium', timeStyle:'medium' });
      var html = '<main class="test-page">'
        + '<div class="watermark" aria-hidden="true"></div><div class="boundary"></div>'
        + '<i class="mark top">TOP</i><i class="mark bottom">BOTTOM</i><i class="mark left">LEFT</i><i class="mark right">RIGHT</i>'
        + '<header><b>ZEZMS</b><span>Zola Electronics Zone</span></header>'
        + '<section><h1>A5 PRINT TEST</h1><p class="build">v' + VERSION + ' · ' + BUILD + '</p>'
        + '<div class="approved">APPROVED</div>'
        + '<p class="sample">Readable sample: ABCDEFGHIJKLMNOPQRSTUVWXYZ · 0123456789</p>'
        + '<p class="statement">If this page appears correctly in your printer\'s A5 output, the device/browser printing path is ready.</p>'
        + '<p class="tested">Test created: ' + esc(testedAt) + '</p></section>'
        + '<footer>System Print Dialog · A5 portrait · 148mm × 210mm</footer></main>';
      var css = '@page{size:A5 portrait;margin:0}*{box-sizing:border-box}html,body{width:148mm;height:210mm;margin:0;padding:0;background:#fff;color:#111;font-family:Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}.test-page{position:relative;width:148mm;height:210mm;overflow:hidden;padding:18mm 14mm 14mm;text-align:center}.watermark{position:absolute;inset:0;background:url("' + watermark.replace(/"/g, '%22') + '") center/cover no-repeat;opacity:.10;z-index:0}.boundary{position:absolute;inset:7mm;border:1px dashed #0f766e;z-index:1}.test-page>*:not(.watermark):not(.boundary){position:relative;z-index:2}header{display:flex;justify-content:space-between;border-bottom:2px solid #0f766e;padding-bottom:4mm;font-size:11pt}header b{font-size:18pt;color:#0f766e}section{margin-top:24mm}h1{font-size:28pt;letter-spacing:2px;margin:0 0 4mm}.build{font:9pt monospace}.approved{display:inline-block;margin:12mm 0 9mm;padding:3mm 6mm;border:3px double #15803d;border-radius:5px;color:#15803d;font-size:22pt;font-weight:800;transform:rotate(-7deg)}.sample{font-size:11pt;line-height:1.5}.statement{margin:13mm auto 0;max-width:106mm;font-size:12pt;font-weight:700;line-height:1.55}.tested{font-size:9pt;margin-top:8mm}footer{position:absolute!important;left:14mm;right:14mm;bottom:11mm;border-top:1px solid #64748b;padding-top:3mm;font-size:9pt}.mark{position:absolute!important;font:7pt monospace;color:#b91c1c;font-style:normal}.mark.top{top:8mm;left:50%;transform:translateX(-50%)}.mark.bottom{bottom:8mm;left:50%;transform:translateX(-50%)}.mark.left{left:8mm;top:50%;transform:translateY(-50%) rotate(-90deg)}.mark.right{right:8mm;top:50%;transform:translateY(-50%) rotate(90deg)}';
      return printHtml(html, { title:'ZEZMS A5 Print Test', styles:css });
    } catch(error) {
      if(typeof toast === 'function') toast(error.message || String(error), 'err');
      return null;
    }
  }
  function settingsHtml() {
    var available = isSystemPrintSupported();
    return '<div class="card" id="printingWirelessReadiness" style="margin-top:12px" data-print-build="' + BUILD + '">'
      + '<h3>Printing &amp; Wireless Printer Readiness</h3>'
      + '<div class="grid g2"><div class="statline"><span>Print Method</span><b>System Print Dialog</b></div>'
      + '<div class="statline"><span>Browser Print Capability</span><b>' + (available ? 'System print available' : 'System print unavailable') + '</b></div></div>'
      + '<p class="muted" style="font-size:12px;line-height:1.55"><b>Wireless/network printers must first be installed or made available to the device operating system. ZEZMS currently uses the system print dialog and does not automatically discover or select printers.</b></p>'
      + '<p class="muted" style="font-size:12px;line-height:1.55">To use a wireless or network print server, first install/add the printer in the device\'s operating system. Then use “Print A5 Test Page”. If the printer appears in the system print dialog and the A5 test prints correctly, ZEZMS is ready to print to it through the system print service.</p>'
      + '<button class="btn" type="button" onclick="ZEZPrint.openPrintTest()"' + (available ? '' : ' disabled') + '>Print A5 Test Page</button>'
      + '<p class="muted" style="font-size:11px;margin-top:8px">This status confirms only browser print-function availability. It cannot confirm that a printer is connected, online or selected.</p></div>';
  }

  window.ZEZPrint = Object.freeze({
    version:VERSION,
    build:BUILD,
    transport:DEFAULT_TRANSPORT,
    isSystemPrintSupported:isSystemPrintSupported,
    openPrintTest:openPrintTest,
    printHtml:printHtml,
    printWithTransport:printWithTransport,
    registerTransport:registerTransport,
    listTransports:listTransports,
    settingsHtml:settingsHtml
  });
}());
