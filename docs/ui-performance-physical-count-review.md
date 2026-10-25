# UI responsiveness and physical-count review

Base: production `8e7dc797b3a8ca2d2ba58f3a3a2ae5879846fbc6`. This is a review-only candidate. No operational device, Supabase project, production profile, or business record was used.

## Reproducible local benchmark

Run `node tests/ui-responsiveness.browser.cjs` with `PLAYWRIGHT_CORE_PATH` set to the installed Playwright runtime. For the old shell set `BENCH_BASELINE=8e7dc797b3a8ca2d2ba58f3a3a2ae5879846fbc6`; use `BENCH_DEVICE=SHOP` for the paired-device profile. The script starts a localhost server, blocks all external requests, signs in a synthetic Owner, and measures seven actual navigation-button clicks per route in headless Chrome. Data volume: 600 catalog products, 1,800 stock rows, 900 receipts, 450 quick-sale transactions, 900 sales, 300 cash-log entries, and 300 expenses. Values below are median synchronous click-to-render milliseconds, not a claim about physical-device paint or network delay.

| Route | Main before | Main after | Shop-style paired before | Shop-style paired after |
| --- | ---: | ---: | ---: | ---: |
| Sales Records | 248.4 | 245.4 | 238.2 | 252.0 |
| Stock Balance | 214.7 | 191.3 | 205.2 | 179.7 |
| Cash Balances | 20.1 | 17.3 | 17.1 | 16.9 |
| Dashboard | 879.5 | 910.4 | 853.0 | 864.5 |
| Management Intelligence | 788.8 | 783.9 | 733.1 | 780.9 |

Stock Balance's original `viewStock()` searched all 600 products for each of 1,800 rows. The replacement builds first-ID and unique-name indexes once per render, retaining the same duplicate-name behavior and exact row markup. Direct Stock Balance HTML generation on Main fell from 188.6 to 155.4 ms. All five measured output lengths and hashes matched baseline. The slower Dashboard/Management path still constructs the complete analytics Dashboard and then extracts the visible section; a direct call costs roughly 0.7–0.8 seconds in this fixture. Sales Records constructs about 1.08 MB of table markup. Both costs remain. The modules' render and audit dependencies do not provide an independently verified smaller route renderer; caching, skipping calculations, or hiding rows was outside this safe pass. A reported after value above before is measurement variation, not an improvement claim.

## Set Physical Count

The new UI accepts a counted **target** of zero or more with at most two decimal places. It derives a strictly positive `Quantity Increase` or `Quantity Decrease` through the existing audited correction path. Count 12 to 0 produces a 12-unit decrease. Increases require the actual unit cost. Equal counts display “No adjustment required” and create no event. Preview shows current/resulting quantity and before/after inventory value. Commit recomputes the correction and compares the exact current stock-layer snapshot, period, quantity and reference value to the preview; changed layers or value stop without a write. Existing Increase/Decrease, correction audit records, reversal rules, FIFO sale-out, historical `qtyIn`/`qtyOut`, wallet and cash data remain unchanged. The M4/3 classifier continues to queue the resulting audit as `STOCK_CORRECTION_UPSERT` in an isolated profile; synchronization itself was not started.

## Stock-row void feasibility — read only

Hard deletion is unsafe. Stock-row IDs are referenced by sale FIFO allocations and their reversal paths, quick-sale inventory transactions, `undoLog`, purchase-order stock-in transactions and supplier/creditor/cash links, and stock correction allocations/reversals. Current Stock-In undo is conditional on sufficient unsold units and can remove an empty row, but it is not a general mistaken-row void and does not prove every later reference is absent. An Owner-only audited “Void Mistaken Stock-In” could be considered only as a separate, explicitly approved compensating workflow after an exact row/reference graph, sold-unit check, purchase and accounting effect reconciliation, and cross-device replay/undo design. No row deletion, archive, or void mutation is implemented here.

## Release and limits

The reviewed shell, worker, manifest, and update helper share release `20261024-ui-stock-review-r1`. The worker preloads and checks the new stock-correction asset, while retaining passive activation and old-tab safeguards. Tests use disposable browser profiles; there was no measurement on Main or Shop Chrome themselves. The high Sales and Dashboard latency remains a separate performance limitation. This candidate must not be published or used for physical counts without separate Owner deployment approval and normal device acceptance checks.
