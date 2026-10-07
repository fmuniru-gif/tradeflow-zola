(function(){
window.ZEZMS=window.ZEZMS||{};
const listeners={};
ZEZMS.events={
 on(name,fn){(listeners[name]=listeners[name]||[]).push(fn);},
 emit(name,data){(listeners[name]||[]).forEach(f=>{try{f(data);}catch(e){console.error(e);}});}
};
})();