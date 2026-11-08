'use strict';
function transformDailyBarcodes(html,helper){
 const dashboard='function viewDashboard(){';if(html.split(dashboard).length!==2)throw Error('DAILY_PROFIT_DASHBOARD_MARKER');
 html=html.replace(dashboard,dashboard+"\n  const dailyProfitTile=ZEZMS.dailyProfit?ZEZMS.dailyProfit.tile():{value:'Unavailable',note:'Recorded cost evidence unavailable'};");
 const before="    {k:'Daily Qty Sold', v:fmtN";
 if(html.split(before).length!==2)throw Error('DAILY_PROFIT_TILE_MARKER');
 html=html.replace(before,"    {k:'Daily Gross Profit', v:dailyProfitTile.value, c:'green', s:dailyProfitTile.note},\n"+before);
 const exportMarker='getRuntime:function () { return { windowDays:runtime.windowDays, buildCount:runtime.buildCount, lastBuildMs:runtime.lastBuildMs, model:runtime.model }; }, _test:Object.freeze({ buildModel:buildModel, saleEvents:saleEvents';
 if(html.split(exportMarker).length!==2)throw Error('DAILY_PROFIT_PROVIDER_MARKER');
 html=html.replace(exportMarker,'getSaleEvents:saleEvents, '+exportMarker);
 const stockMarker='  let prod = selectedName ? findProductByName(selectedName) : null;';
 const stockHook="  let newProductBarcode='';try{newProductBarcode=ZEZMS.barcodes.prepareNewStockIn(selectedName,enteredName,requestedId);}catch(error){toast(error.message,'err');return;}\n";
 if(html.split(stockMarker).length!==2)throw Error('NEW_PRODUCT_BARCODE_PREPARE_MARKER');html=html.replace(stockMarker,stockHook+stockMarker);
 const record='      prod = { id:productId, name:enteredName, category, uPrice:uPrice||0 };';
 if(html.split(record).length!==2)throw Error('NEW_PRODUCT_BARCODE_RECORD_MARKER');
 html=html.replace(record,"      try{prod = ZEZMS.barcodes.newProductRecord({ id:productId, name:enteredName, category, uPrice:uPrice||0 },newProductBarcode);}catch(error){toast(error.message,'err');return;}");
 const end=html.lastIndexOf('</body>');if(end<0)throw Error('DAILY_BARCODE_BODY_MARKER');
 return html.slice(0,end)+'<script data-zezms-daily-barcodes>\n'+helper+'\n</script>'+html.slice(end);
}
function withoutDailyBarcodes(html){
 if(!html.includes('<script data-zezms-daily-barcodes>'))return html;
 html=html.replace(/<script data-zezms-daily-barcodes>[\s\S]*?<\/script>/,'');
 html=html.replace("  let newProductBarcode='';try{newProductBarcode=ZEZMS.barcodes.prepareNewStockIn(selectedName,enteredName,requestedId);}catch(error){toast(error.message,'err');return;}\n",'').replace("      try{prod = ZEZMS.barcodes.newProductRecord({ id:productId, name:enteredName, category, uPrice:uPrice||0 },newProductBarcode);}catch(error){toast(error.message,'err');return;}",'      prod = { id:productId, name:enteredName, category, uPrice:uPrice||0 };');

 const line="    {k:'Daily Gross Profit', v:dailyProfitTile.value, c:'green', s:dailyProfitTile.note},\n";
 if(html.split(line).length!==2)throw Error('DAILY_PROFIT_PROOF_MARKER');
 return html.replace("function viewDashboard(){\n  const dailyProfitTile=ZEZMS.dailyProfit?ZEZMS.dailyProfit.tile():{value:'Unavailable',note:'Recorded cost evidence unavailable'};",'function viewDashboard(){').replace(line,'').replace('getSaleEvents:saleEvents, getRuntime:function () { return { windowDays:runtime.windowDays, buildCount:runtime.buildCount, lastBuildMs:runtime.lastBuildMs, model:runtime.model }; }, _test:Object.freeze({ buildModel:buildModel, saleEvents:saleEvents','getRuntime:function () { return { windowDays:runtime.windowDays, buildCount:runtime.buildCount, lastBuildMs:runtime.lastBuildMs, model:runtime.model }; }, _test:Object.freeze({ buildModel:buildModel, saleEvents:saleEvents');
}
module.exports={transformDailyBarcodes,withoutDailyBarcodes};
