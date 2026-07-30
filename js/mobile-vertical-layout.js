(function(){
  'use strict';

  function isPhoneLayout(){
    return document.documentElement.classList.contains('zezms-phone-layout')
      || (window.matchMedia && window.matchMedia('(max-width: 900px)').matches);
  }

  function headerText(table){
    return Array.from(table.querySelectorAll('thead th')).map(function(th){
      return (th.textContent || '').replace(/\s+/g,' ').trim();
    });
  }

  function isSaleItemsTable(headers){
    var signature = headers.map(function(value){ return value.toUpperCase(); }).join('|');
    return signature === 'PRODUCT|QTY|UNIT PRICE|DISCOUNT|TOTAL';
  }

  function clearTableMode(table){
    table.classList.remove('mobile-fit-table','mobile-stacked-table');
    var wrap = table.closest('.table-wrap');
    if(wrap) wrap.classList.remove('mobile-fit-wrap','mobile-stack-wrap');
    table.querySelectorAll('td[data-label]').forEach(function(td){ td.removeAttribute('data-label'); });
  }

  function prepareTable(table){
    clearTableMode(table);
    if(!isPhoneLayout()) return;

    var headers = headerText(table);
    if(!headers.length) return;

    table.querySelectorAll('tbody tr').forEach(function(row){
      Array.from(row.children).forEach(function(cell,index){
        cell.setAttribute('data-label',headers[index] || '');
      });
    });

    var wrap = table.closest('.table-wrap');
    var portrait = false;
    try { portrait = window.matchMedia('(orientation: portrait)').matches; } catch (_) {}

    if(isSaleItemsTable(headers) && !portrait){
      table.classList.add('mobile-fit-table');
      if(wrap) wrap.classList.add('mobile-fit-wrap');
    }else{
      table.classList.add(isSaleItemsTable(headers) ? 'mobile-fit-table' : 'mobile-stacked-table');
      if(wrap) wrap.classList.add(isSaleItemsTable(headers) ? 'mobile-fit-wrap' : 'mobile-stack-wrap');
    }
  }

  var scheduled = false;
  function apply(){
    scheduled = false;
    document.querySelectorAll('.table-wrap table').forEach(prepareTable);
    if(isPhoneLayout()){
      document.documentElement.style.maxWidth = '100%';
      document.body.style.maxWidth = '100%';
      var root = document.getElementById('viewRoot');
      if(root) root.style.maxWidth = '100%';
    }
  }
  function schedule(){
    if(scheduled) return;
    scheduled = true;
    requestAnimationFrame(apply);
  }

  function start(){
    schedule();
    var target = document.body || document.documentElement;
    new MutationObserver(schedule).observe(target,{childList:true,subtree:true});
    window.addEventListener('resize',schedule,{passive:true});
    window.addEventListener('orientationchange',schedule,{passive:true});
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();

  window.ZEZMSApplyVerticalMobileLayout = schedule;
}());
