# ZEZMS TradeFlow Owner Edition v3.9.1 Release Notes

Release: **Portfolio Signals & Capital Allocation Intelligence**  
Build: `20260812-portfolio-signals-r39`  
Stage: **4B**  
Operating boundary: **Read only, advisory and non-persistent**

## What was added

Stage 4B appends a separate Portfolio Signals & Capital Allocation section beneath Stage 4A in the Owner/Admin Dashboard. It provides:

- four portfolio KPI cards;
- a Product Portfolio Overview with transparent ranks and overlapping advisory badges;
- Capital Heavy — Low Movement and High Velocity — Low Cover attention tables;
- strongest and weakest reference capital-productivity tables;
- independent stock-capital exposures for each overlapping signal;
- current Stage 4A Suggested Reorder Qty only while a valid Stage 4A scenario is present.

The implementation is isolated in `js/portfolio-signals-v391.js` and loads after Stage 4A. It adds no route, permission, storage field, database schema, dependency or network request.

## Datasets reused

Stage 4B does not rescan operational transactions. It joins two existing read-only sources once per render:

1. Stage 3A `ZEZMS.pricingGuidance.getCurrentStockAggregate()` supplies Product ID, name, category, current remaining quantity, remaining stock cost, weighted remaining cost/unit, listed-price state/value, Reference GP/Unit, Reference Margin and the factual price/cost status.
2. Stage 4A `ZEZMS.stockVelocity.getProductSnapshot()` supplies its selected lookback, Units Sold, Avg Units/Day, 30-Day Sales Pace, Days of Cover, Last Sale Date, Incoming Open PO Qty, Inventory Position and current temporary reorder result when valid.

The only earlier-module adjustment is a small additive interface in `js/stock-velocity-v390.js`. It exposes a deeply frozen product snapshot and emits `zezms:stock-velocity-updated` after window or scenario output changes. Its operational scans, product-identity rules and all Stage 4A formulas are unchanged.

## Reference formulas

- `Reference GP Pace / 30 Days = Stage 3A Reference GP/Unit × Stage 4A 30-Day Sales Pace`
- `Reference GP / GH₵1,000 Stock Capital = Reference GP Pace / Remaining Stock Cost × 1,000`, only when Remaining Stock Cost is positive

Reference GP Pace estimates potential 30-day gross-profit contribution using the current listed price, current weighted remaining-cost reference and observed recent pace. It is not realised accounting profit. Reference capital productivity is a current-stock comparison, not ROI or historical return on all invested capital. Missing or ambiguous price/cost inputs produce `—`; negative values remain visible.

## Ranking and quartiles

Ranks are ordinal positions after deterministic sorting. Metric direction follows the specification: velocity, capital, contribution and productivity descending; positive-velocity stock cover ascending. Equal metrics are resolved by Product Name, Product ID and stable product key. The display is `rank of N`.

Quartiles are calculated only when at least four products are eligible for that metric. With rank 1 representing the strongest result, the exact method is:

`Q = 4 - floor((rank - 1) × 4 / N)`

This distributes the ordered observations across Q4 to Q1 using rank position. For fewer than four eligible products, ranks remain available and quartiles are omitted. No fixed unit, margin or currency threshold is used.

## Portfolio signals

- **High Velocity / Low Cover:** positive velocity, Velocity Q4 and cover rank within `ceil(valid cover count / 4)` shortest-cover positions.
- **High Capital / Low Movement:** Capital Q4 and either Velocity Q1 or zero units sold in the active lookback.
- **Strong Reference Contribution:** positive Reference GP Pace and Reference Contribution Q4.
- **Strong Reference Capital Productivity:** positive productivity and rank within `ceil(valid productivity count / 4)` strongest positions.
- **Below Remaining-Cost Reference:** exact Stage 3A factual status reused without a second rule.
- **No Sales in Lookback:** current quantity above zero and Stage 4A Units Sold equal to zero.
- **Normal Monitoring:** shown only where no other signal applies.

Signals can overlap. Their capital percentages show exposure to each signal independently and must not be added together. They are not permanent ABC classes or exclusive categories.

## Deterministic table order

Product Portfolio Overview sorts signalled products before Normal Monitoring, followed by High Velocity / Low Cover, High Capital / Low Movement, Strong Reference Capital Productivity, highest known stock capital, Product Name, Product ID and stable key. Other tables follow the exact metric orders stated in the Stage 4B specification with the same identity tie-breakers.

## Small and empty portfolios

Zero-, one-, two- and three-product portfolios render safely. Quartiles and quartile-dependent signals are absent when fewer than four values are eligible. A portfolio with no valid pricing/cost references displays dashes instead of artificial zeros. Zero sales does not produce infinite cover or a dead-stock label.

## Scope exclusions and limitations

- The optional non-overlapping velocity/capital matrix was omitted; all mandatory views are present.
- There is no persistent ABC classification, user-editable class or saved signal.
- There is no composite score, Buy/Hold/Reduce/Exit command or automatic capital allocation.
- There is no automatic Purchase Order, purchase modification or automatic repricing.
- There is no stock ageing, advanced demand forecast or Stage 4C.
- Results inherit Stage 3A and Stage 4A data-availability and identity limitations.
- The current sales pace is an observed recent average, not a demand guarantee.

## Protected architecture

Database key remains `tradeflow_v321_zola`. FIFO, `recordSaleOutFIFO()`, Sale Out, Quick Sale, Stock In, Purchase Order save/commit/cancel, supplier accounting, receipts, invoices, waybills, VAT, Price Adjustment, `0000` safeguards, discounts, cash, expenses, accounts, undo/reversal, rollover, Cloud Sync, backup/restore, authentication, staff, device, product search and product creation behavior are unchanged. No SQL, Supabase or IndexedDB migration is included.

