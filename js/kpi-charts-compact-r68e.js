/* ZEZMS TradeFlow Owner Edition v3.29.5 / r68E.
   Presentation-only responsive compaction for the established r67G KPI charts. */
(function () {
  'use strict';

  var VERSION = '3.29.5';
  var BUILD = '20260930-r68e-account-cash-pdf-compact-kpi-charts';
  var GRID_SELECTOR = '[data-zezms-kpi-chart-grid-r68e]';
  var TITLE = /^Top 5 months by (Quantity Sold|Total Sales|Gross Profit|Net Profit)/i;

  function route() { try { return String(typeof currentView !== 'undefined' ? currentView : (window.currentView || '')); } catch (_) { return String(window.currentView || ''); } }
  function isChartCard(card) { var heading = card && card.querySelector ? card.querySelector('h3') : null; return !!heading && TITLE.test(String(heading.textContent || '')); }
  function chartCards(root) { return Array.prototype.slice.call((root || document).querySelectorAll('.chart-card')).filter(isChartCard); }
  function installStyles() {
    if (!document || !document.head || document.getElementById('r68eCompactKpiChartStyles')) return;
    var style = document.createElement('style');
    style.id = 'r68eCompactKpiChartStyles';
    style.textContent = [
      '#viewRoot '+GRID_SELECTOR+'{display:grid;grid-template-columns:repeat(auto-fit,minmax(410px,1fr));gap:14px;align-items:start;margin:0}',
      '#viewRoot '+GRID_SELECTOR+' .chart-card{min-width:0;margin:0;padding:12px}',
      '#viewRoot '+GRID_SELECTOR+' .chart-card h3{margin:0 0 7px;font-size:12px;line-height:1.25}',
      '#viewRoot '+GRID_SELECTOR+' .vertical-bar-chart{gap:8px!important;padding:4px 2px!important;min-height:0!important}',
      '#viewRoot '+GRID_SELECTOR+' [data-r67g-negative-scale="true"] .vertical-bar-stage{overflow:visible!important}',
      '#viewRoot '+GRID_SELECTOR+' .vertical-bar-item{height:206px!important;grid-template-rows:166px auto!important;min-width:0!important}',
      '#viewRoot '+GRID_SELECTOR+' .vertical-bar-stage{height:166px!important;min-height:166px!important}',
      '#viewRoot '+GRID_SELECTOR+' .vertical-bar-value{font-size:10px!important;line-height:1.15!important;top:0!important;white-space:normal!important}',
      '#viewRoot '+GRID_SELECTOR+' .r67g-visible-bar{width:clamp(34px,4vw,44px)!important}',
      '#viewRoot '+GRID_SELECTOR+' .vertical-bar-label{padding-top:3px!important;font-size:10px!important;line-height:1.18!important;overflow-wrap:anywhere}',
      '#viewRoot '+GRID_SELECTOR+' .chart-legend{margin-top:6px!important;font-size:10px!important;line-height:1.3!important;min-height:0!important}',
      '@media (max-width:980px){#viewRoot '+GRID_SELECTOR+'{grid-template-columns:1fr}#viewRoot '+GRID_SELECTOR+' .chart-card{padding:11px}#viewRoot '+GRID_SELECTOR+' .vertical-bar-item{height:198px!important;grid-template-rows:158px auto!important}#viewRoot '+GRID_SELECTOR+' .vertical-bar-stage{height:158px!important;min-height:158px!important}}',
      '@media (max-width:620px){#viewRoot '+GRID_SELECTOR+'{gap:10px}#viewRoot '+GRID_SELECTOR+' .chart-card{padding:10px}#viewRoot '+GRID_SELECTOR+' .vertical-bar-chart{gap:6px!important}#viewRoot '+GRID_SELECTOR+' .vertical-bar-item{height:190px!important;grid-template-rows:150px auto!important}#viewRoot '+GRID_SELECTOR+' .vertical-bar-stage{height:150px!important;min-height:150px!important}#viewRoot '+GRID_SELECTOR+' .r67g-visible-bar{width:clamp(30px,14vw,42px)!important}#viewRoot '+GRID_SELECTOR+' .vertical-bar-label{font-size:9.5px!important}#viewRoot '+GRID_SELECTOR+' .chart-legend{font-size:9.5px!important}'
    ].join('');
    document.head.appendChild(style);
  }
  function compact() {
    if (route() !== 'kpiCharts') return false;
    var root = document.getElementById('viewRoot');
    if (!root) return false;
    var cards = chartCards(root);
    if (!cards.length) return false;
    var grid = root.querySelector(GRID_SELECTOR);
    if (!grid) {
      grid = document.createElement('section');
      grid.className = 'kpi-chart-grid-r68e';
      grid.setAttribute('data-zezms-kpi-chart-grid-r68e', BUILD);
      var first = cards[0];
      first.parentNode.insertBefore(grid, first);
    }
    cards.forEach(function (card) { if (card.parentNode !== grid) grid.appendChild(card); });
    return cards.length;
  }
  function install() {
    if (window.__zezmsCompactKpiChartsR68E) return true;
    window.__zezmsCompactKpiChartsR68E = true;
    installStyles();
    var previousRender = window.render;
    if (typeof previousRender === 'function' && !previousRender.__zezmsCompactKpiChartsR68E) {
      window.render = function () {
        var result = previousRender.apply(this, arguments);
        window.setTimeout(function () { try { compact(); } catch (error) { console.error('r68E KPI chart compaction could not be applied.', error); } }, 0);
        return result;
      };
      window.render.__zezmsCompactKpiChartsR68E = true;
    }
    window.setTimeout(function () { try { compact(); } catch (_) {} }, 0);
    return true;
  }

  window.ZEZMS = window.ZEZMS || {};
  window.ZEZMS.kpiChartsCompactR68E = Object.freeze({ version:VERSION, build:BUILD, compact:compact, install:install, _test:Object.freeze({ isChartCard:isChartCard, chartCards:chartCards }) });
  install();
}());
