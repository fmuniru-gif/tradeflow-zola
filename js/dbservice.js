(function(){
window.ZEZMS=window.ZEZMS||{};
ZEZMS.db={
 save:function(key,obj){
   return ZEZMS.storage.save(key,obj);
 },
 load:function(key,fallback){
   return ZEZMS.storage.load(key,fallback);
 }
};
})();