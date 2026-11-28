'use strict';

function edits() {
  const basePrice = `function getBaseUnitPrice(name){
  const lm = getLatestMonth();
  // Prefer latest stock row uPrice in open month, else product catalog
  const rows = DB.stockRows.filter(r=>r.productName===name && r.year===lm.year && r.month===lm.month);
  if(rows.length){
    // most recent by id
    const r = rows[rows.length-1];
    if(r.uPrice!=null) return Number(r.uPrice)||0;
  }
  const p = DB.products.find(x=>x.name===name);
  return p ? (Number(p.uPrice)||0) : 0;
}`;
  const editForm = '    <div class="field"><label>Unit price</label><input id="epPrice" type="number" step="0.01" value="${p.uPrice}" /></div>';
  const savePrice = "  if(!name){ toast('Name required','err'); return; }\n  const old = DB.products[i].name;\n  DB.products[i].name = name;\n  DB.products[i].category = document.getElementById('epCat').value.trim();\n  DB.products[i].uPrice = Number(document.getElementById('epPrice').value)||0;";
  const rawPrice = "    const raw = latestRow && latestRow.uPrice != null && String(latestRow.uPrice).trim() !== '' ? latestRow.uPrice : (catalog && catalog.uPrice != null && String(catalog.uPrice).trim() !== '' ? catalog.uPrice : null);";
  return [
    [basePrice, `function getBaseUnitPrice(name){
  const product = DB.products.find(p=>p.name===name);
  // An explicit Products price takes precedence over batch defaults.
  if(product && product.useCatalogSellingPrice === true) return Number(product.uPrice)||0;
  const lm = getLatestMonth();
  const rows = DB.stockRows.filter(r=>r.productName===name && r.year===lm.year && r.month===lm.month);
  const latest = rows[rows.length-1];
  return Number(latest && latest.uPrice != null ? latest.uPrice : product && product.uPrice)||0;
}`],
    [editForm, `    <div class="field"><label for="epPrice">Selling price (GH₵)</label><input id="epPrice" type="number" min="0" step="0.01" value="\${escAttr(p.uPrice)}" /></div>
    \${p.uPrice != null && p.uPrice !== '' && Number.isFinite(Number(p.uPrice)) && getBaseUnitPrice(p.name) !== Number(p.uPrice)
      ? '<label class="row" style="margin-bottom:12px"><input id="epApplySellingPrice" type="checkbox">Use this price for new sales and documents</label>' : ''}`],
    [savePrice, `  if(!name){ toast('Name required','err'); return; }
  const priceInput = $('epPrice');
  const price = readNumberWithDefault(priceInput,0);
  if(priceInput.validity.badInput || !Number.isFinite(price) || price < 0){
    toast('Selling price must be a valid number of zero or more.','err');
    return;
  }
  const product = DB.products[i];
  const old = product.name;
  if(price !== (Number(priceInput.defaultValue)||0) || $('epApplySellingPrice')?.checked){
    product.uPrice = price;
    product.useCatalogSellingPrice = true;
  }
  product.name = name;
  product.category = $('epCat').value.trim();`],
    [rawPrice, "    const raw = catalog?.useCatalogSellingPrice === true ? catalog.uPrice\n      : (latestRow && latestRow.uPrice != null && String(latestRow.uPrice).trim() !== '' ? latestRow.uPrice : (catalog && catalog.uPrice != null && String(catalog.uPrice).trim() !== '' ? catalog.uPrice : null));"]
  ];
}

function transformProductSellingPrice(html, changes) {
  for (const [before,after] of changes) {
    if (html.split(before).length !== 2) throw Error('PRODUCT_SELLING_PRICE_MARKER: ' + before.slice(0,90));
    html = html.replace(before, () => after);
  }
  return html;
}

function withoutProductSellingPrice(html) {
  html = require('./bnpl-undertaking-transform.cjs').withoutBnplUndertaking(html);
  html = require('./deposits-transform.cjs').withoutDeposits(html);
  if (!html.includes('product.useCatalogSellingPrice === true')) return html;
  const reverse = edits().reverse().map(([before,after]) => [after,before]);
  return transformProductSellingPrice(html, reverse);
}

module.exports = { edits, transformProductSellingPrice, withoutProductSellingPrice };
