(function(){
window.ZEZMS=window.ZEZMS||{};
const observed=new Map();
ZEZMS.db={
 assertCurrent:function(key){
   if(observed.has(key)&&localStorage.getItem(key)!==observed.get(key)){
     throw Error('ZEZMS_DATABASE_CHANGED_IN_ANOTHER_WINDOW: reopen this window before saving.');
   }
 },
 acceptCommittedRaw:function(key,raw){observed.set(key,raw);},
 save:function(key,obj){
   if(ZEZMS.syncDurability&&ZEZMS.syncDurability.pending())throw Error('ZEZMS_SYNC_DURABILITY_REVIEW_REQUIRED: interrupted save retained.');
   this.assertCurrent(key);
   const raw=JSON.stringify(obj);
   ZEZMS.storage.save(key,obj);
   if(localStorage.getItem(key)!==raw)throw Error('ZEZMS_DATABASE_SAVE_READBACK_FAILED');
   observed.set(key,raw);
 },
 load:function(key,fallback){
   const result=ZEZMS.storage.load(key,fallback);
   if(!observed.has(key))observed.set(key,localStorage.getItem(key));
   return result;
 }
};
})();
