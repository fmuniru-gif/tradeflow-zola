'use strict';
// Exact, reversible print-presentation edits. Persisted modules and business
// functions are kept byte-for-byte; edits apply only to the assembled delivery.
function edits() {
  return [
    ['logo asset','assets/zez-document-watermark.jpg','assets/zez-logo-approved-20261103.jpg'],
    ['A5 watermark dimensions','background-size:100% 100%;opacity:.10','background-size:100% 100%;opacity:.10'],
    ['system-test proportions',' center/cover no-repeat;opacity:.10',' center/100% 100% no-repeat;opacity:.10'],
    ['test-page proportions','center/100% 100% no-repeat;opacity:.10','center/100% 100% no-repeat;opacity:.10'],
    ['receipt argument','function receiptPaperHTML(source) {','function receiptPaperHTML(source, brandingLogo) {'],
    ['receipt header','<div class="receipt-business"><b>${esc(biz.name)}</b>','<div class="receipt-business">${ZEZMS.documentBranding.headerHTML(brandingLogo)}<b>${esc(biz.name)}</b>'],
    ['receipt bridge logo','${receiptPaperHTML(payload)}</body>','${receiptPaperHTML(payload, watermarkUrl)}</body>'],
    ['invoice argument','function invoicePaperHTML(record) {','function invoicePaperHTML(record, brandingLogo) {'],
    ['waybill argument','function waybillPaperHTML(record) {','function waybillPaperHTML(record, brandingLogo) {'],
    ['commercial header','<div class="doc-head"><div><div style="font-size:20px;font-weight:900">${esc(biz.name)}</div>','<div class="doc-head"><div>${ZEZMS.documentBranding.headerHTML(brandingLogo)}<div style="font-size:20px;font-weight:900">${esc(biz.name)}</div>'],
    ['commercial dispatch','function documentHTML(type, record) {\n    return type === \'invoice\' ? invoicePaperHTML(record) : waybillPaperHTML(record);','function documentHTML(type, record, brandingLogo) {\n    return type === \'invoice\' ? invoicePaperHTML(record, brandingLogo) : waybillPaperHTML(record, brandingLogo);'],
    ['commercial bridge logo','${documentHTML(type, record)}</body>','${documentHTML(type, record, watermarkUrl)}</body>'],
    ['quotation header','<div><h2 style="margin:0">\' + esc(biz.name || \'ZEZMS TradeFlow\')','<div>\' + ZEZMS.documentBranding.headerHTML() + \'<h2 style="margin:0">\' + esc(biz.name || \'ZEZMS TradeFlow\')'],
    ['purchase-order watermark','<div class="document-paper purchase-order-paper"><div class="doc-head"><div><div style="font-size:20px;font-weight:900">\' + esc(biz.name)','<div class="document-paper purchase-order-paper">\' + ZEZMS.documentBranding.watermarkHTML() + \'<div class="doc-head"><div>\' + ZEZMS.documentBranding.headerHTML() + \'<div style="font-size:20px;font-weight:900">\' + esc(biz.name)'],
    ['PDF aligned text','this.estimatedWidth(content, fontSize)','ZEZMS.documentBranding.pdfTextWidth(content, fontSize, bold)'],
    ['PDF label spacing','      this.ensureSpace(15);\n      this.drawText(label, this.margin, this.y, 9, true);\n      this.drawText(value, this.margin + 105, this.y, 9, false);\n      this.y += 14;','      ZEZMS.documentBranding.pdfKeyValue(this, label, value);'],
    ['PDF page header','      this.y = this.margin;\n    }\n\n    command(value)', '      this.y = this.margin;\n      ZEZMS.documentBranding.pdfHeader(this);\n    }\n\n    command(value)'],
    ['PDF watermark proportions',"'q /GS1 gs ' + this.width.toFixed(2) + ' 0 0 ' + this.height.toFixed(2) + ' 0 0 cm /WM Do Q\\n'",'ZEZMS.documentBranding.pdfWatermark(this)'],
    ['purchase-order PDF argument','function buildPurchaseOrderPDF(record) {\n    const pdf = new SimplePDF(A4);','function buildPurchaseOrderPDF(record, watermark) {\n    const pdf = new SimplePDF(A4, { watermark:watermark });'],
    ['purchase-order PDF loader','window.downloadPurchaseOrderPDF = function (id) {','window.downloadPurchaseOrderPDF = async function (id) {'],
    ['purchase-order PDF watermark',"downloadBytes(buildPurchaseOrderPDF(record), 'Purchase-Order-'", "downloadBytes(buildPurchaseOrderPDF(record, await loadDocumentWatermark()), 'Purchase-Order-'"],
    ['receipt/commercial print image wait','setTimeout(() => {\n      try {\n        const printWindow = frame.contentWindow;','setTimeout(async () => {\n      try {\n        await ZEZMS.documentBranding.ready(frame.contentDocument);\n        const printWindow = frame.contentWindow;'],
    ['purchase-order print image wait','setTimeout(function () {\n      try {\n        const printWindow = frame.contentWindow;','setTimeout(async function () {\n      try {\n        await ZEZMS.documentBranding.ready(frame.contentDocument);\n        const printWindow = frame.contentWindow;'],
    ['quotation print image wait','setTimeout(function () { try { frame.contentWindow.focus(); frame.contentWindow.print(); } finally {','setTimeout(async function () { try { await ZEZMS.documentBranding.ready(frame.contentDocument); frame.contentWindow.focus(); frame.contentWindow.print(); } finally {']
  ];
}
function transformDocumentBranding(html, helper, patches) {
  if (html.includes('<script data-zezms-document-branding>')) throw Error('DOCUMENT_BRANDING_ALREADY_APPLIED');
  for (const [name,before,after] of patches) {
    if (!html.includes(before)) throw Error('DOCUMENT_BRANDING_MARKER_MISSING: '+name);
    html=html.split(before).join(after);
  }
  return html.replace('</head>','<script data-zezms-document-branding>\n'+helper+'\n</script></head>');
}
module.exports={edits,transformDocumentBranding};
