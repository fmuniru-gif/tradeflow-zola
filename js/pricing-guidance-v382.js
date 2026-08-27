/* ZEZMS TradeFlow Owner Edition v3.8.2 - Pricing Guidance Foundation */
(function () {
  'use strict';

  window.ZEZMS = window.ZEZMS || {};
  if (ZEZMS.pricingGuidance
      && ZEZMS.pricingGuidance.installed
      && window.viewDashboard
      && window.viewDashboard.__zezmsPricingGuidanceV382) return;

  const VERSION = '3.8.2';
  const BUILD = '20260811-pricing-guidance-r35';
  const EPSILON = 0.0000001;
  let lastCurrentStockAggregate = Object.freeze([]);

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function lower(value) {
    return text(value).toLowerCase();
  }

  function finiteNumber(value) {
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function number(value) {
    const parsed = finiteNumber(value);
    return parsed == null ? 0 : parsed;
  }

  function escapeHTML(value) {
    if (typeof esc === 'function') return esc(value);
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function currencyText(value) {
    if (typeof fmt === 'function') return fmt(number(value));
    return 'GH\u20b5 ' + number(value).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function quantityText(value) {
    if (typeof fmtN === 'function') return fmtN(number(value));
    return number(value).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function percentageText(value) {
    const safe = finiteNumber(value);
    return (safe == null ? 0 : safe).toLocaleString('en-GH', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  }

  function currentOpenPeriod() {
    try {
      if (typeof getLatestMonth === 'function') {
        const latest = getLatestMonth();
        return Object.freeze({ year:number(latest && latest.year), month:number(latest && latest.month) });
      }
    } catch (error) {
      console.error('Pricing Guidance could not read the open stock period.', error);
    }
    const database = typeof DB !== 'undefined' && DB ? DB : {};
    return Object.freeze({ year:number(database.selectedYear), month:number(database.selectedMonth) });
  }

  function remainingQuantity(row) {
    try {
      if (typeof rowRemainingQty === 'function') return number(rowRemainingQty(row));
    } catch (error) {
      console.error('Pricing Guidance could not read one remaining-stock quantity.', error);
    }
    if (row && row.rStock != null && row.rStock !== '') return number(row.rStock);
    return number(row && row.qtyIn) - number(row && row.qtyOut);
  }

  function catalogueProduct(productId, productName) {
    const database = typeof DB !== 'undefined' && DB ? DB : {};
    const products = Array.isArray(database.products) ? database.products : [];
    const idKey = lower(productId);
    const nameKey = lower(productName);
    return products.find(function (product) { return idKey && lower(product && product.id) === idKey; })
      || products.find(function (product) { return nameKey && lower(product && product.name) === nameKey; })
      || null;
  }

  function mirroredSaleOutPrice(productName, catalogue) {
    const database = typeof DB !== 'undefined' && DB ? DB : {};
    const rows = Array.isArray(database.stockRows) ? database.stockRows : [];
    const period = currentOpenPeriod();
    const matches = rows.filter(function (row) {
      return row && text(row.productName) === productName
        && number(row.year) === period.year
        && number(row.month) === period.month;
    });
    if (matches.length) {
      const latest = matches[matches.length - 1];
      if (latest.uPrice != null) return number(latest.uPrice);
    }
    return catalogue ? number(catalogue.uPrice) : null;
  }

  function resolveListedPrice(product, canonicalName, catalogue) {
    if (canonicalName && typeof getBaseUnitPrice === 'function') {
      try {
        const resolved = finiteNumber(getBaseUnitPrice(canonicalName));
        return Object.freeze({
          state:resolved != null && resolved > 0 ? 'reliable' : 'unavailable',
          value:resolved != null && resolved > 0 ? resolved : null,
          source:'Sale Out getBaseUnitPrice'
        });
      } catch (error) {
        console.error('Pricing Guidance could not call the Sale Out price helper for one product.', error);
      }
    }

    if (canonicalName) {
      const mirrored = mirroredSaleOutPrice(canonicalName, catalogue);
      return Object.freeze({
        state:mirrored != null && mirrored > 0 ? 'reliable' : 'unavailable',
        value:mirrored != null && mirrored > 0 ? mirrored : null,
        source:'read-only Sale Out rule mirror'
      });
    }

    const prices = Array.from(product.remainingPrices.values());
    if (prices.length > 1) return Object.freeze({ state:'multiple', value:null, source:'unresolved conflicting remaining-row prices' });
    if (prices.length === 1) return Object.freeze({ state:'reliable', value:prices[0], source:'single unambiguous remaining-row price' });
    return Object.freeze({ state:'unavailable', value:null, source:'no reliable listed price' });
  }

  function buildCurrentStockAggregate() {
    const database = typeof DB !== 'undefined' && DB ? DB : {};
    const rows = Array.isArray(database.stockRows) ? database.stockRows : [];
    const period = currentOpenPeriod();
    const groups = new Map();

    rows.forEach(function (row, index) {
      try {
        if (!row || typeof row !== 'object') return;
        if (number(row.year) !== period.year || number(row.month) !== period.month) return;
        const remaining = remainingQuantity(row);
        if (!(remaining > 0)) return;

        const rowName = text(row.productName);
        let productId = text(row.productId);
        if (!productId && rowName && typeof resolveProductId === 'function') {
          try { productId = text(resolveProductId(rowName, row.productId)); } catch (_) {}
        }
        const key = productId ? 'id:' + lower(productId) : rowName ? 'name:' + lower(rowName) : 'malformed:' + index;
        if (!groups.has(key)) {
          groups.set(key, {
            key:key,
            productId:productId,
            firstName:rowName,
            category:text(row.category),
            rowNames:new Map(),
            remainingPrices:new Map(),
            remainingQty:0,
            knownRemainingCost:0,
            costValuesValid:true
          });
        }
        const product = groups.get(key);
        product.remainingQty += remaining;
        if (rowName) product.rowNames.set(lower(rowName), rowName);
        if (!product.productId && productId) product.productId = productId;
        if (!product.category && text(row.category)) product.category = text(row.category);

        const unitCost = finiteNumber(row.uCost);
        if (unitCost == null || unitCost < 0) product.costValuesValid = false;
        else product.knownRemainingCost += remaining * unitCost;

        const rowPrice = finiteNumber(row.uPrice);
        if (rowPrice != null && rowPrice > 0) product.remainingPrices.set(String(rowPrice), rowPrice);
      } catch (error) {
        console.error('Pricing Guidance skipped one malformed stock row.', error);
      }
    });

    return Object.freeze(Array.from(groups.values()).map(function (group) {
      const names = Array.from(group.rowNames.values());
      const catalogue = catalogueProduct(group.productId, names.length === 1 ? names[0] : group.firstName);
      const canonicalName = catalogue && text(catalogue.name)
        ? text(catalogue.name)
        : names.length === 1
          ? names[0]
          : '';
      const productName = canonicalName || group.firstName || group.productId || 'Unnamed product';
      const category = text(group.category || (catalogue && catalogue.category));
      const price = resolveListedPrice(group, canonicalName, catalogue);
      const costValuesValid = group.costValuesValid && group.remainingQty > 0;
      const totalRemainingCost = costValuesValid ? group.knownRemainingCost : null;
      const weightedCost = costValuesValid ? totalRemainingCost / group.remainingQty : null;
      const priceReliable = price.state === 'reliable' && price.value != null && price.value > 0;
      const referenceDifference = priceReliable && costValuesValid ? price.value - weightedCost : null;
      const referenceMargin = referenceDifference != null ? (referenceDifference / price.value) * 100 : null;
      let status = 'Price Unavailable';
      if (price.state === 'multiple') status = 'Multiple Prices';
      else if (referenceDifference != null && referenceDifference < -EPSILON) status = 'Below Remaining-Cost Reference';
      else if (referenceDifference != null && Math.abs(referenceDifference) <= EPSILON) status = 'At Cost Reference';
      else if (referenceDifference != null) status = 'Above Cost Reference';

      return Object.freeze({
        key:group.key,
        productId:group.productId,
        productName:productName,
        category:category,
        remainingQty:group.remainingQty,
        totalRemainingCost:totalRemainingCost,
        weightedCostPerUnit:weightedCost,
        costValuesValid:costValuesValid,
        listedPriceState:price.state,
        listedPrice:price.value,
        listedPriceSource:price.source,
        referenceGrossProfitPerUnit:referenceDifference,
        referenceGrossMargin:referenceMargin,
        headroomPerUnit:referenceDifference,
        headroomPercent:referenceMargin,
        status:status
      });
    }));
  }

  function statusBadge(product) {
    const badgeClass = product.status === 'Below Remaining-Cost Reference' ? 'bad'
      : product.status === 'Above Cost Reference' ? 'ok' : 'warn';
    const title = product.status === 'Price Unavailable' && product.costValuesValid === false
      ? 'Remaining stock cost is unavailable; no cost-reference status was assigned.'
      : product.listedPriceSource;
    return '<span class="badge ' + badgeClass + '" title="' + escapeHTML(title) + '">' + escapeHTML(product.status) + '</span>';
  }

  function listedPriceCell(product) {
    if (product.listedPriceState === 'multiple') {
      return '<span title="Multiple current remaining-stock prices were found without a safe canonical Sale Out lookup.">Multiple</span>';
    }
    if (product.listedPriceState !== 'reliable') return '\u2014';
    return currencyText(product.listedPrice);
  }

  function pricingDataAttributes(product) {
    return ' data-pricing-product-id="' + escapeHTML(product.productId) + '"'
      + ' data-product-key="' + escapeHTML(product.key) + '"'
      + ' data-remaining-qty="' + product.remainingQty + '"'
      + ' data-stock-cost="' + (product.totalRemainingCost == null ? '' : product.totalRemainingCost) + '"'
      + ' data-weighted-cost="' + (product.weightedCostPerUnit == null ? '' : product.weightedCostPerUnit) + '"'
      + ' data-listed-price-state="' + product.listedPriceState + '"'
      + ' data-listed-price="' + (product.listedPrice == null ? '' : product.listedPrice) + '"'
      + ' data-reference-gp="' + (product.referenceGrossProfitPerUnit == null ? '' : product.referenceGrossProfitPerUnit) + '"'
      + ' data-reference-margin="' + (product.referenceGrossMargin == null ? '' : product.referenceGrossMargin) + '"'
      + ' data-status="' + escapeHTML(product.status) + '"';
  }

  function currentPositionRows(products) {
    if (!products.length) return '<tr><td colspan="11" class="empty">No product has remaining stock in the current open stock period.</td></tr>';
    return products.map(function (product) {
      return '<tr' + pricingDataAttributes(product) + '><td>' + escapeHTML(product.productName) + '</td>'
        + '<td class="mono">' + escapeHTML(product.productId || '\u2014') + '</td>'
        + '<td>' + escapeHTML(product.category || '\u2014') + '</td>'
        + '<td class="right mono">' + quantityText(product.remainingQty) + '</td>'
        + '<td class="right mono">' + (product.totalRemainingCost == null ? '\u2014' : currencyText(product.totalRemainingCost)) + '</td>'
        + '<td class="right mono">' + (product.weightedCostPerUnit == null ? '\u2014' : currencyText(product.weightedCostPerUnit)) + '</td>'
        + '<td class="right mono">' + listedPriceCell(product) + '</td>'
        + '<td class="right mono">' + (product.referenceGrossProfitPerUnit == null ? '\u2014' : currencyText(product.referenceGrossProfitPerUnit)) + '</td>'
        + '<td class="right mono">' + (product.referenceGrossMargin == null ? '\u2014' : percentageText(product.referenceGrossMargin)) + '</td>'
        + '<td class="right mono">' + (product.headroomPercent == null ? '\u2014' : percentageText(product.headroomPercent)) + '</td>'
        + '<td>' + statusBadge(product) + '</td></tr>';
    }).join('');
  }

  function headroomRows(products) {
    if (!products.length) return '<tr><td colspan="7" class="empty">No current product has a reliable listed price above its weighted remaining-cost reference.</td></tr>';
    return products.map(function (product) {
      return '<tr' + pricingDataAttributes(product) + '><td>' + escapeHTML(product.productName) + '</td>'
        + '<td class="right mono">' + quantityText(product.remainingQty) + '</td>'
        + '<td class="right mono">' + currencyText(product.weightedCostPerUnit) + '</td>'
        + '<td class="right mono">' + currencyText(product.listedPrice) + '</td>'
        + '<td class="right mono">' + currencyText(product.headroomPerUnit) + '</td>'
        + '<td class="right mono">' + percentageText(product.headroomPercent) + '</td>'
        + '<td class="right mono">' + currencyText(product.totalRemainingCost) + '</td></tr>';
    }).join('');
  }

  function positionOrder(left, right) {
    const belowLeft = left.status === 'Below Remaining-Cost Reference' ? 0 : 1;
    const belowRight = right.status === 'Below Remaining-Cost Reference' ? 0 : 1;
    if (belowLeft !== belowRight) return belowLeft - belowRight;
    const marginLeft = left.referenceGrossMargin == null ? Infinity : left.referenceGrossMargin;
    const marginRight = right.referenceGrossMargin == null ? Infinity : right.referenceGrossMargin;
    return marginLeft - marginRight
      || (right.totalRemainingCost == null ? -Infinity : right.totalRemainingCost) - (left.totalRemainingCost == null ? -Infinity : left.totalRemainingCost)
      || left.productName.localeCompare(right.productName);
  }

  function periodText(period) {
    try {
      if (typeof monthName === 'function') return monthName(period.month) + ' ' + period.year;
    } catch (_) {}
    return period.year + '-' + String(period.month).padStart(2, '0');
  }

  function pricingGuidanceHTML() {
    const products = buildCurrentStockAggregate();
    lastCurrentStockAggregate = products;
    const period = currentOpenPeriod();
    const reliable = products.filter(function (product) { return product.listedPriceState === 'reliable'; });
    const below = products.filter(function (product) { return product.status === 'Below Remaining-Cost Reference'; });
    const ambiguous = products.filter(function (product) { return product.listedPriceState === 'multiple'; });
    const belowCapital = below.reduce(function (sum, product) { return sum + number(product.totalRemainingCost); }, 0);
    const position = products.slice().sort(positionOrder);
    const headroom = products.filter(function (product) {
      return product.listedPriceState === 'reliable'
        && product.costValuesValid
        && product.headroomPerUnit > EPSILON;
    }).sort(function (a, b) {
      return b.headroomPerUnit - a.headroomPerUnit
        || b.totalRemainingCost - a.totalRemainingCost
        || a.productName.localeCompare(b.productName);
    }).slice(0, 10);

    const options = products.map(function (product, index) {
      return '<option value="' + index + '">' + escapeHTML(product.productId || 'No ID') + ' \u2014 ' + escapeHTML(product.productName) + '</option>';
    }).join('');

    return '<div id="pricingGuidance" data-build="' + BUILD + '" data-open-year="' + period.year + '" data-open-month="' + period.month + '" style="margin-top:18px">'
      + '<div class="card" style="margin-bottom:12px"><h2 style="margin:0 0 6px">Current Stock Pricing Guidance</h2>'
      + '<p class="muted" style="margin:0">Advisory analysis of current remaining stock. This section is not controlled by the historical Dashboard month selector.</p>'
      + '<p class="muted" style="font-size:12px;margin:6px 0 0">Current open stock period: ' + escapeHTML(periodText(period)) + '. Historical realised metrics remain in Stage 1 and Stage 2 above.</p></div>'
      + '<div class="grid g2 pricing-guidance-kpis" style="margin-bottom:12px">'
      + '<div class="card kpi teal"><h3>Products with Price Reference</h3><div id="pricingReliableCount" class="val mono" data-value="' + reliable.length + '">' + reliable.length + '</div><div class="sub">Current stocked products resolved through the Sale Out listed-price rule</div></div>'
      + '<div class="card kpi amber"><h3>Below Remaining-Cost Reference</h3><div id="pricingBelowCount" class="val mono" data-value="' + below.length + '">' + below.length + '</div><div class="sub">Listed price is mathematically below weighted remaining stock cost</div></div>'
      + '<div class="card kpi pink"><h3>Capital in Below-Reference Products</h3><div id="pricingBelowCapital" class="val mono" data-value="' + belowCapital + '">' + currencyText(belowCapital) + '</div><div class="sub">Associated remaining stock capital; this is not a realised loss</div></div>'
      + '<div class="card kpi blue"><h3>Products with Ambiguous Price</h3><div id="pricingAmbiguousCount" class="val mono" data-value="' + ambiguous.length + '">' + ambiguous.length + '</div><div class="sub">Conflicting remaining-row prices without a safe canonical Sale Out lookup</div></div>'
      + '</div>'
      + '<div class="card" style="margin-bottom:12px"><h3>Current Pricing Position</h3><p class="muted" style="font-size:12px">This is only the gap above the weighted remaining stock-cost reference. It is not a recommended discount limit.</p><div class="table-wrap"><table><thead><tr><th>Product</th><th>Product ID</th><th>Category</th><th class="right">Remaining Qty</th><th class="right">Stock Cost Value</th><th class="right">Weighted Cost/Unit</th><th class="right">Listed Price</th><th class="right">Reference GP/Unit</th><th class="right">Reference Margin %</th><th class="right">Headroom %</th><th>Status</th></tr></thead><tbody id="pricingPositionBody">'
      + currentPositionRows(position) + '</tbody></table></div></div>'
      + '<div class="card" style="margin-bottom:12px"><h3>Largest Price Headroom \u2014 Top 10</h3><p class="muted" style="font-size:12px">Headroom measures distance above remaining-stock cost only. It is not a recommended discount amount.</p><div class="table-wrap"><table><thead><tr><th>Product</th><th class="right">Remaining Qty</th><th class="right">Weighted Cost/Unit</th><th class="right">Listed Price</th><th class="right">Headroom/Unit</th><th class="right">Headroom %</th><th class="right">Remaining Stock Cost</th></tr></thead><tbody id="pricingHeadroomBody">'
      + headroomRows(headroom) + '</tbody></table></div></div>'
      + '<div class="card" id="pricingWhatIfCalculator"><h3>Pricing What-If Calculator</h3>'
      + '<p class="muted" style="font-size:12px">This calculator provides a stock-cost reference only. It does not include every business expense, warranty exposure, delivery cost or required profit margin, and it does not change the actual selling price.</p>'
      + '<div class="grid g2"><div class="field"><label>Product</label><select id="pricingWhatIfProduct" onchange="ZEZMS.pricingGuidance.selectWhatIf()"><option value="">\u2014 select current stocked product \u2014</option>' + options + '</select></div>'
      + '<div class="field"><label>Contemplated Selling Price</label><input id="pricingWhatIfPrice" type="number" min="0" step="0.01" placeholder="Enter contemplated price" oninput="ZEZMS.pricingGuidance.calculateWhatIf()" /></div></div>'
      + '<div class="grid g2" style="margin-top:10px"><div><div class="statline"><span>Product</span><b id="pricingWhatIfName">\u2014</b></div><div class="statline"><span>Product ID</span><b id="pricingWhatIfId" class="mono">\u2014</b></div><div class="statline"><span>Remaining Qty</span><b id="pricingWhatIfRemaining" class="mono">\u2014</b></div><div class="statline"><span>Weighted Remaining Cost/Unit</span><b id="pricingWhatIfCost" class="mono">\u2014</b></div><div class="statline"><span>Current Listed Price</span><b id="pricingWhatIfListed" class="mono">\u2014</b></div></div>'
      + '<div><div class="statline"><span>Unit Gross Profit Reference</span><b id="pricingWhatIfUnitProfit" class="mono">\u2014</b></div><div class="statline"><span>Gross Margin %</span><b id="pricingWhatIfMargin" class="mono">\u2014</b></div><div class="statline"><span>Difference from Current Listed Price</span><b id="pricingWhatIfCurrentDifference" class="mono">\u2014</b></div><div class="statline"><span>Difference from Weighted Remaining Cost</span><b id="pricingWhatIfCostDifference" class="mono">\u2014</b></div><div class="statline"><span>Status</span><b id="pricingWhatIfStatus">\u2014</b></div></div></div>'
      + '<div class="row" style="margin-top:10px"><button type="button" class="btn ghost" onclick="ZEZMS.pricingGuidance.resetWhatIf()">Reset</button></div></div></div>';
  }

  function setNodeText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function selectedCalculatorProduct() {
    const select = document.getElementById('pricingWhatIfProduct');
    if (!select || select.value === '') return null;
    const index = Number(select.value);
    return Number.isInteger(index) && lastCurrentStockAggregate[index] ? lastCurrentStockAggregate[index] : null;
  }

  function clearWhatIfResults() {
    ['pricingWhatIfUnitProfit','pricingWhatIfMargin','pricingWhatIfCurrentDifference','pricingWhatIfCostDifference','pricingWhatIfStatus'].forEach(function (id) { setNodeText(id, '\u2014'); });
  }

  function selectWhatIf() {
    const product = selectedCalculatorProduct();
    if (!product) {
      ['pricingWhatIfName','pricingWhatIfId','pricingWhatIfRemaining','pricingWhatIfCost','pricingWhatIfListed'].forEach(function (id) { setNodeText(id, '\u2014'); });
      clearWhatIfResults();
      return;
    }
    setNodeText('pricingWhatIfName', product.productName);
    setNodeText('pricingWhatIfId', product.productId || '\u2014');
    setNodeText('pricingWhatIfRemaining', quantityText(product.remainingQty));
    setNodeText('pricingWhatIfCost', product.weightedCostPerUnit == null ? '\u2014' : currencyText(product.weightedCostPerUnit));
    setNodeText('pricingWhatIfListed', product.listedPriceState === 'multiple' ? 'Multiple' : product.listedPriceState === 'reliable' ? currencyText(product.listedPrice) : '\u2014');
    calculateWhatIf();
  }

  function calculateWhatIf() {
    const product = selectedCalculatorProduct();
    const input = document.getElementById('pricingWhatIfPrice');
    const contemplated = input && input.value !== '' ? finiteNumber(input.value) : null;
    if (!product || contemplated == null || contemplated < 0 || product.weightedCostPerUnit == null) {
      clearWhatIfResults();
      return;
    }
    const difference = contemplated - product.weightedCostPerUnit;
    const margin = contemplated > 0 ? (difference / contemplated) * 100 : null;
    const currentDifference = product.listedPriceState === 'reliable' ? contemplated - product.listedPrice : null;
    const status = difference < -EPSILON ? 'Below Cost Reference' : Math.abs(difference) <= EPSILON ? 'At Cost Reference' : 'Above Cost Reference';
    setNodeText('pricingWhatIfUnitProfit', currencyText(difference));
    setNodeText('pricingWhatIfMargin', margin == null ? '\u2014' : percentageText(margin));
    setNodeText('pricingWhatIfCurrentDifference', currentDifference == null ? '\u2014' : currencyText(currentDifference));
    setNodeText('pricingWhatIfCostDifference', currencyText(difference));
    setNodeText('pricingWhatIfStatus', status);
  }

  function resetWhatIf() {
    const select = document.getElementById('pricingWhatIfProduct');
    const input = document.getElementById('pricingWhatIfPrice');
    if (select) select.value = '';
    if (input) input.value = '';
    selectWhatIf();
  }

  function appendInsideManagementArea(dashboardHTML, pricingHTML) {
    const close = dashboardHTML.lastIndexOf('</section>');
    if (close < 0) return dashboardHTML + pricingHTML;
    return dashboardHTML.slice(0, close) + pricingHTML + dashboardHTML.slice(close);
  }

  function install() {
    const originalDashboard = window.viewDashboard;
    if (typeof originalDashboard !== 'function') {
      console.error('Pricing Guidance could not attach because the Dashboard renderer is unavailable.');
      return false;
    }
    if (originalDashboard.__zezmsPricingGuidanceV382) return true;

    const wrappedDashboard = function () {
      const dashboard = originalDashboard.apply(this, arguments);
      try {
        return appendInsideManagementArea(dashboard, pricingGuidanceHTML());
      } catch (error) {
        lastCurrentStockAggregate = Object.freeze([]);
        console.error('Current Stock Pricing Guidance could not be calculated.', error);
        return appendInsideManagementArea(dashboard, '<div id="pricingGuidance" style="margin-top:18px"><div class="card"><h2>Current Stock Pricing Guidance</h2><div class="empty">Pricing Guidance could not be calculated. Existing prices, stock and transaction records were not changed.</div></div></div>');
      }
    };
    wrappedDashboard.__zezmsPricingGuidanceV382 = true;
    wrappedDashboard.__zezmsMarginIntelligenceV381 = Boolean(originalDashboard.__zezmsMarginIntelligenceV381);
    wrappedDashboard.__zezmsManagementIntelligenceV380 = Boolean(originalDashboard.__zezmsManagementIntelligenceV380);
    wrappedDashboard.__zezmsOriginalDashboard = originalDashboard;
    window.viewDashboard = wrappedDashboard;
    return true;
  }

  const installed = install();
  ZEZMS.pricingGuidance = Object.freeze({
    version:VERSION,
    build:BUILD,
    installed:installed,
    readOnly:true,
    advisoryOnly:true,
    selectWhatIf:selectWhatIf,
    calculateWhatIf:calculateWhatIf,
    resetWhatIf:resetWhatIf,
    getCurrentStockAggregate:function () { return lastCurrentStockAggregate; }
  });
}());
