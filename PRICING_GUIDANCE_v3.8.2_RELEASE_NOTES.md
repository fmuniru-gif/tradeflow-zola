# ZEZMS TradeFlow Owner Edition v3.8.2

## Pricing Guidance Foundation — Stage 3A

Build: `20260811-pricing-guidance-r35`

This release adds read-only, advisory-only Current Stock Pricing Guidance beneath Stage 1 and Stage 2. It provides current remaining-stock cost references and a temporary What-If Calculator. It does not change a selling price, block a sale, alter a discount, define a minimum margin, persist a recommendation or modify an operational record.

## Current versus historical scope

- Stage 1 and Stage 2 continue to use `DB.selectedYear` and `DB.selectedMonth` exactly as before.
- Stage 3A uses the application's current open stock period returned by the existing `getLatestMonth()` helper.
- Changing the historical Dashboard month does not change Current Stock Pricing Guidance.
- The new section explicitly labels this distinction and displays the current open stock period.

## Current-stock aggregation

The new `js/pricing-guidance-v382.js` module scans current-open-period stock rows once per Dashboard render and aggregates rows with Remaining Qty above zero:

- Product ID is preferred as the aggregate key, with canonical product name as the safe fallback.
- Multiple remaining cost rows become one product.
- Remaining Qty is taken through the existing `rowRemainingQty()` semantics.
- Total Remaining Stock Cost = `Σ(Remaining Qty × Unit Cost)`.
- Weighted Remaining Cost/Unit = `Total Remaining Stock Cost / Total Remaining Qty`.
- Missing or invalid cost on any positive-remaining row suppresses aggregate cost-dependent calculations instead of producing a partial or false result.

Weighted Remaining Cost is an analytical reference only. It does not replace FIFO, recorded unit costs, accounting COGS or Purchase Order costs and is never written to stock rows.

## Authoritative listed-price resolution

For a safely resolved canonical product name, Pricing Guidance calls the existing Sale Out helper `getBaseUnitPrice(name)` read-only. That existing rule:

1. determines the open period through `getLatestMonth()`;
2. finds stock rows whose Product Name exactly matches in that open year/month;
3. uses the last matching stock row's `uPrice` when it is present; and
4. falls back to the matching product catalogue `uPrice` only when the last open-month price is absent or no matching open-month row supplies a price.

Stage 3A does not modify that helper or introduce a competing price rule. A resolved price must be finite and above zero to be counted as a reliable price reference.

If an aggregate has no safe canonical name and its remaining rows contain more than one positive listed price, the table displays `Multiple`; it does not average, minimise or maximise them, and all price-dependent calculations display `—`. One unambiguous remaining-row price may be shown when no canonical lookup is possible. Missing and zero prices display as unavailable.

## Advisory calculations

Where both weighted cost and a reliable listed price exist:

- Reference Gross Profit/Unit = `Listed Price - Weighted Remaining Cost/Unit`.
- Reference Gross Margin = `(Listed Price - Weighted Remaining Cost/Unit) / Listed Price × 100`.
- Headroom to Cost Reference = `Listed Price - Weighted Remaining Cost/Unit`.
- Headroom % = `(Listed Price - Weighted Remaining Cost/Unit) / Listed Price × 100`.

The following factual statuses are used without a recommendation:

- Below Remaining-Cost Reference
- At Cost Reference
- Above Cost Reference
- Multiple Prices
- Price Unavailable

No overhead, warranty, rent, salary, delivery, marketing or other expense is allocated.

## KPIs and tables

- Products with Price Reference
- Below Remaining-Cost Reference
- Capital in Below-Reference Products
- Products with Ambiguous Price
- Current Pricing Position
- Largest Price Headroom — Top 10

Headroom is labelled as distance above remaining-stock cost only. It is not described as a safe, maximum or allowed discount.

## Pricing What-If Calculator

The calculator uses the already-built current-stock aggregate. It displays current product references and derives, from a manually entered contemplated price:

- Unit Gross Profit Reference
- Gross Margin %
- Difference from Current Listed Price
- Difference from Weighted Remaining Cost
- Above, At or Below Cost Reference status

The calculator has no save button. Its product selection, input and results exist only in module/DOM memory and may clear on navigation or refresh. It does not call `saveDB()`, trigger Cloud Sync or modify the product catalogue/listed price.

## Protected boundaries

- Read-only and advisory-only release.
- No Sale Out, Quick Sale, Stock In, FIFO, Purchase Order, receipt, invoice, waybill, VAT, Price Adjustment, discount, cash, expense, account, undo, rollover, sync, backup, authentication, staff, device, search, product-creation or historical KPI behaviour changed.
- No price enforcement, price floor, minimum margin, category margin, discount limit, transaction warning, blocking or override.
- No data/database-schema migration.
- No Supabase/SQL migration.
- No IndexedDB, dependency, external chart or network dependency.
- Database key remains `tradeflow_v321_zola`.
- ZIP/package path structure remains unchanged.
- Stage 3B and Stage 4 are not included.

