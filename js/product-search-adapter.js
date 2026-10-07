(function(){
window.ZEZMS=window.ZEZMS||{};
ZEZMS.adapters=ZEZMS.adapters||{};
ZEZMS.adapters.productSearch={
 normalize:function(v){
   return ZEZMS.modules&&ZEZMS.modules.productSearch
     ? ZEZMS.modules.productSearch.normalize(v)
     : String(v||"").trim().toLowerCase();
 },
 matches:function(q,t){
   return ZEZMS.modules&&ZEZMS.modules.productSearch
     ? ZEZMS.modules.productSearch.matches(q,t)
     : String(t||"").toLowerCase().indexOf(String(q||"").toLowerCase())!==-1;
 }
};
})();