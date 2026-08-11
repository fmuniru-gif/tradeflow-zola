# ZEZMS TradeFlow Owner Edition v3.9.0 Release Notes

Release: **Stock Velocity & Reorder Planning Lab**  
Build: `20260811-stock-velocity-r38`  
Stage: **4A**  
Operating boundary: **Read only, advisory and runtime only**

## What was added

Stage 4A extends the existing Owner/Admin Management Intelligence area with a separate Stock Velocity & Reorder Planning section. It provides:

- actual-calendar 30, 60 and 90-day sales lookbacks, with 90 days as the non-persistent default;
- an exact effective date range and valid completed-sale count;
- current-stock velocity, 30-day pace, estimated days of cover and last-sale visibility;
- up to ten positive-velocity products ordered by lowest stock cover;
- a current-stock/no-sale-in-window table and associated capital split;
- a factual Recently Selling but Out of Stock table where identity is safe;
- runtime-only lead-time, safety-buffer and target-cover assumptions;
- open-PO-aware inventory position where open incoming quantity is safely known;
- a temporary reorder point, target position, whole-unit suggested quantity and reference restock-capital view;
- runtime-only KPI cards and a reset that restores blank/default assumptions without saving.

The implementation is isolated in `js/stock-velocity-v390.js` and loads after Stages 1, 2, 3A, 3B and 3B.1. No earlier intelligence/pricing JavaScript file was modified.

## Authoritative sales-history source

Stage 4A reuses the application's verified **Sales Records operational model** without modifying it:

1. receipt-based completed sales are read from active `DB.sales` records and their exact dated `lines`;
2. Quick Sale completed sales are read from active `DB.inventoryTxns` records whose `type` is `SALE_OUT` and `subtype` is `QUICK`, using their exact dated `details.lines`.

These are the two transaction variants represented by the existing Sales Records/Daily Sales behavior. `DB.receipts` is deliberately not scanned because it is the printable register representation of receipt sales already present in `DB.sales`; combining it would double-count the same sale.

The existing active-record rule is mirrored read-only: a record is excluded when `voided` is true or its status is `VOID`, `UNDONE` or `CANCELLED`. Stage 4A does not apply a second reversal correction or alter history. Stable receipt/transaction IDs are also de-duplicated inside the analytical pass.

## Product identity

The join order is deliberately conservative:

1. an explicit sale/PO `productId` is preferred;
2. otherwise the exact canonical catalogue/current-stock name may be used only when that name identifies one product unambiguously;
3. similar or fuzzy names are never merged;
4. a name that maps to more than one Product ID is excluded and disclosed in the coverage notice.

This preserves distinct products that share a name but have different IDs. Current quantity, current remaining stock cost, weighted remaining cost/unit, category and listed price are copied from the frozen Stage 3A current-stock aggregate returned by `ZEZMS.pricingGuidance.getCurrentStockAggregate()`.

## Lookback and formulas

The selected window is an inclusive local-calendar range ending on the current local day. A 90-day window therefore contains the current day plus the preceding 89 local calendar days. Downstream calculations retain full precision.

- `Units Sold in Lookback = sum of valid completed-sale line quantities in range`
- `Avg Units/Day = Units Sold in Lookback / selected calendar days`
- `30-Day Sales Pace = Avg Units/Day × 30`
- `Estimated Days of Cover = Current Remaining Qty / Avg Units/Day`, only when velocity is positive
- `Lead-Time Demand = Avg Units/Day × Lead Time Days`
- `Safety Buffer Demand = Avg Units/Day × Safety Buffer Days`
- `Temporary Reorder Point = Avg Units/Day × (Lead Time Days + Safety Buffer Days)`
- `Inventory Position = Current Remaining Qty + Incoming Open PO Qty`, when PO data is available
- `Temporary Target Position = Avg Units/Day × (Lead Time Days + Safety Buffer Days + Target Cover Days)`
- `Suggested Reorder Qty = max(0, ceil(Temporary Target Position - Inventory Position))`
- `Reference Restock Capital = Suggested Reorder Qty × Stage 3A Weighted Remaining Cost/Unit`, when that cost is available
- `Capital Activity % = group remaining stock cost / total known current remaining stock cost × 100`

Zero velocity displays a dash for days of cover and receives `No Recent Sales Basis`; it never produces `Infinity`. Lead time and target cover have no arbitrary defaults. Safety Buffer defaults to zero days.

## Open Purchase Order treatment

Stage 4A reads `DB.purchaseOrders` once per analytical rebuild and follows the existing Purchase Order status semantics from `owner-maintenance-v373.js`:

- only `OPEN` orders are eligible;
- `CANCELLED` and `COMMITTED` orders are excluded;
- an order with `committedAt` or non-empty `committedTransactionIds` is excluded even if malformed data still says `OPEN`;
- duplicate stable order IDs are counted once;
- duplicate stable line IDs within one order are counted once;
- only finite positive line quantities with a safe product identity are included.

If the Purchase Order collection is unavailable, incoming quantity displays as unavailable and planning is transparently calculated from current stock only. Stage 4A never creates, edits, saves, commits or cancels a Purchase Order.

## Data coverage and limitations

The current data model has no definitive sales-history coverage-start marker. Stage 4A therefore reports the exact selected dates and valid records used, but does not invent a completeness score. If either operational sales collection is unavailable, the required incomplete-coverage warning is shown.

Additional limits:

- recent average pace is a simple observed rate, not a forecast;
- days of cover assumes that recent average pace continues;
- a no-sale-in-window product is not labelled dead, obsolete or aged;
- reference cost is current weighted remaining cost, not a supplier quotation;
- safely identified out-of-stock products may have no reference cost;
- ambiguous historical names are excluded instead of guessed;
- no seasonality, trend model, promotion effect, machine learning or category forecast is included;
- no stock ageing, ABC classification or Stage 4B is included.

## Protected architecture

v3.9.0 keeps browser database key `tradeflow_v321_zola`. It adds no SQL, Supabase migration, IndexedDB implementation, dependency or external request. FIFO, Sale Out, Quick Sale, Stock In, Purchase Order save/commit/cancel, supplier accounting, receipts, invoices, waybills, VAT, Price Adjustment, `0000` safeguards, accounts, undo, month rollover, Cloud Sync, backup/restore, authentication, staff and device workflows are unchanged.

All scenario controls and results exist only in the currently rendered page. Refreshing, navigating away or using **Reset Reorder Planning** discards them.
