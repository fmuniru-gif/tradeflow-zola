# ZEZMS TradeFlow Owner Edition v3.8.0

## Management Intelligence Foundation

Build: `20260811-management-intelligence-r33`

This release adds Stage 1 of Management Intelligence as a conservative, read-only extension beneath the existing Dashboard. It does not replace the 13 KPI tiles, Quick Actions, Cash Wallets or existing period selector.

## Read-only architecture

- Added the late-loaded runtime module `js/management-intelligence-v380.js`.
- The module wraps the final active `viewDashboard()` once, calls the existing renderer normally, then appends Management Intelligence beneath it.
- Figures are calculated in memory from `DB.stockRows` for `DB.selectedYear` and `DB.selectedMonth`.
- The calculation does not call `saveDB()`, persist derived figures, add fields, create transactions, create stock rows or modify existing records.
- No network connection or external library is required; the feature works offline.
- A historical period without detailed stock rows displays a friendly empty state and does not manufacture data from the current period.

## Management indicators

- **Products Currently in Stock:** distinct aggregated products with remaining quantity above zero.
- **Capital in No-Sale Stock:** remaining stock cost for stocked products with zero selected-period quantity sold.
- **Overall Sell-Through:** `Total Qty Sold / (Total Qty Sold + Total Remaining Qty) x 100`.
- **Top-5 Capital Concentration:** `Top 5 Remaining Stock Cost / Total Remaining Stock Cost x 100`.

## Product analysis

Selected-period cost tiers are aggregated into one product, preferring Product ID where available and falling back safely to canonical product name. Each aggregate derives Quantity In, Quantity Sold, Remaining Quantity, Remaining Stock Cost Value, Total Sales, Gross Profit, Sell-Through and Gross Margin.

- Remaining Stock Cost Value is the sum of `Remaining Quantity x Unit Cost` across the product's cost rows.
- Sell-Through is `Qty Sold / (Qty Sold + Remaining Qty) x 100`.
- Gross Margin is `Gross Profit / Total Sales x 100`.
- Zero denominators display `0.0%`.
- Existing `tSales` and `profit` values are used without introducing a new accounting method.

The Dashboard now includes:

- **Capital Tied Up - Top 10 Products**
- **No-Sale Stock This Period**
- **Best Movers This Period**

No ageing labels, reorder recommendations, pricing recommendations or Stage 2 rules are included.

## Permissions

Management Intelligence has no independent route and creates no new permission. It is visible only inside the existing Dashboard and inherits the existing `VIEW_DASHBOARD` restrictions. In the normal Owner/Admin operating configuration this keeps it Owner/Admin-only, while any additional role already granted Dashboard access by the existing configuration continues to inherit that access. Restricted Cashiers do not gain Dashboard access.

## Compatibility and protected boundaries

- No local database migration is required.
- No Supabase migration or SQL file is added.
- The existing database key remains `tradeflow_v321_zola`.
- `recordSaleOutFIFO()`, Stock In, Sale Out, receipt creation, purchase-order stock commit, invoice/waybill, VAT, price adjustment, cash, accounts, expenses, undo, rollover, Cloud Sync, backup/restore, authentication, staff permissions and device enrollment logic are unchanged.
- No IndexedDB or new dependency is introduced.
- The ZIP/package path structure is unchanged.

The frozen v3.7.0 r29 and verified v3.7.1, v3.7.2 and v3.7.3 packages remain separate and unchanged.
