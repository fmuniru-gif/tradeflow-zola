const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const delivery=require('../tools/build-pr11-delivery.cjs'),{edits,transformDocumentBranding}=require('../tools/document-branding-transform.cjs');
const baseline='4c1221ae4b1a815d5a6354a13a1c1ba01664d522',prior=file=>execFileSync('git',['show',baseline+':'+file],{maxBuffer:32*1024*1024}).toString();
test('all embedded business, recovery and protocol modules and loader code outside delivery metadata remain exact production bytes',()=>{
 assert.equal(delivery.stripDelivery(delivery.assetBytes('index.html').toString()),delivery.stripDelivery(prior('index.html')));
});
test('every pre-existing application script, image and manifest remains byte-identical',()=>{
 const files=execFileSync('git',['ls-tree','-r','--name-only',baseline,'js','assets','manifest.json'],{encoding:'utf8'}).trim().split('\n');
 for(const file of files)assert.deepEqual(delivery.assetBytes(file),execFileSync('git',['show',baseline+':'+file],{maxBuffer:32*1024*1024}),file);
});
test('unbranded assembled presentation remains identical to production, including all business functions',()=>{
 const clean=html=>html.replace(/<meta name="zezms-delivery" content="[^"]+">/,'DELIVERY_METADATA');
 assert.equal(clean(delivery.assembledShell(delivery.assetBytes('index.html').toString(),{withoutDocumentBranding:true})),clean(delivery.assembledShell(prior('index.html'))));
});
test('the complete application is transformed by only the exact reviewed print edits and coupled print modules',()=>{
 const index=delivery.assetBytes('index.html').toString();let expected=delivery.assembledShell(index,{withoutDocumentBranding:true});
 const metadata=expected.match(/<meta name="zezms-delivery" content="[^"]+">/)[0];expected=expected.replace(metadata,'');
 const names=['pdf-export.js','invoice-waybill.js','print-readiness-v3120.js','direct-print-bridge-v3121.js'];
 expected=expected.replace(/<script src="([^"]+)"><\/script>/g,(tag,src)=>{const name=src.split('?')[0].split('/').pop();return names.includes(name)?'<script data-zezms-document-module="'+name+'" data-document-origin="'+src+'">\n'+delivery.assetBytes('js/'+name).toString().replace(/<\/script/gi,'<\\/script')+'\n</script>':tag;});
 expected=transformDocumentBranding(expected,delivery.assetBytes('js/document-branding.js').toString().replace(/<\/script/gi,'<\\/script'),edits());
 expected=expected.replace('</head>',metadata+'</head>');
 assert.equal(delivery.sha(Buffer.from(delivery.assembledShell(index,{withoutResilience:true}))),delivery.sha(Buffer.from(expected)));
});
test('presentation transform fails closed if a required printer marker is absent or already transformed',()=>{
 assert.throws(()=>transformDocumentBranding('<html></html>','',edits()),/MARKER_MISSING/);
 assert.throws(()=>transformDocumentBranding('<script data-zezms-document-branding>','',edits()),/ALREADY_APPLIED/);
});
test('the new artwork is pinned and the update remains passive',()=>{
 const worker=delivery.assetBytes('sw.js').toString(),manifest=delivery.workerHashes(worker,delivery.assetBytes('index.html').toString());
 assert.equal(Object.keys(manifest).length,94);assert.equal(manifest['./assets/zez-logo-approved-20261103.jpg'],delivery.sha(delivery.assetBytes('assets/zez-logo-approved-20261103.jpg')));
 for(const name of ['sw.js','DOCUMENT_BRANDING_UPDATE.html'])for(const forbidden of ['skipWaiting(', 'clients.claim(', 'caches.delete(', 'localStorage.clear(', 'indexedDB.deleteDatabase('])assert.ok(!delivery.assetBytes(name).toString().includes(forbidden));
 const helper=delivery.assetBytes('js/document-branding.js').toString();for(const forbidden of ['localStorage','indexedDB','saveDB','cloudSync','supabase'])assert.ok(!helper.includes(forbidden));
});
