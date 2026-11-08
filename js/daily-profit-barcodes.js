/* Daily actual profit and product selection by barcode. Native posting services remain authoritative. */
(function(){
 'use strict';
 window.ZEZMS=window.ZEZMS||{};
 const BUILD='20261108-daily-profit-barcodes-r2',VENDOR='vendor/zxing-browser-0.1.5.min.js';
 const TARGETS={posProduct:{name:'Sale Out',permission:'SALE_OUT'},siProduct:{name:'Stock In',permission:'STOCK_IN'},siNewName:{name:'New product',permission:'STOCK_IN',owner:true},invProduct:{name:'Invoice',permission:'MANAGE_DOCUMENTS'},wbProduct:{name:'Waybill',permission:'MANAGE_DOCUMENTS'},quoteProductSearch:{name:'Quotation',permission:'MANAGE_DOCUMENTS'},pfiProductId:{name:'Proforma invoice',permission:'MANAGE_DOCUMENTS'},poProduct:{name:'Purchase order',permission:'STOCK_IN'},scProduct:{name:'Stock correction',owner:true},tiNewProduct:{name:'TV upgrade',owner:true}};
 let camera=null,decoderPromise=null,mountQueued=false;
 const list=x=>Array.isArray(x)?x:[],clean=x=>String(x==null?'':x).trim(),clone=x=>JSON.parse(JSON.stringify(x));
 const esc=x=>clean(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function assert(test,message){if(!test)throw Error(message);}
 function database(){return typeof DB==='object'&&DB?DB:{};}
 function auth(){const a=ZEZMS.staffAuth;return a&&a.getContext?a.getContext():{};}
 function owner(){const a=auth();return !!(a.user&&['OWNER','ADMIN'].includes(a.role));}
 function allowed(id){const a=auth(),target=TARGETS[id];return !!(target&&a.user&&a.user.active!==false&&(target.owner?owner():ZEZMS.staffAuth.can(target.permission)));}
 function code(value){const text=clean(value);assert(text.length>0&&text.length<=128&&!/[\x00-\x1f\x7f]/.test(text),'Scan or enter a valid barcode (up to 128 characters).');return text;}
 function aliases(product){return [...new Set([].concat(list(product.barcodes),typeof product.barcode==='string'?[product.barcode]:[]).map(clean).filter(Boolean))];}
 function resolve(value){const text=code(value),matches=list(database().products).filter(p=>aliases(p).includes(text)||clean(p.id).toLowerCase()===text.toLowerCase());assert(matches.length===1,matches.length?'This barcode matches multiple products. Ask Owner/Admin to correct the mappings.':'No product is linked to this barcode. Owner/Admin can link it in Products.');return matches[0];}
 function setBarcode(productId,value,remove){
  assert(owner(),'Only Owner/Admin can manage product barcodes.');const sync=ZEZMS.cloudSync;
  if(sync&&sync.getState().initialized)assert(sync.isReadyForLocalOperations(),'Resolve Sync/device readiness before changing barcodes.');
  const text=code(value),products=list(database().products),product=products.find(p=>clean(p.id)===clean(productId));assert(product,'Select an existing Product Catalog item.');
  if(!remove)assert(!products.some(p=>p!==product&&(aliases(p).includes(text)||clean(p.id).toLowerCase()===text.toLowerCase())),'This barcode or Product ID belongs to another product.');
  const before=clone(product),next=remove?aliases(product).filter(x=>x!==text):[...new Set(aliases(product).concat(text))];assert(next.length<=50,'A product may have at most 50 barcode aliases.');
  product.barcodes=next;if(remove&&product.barcode===text)delete product.barcode;
  try{saveDB();}catch(error){let saved=null;try{saved=ZEZMS.db.load(DB_KEY);if(typeof saved==='string')saved=JSON.parse(saved);}catch(_){}
   const durable=saved&&list(saved.products).find(p=>p.id===product.id);
   if(!durable||JSON.stringify(aliases(durable))!==JSON.stringify(next)){Object.keys(product).forEach(k=>delete product[k]);Object.assign(product,before);}throw error;
  }
  return next;
 }
 function unassigned(value){const text=code(value);assert(!list(database().products).some(p=>aliases(p).includes(text)||clean(p.id).toLowerCase()===text.toLowerCase()),'This barcode or Product ID already belongs to an existing product. Select that product instead.');return text;}
 function prepareNewStockIn(selectedName,enteredName,requestedId){
  const input=document.getElementById('barcodeInput-siNewName'),value=clean(input&&input.value);if(!value)return '';
  assert(allowed('siNewName'),'Only Owner/Admin with Stock In access can link a new product barcode.');
  assert(!clean(selectedName),'Clear Existing product before creating a new product with this barcode.');
  assert(clean(enteredName),'Enter the new product name before recording this barcode.');
  assert(!list(database().products).some(p=>clean(p.name).toLowerCase()===clean(enteredName).toLowerCase()),'That product name already exists. Select the existing product and manage its barcode in Products.');
  if(clean(requestedId))unassigned(requestedId);return unassigned(value);
 }
 function newProductRecord(product,barcode){if(!barcode)return product;assert(allowed('siNewName'),'Only Owner/Admin with Stock In access can link a new product barcode.');unassigned(product.id);return Object.assign(product,{barcodes:[unassigned(barcode)]});}
 function stageNewBarcode(value){
  assert(allowed('siNewName'),'Only Owner/Admin with Stock In access can link a new product barcode.');
  const selected=document.getElementById('siProduct');assert(!clean(selected&&selected.value),'Clear Existing product before scanning a new product barcode.');
  const text=unassigned(value),input=document.getElementById('barcodeInput-siNewName');assert(input&&input.isConnected,'The new product form has closed.');input.value=text;input.focus();input.select();
  message('siNewName','Barcode ready. Enter the product details, then Record Stock In to save the product and barcode together.',false);return text;
 }
 function daily(reference){
  const data=database(),date=reference instanceof Date?reference:new Date(reference||Date.now()),selection=ZEZMS.dashboardRestoration&&ZEZMS.dashboardRestoration.getSelection();
  if(!Number.isFinite(date.getTime())||!isOpenMonth()||Number(data.selectedYear)!==date.getFullYear()||Number(data.selectedMonth)!==date.getMonth()+1||(selection&&selection.kind&&selection.kind!=='NORMAL'))return {value:null,note:'Live-day KPI · select the current open month',count:0,missing:0};
  const provider=ZEZMS.executivePerformance;
  if(!provider||typeof provider.getSaleEvents!=='function')return {value:null,note:'Recorded sale-cost evidence is unavailable',count:0,missing:1};
  const today=localDateKey(date),events=provider.getSaleEvents(data).events.filter(e=>localDateKey(new Date(e.time))===today);let profit=0,missing=0;
  events.forEach(e=>{
   const record=e.record,lines=e.source==='quick'?list(record.details&&record.details.lines):list(record.lines);
   const incomplete=lines.some(line=>Array.isArray(line.fifo)&&line.fifo.length&&Math.abs(line.fifo.reduce((n,a)=>n+Number(a.qty||a.units||0),0)-Number(line.qty))>1e-6);
   const revenue=e.source==='quick'?Number(record.amount):receiptSalesBaseValue(record);
   if(e.cost==null||!Number.isFinite(e.cost)||!Number.isFinite(revenue)||incomplete){missing++;return;}profit+=revenue-e.cost;
  });
  const receiptIds=new Set(events.filter(e=>e.source==='receipt').map(e=>clean(e.record.receiptNo||e.record.id)));
  list(data.receipts).forEach(r=>{if(isActiveSaleRecord(r)&&localDateKey(r.date)===today&&!receiptIds.has(clean(r.receiptNo||r.id)))missing++;});
  return {value:missing?null:Math.round((profit+Number.EPSILON)*100)/100,note:missing?missing+' sale(s) lack complete recorded cost evidence':'Today · after discounts, before VAT/expenses · resets at midnight',count:events.length,missing};
 }
 function profitTile(){const result=daily();return {value:result.value==null?'Unavailable':fmt(result.value),note:result.note};}
 function message(id,text,bad){const el=document.getElementById('barcodeStatus-'+id);if(el){el.textContent=text;el.style.color=bad?'#fda4af':'#99f6e4';}}
 function choice(id,value){const el=document.getElementById(id);assert(el,'The entry form has closed. Reopen it before scanning.');assert(Array.from(el.options||[]).some(o=>o.value===value),'This product is not eligible in the current entry/month.');el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));return el;}
 function select(value,id){
  assert(allowed(id),'Sign in with access to this entry form before scanning.');if(id==='siNewName')return stageNewBarcode(value);const product=resolve(value),target=document.getElementById(id);assert(target&&target.isConnected,'The entry form has closed.');
  if(id==='posProduct')pickProduct(product.name);
  else if(id==='siProduct')choice(id,product.name);
  else if(id==='invProduct'||id==='wbProduct')pickCommercialProduct(id==='invProduct'?'inv':'wb',encodeURIComponent(product.name));
  else if(id==='poProduct'){choice(id,product.id);purchaseOrderProductChanged();}
  else if(id==='quoteProductSearch')target.value=product.id;
  else if(id==='pfiProductId'){target.value=product.id;ZEZMS.proformaInvoiceR67W.productFromId();}
  else if(id==='scProduct'){choice(id,product.id);ZEZMS.stockCorrections.refreshCorrectionForm();}
  else if(id==='tiNewProduct'){choice(id,product.id);ZEZMS.tvTradeIns.productChanged();}
  if(id==='posProduct'||id==='invProduct'||id==='wbProduct')assert(target.value===product.name,'The product is not available in the current open month.');
  const input=document.getElementById('barcodeInput-'+id);if(input){input.value=code(value);input.focus();input.select();}
  message(id,'Selected '+product.name+'. Review quantity and price, then use the normal Add/Save action.',false);return product;
 }
 function scan(id){try{select(document.getElementById('barcodeInput-'+id).value,id);}catch(error){message(id,error.message,true);}}
 function scope(id){const a=auth(),s=ZEZMS.cloudSync&&ZEZMS.cloudSync.getState()||{};return [a.user&&a.user.id,a.role,s.deviceId,s.syncOwnerId,id].join('|');}
 function stopCamera(){const session=camera;camera=null;if(!session)return;session.cancelled=true;if(session.timer)clearTimeout(session.timer);if(session.controls)session.controls.stop();if(session.stream)session.stream.getTracks().forEach(track=>track.stop());if(session.video)session.video.srcObject=null;if(session.dialog){if(session.dialog.open)session.dialog.close();session.dialog.remove();}}
 function validCamera(session){return camera===session&&!session.cancelled&&allowed(session.id)&&scope(session.id)===session.scope&&document.getElementById(session.id)===session.target&&session.target.isConnected&&session.target.getClientRects().length>0;}
 function decoder(){if(window.ZXingBrowser)return Promise.resolve(window.ZXingBrowser);if(decoderPromise)return decoderPromise;decoderPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=VENDOR;script.onload=()=>window.ZXingBrowser?resolve(window.ZXingBrowser):reject(Error('Camera decoder is unavailable.'));script.onerror=()=>{decoderPromise=null;script.remove();reject(Error('Camera decoder could not load. Use a handheld scanner or enter the barcode.'));};document.head.appendChild(script);});return decoderPromise;}
 async function openCamera(id){
  let session=null;
  try{
   assert(allowed(id),'Sign in with access to this entry before opening the camera.');assert(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia,'Camera access is unavailable. Use a handheld scanner or enter the barcode.');stopCamera();
   const dialog=document.createElement('dialog');dialog.className='tf-barcode-camera';dialog.innerHTML='<h3>Scan product barcode</h3><video autoplay playsinline muted></video><p role="status">Requesting camera access…</p><button class="btn ghost" type="button">Close camera</button>';document.body.appendChild(dialog);
   session={id,scope:scope(id),target:document.getElementById(id),dialog,video:dialog.querySelector('video'),cancelled:false};camera=session;dialog.querySelector('button').onclick=stopCamera;dialog.addEventListener('close',()=>{if(camera===session)stopCamera();});dialog.showModal();
   const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});if(!validCamera(session)){stream.getTracks().forEach(t=>t.stop());return;}session.stream=stream;session.video.srcObject=stream;await session.video.play();if(!validCamera(session)){if(camera===session)stopCamera();return;}
   const found=text=>{if(!validCamera(session))return;const targetId=session.id;stopCamera();try{select(text,targetId);}catch(error){const field=document.getElementById('barcodeInput-'+targetId);if(field)field.value=clean(text);message(targetId,error.message,true);}};
   let detector=null;try{if(window.BarcodeDetector){const formats=await BarcodeDetector.getSupportedFormats();if(formats.length)detector=new BarcodeDetector({formats:formats.filter(f=>f!=='unknown')});}}catch(_){}
   if(!validCamera(session)){if(camera===session)stopCamera();return;}dialog.querySelector('p').textContent='Point the camera at the product barcode. Images stay on this device.';
   if(detector){const tick=async()=>{if(!validCamera(session)){if(camera===session)stopCamera();return;}try{const results=await detector.detect(session.video);if(results.length){found(results[0].rawValue);return;}}catch(error){if(validCamera(session))dialog.querySelector('p').textContent='Could not read a barcode yet. Hold steady or use a handheld scanner.';}if(validCamera(session))session.timer=setTimeout(tick,200);};tick();}
   else{const library=await decoder();if(!validCamera(session)){if(camera===session)stopCamera();return;}const reader=new library.BrowserMultiFormatReader();const controls=await reader.decodeFromStream(stream,session.video,(result,error,controls)=>{if(!validCamera(session)){if(controls)controls.stop();if(camera===session)stopCamera();return;}if(result){if(controls)controls.stop();found(result.getText());}});session.controls=controls;if(!validCamera(session))controls.stop();}
  }catch(error){if(session&&camera===session){const p=camera.dialog.querySelector('p');if(p)p.textContent=error.name==='NotAllowedError'?'Camera permission was not granted. Use a handheld scanner or enter the barcode.':clean(error.message);if(camera.stream)camera.stream.getTracks().forEach(t=>t.stop());}else if(!session&&allowed(id))message(id,error.message,true);}
 }
 function styles(){if(document.getElementById('dailyBarcodeStyles'))return;const style=document.createElement('style');style.id='dailyBarcodeStyles';style.textContent='.tf-barcode-entry{margin:8px 0 12px;padding:8px;border:1px solid #475569;border-radius:6px}.tf-barcode-entry label{display:block;font-size:12px;margin-bottom:4px}.tf-barcode-row{display:flex;gap:6px;flex-wrap:wrap}.tf-barcode-entry input,.tf-barcode-mapping input,.tf-barcode-mapping select{box-sizing:border-box;max-width:100%;padding:9px;font:inherit;background:#081221;color:#f8fafc;caret-color:#f8fafc;border:1px solid #64748b;border-radius:5px;color-scheme:dark}.tf-barcode-entry input{flex:1;min-width:120px}.tf-barcode-entry input::placeholder,.tf-barcode-mapping input::placeholder{color:#94a3b8;opacity:1}.tf-barcode-mapping option{color:#f8fafc;background:#081221}.tf-barcode-entry input:focus,.tf-barcode-mapping input:focus,.tf-barcode-mapping select:focus{outline:2px solid #2dd4bf;outline-offset:1px}.tf-barcode-entry p{font-size:12px;margin:5px 0 0}.tf-barcode-camera{box-sizing:border-box;background:#0f172a;color:#f8fafc;border:1px solid #64748b;border-radius:10px;width:min(94vw,560px);max-height:94vh;padding:16px}.tf-barcode-camera::backdrop{background:rgba(0,0,0,.7)}.tf-barcode-camera video{display:block;width:100%;max-height:55vh;background:#000}.tf-barcode-mapping select,.tf-barcode-mapping input{width:100%;margin:5px 0}';document.head.appendChild(style);}
 function mount(){
  mountQueued=false;styles();if(camera&&!validCamera(camera))stopCamera();
  Object.keys(TARGETS).forEach(id=>{const target=document.getElementById(id);if(!target||!target.isConnected||!target.getClientRects().length||!allowed(id)||document.getElementById('barcodeInput-'+id))return;
   const box=document.createElement('div');box.className='tf-barcode-entry';box.dataset.barcodeTarget=id;box.innerHTML='<label for="barcodeInput-'+id+'">Barcode / Product ID · '+esc(TARGETS[id].name)+'</label><div class="tf-barcode-row"><input id="barcodeInput-'+id+'" autocomplete="off" spellcheck="false" maxlength="128" placeholder="Scan here, then Enter"><button type="button" class="btn ghost" data-action="find">Find</button><button type="button" class="btn ghost" data-action="camera">Camera</button></div><p id="barcodeStatus-'+id+'" role="status">Scan selects a product. Quantity and posting remain under your control. F8 focuses scanning.</p>';
   if(id==='siNewName'&&target.closest('.row'))target.closest('.row').insertAdjacentElement('afterend',box);else target.closest('.field')?target.closest('.field').insertAdjacentElement('afterend',box):target.insertAdjacentElement('afterend',box);
   box.querySelector('input').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();event.stopPropagation();scan(id);}});box.querySelector('[data-action=find]').onclick=()=>scan(id);box.querySelector('[data-action=camera]').onclick=()=>openCamera(id);
   if(id==='siNewName'){box.querySelector('label').textContent='New product barcode (optional)';box.querySelector('input').maxLength=1024;box.querySelector('[data-action=find]').textContent='Check barcode';box.querySelector('p').textContent='Scan or type the barcode, then enter the product details and Record Stock In. Nothing is saved by scanning.';}
   if(id==='siProduct'&&allowed('siNewName')){const button=document.createElement('button');button.type='button';button.className='btn ghost';button.textContent='Use for new product';button.dataset.action='new';button.onclick=()=>{try{stageNewBarcode(box.querySelector('input').value);}catch(error){message(id,error.message,true);}};box.querySelector('.tf-barcode-row').appendChild(button);}

  });
  if(typeof currentView!=='undefined'&&currentView==='products'&&owner()&&!document.getElementById('barcodeMappingCard')){
   const root=document.getElementById('viewRoot');if(!root)return;const card=document.createElement('section');card.id='barcodeMappingCard';card.className='card tf-barcode-mapping';card.innerHTML='<h3>Product barcodes</h3><p>Owner/Admin: link a manufacturer barcode to an existing product. Product IDs can already be scanned without a mapping.</p><label for="barcodeMapProduct">Product</label><select id="barcodeMapProduct"><option value="">Select product</option>'+list(database().products).map(p=>'<option value="'+esc(p.id)+'">'+esc(p.id+' · '+p.name)+'</option>').join('')+'</select><label for="barcodeMapCode">Barcode (leading zeros are preserved)</label><input id="barcodeMapCode" maxlength="128" placeholder="Scan or type the barcode"><div class="row"><button type="button" class="btn" data-map="add">Link barcode</button><button type="button" class="btn ghost" data-map="remove">Remove link</button></div><p id="barcodeMapStatus" role="status"></p>';root.appendChild(card);
   card.querySelector('select').onchange=()=>{const p=list(database().products).find(p=>p.id===card.querySelector('select').value);card.querySelector('#barcodeMapStatus').textContent=p?'Linked barcodes: '+(aliases(p).join(', ')||'None'):'Select a product.';};
   card.querySelectorAll('[data-map]').forEach(button=>button.onclick=()=>{try{const result=setBarcode(card.querySelector('select').value,card.querySelector('input').value,button.dataset.map==='remove');card.querySelector('#barcodeMapStatus').textContent='Saved. Linked barcodes: '+(result.join(', ')||'None');}catch(error){card.querySelector('#barcodeMapStatus').textContent=error.message;}});
  }
 }
 function schedule(){if(!mountQueued){mountQueued=true;queueMicrotask(mount);}}
 document.addEventListener('keydown',event=>{if(event.key==='F8'){const input=Array.from(document.querySelectorAll('.tf-barcode-entry input')).filter(el=>el.getClientRects().length).at(-1);if(input){event.preventDefault();input.focus();input.select();}}});
 window.addEventListener('pagehide',stopCamera);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera();});document.addEventListener('zezms-staff-auth-changed',()=>{stopCamera();schedule();});
 const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden']});schedule();
 ZEZMS.dailyProfit=Object.freeze({build:BUILD,calculate:daily,tile:profitTile});
 ZEZMS.barcodes=Object.freeze({build:BUILD,resolve,setBarcode,prepareNewStockIn,newProductRecord,select,scan,openCamera,stopCamera,mount,_test:{code,aliases,allowed,scope}});
}());
