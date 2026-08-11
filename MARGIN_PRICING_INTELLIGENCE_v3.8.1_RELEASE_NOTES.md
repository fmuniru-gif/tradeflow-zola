# ZEZMS TradeFlow Owner Edition v3.8.1

## Margin & Pricing Intelligence

Build: `20260811-margin-intelligence-r34`

This release adds Stage 2 Margin & Pricing Intelligence beneath the existing Stage 1 Management Intelligence content. It is a read-only analytical release: no selling price, discount, transaction, stock, account or historical record is changed or enforced.

## Architecture

- Added the late-loaded `js/margin-intelligence-v381.js` runtime module.
- Stage 1 still constructs the selected-period product aggregate from `DB.stockRows` once while rendering.
- Stage 1 now exposes that aggregate as a frozen, read-only snapshot through its namespaced API.
- Stage 2 derives all of its KPI and table arrays from that snapshot. It does not independently rescan `DB.stockRows`.
- Stage 2 wraps the already-installed Stage 1 Dashboard renderer once and appends its subsection beneath the Stage 1 tables.
- Both modules guard against duplicate installation.
- Stage 2 creates no route or permission and inherits the existing Dashboard access control.
- All calculations occur in memory. Stage 2 does not call `saveDB()`, add fields, persist analytics, create records, or make network requests.

## Stage 2 KPIs

- **Products Sold at Gross Loss:** count of aggregated products with Qty Sold above zero and recorded Gross Profit below zero.
- **Sales Value at Gross Loss:** sum of Total Sales for those gross-loss products. This is associated sales revenue, not the loss amount.
- **Avg Gross Profit / Unit Sold:** Total Gross Profit divided by Total Qty Sold across all sold products.
- **Top-5 Profit Concentration:** the five highest positive product Gross Profit values divided by total positive product Gross Profit.

## Stage 2 tables

- **Margin Watch — Lowest 10:** sold products ordered by Gross Margin ascending, Gross Profit ascending and Product Name ascending.
- **Profit Engines — Top 10:** positive-profit sold products ordered by Gross Profit descending, Total Sales descending and Product Name ascending.
- **Sales vs Profit:** up to 15 sold products ordered by Total Sales descending and Product Name ascending.
- **Gross-Loss Products:** all gross-loss sold products ordered by Gross Profit ascending. When none exist, the card remains visible with a positive empty state.

## Formulas introduced

All figures use the selected-period aggregate's existing recorded `tSales`, `profit` and Qty Sold values. Stage 2 does not recalculate FIFO or reconstruct purchase cost.

- Realised Gross Margin % = `Gross Profit / Total Sales × 100`; zero when Total Sales is zero.
- Avg Realised Selling Price = `Total Sales / Qty Sold`; zero when Qty Sold is zero.
- Implied COGS = `Total Sales - Gross Profit`.
- Avg Realised Cost/Unit = `(Total Sales - Gross Profit) / Qty Sold`; zero when Qty Sold is zero.
- Gross Profit/Unit = `Gross Profit / Qty Sold`; zero when Qty Sold is zero.
- Sales Contribution % = `Product Total Sales / Total Sales of all sold products × 100`.
- Gross Profit Contribution % = `Product Gross Profit / Overall Gross Profit × 100` only when overall Gross Profit is positive; otherwise zero. Negative product contributions remain negative when the denominator is valid.
- Top-5 Profit Concentration = `Top five positive product Gross Profit / Total positive product Gross Profit × 100`.

Full numeric precision is retained for calculation. Currency and percentages are rounded only for display using existing application formatting.

## Defensive interpretation

- A product is identified factually as a gross-loss product only when its recorded aggregated Gross Profit is below zero.
- No arbitrary margin threshold, price recommendation, reorder instruction, product-quality label or recommendation engine is included.
- If `Total Sales - Gross Profit` is negative, the Avg Realised Cost/Unit cell displays `—` with an inconsistency notice; the underlying record is not changed.
- Missing Product IDs/categories, numeric strings, null numbers, multiple cost rows, malformed rows and zero denominators are handled without interrupting the Dashboard.
- Database-sourced text is escaped before HTML insertion.
- Historical periods without detailed `stockRows` retain the established empty-state behaviour; no detail is inferred from KPI snapshots.

## Protected boundaries

- No data migration or data-model change.
- No Supabase or SQL migration.
- No FIFO or transaction-engine change.
- No Sale Out, Quick Sale, Stock In, Purchase Order, receipt, invoice, waybill, VAT, cash, expense, account, undo, rollover, Cloud Sync, backup/restore, authentication, staff, device, product-search or historical KPI logic change.
- No price or discount enforcement, price floor, margin threshold, sale blocking or Owner override.
- No IndexedDB, npm package, external chart or network dependency.
- Database key remains `tradeflow_v321_zola`.
- ZIP/package path structure is unchanged.

Stage 3 pricing controls, price floors, business-rule thresholds, promotion flags, traffic-product flags and stock ageing are not included.

