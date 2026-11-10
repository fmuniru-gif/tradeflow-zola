'use strict';
function transformCamonKpi(html,module){
 const marker='</body>',at=html.lastIndexOf(marker);
 if(at<0||html.includes('CAMON_KPI_REVIEW_BEGIN'))throw Error('CAMON_KPI_REVIEW_MARKER');
 return html.slice(0,at)+'<!-- CAMON_KPI_REVIEW_BEGIN -->\n<script data-zezms-camon17p-kpi-review-r70w>\n'+module+'\n</script>\n<!-- CAMON_KPI_REVIEW_END -->\n'+html.slice(at);
}
function withoutCamonKpi(html){return html.replace(/<!-- CAMON_KPI_REVIEW_BEGIN -->[\s\S]*?<!-- CAMON_KPI_REVIEW_END -->\n/,'');}
module.exports={transformCamonKpi,withoutCamonKpi};
