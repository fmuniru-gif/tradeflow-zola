'use strict';
const login="if(['OWNER','ADMIN'].includes(u.role))setTimeout(()=>{autoPublishDirectory();},800);";
const replacement='/* STAFF_DIRECTORY_LOGIN_ACTIVITY_LOCAL */';
function transformStaffDirectory(html,core,runtime){
 const login="if(['OWNER','ADMIN'].includes(u.role))setTimeout(()=>{autoPublishDirectory();},800);";
 const replacement='/* STAFF_DIRECTORY_LOGIN_ACTIVITY_LOCAL */';
 if(html.split(login).length!==2||html.split('/* SHOP_DIRECTORY_RECOVERY_INSERT_END */').length!==2)throw Error('STAFF_DIRECTORY_MARKER');
 return html.replace(login,replacement).replace('/* SHOP_DIRECTORY_RECOVERY_INSERT_END */','/* SHOP_DIRECTORY_RECOVERY_INSERT_END */\n/* STAFF_DIRECTORY_REVIEW_BEGIN */\n'+core+'\n'+runtime+'\n/* STAFF_DIRECTORY_REVIEW_END */');
}
function withoutStaffDirectory(html){return html.replace(/\n\/\* STAFF_DIRECTORY_REVIEW_BEGIN \*\/[\s\S]*?\/\* STAFF_DIRECTORY_REVIEW_END \*\//,'').replace(replacement,login);}
module.exports={transformStaffDirectory,withoutStaffDirectory};
