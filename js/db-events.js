(function(){
window.ZEZMS=window.ZEZMS||{};
ZEZMS.events&&ZEZMS.events.on("db:saved",d=>{
  ZEZMS.log&&ZEZMS.log.info("Database saved event",d);
});
ZEZMS.notifyDBSaved=function(info){
  if(ZEZMS.events){ZEZMS.events.emit("db:saved",info||{});}
};
})();