/* TradeFlow: bounded table presentation. No stored records or financial cache. */
(function () {
  'use strict';
  const SIZE=50, states=new Map();
  let salesQuery='', refreshing=false;
  function state(key){if(!states.has(key))states.set(key,{page:0,total:0,signature:''});return states.get(key);}
  function attr(value){return String(value==null?'':value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]);}
  function slice(key,records,signature=''){
    const s=state(key);
    if(s.signature!==signature){s.signature=signature;s.page=0;}
    s.total=records.length;s.page=Math.max(0,Math.min(s.page,Math.max(0,Math.ceil(s.total/SIZE)-1)));
    return records.slice(s.page*SIZE,(s.page+1)*SIZE);
  }
  function controls(key){
    const s=state(key),pages=Math.max(1,Math.ceil(s.total/SIZE));
    return '<div class="row table-pages" id="tablePages-'+attr(key)+'" role="group" aria-label="Table pages" style="justify-content:space-between;margin-top:10px">'
      +'<span role="status" aria-live="polite">'+(s.total?s.page*SIZE+1:0)+'–'+Math.min(s.total,(s.page+1)*SIZE)+' of '+s.total+' records · Page '+(s.page+1)+' of '+pages+'</span>'
      +'<div class="row"><button type="button" class="btn sm ghost" data-page-key="'+attr(key)+'" data-page-step="-1" onclick="ZEZMS.tablePages.move(\''+attr(key)+'\',-1)"'+(s.page===0?' disabled':'')+'>Previous</button>'
      +'<button type="button" class="btn sm ghost" data-page-key="'+attr(key)+'" data-page-step="1" onclick="ZEZMS.tablePages.move(\''+attr(key)+'\',1)"'+(s.page+1>=pages?' disabled':'')+'>Next</button></div></div>';
  }
  function refresh(){
    if(refreshing||typeof window.render!=='function')return;
    const root=document.getElementById('viewRoot');
    // Preserve unposted form inputs/focus when the normal guarded view rerenders.
    const active=document.activeElement;
    const values=root?Array.from(root.querySelectorAll('input[id],select[id],textarea[id]')).filter(el=>!el.closest('tbody')&&el.type!=='file'&&el.type!=='password').map(el=>({id:el.id,value:el.value,checked:el.checked,focused:el===active,start:el.selectionStart,end:el.selectionEnd})):[];
    refreshing=true;
    try{
      window.render();
      for(const saved of values){
        const el=document.getElementById(saved.id);if(!el||!root.contains(el))continue;
        el.value=saved.value;if(typeof saved.checked==='boolean')el.checked=saved.checked;
        if(saved.focused){el.focus({preventScroll:true});if(saved.start!=null&&typeof el.setSelectionRange==='function')try{el.setSelectionRange(saved.start,saved.end);}catch(_){} }
      }
    }finally{refreshing=false;}
  }
  function move(key,step){
    const s=state(key),next=Math.max(0,Math.min(s.page+step,Math.max(0,Math.ceil(s.total/SIZE)-1)));
    if(next===s.page)return;s.page=next;refresh();
    const button=document.querySelector('[data-page-key="'+key+'"][data-page-step="'+step+'"]');
    if(button&&!button.disabled)button.focus({preventScroll:true});
  }
  function reset(key){state(key).page=0;}
  function enter(key){if(!refreshing){reset(key);if(key==='receipts')salesQuery='';}}
  function setSalesQuery(query){salesQuery=String(query||'');reset('receipts');}
  function filterSales(records,renderRow,receipts){
    const query=salesQuery.trim().toLowerCase();if(!query)return records;
    // Search all records using the original formatted row text, without mounting
    // every row. Apply the original whole-list reference substitution once.
    const rows=records.map(renderRow);
    let separator='\u0000';
    while(rows.some(row=>row.includes(separator))||receipts.some(r=>r&&[r.receiptRef,r.receiptNo,r.id].some(value=>String(value||'').includes(separator))))separator+='\u0000';
    const replaced=ZEZMS.remainingTabsPresentation.replaceReceiptIds(rows.join(separator),receipts).split(separator);
    const decoder=document.createElement('textarea');
    const decode=value=>{decoder.innerHTML=value;return decoder.value;};
    const edit=ZEZMS.ownerMaintenance&&typeof ZEZMS.ownerMaintenance.receiptEditLookup==='function'?ZEZMS.ownerMaintenance.receiptEditLookup():()=>false;
    return records.filter((record,index)=>{
      let html=replaced[index];
      // Preserve action-label searches added by the existing UI decorators.
      html=html.replace(/(<button\b[^>]*onclick="printStoredReceipt\('([^']+)'\)"[^>]*>[\s\S]*?<\/button>)/g,(whole,button,id)=>(edit(id)?'<button>Edit</button>':'')+button+(typeof window.downloadStoredReceiptPDF==='function'?'<button>PDF</button>':''));
      const text=decode(html.replace(/<[^>]*>/g,''));
      const customer=decode((html.match(/data-customer-name="([^"]*)"/)||[])[1]||'');
      const receipt=receipts.find(item=>item&&item.receiptRef&&text.indexOf(String(item.receiptRef))>=0);
      const reference=receipt?String(receipt.receiptRef)+' '+String(receipt.receiptNo||''):'';
      return (customer+' '+reference+' '+text).toLowerCase().includes(query);
    });
  }
  window.ZEZMS=window.ZEZMS||{};
  window.ZEZMS.tablePages=Object.freeze({size:SIZE,slice,controls,move,reset,enter,refresh,attr,setSalesQuery,getSalesQuery:()=>salesQuery,filterSales,
    inspect:key=>({...state(key),size:SIZE})});
}());
