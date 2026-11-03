/* Presentation only. Approved Zola seal; no business-data or sync access. */
(function () {
  'use strict';
  window.ZEZMS = window.ZEZMS || {};
  const asset = 'assets/zez-logo-approved-20261103.jpg';
  const url = new URL(asset, document.baseURI).href;
  const slogan = 'Buy the right one.';
  function escape(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function headerHTML(embeddedLogo) {
    return '<div data-zezms-print-brand style="display:flex;align-items:center;gap:9px;margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;color:#111">'
      + '<img data-zezms-approved-logo src="' + escape(embeddedLogo || url) + '" alt="Zola Electronics Zone" width="42" height="42" style="display:block;width:42px;height:42px;object-fit:contain;flex-shrink:0">'
      + '<span style="font-size:11px;font-style:italic;font-weight:700;line-height:1.25;letter-spacing:0">' + slogan + '</span></div>';
  }
  function watermarkHTML() {
    return '<style>.purchase-order-paper{position:relative}.purchase-order-paper>:not(.document-branding-watermark){position:relative;z-index:1}@media print{.purchase-order-paper .document-branding-watermark{position:fixed!important;inset:0!important}}</style>'
      + '<div class="document-branding-watermark" aria-hidden="true" style="position:absolute;inset:0;background:url(&quot;' + escape(url) + '&quot;) center/80% auto no-repeat;opacity:.10;z-index:0;pointer-events:none"></div>';
  }
  const fontWidths = {"Helvetica":[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584],"Helvetica-Bold":[278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584]};
  function pdfTextWidth(value, size, bold) {
    const widths = fontWidths[bold ? 'Helvetica-Bold' : 'Helvetica'];
    return Array.from(String(value)).reduce((total, character) => total + (widths[character.charCodeAt(0)-32] || 560), 0) * Number(size) / 1000;
  }
  function pdfKeyValue(pdf, label, value) {
    const offset = Math.max(105, Math.ceil(pdfTextWidth(label, 9, true)) + 12);
    const lines = pdf.wrap(value, pdf.width - pdf.margin * 2 - offset, 9);
    const height = Math.max(14, lines.length * 12 + 2);
    pdf.ensureSpace(height + 1);
    pdf.drawText(label, pdf.margin, pdf.y, 9, true);
    lines.forEach((line,index) => pdf.drawText(line, pdf.margin + offset, pdf.y + index * 12, 9, false));
    pdf.y += height;
  }
  function pdfHeader(pdf) {
    const hasImage = !!(pdf.watermark && pdf.watermark.bytes);
    if (hasImage) pdf.command('q 34 0 0 34 ' + pdf.margin.toFixed(2) + ' ' + (pdf.height - pdf.margin - 34).toFixed(2) + ' cm /WM Do Q');
    pdf.drawText(slogan, pdf.margin + (hasImage ? 44 : 0), pdf.margin + 11, 9.3, true);
    pdf.y = pdf.margin + 44;
  }
  function pdfWatermark(pdf) {
    const image = pdf.watermark;
    const dimensions = [pdf.width,pdf.height].sort((a,b)=>a-b);
    if (Math.abs(dimensions[0]-419.53)<1 && Math.abs(dimensions[1]-595.28)<1) return 'q /GS1 gs ' + pdf.width.toFixed(2) + ' 0 0 ' + pdf.height.toFixed(2) + ' 0 0 cm /WM Do Q\n';
    let width = pdf.width * .82, height = width * image.height / image.width;
    if (height > pdf.height * .72) { height = pdf.height * .72; width = height * image.width / image.height; }
    return 'q /GS1 gs ' + width.toFixed(2) + ' 0 0 ' + height.toFixed(2) + ' ' + ((pdf.width-width)/2).toFixed(2) + ' ' + ((pdf.height-height)/2).toFixed(2) + ' cm /WM Do Q\n';
  }
  async function ready(doc) {
    await Promise.all(Array.from(doc.querySelectorAll('img[data-zezms-approved-logo]')).map(async image => {
      await image.decode();
      if (!image.naturalWidth) throw new Error('The approved document logo could not be loaded.');
    }));
  }
  ZEZMS.documentBranding = Object.freeze({build:'20261103-approved-document-branding-r1',asset,url,slogan,headerHTML,watermarkHTML,pdfHeader,pdfWatermark,pdfTextWidth,pdfKeyValue,ready});
}());
