'use strict';
const login="if(['OWNER','ADMIN'].includes(u.role))setTimeout(()=>{autoPublishDirectory();},800);";
const replacement='/* STAFF_DIRECTORY_LOGIN_ACTIVITY_LOCAL */';
function transformStaffDirectory(html,core,runtime){
 const login="if(['OWNER','ADMIN'].includes(u.role))setTimeout(()=>{autoPublishDirectory();},800);";
 const replacement='/* STAFF_DIRECTORY_LOGIN_ACTIVITY_LOCAL */';
 if(html.split(login).length!==2||html.split('/* SHOP_DIRECTORY_RECOVERY_INSERT_END */').length!==2)throw Error('STAFF_DIRECTORY_MARKER');
 const line="      if (directoryStaff.lastLoginAt !== newest) { directoryStaff.lastLoginAt = newest; changed = true; }", block="    if (changed) {\n      const newestDirectoryTimestamp = db.sharedDeviceDirectory.users.reduce(function (latest, user) {\n        return latestTimestamp(latest, user && user.lastLoginAt);\n      }, '');\n      if (newestDirectoryTimestamp && db.sharedDeviceDirectory.updatedAt !== newestDirectoryTimestamp) {\n        db.sharedDeviceDirectory.updatedAt = newestDirectoryTimestamp;\n      }\n    }";
 if(html.split(line).length!==2||html.split(block).length!==2)throw Error('STAFF_DIRECTORY_MIRROR_MARKER');
 return html.replace(line,'      /* STAFF_DIRECTORY_NO_LOGIN_ROOT_WRITE */').replace(block,'    /* STAFF_DIRECTORY_NO_LOGIN_ROOT_TIMESTAMP */').replace(login,replacement).replace('/* SHOP_DIRECTORY_RECOVERY_INSERT_END */','/* SHOP_DIRECTORY_RECOVERY_INSERT_END */\n/* STAFF_DIRECTORY_REVIEW_BEGIN */\n'+core+'\n'+runtime+'\n/* STAFF_DIRECTORY_REVIEW_END */');
}
function withoutStaffDirectory(html){
 html=require('./camon-kpi-transform.cjs').withoutCamonKpi(html);
 const line="      if (directoryStaff.lastLoginAt !== newest) { directoryStaff.lastLoginAt = newest; changed = true; }", block="    if (changed) {\n      const newestDirectoryTimestamp = db.sharedDeviceDirectory.users.reduce(function (latest, user) {\n        return latestTimestamp(latest, user && user.lastLoginAt);\n      }, '');\n      if (newestDirectoryTimestamp && db.sharedDeviceDirectory.updatedAt !== newestDirectoryTimestamp) {\n        db.sharedDeviceDirectory.updatedAt = newestDirectoryTimestamp;\n      }\n    }";
 return html.replace('      /* STAFF_DIRECTORY_NO_LOGIN_ROOT_WRITE */',line).replace('    /* STAFF_DIRECTORY_NO_LOGIN_ROOT_TIMESTAMP */',block).replace(/\n\/\* STAFF_DIRECTORY_REVIEW_BEGIN \*\/[\s\S]*?\/\* STAFF_DIRECTORY_REVIEW_END \*\//,'').replace(replacement,login);}
module.exports={transformStaffDirectory,withoutStaffDirectory};
