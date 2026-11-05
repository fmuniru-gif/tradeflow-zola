'use strict';
function transformWatermarkIdle(html,helper) {
  if (html.includes('<script data-zezms-idle-session>')) throw Error('WATERMARK_IDLE_ALREADY_APPLIED');
  const before='center/contain no-repeat;opacity:.10;z-index:1';
  if (html.split(before).length!==3) throw Error('QUOTATION_WATERMARK_MARKER');
  html=html.split(before).join('center/100% 100% no-repeat;opacity:.10;z-index:1');
  const printMarker='@page{size:A5;margin:10mm}body{font:11px Arial;color:#111}';
  if (html.split(printMarker).length!==2) throw Error('QUOTATION_PRINT_MARKER');
  html=html.replace(printMarker,printMarker+'@media print{.quotation-watermark{position:fixed!important;inset:-10mm!important;print-color-adjust:exact;-webkit-print-color-adjust:exact}}');
  // A storage/audit failure must never retain local staff authority at sign-out.
  const audit="if(session.sharedUserId)audit('STAFF_SIGNED_OUT',{userId:session.sharedUserId});session={cashier:null";
  if (html.split(audit).length!==2) throw Error('STAFF_SIGNOUT_AUDIT_MARKER');
  html=html.replace(audit,"if(session.sharedUserId){try{audit('STAFF_SIGNED_OUT',{userId:session.sharedUserId});}catch(error){console.error('Staff sign-out audit could not be saved',error);}}session={cashier:null");
  const end=html.lastIndexOf('</body>');
  if (end<0 || !/^<\/body>\s*<\/html>\s*$/.test(html.slice(end))) throw Error('IDLE_SESSION_BODY_MARKER');
  return html.slice(0,end)+'<script data-zezms-idle-session>\n'+helper+'\n</script>'+html.slice(end);
}
module.exports={transformWatermarkIdle};
