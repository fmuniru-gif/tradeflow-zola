(function(){
window.ZEZMS=window.ZEZMS||{};
ZEZMS.modules=ZEZMS.modules||{};
ZEZMS.modules.productSearchService={
 find:function(query, items, selector){
   selector=selector||function(x){return x;};
   if(!Array.isArray(items)) return [];
   var adapter=ZEZMS.adapters&&ZEZMS.adapters.productSearch;
   return items.filter(function(item){
      var text=selector(item);
      return adapter ? adapter.matches(query,text) :
             String(text||"").toLowerCase().indexOf(String(query||"").toLowerCase())!==-1;
   });
 }
};
})();