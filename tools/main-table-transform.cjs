'use strict';
// Scoped presentation edits applied after the established PR14 transformation.
// All row templates, stock calculations, transaction models and actions remain.
function transformMainTables(source,helpers){
  function replace(before,after){if(source.split(before).length!==2)throw Error('MAIN_TABLE_MARKER_MISMATCH: '+before.slice(0,90));source=source.replace(before,()=>after);}
  replace("const fmt = (n) => 'GH₵ ' + ZEZMS.remainingTabsPresentation.number(n);",helpers+"\nconst fmt = (n) => 'GH₵ ' + ZEZMS.remainingTabsPresentation.number(n);");
  replace('function productCatalogRowsHTML(model){','function productCatalogRowsHTML(model){\n  ZEZMS.tablePages.enter(\'products\');');
  replace('const rows = model.entries.map(entry=>{',"const rows = ZEZMS.tablePages.slice('products',model.entries,model.name+'\\0'+model.productId).map(entry=>{");
  replace('  if(count) count.textContent=String(model.entries.length);','  if(count) count.textContent=String(model.entries.length);\n  const pages=$(\'tablePages-products\');if(pages)pages.outerHTML=ZEZMS.tablePages.controls(\'products\');\n  if(ZEZMS.staffAuth&&ZEZMS.staffAuth.isActive())ZEZMS.staffAuth.afterRender();\n  if(window.ZEZMSApplyVerticalMobileLayout)window.ZEZMSApplyVerticalMobileLayout();');
  replace('<tbody id="productCatalogBody">${rows}</tbody>\n      </table></div>','<tbody id="productCatalogBody">${rows}</tbody>\n      </table></div>${ZEZMS.tablePages.controls(\'products\')}');
  const stockFilterStart=source.indexOf('function filterStockBalanceRows(){'),stockFilterEnd=source.indexOf('function clearStockBalanceSearch(){',stockFilterStart);
  if(stockFilterStart<0||stockFilterEnd<0)throw Error('MAIN_TABLE_STOCK_FILTER_MARKER');
  const filter=source.slice(stockFilterStart,stockFilterEnd);
  replace(filter,"function filterStockBalanceRows(){\n  stockBalanceSearchState.name=(($('stockSearchName')&&$('stockSearchName').value)||'');\n  stockBalanceSearchState.productId=(($('stockSearchId')&&$('stockSearchId').value)||'');\n  ZEZMS.tablePages.reset('stock');ZEZMS.tablePages.refresh();\n}\n");
  replace('  const list = Object.values(map).sort((a,b)=>a.name.localeCompare(b.name));',`  ZEZMS.tablePages.enter('stock');
  const nameQuery=stockBalanceSearchState.name.trim().toLowerCase(),idQuery=stockBalanceSearchState.productId.trim().toLowerCase();
  const allStock = Object.values(map).sort((a,b)=>a.name.localeCompare(b.name));
  const list = allStock.filter(p=>(!nameQuery||p.name.toLowerCase().includes(nameQuery))&&(!idQuery||String(p.id||'').toLowerCase().includes(idQuery)));`);
  replace('  const rows = list.map(p=>`<tr class="stock-balance-row"',"  const rows = ZEZMS.tablePages.slice('stock',list,[DB.selectedYear,DB.selectedMonth,nameQuery,idQuery].join('|')).map(p=>`<tr class=\"stock-balance-row\"");
  replace('${list.length} ${list.length===1?\'product\':\'products\'}</span>',"${list.length} ${nameQuery||idQuery?'matching ':''}${list.length===1?'product':'products'}</span>");
  replace('  const tableRows = rows || `<tr><td colspan="7" class="empty">No stock in', '  const tableRows = rows || (allStock.length&&(nameQuery||idQuery)?\'<tr id="stockBalanceNoMatch"><td colspan="7" class="empty">No product matches the search.</td></tr>\':\'\') || `<tr><td colspan="7" class="empty">No stock in');
  replace('<tbody id="stockBalanceBody">${tableRows}${rows?\'<tr id="stockBalanceNoMatch" style="display:none"><td colspan="7" class="empty">No product matches the search.</td></tr>\':\'\'}</tbody>\n    </table></div>', '<tbody id="stockBalanceBody">${tableRows}${rows?\'<tr id="stockBalanceNoMatch" style="display:none"><td colspan="7" class="empty">No product matches the search.</td></tr>\':\'\'}</tbody>\n    </table></div>${ZEZMS.tablePages.controls(\'stock\')}');
  replace('    const accountRows = list.map((account) =>',"    ZEZMS.tablePages.enter('accounts-'+accTab);\n    const accountRows = ZEZMS.tablePages.slice('accounts-'+accTab,list).map((account) =>");
  replace('  viewReceipts = function () {\n    ensureOperationsModel();','  viewReceipts = function () {\n    ZEZMS.tablePages.enter(\'receipts\');\n    ensureOperationsModel();');
  replace('<tbody>${accountRows}</tbody>\n          </table></div>','<tbody id="accountHolderBody">${accountRows}</tbody>\n          </table></div>${ZEZMS.tablePages.controls(\'accounts-\'+accTab)}');
  const sales=/    const rows = list\.map\(\(record\) => \{([\s\S]*?)    \}\)\.join\(''\);\n\n    const emptyRow/;
  const match=source.match(sales);if(!match)throw Error('MAIN_TABLE_SALES_ROW_MARKER');
  replace(match[0],`    const renderSalesRow = (record) => {${match[1]}    };
    const matchingSales=ZEZMS.tablePages.filterSales(list,renderSalesRow,DB.receipts);
    const rows=ZEZMS.tablePages.slice('receipts',matchingSales,ZEZMS.tablePages.getSalesQuery()).map(renderSalesRow).join('');

    const emptyRow`);
  replace('<input id="receiptNameSearch" type="search"','<input id="receiptNameSearch" value="${ZEZMS.tablePages.attr(ZEZMS.tablePages.getSalesQuery())}" type="search"');
  replace('${list.length} ${list.length === 1 ? \'sales record\' : \'sales records\'}</span>',"${matchingSales.length} ${ZEZMS.tablePages.getSalesQuery().trim()?(matchingSales.length===1?'matching receipt':'matching receipts'):(matchingSales.length===1?'sales record':'sales records')}</span>");
  replace('<tr id="salesRecordsNoMatch" style="display:none">','<tr id="salesRecordsNoMatch" style="display:${list.length&&!matchingSales.length?\'\':\'none\'}">');
  replace('<tbody id="salesRecordsBody">${rows}${emptyRow}<tr id="salesRecordsNoMatch" style="display:${list.length&&!matchingSales.length?\'\':\'none\'}"><td colspan="11" class="empty">No receipt matches that customer name.</td></tr></tbody>\n      </table></div>', '<tbody id="salesRecordsBody">${rows}${emptyRow}<tr id="salesRecordsNoMatch" style="display:${list.length&&!matchingSales.length?\'\':\'none\'}"><td colspan="11" class="empty">No receipt matches that customer name.</td></tr></tbody>\n      </table></div>${ZEZMS.tablePages.controls(\'receipts\')}');
  const start=source.indexOf('    window.filterSalesRecordsByName = function () {\n      const input = document.getElementById(\'receiptNameSearch\'); const query ='),end=source.indexOf('    window.clearSalesRecordsNameSearch',start);
  if(start<0||end<0)throw Error('MAIN_TABLE_SALES_FILTER_MARKER');
  replace(source.slice(start,end),"    window.filterSalesRecordsByName = function () {\n      const input=document.getElementById('receiptNameSearch');ZEZMS.tablePages.setSalesQuery(input&&input.value||'');ZEZMS.tablePages.refresh();\n    };\n");
  return source;
}
module.exports={transformMainTables};
