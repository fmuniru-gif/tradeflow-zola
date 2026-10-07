(function(){
window.ZEZMS=window.ZEZMS||{};
ZEZMS.modules=ZEZMS.modules||{};
ZEZMS.modules.system={
 version:"0.1",
 ready:function(){
   return !!(ZEZMS.storage&&ZEZMS.db&&ZEZMS.events);
 },
 status:function(){
   return {
     storage:!!ZEZMS.storage,
     db:!!ZEZMS.db,
     events:!!ZEZMS.events,
     logger:!!ZEZMS.log
   };
 }
};
document.addEventListener("DOMContentLoaded",function(){
 if(ZEZMS.log&&ZEZMS.modules.system.ready()){
   ZEZMS.log.info("System module ready");
 }
});
})();