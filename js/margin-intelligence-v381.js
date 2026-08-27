/* ZEZMS TradeFlow Owner Edition v3.8.1 - Margin & Pricing Intelligence */
(function () {
  'use strict';

  window.ZEZMS = window.ZEZMS || {};

  const VERSION = '3.8.1';
  const BUILD = '20260811-margin-intelligence-r34';

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function escapeHTML(value) {
    if (typeof esc === 'function') return esc(value);
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function percentage(numerator, denominator) {
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return 0;
    return (numerator / denominator) * 100;
  }

  function percentageText(value) {
    const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
    return safe.toLocaleString('en-GH', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  }

  function currencyText(value) {
    if (typeof fmt === 'function') return fmt(number(value));
    return 'GH\u20b5 ' + number(value).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function quantityText(value) {
    if (typeof fmtN === 'function') return fmtN(number(value));
    return number(value).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function nameOrder(left, right) {
    return text(left.productName).localeCompare(text(right.productName));
  }

  function aggregateSnapshot() {
    const stageOne = ZEZMS.managementIntelligence;
    if (!stageOne || typeof stageOne.getSelectedPeriodAggregate !== 'function') return [];
    const aggregate = stageOne.getSelectedPeriodAggregate();
    return Array.isArray(aggregate) ? aggregate : [];
  }

  function buildAnalysis(aggregate) {
    const sold = aggregate.filter(function (product) {
      return product && typeof product === 'object' && number(product.qtySold) > 0;
    });
    const totalQtySold = sold.reduce(function (sum, product) { return sum + number(product.qtySold); }, 0);
    const totalSales = sold.reduce(function (sum, product) { return sum + number(product.totalSales); }, 0);
    const totalGrossProfit = sold.reduce(function (sum, product) { return sum + number(product.grossProfit); }, 0);

    const products = sold.map(function (product) {
      const qtySold = number(product.qtySold);
      const productSales = number(product.totalSales);
      const grossProfit = number(product.grossProfit);
      const impliedCogs = productSales - grossProfit;
      const costValuesValid = Number.isFinite(impliedCogs) && impliedCogs >= 0;
      return Object.freeze({
        key: text(product.key),
        productName: text(product.productName) || 'Unnamed product',
        productId: text(product.productId),
        qtySold: qtySold,
        totalSales: productSales,
        grossProfit: grossProfit,
        sellThrough: number(product.sellThrough),
        grossMargin: percentage(grossProfit, productSales),
        averageSellingPrice: qtySold ? productSales / qtySold : 0,
        impliedCogs: impliedCogs,
        costValuesValid: costValuesValid,
        averageCostPerUnit: costValuesValid ? impliedCogs / qtySold : null,
        grossProfitPerUnit: qtySold ? grossProfit / qtySold : 0,
        salesContribution: percentage(productSales, totalSales),
        grossProfitContribution: totalGrossProfit > 0 ? percentage(grossProfit, totalGrossProfit) : 0
      });
    });

    const losses = products.filter(function (product) { return product.grossProfit < 0; });
    const positiveProfit = products.filter(function (product) { return product.grossProfit > 0; });
    const totalPositiveProfit = positiveProfit.reduce(function (sum, product) { return sum + product.grossProfit; }, 0);
    const topFivePositiveProfit = positiveProfit.slice().sort(function (a, b) {
      return b.grossProfit - a.grossProfit || b.totalSales - a.totalSales || nameOrder(a, b);
    }).slice(0, 5).reduce(function (sum, product) { return sum + product.grossProfit; }, 0);

    return Object.freeze({
      products: Object.freeze(products),
      losses: Object.freeze(losses),
      positiveProfit: Object.freeze(positiveProfit),
      totalQtySold: totalQtySold,
      totalSales: totalSales,
      totalGrossProfit: totalGrossProfit,
      lossSalesValue: losses.reduce(function (sum, product) { return sum + product.totalSales; }, 0),
      averageGrossProfitPerUnit: totalQtySold ? totalGrossProfit / totalQtySold : 0,
      topFiveProfitConcentration: percentage(topFivePositiveProfit, totalPositiveProfit)
    });
  }

  function costCell(product) {
    if (!product.costValuesValid) {
      return '<td class="right mono" data-cost-valid="false" title="Inconsistent recorded sales/profit values">\u2014</td>';
    }
    return '<td class="right mono" data-cost-valid="true" data-implied-cogs="' + product.impliedCogs + '">' + currencyText(product.averageCostPerUnit) + '</td>';
  }

  function analysisDataAttributes(product) {
    return ' data-product-id="' + escapeHTML(product.productId) + '"'
      + ' data-qty-sold="' + product.qtySold + '"'
      + ' data-total-sales="' + product.totalSales + '"'
      + ' data-gross-profit="' + product.grossProfit + '"'
      + ' data-gross-margin="' + product.grossMargin + '"'
      + ' data-average-selling-price="' + product.averageSellingPrice + '"'
      + ' data-implied-cogs="' + product.impliedCogs + '"'
      + ' data-average-cost="' + (product.costValuesValid ? product.averageCostPerUnit : '') + '"'
      + ' data-gross-profit-unit="' + product.grossProfitPerUnit + '"'
      + ' data-sales-contribution="' + product.salesContribution + '"'
      + ' data-profit-contribution="' + product.grossProfitContribution + '"'
      + ' data-sell-through="' + product.sellThrough + '"'
      + ' data-cost-valid="' + product.costValuesValid + '"';
  }

  function marginWatchRows(products) {
    if (!products.length) return '<tr><td colspan="9" class="empty">No product has a recorded sale in the selected period.</td></tr>';
    return products.map(function (product) {
      return '<tr data-margin-product-id="' + escapeHTML(product.productId) + '"' + analysisDataAttributes(product) + '>'
        + '<td>' + escapeHTML(product.productName) + '</td>'
        + '<td class="mono">' + escapeHTML(product.productId || '\u2014') + '</td>'
        + '<td class="right mono">' + quantityText(product.qtySold) + '</td>'
        + '<td class="right mono">' + currencyText(product.totalSales) + '</td>'
        + '<td class="right mono">' + currencyText(product.grossProfit) + '</td>'
        + '<td class="right mono">' + percentageText(product.grossMargin) + '</td>'
        + '<td class="right mono">' + currencyText(product.averageSellingPrice) + '</td>'
        + costCell(product)
        + '<td class="right mono">' + currencyText(product.grossProfitPerUnit) + '</td></tr>';
    }).join('');
  }

  function profitEngineRows(products) {
    if (!products.length) return '<tr><td colspan="9" class="empty">No product recorded positive gross profit for the selected period.</td></tr>';
    return products.map(function (product) {
      return '<tr data-profit-product-id="' + escapeHTML(product.productId) + '"' + analysisDataAttributes(product) + '>'
        + '<td>' + escapeHTML(product.productName) + '</td>'
        + '<td class="mono">' + escapeHTML(product.productId || '\u2014') + '</td>'
        + '<td class="right mono">' + quantityText(product.qtySold) + '</td>'
        + '<td class="right mono">' + currencyText(product.totalSales) + '</td>'
        + '<td class="right mono">' + currencyText(product.grossProfit) + '</td>'
        + '<td class="right mono">' + percentageText(product.grossMargin) + '</td>'
        + '<td class="right mono">' + percentageText(product.grossProfitContribution) + '</td>'
        + '<td class="right mono">' + currencyText(product.grossProfitPerUnit) + '</td>'
        + '<td class="right mono">' + percentageText(product.sellThrough) + '</td></tr>';
    }).join('');
  }

  function salesProfitRows(products) {
    if (!products.length) return '<tr><td colspan="6" class="empty">No product has a recorded sale in the selected period.</td></tr>';
    return products.map(function (product) {
      return '<tr data-sales-profit-product-id="' + escapeHTML(product.productId) + '"' + analysisDataAttributes(product) + '>'
        + '<td>' + escapeHTML(product.productName) + '</td>'
        + '<td class="right mono">' + currencyText(product.totalSales) + '</td>'
        + '<td class="right mono">' + percentageText(product.salesContribution) + '</td>'
        + '<td class="right mono">' + currencyText(product.grossProfit) + '</td>'
        + '<td class="right mono">' + percentageText(product.grossProfitContribution) + '</td>'
        + '<td class="right mono">' + percentageText(product.grossMargin) + '</td></tr>';
    }).join('');
  }

  function grossLossRows(products) {
    if (!products.length) return '<tr><td colspan="8" class="empty">No product recorded an aggregated gross loss for the selected period.</td></tr>';
    return products.map(function (product) {
      return '<tr data-loss-product-id="' + escapeHTML(product.productId) + '"' + analysisDataAttributes(product) + '>'
        + '<td>' + escapeHTML(product.productName) + '</td>'
        + '<td class="mono">' + escapeHTML(product.productId || '\u2014') + '</td>'
        + '<td class="right mono">' + quantityText(product.qtySold) + '</td>'
        + '<td class="right mono">' + currencyText(product.totalSales) + '</td>'
        + '<td class="right mono">' + currencyText(product.grossProfit) + '</td>'
        + '<td class="right mono">' + percentageText(product.grossMargin) + '</td>'
        + '<td class="right mono">' + currencyText(product.averageSellingPrice) + '</td>'
        + costCell(product) + '</tr>';
    }).join('');
  }

  function marginIntelligenceHTML() {
    const analysis = buildAnalysis(aggregateSnapshot());
    const marginWatch = analysis.products.slice().sort(function (a, b) {
      return a.grossMargin - b.grossMargin || a.grossProfit - b.grossProfit || nameOrder(a, b);
    }).slice(0, 10);
    const profitEngines = analysis.positiveProfit.slice().sort(function (a, b) {
      return b.grossProfit - a.grossProfit || b.totalSales - a.totalSales || nameOrder(a, b);
    }).slice(0, 10);
    const salesProfit = analysis.products.slice().sort(function (a, b) {
      return b.totalSales - a.totalSales || nameOrder(a, b);
    }).slice(0, 15);
    const grossLoss = analysis.losses.slice().sort(function (a, b) {
      return a.grossProfit - b.grossProfit || nameOrder(a, b);
    });

    return '<div id="marginPricingIntelligence" data-build="' + BUILD + '" style="margin-top:18px">'
      + '<div class="card" style="margin-bottom:12px"><h2 style="margin:0 0 6px">Margin &amp; Pricing Intelligence</h2>'
      + '<p class="muted" style="margin:0">Read-only analysis of realised sales and gross profit. No selling prices, discounts or transaction records are changed.</p></div>'
      + '<div class="grid g2 margin-intelligence-kpis" style="margin-bottom:12px">'
      + '<div class="card kpi amber"><h3>Products Sold at Gross Loss</h3><div id="marginLossProductCount" class="val mono" data-value="' + analysis.losses.length + '">' + analysis.losses.length + '</div><div class="sub">Products whose recorded selected-period gross profit is below zero</div></div>'
      + '<div class="card kpi pink"><h3>Sales Value at Gross Loss</h3><div id="marginLossSalesValue" class="val mono" data-value="' + analysis.lossSalesValue + '">' + currencyText(analysis.lossSalesValue) + '</div><div class="sub">Sales revenue associated with gross-loss products; this is not the loss amount</div></div>'
      + '<div class="card kpi teal"><h3>Avg Gross Profit / Unit Sold</h3><div id="marginAverageProfitPerUnit" class="val mono" data-value="' + analysis.averageGrossProfitPerUnit + '">' + currencyText(analysis.averageGrossProfitPerUnit) + '</div><div class="sub">Recorded gross profit divided by total quantity sold</div></div>'
      + '<div class="card kpi blue"><h3>Top-5 Profit Concentration</h3><div id="marginTop5ProfitConcentration" class="val mono" data-value="' + analysis.topFiveProfitConcentration + '">' + percentageText(analysis.topFiveProfitConcentration) + '</div><div class="sub">Share of positive gross profit generated by the five strongest profit contributors</div></div>'
      + '</div>'
      + '<div class="card" style="margin-bottom:12px"><h3>Margin Watch \u2014 Lowest 10</h3><div class="table-wrap"><table><thead><tr><th>Product</th><th>Product ID</th><th class="right">Qty Sold</th><th class="right">Total Sales</th><th class="right">Gross Profit</th><th class="right">Gross Margin %</th><th class="right">Avg Realised Selling Price</th><th class="right">Avg Realised Cost/Unit</th><th class="right">Gross Profit/Unit</th></tr></thead><tbody id="marginWatchBody">'
      + marginWatchRows(marginWatch) + '</tbody></table></div></div>'
      + '<div class="card" style="margin-bottom:12px"><h3>Profit Engines \u2014 Top 10</h3><div class="table-wrap"><table><thead><tr><th>Product</th><th>Product ID</th><th class="right">Qty Sold</th><th class="right">Total Sales</th><th class="right">Gross Profit</th><th class="right">Gross Margin %</th><th class="right">Gross Profit Contribution %</th><th class="right">Gross Profit/Unit</th><th class="right">Sell-Through %</th></tr></thead><tbody id="profitEnginesBody">'
      + profitEngineRows(profitEngines) + '</tbody></table></div></div>'
      + '<div class="card" style="margin-bottom:12px"><h3>Sales vs Profit</h3><div class="table-wrap"><table><thead><tr><th>Product</th><th class="right">Total Sales</th><th class="right">Sales Contribution %</th><th class="right">Gross Profit</th><th class="right">Gross Profit Contribution %</th><th class="right">Gross Margin %</th></tr></thead><tbody id="salesVsProfitBody">'
      + salesProfitRows(salesProfit) + '</tbody></table></div></div>'
      + '<div class="card"><h3>Gross-Loss Products</h3><div class="table-wrap"><table><thead><tr><th>Product</th><th>Product ID</th><th class="right">Qty Sold</th><th class="right">Total Sales</th><th class="right">Gross Profit</th><th class="right">Gross Margin %</th><th class="right">Avg Realised Selling Price</th><th class="right">Avg Realised Cost/Unit</th></tr></thead><tbody id="grossLossProductsBody">'
      + grossLossRows(grossLoss) + '</tbody></table></div></div></div>';
  }

  function appendInsideManagementArea(dashboardHTML, marginHTML) {
    const close = dashboardHTML.lastIndexOf('</section>');
    if (close < 0) return dashboardHTML + marginHTML;
    return dashboardHTML.slice(0, close) + marginHTML + dashboardHTML.slice(close);
  }

  function install() {
    const originalDashboard = window.viewDashboard;
    if (typeof originalDashboard !== 'function') {
      console.error('Margin & Pricing Intelligence could not attach because the Dashboard renderer is unavailable.');
      return false;
    }
    if (originalDashboard.__zezmsMarginIntelligenceV381) return true;

    const wrappedDashboard = function () {
      const dashboard = originalDashboard.apply(this, arguments);
      try {
        return appendInsideManagementArea(dashboard, marginIntelligenceHTML());
      } catch (error) {
        console.error('Margin & Pricing Intelligence could not be calculated.', error);
        return appendInsideManagementArea(dashboard, '<div id="marginPricingIntelligence" style="margin-top:18px"><div class="card"><h2>Margin &amp; Pricing Intelligence</h2>'
          + '<div class="empty">Margin &amp; Pricing Intelligence could not be calculated for this period. Existing figures and operational records were not changed.</div></div></div>');
      }
    };
    wrappedDashboard.__zezmsMarginIntelligenceV381 = true;
    wrappedDashboard.__zezmsManagementIntelligenceV380 = Boolean(originalDashboard.__zezmsManagementIntelligenceV380);
    wrappedDashboard.__zezmsOriginalDashboard = originalDashboard;
    window.viewDashboard = wrappedDashboard;
    return true;
  }

  const installed = install();
  ZEZMS.marginIntelligence = Object.freeze({ version: VERSION, build: BUILD, installed: installed, readOnly: true });
}());
