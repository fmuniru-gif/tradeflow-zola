'use strict';
// Preserve the published SDK bytes and all native Cloud behavior; couple only its delivery.
function transformCloudSdk(html,sdk){
 const tag='<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.1"></script>';
 if(html.split(tag).length!==2)throw Error('VERIFIED_CLOUD_SDK_MARKER');
 return html.replace(tag,'<script data-zezms-verified-cloud-sdk>\n'+sdk+'\n</script>');
}
function withoutCloudSdk(html){
 html=require('./staff-directory-transform.cjs').withoutStaffDirectory(html);
 return html.replace(/<script data-zezms-verified-cloud-sdk>[\s\S]*?<\/script>/,'<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.1"></script>');
}
module.exports={transformCloudSdk,withoutCloudSdk};
