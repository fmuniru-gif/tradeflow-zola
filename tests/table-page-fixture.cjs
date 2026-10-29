'use strict';
async function installProbe(page){
  await page.evaluate(()=>{
    const settle=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(resolve,80))));
    window.__tableProbe={settle,async collect(key,selector){
      const api=ZEZMS.tablePages;
      if(api&&api.inspect(key).page)api.move(key,-api.inspect(key).page);
      await settle();
      const rows=[];let pages=0;
      do{
        rows.push(...Array.from(document.querySelectorAll(selector)).map(row=>({html:row.outerHTML,text:row.textContent,cells:Array.from(row.cells).map(c=>c.textContent),actions:Array.from(row.querySelectorAll('[onclick]')).map(el=>el.getAttribute('onclick'))})));
        pages++;
        if(!api||api.inspect(key).page+1>=Math.max(1,Math.ceil(api.inspect(key).total/api.size)))break;
        const previous=api.inspect(key).page;
        api.move(key,1);await settle();
        if(api.inspect(key).page!==previous+1)throw Error('Page did not advance for '+key+': '+previous+' -> '+api.inspect(key).page);
      }while(pages<10000);
      if(api&&api.inspect(key).page)api.move(key,-api.inspect(key).page);
      await settle();console.log('PAGE_COLLECTION '+key+' '+rows.length+' rows / '+pages+' pages');return rows;
    }};
  });
}
async function functional(page){
  return page.evaluate(async()=>{
    const check=(condition,message)=>{if(!condition)throw Error(message);},p=window.__tableProbe,settle=p.settle;
    const all={};
    nav('receipts');await settle();all.receipts=await p.collect('receipts','#salesRecordsBody .sales-record-row');
    check(all.receipts.length===1350,'Complete sales records omitted');
    const ids=all.receipts.map(row=>row.cells[1]);check(new Set(ids).size===1350,'Duplicate sales records');
    const dates=all.receipts.map(row=>new Date(row.cells[7]).getTime());check(dates.every((date,i)=>!i||date<=dates[i-1]),'Full date order changed');
    const searches={};
    for(const query of ['Synthetic Customer 899','RCP-00000899','ZEZ-2026-00000899','Q449','not-a-real-customer','PDF','PAID','GH₵ 25.00']){
      document.getElementById('receiptNameSearch').value=query;filterSalesRecordsByName();await settle();
      const rows=await p.collect('receipts','#salesRecordsBody .sales-record-row');
      // The baseline retains filtered-out DOM rows; the candidate mounts matches.
      searches[query]=rows.filter(row=>!row.html.includes('display: none')).map(row=>row.cells[1]);
    }
    for(const query of ['Synthetic Customer 899','RCP-00000899','ZEZ-2026-00000899'])check(searches[query].includes('ZEZ-2026-00000899'),'Off-page receipt search failed: '+query);
    check(searches['not-a-real-customer'].length===0,'No-match search failed');
    document.getElementById('receiptNameSearch').value='ZEZ-2026-00000899';filterSalesRecordsByName();await settle();
    let receipt=Array.from(document.querySelectorAll('#salesRecordsBody .sales-record-row')).find(row=>row.style.display!=='none'&&row.textContent.includes('ZEZ-2026-00000899'));
    receipt.querySelector('button').click();check(document.getElementById('modalBody').textContent.includes('ZEZ-2026-00000899'),'Last receipt view failed');closeModal();
    const print=window.printStoredReceipt;let target;try{window.printStoredReceipt=id=>{target=id;};receipt.querySelector('button[onclick^="printStoredReceipt"]').click();check(target==='ZEZ-2026-00000899','Reprint target changed');}finally{window.printStoredReceipt=print;}
    const pdf=window.downloadStoredReceiptPDF;let pdfTarget;try{window.downloadStoredReceiptPDF=async id=>{pdfTarget=id;};receipt.querySelector('[data-pdf-export]').click();check(pdfTarget==='ZEZ-2026-00000899','Receipt PDF target changed');}finally{window.downloadStoredReceiptPDF=pdf;}
    document.getElementById('receiptNameSearch').value='Q449';filterSalesRecordsByName();await settle();
    const quick=Array.from(document.querySelectorAll('#salesRecordsBody .sales-record-row')).find(row=>row.style.display!=='none'&&row.textContent.includes('Q449'));quick.querySelector('button').click();check(document.getElementById('modalBody').textContent.includes('Q449'),'Off-page quick sale missing');closeModal();
    clearSalesRecordsNameSearch();await settle();
    nav('products');await settle();all.products=await p.collect('products','#productCatalogBody tr');check(all.products.length===600,'Products omitted');
    ZEZMS.productCatalogSearch.updateId('P599');ZEZMS.productCatalogSearch.refreshNow();await settle();check(document.getElementById('productCatalogBody').textContent.includes('Synthetic Product 599'),'Last product search failed');check(document.querySelector('#productCatalogBody button[onclick="editProduct(599)"]'),'Product action index changed');
    ZEZMS.productCatalogSearch.clear();await settle();check((await p.collect('products','#productCatalogBody tr')).length===600,'Clear product search omitted records');
    nav('stock');await settle();all.stock=await p.collect('stock','#stockBalanceBody .stock-balance-row');check(all.stock.length===600,'Stock rows omitted');const stockTotal=document.getElementById('stockBalanceValue').textContent;
    document.getElementById('stockSearchId').value='P599';filterStockBalanceRows();await settle();const matches=Array.from(document.querySelectorAll('#stockBalanceBody .stock-balance-row')).filter(row=>row.style.display!=='none');check(matches.length===1&&matches[0].textContent.includes('P599'),'Last stock filter failed');const filteredTotal=document.getElementById('stockBalanceValue').textContent;
    document.getElementById('stockSearchId').value='not-a-stock-id';filterStockBalanceRows();await settle();check(document.getElementById('stockBalanceNoMatch')?.textContent.includes('No product matches'),'Stock no-match state missing');check(document.getElementById('stockBalanceMatchCount').textContent==='0 matching products','Stock no-match count changed');
    clearStockBalanceSearch();await settle();check(document.getElementById('stockBalanceValue').textContent===stockTotal,'Complete stock totals changed');
    const statements={};nav('accounts');await settle();
    for(const kind of ['debtors','creditors','depositors']){
      accTab=kind;render();await settle();
      const selector=ZEZMS.tablePages?'#accountHolderBody tr':'#viewRoot button[onclick^="openSettle"]';
      if(ZEZMS.tablePages)all[kind]=await p.collect('accounts-'+kind,selector);
      else all[kind]=Array.from(document.querySelectorAll(selector)).map(button=>button.closest('tr')).map(row=>({html:row.outerHTML,text:row.textContent,cells:Array.from(row.cells).map(c=>c.textContent),actions:Array.from(row.querySelectorAll('[onclick]')).map(el=>el.getAttribute('onclick'))}));
      check(all[kind].length===600,'Account register omitted '+kind);
      setAccountHolderFilter(kind+'-599');await settle();const last=document.querySelector('#viewRoot button[onclick^="openSettle"]');check(last.getAttribute('onclick').includes(kind+'-599'),'Last account target changed');last.click();check(document.getElementById('modalBody').textContent.includes('Synthetic '+kind+' 599'),'Settlement dialog target changed');closeModal();
      check(document.querySelectorAll('#accountTransactionBody .account-transaction-row').length===100,'Original latest-100 history changed');
      const report=await ZEZMS.accountCashPdfR68E.buildAccountStatement(kind,kind+'-599');check(report.model.transactions.length===150&&report.bytes.length>100,'Full statement history lost');statements[kind]={balance:report.model.accountBalance,transactions:report.model.transactions.length,model:report.model};
      setAccountHolderFilter('');await settle();
    }
    // A disposable linked, unreferenced receipt proves the Edit predicate and
    // callback on a record beyond the first page. Never submit the edit form.
    const receiptRecord=DB.receipts[899],saleRecord=DB.sales[899],receiptBefore={...receiptRecord},saleBefore={...saleRecord};
    try{
      const period=getLatestMonth();receiptRecord.receiptRef='';saleRecord.receiptNo=receiptRecord.receiptNo;saleRecord.year=period.year;saleRecord.month=period.month;
      nav('receipts');await settle();document.getElementById('receiptNameSearch').value='Edit';filterSalesRecordsByName();await settle();
      const edits=Array.from(document.querySelectorAll('#salesRecordsBody .sales-record-row')).filter(row=>row.style.display!=='none');check(edits.length===1,'Global Edit-label search changed');
      const button=edits[0].querySelector('[data-receipt-edit]');check(button?.dataset.receiptEdit===receiptRecord.receiptNo,'Off-page receipt Edit target changed');button.click();check(document.getElementById('modalBody').textContent.includes(receiptRecord.receiptNo),'Receipt Edit dialog failed');closeModal();
    }finally{
      for(const key of Object.keys(receiptRecord))delete receiptRecord[key];Object.assign(receiptRecord,receiptBefore);
      for(const key of Object.keys(saleRecord))delete saleRecord[key];Object.assign(saleRecord,saleBefore);
    }
    accTab='debtors';nav('cash');await settle();
    return {all,searches,stockTotal,filteredTotal,statements,salesRecords:ids.length,uniqueIds:new Set(ids).size,receiptSearch:'PASS',dateSort:'PASS',receiptView:'PASS',quickView:'PASS',reprint:'PASS',receiptPdfTarget:'PASS',receiptEdit:'PASS',products:600,stockProducts:600,accountsPerKind:600,accountHistoryPerKind:100};
  });
}
module.exports={installProbe,functional};
