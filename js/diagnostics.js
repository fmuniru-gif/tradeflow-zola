(function(){
window.ZEZMS=window.ZEZMS||{};
ZEZMS.diagnostics=function(){
 if(!window.localStorage){ZEZMS.log&&ZEZMS.log.error("localStorage unavailable");return;}
 ZEZMS.log&&ZEZMS.log.info("Diagnostics passed");
};
document.addEventListener("DOMContentLoaded",()=>ZEZMS.diagnostics());
})();