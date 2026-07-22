(function(){
window.ZEZMS=window.ZEZMS||{};
ZEZMS.modules=ZEZMS.modules||{};
ZEZMS.modules.productSearchMetrics={
 record:function(query,count){
   if(ZEZMS.modules.productSearchEvents){
      ZEZMS.modules.productSearchEvents.emitSearch(query,count);
   }
   if(ZEZMS.log){
      ZEZMS.log.info("Product search",{
        query:query,
        results:count
      });
   }
 }
};
})();