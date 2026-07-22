(function(){
window.ZEZMS=window.ZEZMS||{};
ZEZMS.storage={
 save(key,val){
   localStorage.setItem(key,JSON.stringify(val));
   ZEZMS.log&&ZEZMS.log.info("Saved",key);
 },
 load(key,def=null){
   try{
      const v=localStorage.getItem(key);
      return v===null?def:JSON.parse(v);
   }catch(e){
      ZEZMS.log&&ZEZMS.log.error("Load failed",key,e);
      return def;
   }
 }
};
})();