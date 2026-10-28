'use strict';
// Exact presentation-only assembly edits; original embedded business modules
// and standalone sources stay intact. The function is also embedded in loader.
function transformRemainingTabs(source, helpers) {
  function replace(before, after) {
    if(source.split(before).length!==2)throw Error('REMAINING_TABS_PRESENTATION_MARKER_MISMATCH: '+before.slice(0,70));
    source=source.replace(before,()=>after);
  }
  replace("const fmt = (n) => 'GH₵ ' + (Number(n)||0).toLocaleString('en-GH',{minimumFractionDigits:2,maximumFractionDigits:2});\nconst fmtN = (n) => (Number(n)||0).toLocaleString('en-GH',{minimumFractionDigits:2,maximumFractionDigits:2});",
    helpers+"\nconst fmt = (n) => 'GH₵ ' + ZEZMS.remainingTabsPresentation.number(n);\nconst fmtN = (n) => ZEZMS.remainingTabsPresentation.number(n);");
  replace('function productCatalogRowsHTML(model){\n  const rows = model.entries.map(entry=>{',
    'function productCatalogRowsHTML(model){\n  const catalogQuantities = ZEZMS.remainingTabsPresentation.stockQuantities(DB.stockRows,getLatestMonth());\n  const rows = model.entries.map(entry=>{');
  replace('${fmtN(stockOnHand(p.name))}','${fmtN(catalogQuantities.has(p.name)?catalogQuantities.get(p.name):0)}');
  replace("    list(database().receipts).filter(function (receipt) { return receipt && receipt.receiptRef; }).forEach(function (receipt) {\n      const internal = String(receipt.receiptNo || receipt.id || ''); const ref = String(receipt.receiptRef || '');\n      if (internal && ref) output = output.split(internal).join(ref);\n    });",
    '    output = ZEZMS.remainingTabsPresentation.replaceReceiptIds(output,list(database().receipts));');
  return source;
}
module.exports={transformRemainingTabs};
