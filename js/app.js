(function(){
'use strict';
window.ZEZMS=window.ZEZMS||{};
ZEZMS.boot=function(){
  console.info("ZEZMS Developer Edition booted",window.ZEZMS_CONFIG||{});
};
if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",ZEZMS.boot);
}else{
  ZEZMS.boot();
}
})();
