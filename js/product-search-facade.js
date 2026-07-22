(function(){
window.ZEZMS=window.ZEZMS||{};
ZEZMS.modules=ZEZMS.modules||{};
ZEZMS.modules.productSearchFacade={
 search:function(query,items,selector){
   var controller=ZEZMS.modules.productSearchController;
   var results=controller?controller.search(query,items,selector):(items||[]);
   var metrics=ZEZMS.modules.productSearchMetrics;
   if(metrics){metrics.record(query,results.length);}
   return results;
 }
};
})();