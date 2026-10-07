(function(){
window.ZEZMS=window.ZEZMS||{};
const mods={};
ZEZMS.register=function(name,obj){
  mods[name]=obj||{};
  if(ZEZMS.log){ZEZMS.log.info("Registered module:",name);}
};
ZEZMS.modules=mods;
})();