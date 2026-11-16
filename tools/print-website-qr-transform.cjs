'use strict';
// Move the shared branding row above document columns, reserving its own QR space.
function edits(){return [
 ['receipt','<div class="receipt-title">SALES RECEIPT</div>\n      <div class="receipt-business">${ZEZMS.documentBranding.headerHTML(brandingLogo)}','${ZEZMS.documentBranding.headerHTML(brandingLogo)}<div class="receipt-title">SALES RECEIPT</div>\n      <div class="receipt-business">'],
 ['commercial','<div class="doc-head"><div>${ZEZMS.documentBranding.headerHTML(brandingLogo)}','${ZEZMS.documentBranding.headerHTML(brandingLogo)}<div class="doc-head"><div>'],
 ['purchase order',"<div class=\"doc-head\"><div>' + ZEZMS.documentBranding.headerHTML() + '","' + ZEZMS.documentBranding.headerHTML() + '<div class=\"doc-head\"><div>"],
 ['quotation',"<div class=\"quotation-content\"><div class=\"row\" style=\"justify-content:space-between;align-items:flex-start\"><div>' + ZEZMS.documentBranding.headerHTML() + '","<div class=\"quotation-content\">' + ZEZMS.documentBranding.headerHTML() + '<div class=\"row\" style=\"justify-content:space-between;align-items:flex-start\"><div>"],
 ['legacy receipt','<div style="margin-top:8px"><b>${esc(biz.name)}</b><br>${esc(biz.address)}<br>Tel: ${esc(biz.tel)}</div>','${ZEZMS.documentBranding.headerHTML()}<div style="margin-top:8px"><b>${esc(biz.name)}</b><br>${esc(biz.address)}<br>Tel: ${esc(biz.tel)}</div>'],
 ['system test',"+ '<header><b>ZEZMS</b><span>Zola Electronics Zone</span></header>'","+ ZEZMS.documentBranding.headerHTML() + '<header><b>ZEZMS</b><span>Zola Electronics Zone</span></header>'"],
 ['system test spacing','section{margin-top:24mm}','section{margin-top:4mm}'],
 ['bridge test','<div class="content"><header><b>ZEZMS - Zola Electronics Zone</b></header>','<div class="content">\' + ZEZMS.documentBranding.headerHTML(watermark) + \'<header><b>ZEZMS - Zola Electronics Zone</b></header>'],
 ['bridge test spacing','h1{margin:28mm 0 4mm;font-size:28pt}','h1{margin:4mm 0 4mm;font-size:28pt}'],
 ['bridge test footer','footer{position:absolute;left:14mm;right:14mm;bottom:12mm;','footer{position:fixed;z-index:2;left:14mm;right:14mm;bottom:12mm;']
];}
function transformPrintWebsiteQR(html,helper,patches){
 if(html.includes('<script data-zezms-print-website-qr>'))throw Error('PRINT_WEBSITE_QR_ALREADY_APPLIED');
 for(const [name,before,after]of patches){if(!html.includes(before))throw Error('PRINT_WEBSITE_QR_MARKER: '+name);html=html.split(before).join(after);}
 return html.replace('</head>','<script data-zezms-print-website-qr>\n'+helper+'\n</script></head>');
}
function withoutPrintWebsiteQR(html){
 if(!html.includes('<script data-zezms-print-website-qr>'))return html;
 html=html.replace(/<script data-zezms-print-website-qr>[\s\S]*?<\/script>/,'');
 for(const [,before,after]of edits().reverse())html=html.split(after).join(before);
 return html;
}
module.exports={edits,transformPrintWebsiteQR,withoutPrintWebsiteQR};
