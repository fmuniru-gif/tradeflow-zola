/* Read-only presentation helpers. No business values or records are cached. */
(function () {
  'use strict';
  const numberFormat = new Intl.NumberFormat('en-GH', {minimumFractionDigits:2,maximumFractionDigits:2});
  const number = value => numberFormat.format(Number(value) || 0);
  function stockQuantities(rows, latest) {
    const quantities=new Map();
    for(const row of rows){
      if(row.year!==latest.year||row.month!==latest.month||Number.isNaN(row.productName))continue;
      quantities.set(row.productName,(quantities.has(row.productName)?quantities.get(row.productName):0)+(Number(row.rStock)||0));
    }
    return quantities;
  }
  function replaceReceiptIds(html, receipts) {
    const source=String(html||'');
    const pairs=(Array.isArray(receipts)?receipts:[]).filter(receipt=>receipt&&receipt.receiptRef).map(receipt=>[String(receipt.receiptNo||receipt.id||''),String(receipt.receiptRef||'')]).filter(([id,ref])=>id&&ref&&id!==ref);
    const legacy=()=>pairs.reduce((output,[id,ref])=>output.split(id).join(ref),source);
    if(!pairs.length)return source;
    // Safe single-pass domain: literal, token-bounded internal IDs have one
    // common initial character which never appears again inside an ID. Thus
    // distinct IDs cannot overlap. References cannot contain the common prefix,
    // so a replacement cannot cascade into another internal-ID replacement.
    const initial=pairs[0][0][0],seen=new Set();
    let prefix=pairs[0][0];
    for(const [id,ref] of pairs){
      if(id.length<12||!/^[A-Za-z][A-Za-z0-9_-]+$/.test(id)||id[0]!==initial||id.slice(1).includes(initial)||seen.has(id)||!/^[A-Za-z0-9_/-]+$/.test(ref))return legacy();
      seen.add(id);
      while(!id.startsWith(prefix))prefix=prefix.slice(0,-1);
    }
    if(pairs.some(([,ref])=>ref.includes(prefix)))return legacy();
    const replacements=new Map(pairs),pattern=new RegExp(pairs.map(([id])=>id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g');
    let safe=true;
    const output=source.replace(pattern,(id,offset)=>{
      if(/[A-Za-z0-9_-]/.test(source[offset-1]||'')||/[A-Za-z0-9_-]/.test(source[offset+id.length]||''))safe=false;
      return replacements.get(id);
    });
    return safe?output:legacy();
  }
  window.ZEZMS=window.ZEZMS||{};
  window.ZEZMS.remainingTabsPresentation=Object.freeze({number,stockQuantities,replaceReceiptIds});
}());
