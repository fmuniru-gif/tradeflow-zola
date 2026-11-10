'use strict';
function transformPairedDirectory(html,core,runtime){const marker='/* STAFF_DIRECTORY_REVIEW_END */';if(html.split(marker).length!==2||html.includes('PAIRED_DIRECTORY_REVIEW_BEGIN'))throw Error('PAIRED_DIRECTORY_MARKER');return html.replace(marker,marker+'\n/* PAIRED_DIRECTORY_REVIEW_BEGIN */\n'+core+'\n'+runtime+'\n/* PAIRED_DIRECTORY_REVIEW_END */');}
function withoutPairedDirectory(html){return html.replace(/\n\/\* PAIRED_DIRECTORY_REVIEW_BEGIN \*\/[\s\S]*?\/\* PAIRED_DIRECTORY_REVIEW_END \*\//,'');}
module.exports={transformPairedDirectory,withoutPairedDirectory};
