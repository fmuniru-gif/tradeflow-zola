(function(){
window.ZEZMS=window.ZEZMS||{};
ZEZMS.modules=ZEZMS.modules||{};
ZEZMS.modules.productSearch={
 normalize:function(v){
   return String(v||"").trim().toLowerCase();
 },
 matches:function(query,text){
   return this.normalize(text).indexOf(this.normalize(query))!==-1;
 }
};
})();