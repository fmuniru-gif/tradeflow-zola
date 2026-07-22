(function(){
window.ZEZMS=window.ZEZMS||{};
ZEZMS.modules=ZEZMS.modules||{};
ZEZMS.modules.productSearchController={
 search:function(query,items,selector){
   if(ZEZMS.modules.productSearchService){
     return ZEZMS.modules.productSearchService.find(query,items,selector);
   }
   return items||[];
 }
};
})();