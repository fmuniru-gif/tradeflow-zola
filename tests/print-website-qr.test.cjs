'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process'),vm=require('node:vm');
const d=require('../tools/build-pr11-delivery.cjs'),t=require('../tools/print-website-qr-transform.cjs');
test('the bridge fix changes only the website label and document rejection feedback', () => {
 const transform=require('../tools/direct-print-compatibility-transform.cjs');
 const baseline=cp.execFileSync('git',['show','26d09ef63b1b88a34114b15141488b99c3692fbc:index.html'],{maxBuffer:32e6}).toString();
 const strip=s=>s.replace(/<meta name="zezms-delivery" content="[^"]+">/,'DELIVERY');
 const html=d.assembledShell(d.assetBytes('index.html').toString());
 assert.equal(strip(transform.withoutDirectPrintCompatibility(html)),strip(d.assembledShell(baseline)));
 const branding=html.match(/<script data-zezms-print-website-qr>\n([\s\S]*?)\n<\/script>/)[1];
 const c={window:null,ZEZMS:{},document:{baseURI:'https://print.invalid/'},URL};c.window=c;vm.createContext(c);
 vm.runInContext(d.assetBytes('js/document-branding.js').toString(),c);
 vm.runInContext(branding,c);
 const helper=c.ZEZMS.documentBranding;
 const direct=helper.headerHTML('data:image/jpeg;base64,AA==');
 assert.match(direct,/<span data-zezms-website [^>]+>zolaelectronicszone\.com<\/span>/);
 assert.match(direct,/data-zezms-website-qr src="data:image\/png;base64,/);
 assert.doesNotMatch(direct,/https?:\/\//i);
 assert.match(helper.headerHTML('https://print.invalid/logo.jpg'),/<a data-zezms-website href="https:\/\/zolaelectronicszone\.com\//);
});
test('website print changes reverse exactly to production, including every sync, account and business function',()=>{
 const prior=cp.execFileSync('git',['show','bee87558848cf45ae3b78d8a46c04cdc954ef818:index.html'],{maxBuffer:32e6}).toString();
 const strip=s=>s.replace(/<meta name="zezms-delivery" content="[^"]+">/,'DELIVERY');
 assert.equal(strip(t.withoutPrintWebsiteQR(d.assembledShell(d.assetBytes('index.html').toString()))),strip(d.assembledShell(prior)));
});
test('the fixed website QR works without the logo and reserves its own top-right PDF space on every page',()=>{
 const c={window:null,ZEZMS:{},document:{baseURI:'https://print.invalid/'},URL};c.window=c;vm.createContext(c);
 for(const file of ['js/document-branding.js','js/print-website-qr.js'])vm.runInContext(d.assetBytes(file).toString(),c);
 const b=c.ZEZMS.documentBranding;assert.equal(b.website,'https://zolaelectronicszone.com/');assert.match(b.headerHTML(),/data-zezms-website-qr src="data:image\/png;base64,/);
 const commands=[],pdf={width:419.53,height:595.28,margin:28.35,watermark:null,drawText:(...a)=>commands.push(['text',...a]),rect:(...a)=>commands.push(['rect',...a])};
 b.pdfHeader(pdf);assert.ok(pdf.y>96);assert.ok(commands.some(a=>a[1]==='zolaelectronicszone.com'));assert.ok(commands.some(a=>a[0]==='rect'&&a[1]>300&&a[5]===1));
 for(const forbidden of ['localStorage','indexedDB','saveDB','cloudSync','supabase','fetch('])assert.ok(!d.assetBytes('js/print-website-qr.js').toString().includes(forbidden));
 assert.throws(()=>t.transformPrintWebsiteQR('<html></html>','',t.edits()),/MARKER/);
});
