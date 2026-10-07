(function(){
window.ZEZMS=window.ZEZMS||{};
ZEZMS.modules=ZEZMS.modules||{};
ZEZMS.modules.lifecycle={
 startup:function(){
   ZEZMS.log&&ZEZMS.log.info("Lifecycle startup");
   ZEZMS.events&&ZEZMS.events.emit("app:started",{time:Date.now()});
 },
 shutdown:function(){
   ZEZMS.log&&ZEZMS.log.info("Lifecycle shutdown");
   ZEZMS.events&&ZEZMS.events.emit("app:shutdown",{time:Date.now()});
 }
};
document.addEventListener("DOMContentLoaded",function(){
 ZEZMS.modules.lifecycle.startup();
});
window.addEventListener("beforeunload",function(){
 ZEZMS.modules.lifecycle.shutdown();
});
})();