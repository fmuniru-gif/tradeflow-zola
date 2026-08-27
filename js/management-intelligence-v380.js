/* ZEZMS TradeFlow Owner Edition v3.8.0 - Management Intelligence Foundation */
(function () {
  'use strict';

  window.ZEZMS = window.ZEZMS || {};

  if (ZEZMS.managementIntelligence
      && ZEZMS.managementIntelligence.installed
      && typeof ZEZMS.managementIntelligence.getSelectedPeriodAggregate === 'function') return;

  const VERSION = '3.8.0';
  const BUILD = '20260811-management-intelligence-r33';
  let lastAggregate = Object.freeze([]);

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function lower(value) {
    return text(value).toLowerCase();
  }

  function escapeHTML(value) {
    if (typeof esc === 'function') return esc(value);
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function remainingQuantity(row) {
    if (row && row.rStock != null && row.rStock !== '') {
      const stored = Number(row.rStock);
      if (Number.isFinite(stored)) return stored;
    }
    return number(row && row.qtyIn) - number(row && row.qtyOut);
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

  function selectedPeriodRows() {
    const database = typeof DB !== 'undefined' && DB ? DB : null;
    const rows = database && Array.isArray(database.stockRows) ? database.stockRows : [];
    const selectedYear = number(database && database.selectedYear);
    const selectedMonth = number(database && database.selectedMonth);
    return rows.filter(function (row) {
      return row && typeof row === 'object'
        && number(row.year) === selectedYear
        && number(row.month) === selectedMonth;
    });
  }

  function buildAggregateModel() {
    const rows = selectedPeriodRows();
    const idsByName = new Map();

    rows.forEach(function (row) {
      const productName = lower(row.productName);
      const productId = text(row.productId);
      if (!productName || !productId) return;
      if (!idsByName.has(productName)) idsByName.set(productName, new Map());
      idsByName.get(productName).set(lower(productId), productId);
    });

    const groups = new Map();
    rows.forEach(function (row, index) {
      try {
        const rowName = text(row.productName);
        const rowNameKey = lower(rowName);
        let productId = text(row.productId);
        if (!productId && rowNameKey && idsByName.has(rowNameKey) && idsByName.get(rowNameKey).size === 1) {
          productId = Array.from(idsByName.get(rowNameKey).values())[0];
        }
        const key = productId
          ? 'id:' + lower(productId)
          : rowNameKey
            ? 'name:' + rowNameKey
            : 'malformed:' + index;
        if (!groups.has(key)) {
          groups.set(key, {
            key: key,
            productId: productId,
            productName: rowName || productId || 'Unnamed product',
            category: text(row.category),
            qtyIn: 0,
            qtySold: 0,
            remainingQty: 0,
            remainingStockCost: 0,
            totalSales: 0,
            grossProfit: 0
          });
        }
        const product = groups.get(key);
        const remaining = remainingQuantity(row);
        product.qtyIn += number(row.qtyIn);
        product.qtySold += number(row.qtyOut);
        product.remainingQty += remaining;
        product.remainingStockCost += remaining * number(row.uCost);
        product.totalSales += number(row.tSales);
        product.grossProfit += number(row.profit);
        if (!product.productId && productId) product.productId = productId;
        if ((!product.productName || product.productName === 'Unnamed product') && rowName) product.productName = rowName;
        if (!product.category && text(row.category)) product.category = text(row.category);
      } catch (error) {
        console.error('Management Intelligence skipped one malformed stock row.', error);
      }
    });

    return Object.freeze(Array.from(groups.values()).map(function (product) {
      const sellThroughBase = product.qtySold + product.remainingQty;
      product.sellThrough = percentage(product.qtySold, sellThroughBase);
      product.grossMargin = percentage(product.grossProfit, product.totalSales);
      return Object.freeze(product);
    }));
  }

  function productCells(product, columns) {
    return columns.map(function (column) {
      if (column === 'product') return '<td>' + escapeHTML(product.productName) + '</td>';
      if (column === 'id') return '<td class="mono">' + escapeHTML(product.productId || '\u2014') + '</td>';
      if (column === 'category') return '<td>' + escapeHTML(product.category || '\u2014') + '</td>';
      if (column === 'remaining') return '<td class="right mono">' + quantityText(product.remainingQty) + '</td>';
      if (column === 'stockCost') return '<td class="right mono">' + currencyText(product.remainingStockCost) + '</td>';
      if (column === 'sold') return '<td class="right mono">' + quantityText(product.qtySold) + '</td>';
      if (column === 'sales') return '<td class="right mono">' + currencyText(product.totalSales) + '</td>';
      if (column === 'profit') return '<td class="right mono">' + currencyText(product.grossProfit) + '</td>';
      if (column === 'margin') return '<td class="right mono">' + percentageText(product.grossMargin) + '</td>';
      if (column === 'sellThrough') return '<td class="right mono">' + percentageText(product.sellThrough) + '</td>';
      return '<td></td>';
    }).join('');
  }

  function tableRows(products, columns, emptyMessage) {
    if (!products.length) return '<tr><td colspan="' + columns.length + '" class="empty">' + escapeHTML(emptyMessage) + '</td></tr>';
    return products.map(function (product) {
      return '<tr data-mi-product-id="' + escapeHTML(product.productId || '') + '">' + productCells(product, columns) + '</tr>';
    }).join('');
  }

  function managementIntelligenceHTML() {
    lastAggregate = Object.freeze([]);
    const products = buildAggregateModel();
    lastAggregate = products;
    const heading = '<section id="managementIntelligence" data-build="' + BUILD + '" style="margin-top:18px">'
      + '<div class="card" style="margin-bottom:12px"><h2 style="margin:0 0 6px">Management Intelligence</h2>'
      + '<p class="muted" style="margin:0">Read-only analysis based on the selected reporting period. No inventory or transaction records are changed.</p></div>';

    if (!products.length) {
      return heading + '<div class="card"><div class="empty">No detailed stock rows are available for the selected reporting period.</div></div></section>';
    }

    const stocked = products.filter(function (product) { return product.remainingQty > 0; });
    const noSale = stocked.filter(function (product) { return product.qtySold === 0; });
    const totalSold = products.reduce(function (sum, product) { return sum + product.qtySold; }, 0);
    const totalRemaining = products.reduce(function (sum, product) { return sum + product.remainingQty; }, 0);
    const overallSellThrough = percentage(totalSold, totalSold + totalRemaining);
    const totalRemainingCost = stocked.reduce(function (sum, product) { return sum + product.remainingStockCost; }, 0);
    const capitalOrder = stocked.slice().sort(function (a, b) {
      return b.remainingStockCost - a.remainingStockCost || a.productName.localeCompare(b.productName);
    });
    const topFiveCost = capitalOrder.slice(0, 5).reduce(function (sum, product) { return sum + product.remainingStockCost; }, 0);
    const concentration = percentage(topFiveCost, totalRemainingCost);
    const noSaleCapital = noSale.reduce(function (sum, product) { return sum + product.remainingStockCost; }, 0);
    const bestMovers = products.filter(function (product) { return product.qtySold > 0; }).sort(function (a, b) {
      return b.qtySold - a.qtySold || b.totalSales - a.totalSales || a.productName.localeCompare(b.productName);
    }).slice(0, 10);

    return heading
      + '<div class="grid g2 management-intelligence-kpis" style="margin-bottom:12px">'
      + '<div class="card kpi teal"><h3>Products Currently in Stock</h3><div id="miProductsInStock" class="val mono" data-value="' + stocked.length + '">' + stocked.length + '</div><div class="sub">Distinct products with remaining quantity</div></div>'
      + '<div class="card kpi amber"><h3>Capital in No-Sale Stock</h3><div id="miNoSaleCapital" class="val mono" data-value="' + noSaleCapital + '">' + currencyText(noSaleCapital) + '</div><div class="sub">Stock remaining with no recorded sale in the selected period</div></div>'
      + '<div class="card kpi blue"><h3>Overall Sell-Through</h3><div id="miOverallSellThrough" class="val mono" data-value="' + overallSellThrough + '">' + percentageText(overallSellThrough) + '</div><div class="sub">Quantity sold as a share of sold plus remaining quantity</div></div>'
      + '<div class="card kpi pink"><h3>Top-5 Capital Concentration</h3><div id="miTop5Concentration" class="val mono" data-value="' + concentration + '">' + percentageText(concentration) + '</div><div class="sub">Share of remaining stock capital concentrated in the five largest products</div></div>'
      + '</div>'
      + '<div class="card" style="margin-bottom:12px"><h3>Capital Tied Up \u2014 Top 10 Products</h3><div class="table-wrap"><table><thead><tr><th>Product</th><th>Product ID</th><th>Category</th><th class="right">Remaining Qty</th><th class="right">Stock Cost Value</th><th class="right">Qty Sold</th><th class="right">Sell-Through %</th></tr></thead>'
      + '<tbody id="miCapitalTiedUpBody">' + tableRows(capitalOrder.slice(0, 10), ['product', 'id', 'category', 'remaining', 'stockCost', 'sold', 'sellThrough'], 'No products have remaining stock in the selected period.') + '</tbody></table></div></div>'
      + '<div class="card" style="margin-bottom:12px"><h3>No-Sale Stock This Period</h3><div class="table-wrap"><table><thead><tr><th>Product</th><th>Product ID</th><th>Category</th><th class="right">Remaining Qty</th><th class="right">Stock Cost Value</th></tr></thead>'
      + '<tbody id="miNoSaleBody">' + tableRows(noSale.slice().sort(function (a, b) { return b.remainingStockCost - a.remainingStockCost || a.productName.localeCompare(b.productName); }), ['product', 'id', 'category', 'remaining', 'stockCost'], 'No stocked product has zero sales for the selected period.') + '</tbody></table></div></div>'
      + '<div class="card"><h3>Best Movers This Period</h3><div class="table-wrap"><table><thead><tr><th>Product</th><th class="right">Qty Sold</th><th class="right">Total Sales</th><th class="right">Gross Profit</th><th class="right">Gross Margin %</th><th class="right">Sell-Through %</th></tr></thead>'
      + '<tbody id="miBestMoversBody">' + tableRows(bestMovers, ['product', 'sold', 'sales', 'profit', 'margin', 'sellThrough'], 'No product has a recorded sale in the selected period.') + '</tbody></table></div></div></section>';
  }

  function install() {
    const originalDashboard = window.viewDashboard;
    if (typeof originalDashboard !== 'function') {
      console.error('Management Intelligence could not attach because the Dashboard renderer is unavailable.');
      return false;
    }
    if (originalDashboard.__zezmsManagementIntelligenceV380) return true;

    const wrappedDashboard = function () {
      const dashboard = originalDashboard.apply(this, arguments);
      try {
        return dashboard + managementIntelligenceHTML();
      } catch (error) {
        console.error('Management Intelligence could not be calculated.', error);
        return dashboard + '<section id="managementIntelligence" style="margin-top:18px"><div class="card"><h2>Management Intelligence</h2>'
          + '<div class="empty">Management Intelligence could not be calculated for this period. Existing dashboard figures and operational records were not changed.</div></div></section>';
      }
    };
    wrappedDashboard.__zezmsManagementIntelligenceV380 = true;
    wrappedDashboard.__zezmsOriginalDashboard = originalDashboard;
    window.viewDashboard = wrappedDashboard;
    return true;
  }

  const installed = install();
  ZEZMS.managementIntelligence = Object.freeze({
    version: VERSION,
    build: BUILD,
    installed: installed,
    readOnly: true,
    getSelectedPeriodAggregate: function () { return lastAggregate; }
  });
}());
