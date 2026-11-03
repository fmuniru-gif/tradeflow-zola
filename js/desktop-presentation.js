/* Fresh render-scoped indexes and reusable formatting machinery. No stored business values. */
(function () {
  'use strict';
  const dateTime = new Intl.DateTimeFormat(undefined, {year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'numeric',second:'numeric'});
  const dateOnly = new Intl.DateTimeFormat(undefined, {year:'numeric',month:'numeric',day:'numeric'});
  function date(value, only) { const d = new Date(value); return Number.isNaN(d.getTime()) ? d.toString() : (only ? dateOnly : dateTime).format(d); }
  function newest(records, getDate) {
    return records.map((record, index) => ({record,index,time:new Date(getDate(record)).getTime()}))
      .sort((a,b) => (b.time-a.time) || a.index-b.index).map(item=>item.record);
  }
  function cashLinks(transactions, expenses) {
    const accounts = new Map(), costs = new Map();
    for (const txn of transactions) if (txn && txn.meta) { const key=String(txn.meta.cashLogId || ''); if (!accounts.has(key)) accounts.set(key,txn); }
    for (const expense of expenses) if (expense) for (const key of [String(expense.cashLogId || ''),String(expense.meta && expense.meta.cashLogId || '')]) if (!costs.has(key)) costs.set(key,expense);
    return {account:id=>accounts.get(String(id || '')) || null, expense:id=>costs.get(String(id || '')) || null};
  }
  function productIds(products) {
    let names;
    return (name, preferred) => {
      const direct=String(preferred==null?'':preferred).trim(); if(direct)return direct;
      if(!names){names=new Map();for(const product of products){const key=String(product.name||'').trim().toLowerCase();if(!names.has(key))names.set(key,String(product.id==null?'':product.id).trim());}}
      return names.get(String(name||'').trim().toLowerCase()) || '';
    };
  }
  window.ZEZMS = window.ZEZMS || {};
  ZEZMS.desktopPresentation = Object.freeze({date,newest,cashLinks,productIds});
}());
