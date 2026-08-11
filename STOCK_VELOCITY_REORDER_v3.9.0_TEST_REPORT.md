# Stock Velocity & Reorder Planning v3.9.0 Test Report

Build: `20260811-stock-velocity-r38`  
Result: **PASS**

## Stage 4A focused feature suite

The deterministic rendered-browser suite passed **70/70** mandatory checks:

1. Dashboard opened normally.
2. Stages 1–3B.1 remained intact.
3. Stage 4A rendered once.
4. Stage 4A remained inside the Owner/Admin Dashboard and created no cashier route.
5. The 30-day window produced the expected quantity.
6. The 60-day window produced the expected quantity.
7. The default 90-day window produced the expected quantity.
8. Inclusive local-calendar start/end dates were exact.
9. Completed sales used the Sales Records receipt-sale/Quick Sale operational model.
10. The printable receipt representation was not double-counted.
11. Voided, undone, cancelled, malformed and out-of-window records followed existing active-record semantics.
12. Product-ID matching kept two same-name/different-ID products separate.
13. Exact unambiguous canonical-name fallback worked and an ambiguous name was excluded.
14. Units Sold in Window was correct.
15. Avg Units/Day was correct at full precision.
16. 30-Day Sales Pace was correct.
17. Last Sale Date was correct.
18. A zero-sale current product displayed `No sale in window`.
19. Estimated Days of Cover was correct.
20. Zero velocity produced a dash, not `Infinity`.
21. Current remaining quantity matched the Stage 3A fixture exactly.
22. Remaining stock cost matched the Stage 3A fixture exactly.
23. Blank Lead Time produced `Planning Inputs Required` and hid planning output.
24. Zero Lead Time was accepted.
25. Negative Lead Time was rejected.
26. Zero Safety Buffer was accepted.
27. Negative Safety Buffer was rejected.
28. Blank Target Cover was handled as incomplete.
29. Zero Target Cover was accepted.
30. Lead-Time Demand was correct.
31. Safety Buffer Demand was correct.
32. Temporary Reorder Point was correct.
33. Valid open-PO quantities were counted.
34. Cancelled POs were excluded.
35. Committed POs and committed-marker records were excluded.
36. Duplicate order/line quantities were not double-counted.
37. Inventory Position was correct.
38. Temporary Target Position was correct.
39. Suggested Reorder Qty was correct.
40. Suggested quantity never became negative.
41. A positive fractional requirement rounded upward to the next whole unit.
42. Per-product Reference Restock Capital was correct.
43. The supplier-cost limitation notice was visible.
44. At/Below Temporary Reorder Point KPI was correct.
45. Suggested Reorder Units KPI was correct.
46. Reference Restock Capital KPI was correct.
47. Current Stock with No Recent Sales KPI was correct.
48. Stock Velocity sorting was correct.
49. Fast Movers sorting was correct.
50. No-Sales table cost sorting was correct.
51. Temporary Reorder Preview status/quantity/cover sorting was correct.
52. Capital by Sales Activity amounts were correct.
53. Capital activity percentages used the same total and summed to 100%.
54. Recently Selling but Out of Stock worked with a safe Product ID.
55. Missing sales-source data showed the incomplete-coverage state without crashing.
56. Reset restored 90 days, blank Lead Time, zero Safety Buffer, blank Target Cover and hidden planning results.
57. Reset left a deep DB snapshot unchanged.
58. A fresh Dashboard render did not retain planning inputs.
59. Navigation away/back did not retain planning inputs.
60. Stage 4A made zero `saveDB()` calls and contains no such call.
61. Stage 4A triggered zero Cloud Sync activity and contains no sync call.
62. No Purchase Order was created.
63. No Purchase Order was changed.
64. No current-stock quantity was changed.
65. No catalogue product was changed.
66. Changing the historical Dashboard month did not change Stage 4A's current-stock/lookback basis.
67. Repeated Dashboard rendering retained one Stage 4A section.
68. Re-loading the Stage 4A script retained the same API/wrapper and one installation.
69. Inputs use the native responsive grid, all tables use scoped horizontal `table-wrap`, and Stage 4A adds no fixed element.
70. A valid `1e308` quantity and an extreme planning-day input produced finite output/a validation state; no rendered `NaN`, `Infinity` or undefined numeric value appeared.

The formula fixture used current products with known quantities/costs, receipt-sale and Quick Sale records at 2–100 days ago, explicit reversals/voids/cancellations, a duplicated printable receipt, an ambiguous same-name product, open/cancelled/committed/duplicated POs and a safely identified out-of-stock product. For the 90-day scenario, Product A recorded 31 units, average `31/90`, 30-day pace `31/3`, current quantity 10 and cover `10 ÷ (31/90)`. With Lead Time 45, Safety Buffer 15 and Target Cover 60, its inventory position was 15, target position `31/90 × 120`, suggested quantity 27 and reference capital GH₵1,350.00.

## Critical regression checks 71–104

The v3.8.4 rollback baseline was re-audited and all **34/34** required regression checks passed:

- 71–77: Sale Out/FIFO, Quick Sale, receipts, Stock In and Purchase Order save/commit/cancel surfaces passed protected-source integrity and runtime-surface checks.
- 78–80: VAT, Price Adjustment and fixed `0000` safeguards remained present in the byte-identical normalized runtime.
- 81–88: cash, expenses, debtors, creditors, depositors, undo/reversal, invoices and waybills passed protected-source integrity/runtime-surface checks.
- 89–99: automatic rollover, Cloud Sync, backup/restore, authentication, cashier restrictions, staff management, device enrollment/revocation, product search, PDF, installed-PWA startup and service-worker lifecycle checks passed.
- 100–104: Stage 1, Stage 2, Stage 3A, Stage 3B Existing Product and Stage 3B.1 New Product modules were byte-identical to v3.8.4, retained their expected wrapper/API surfaces and rendered intact in the Stage 4A browser fixture.

The operational regression method was deliberately non-mutating: it combined byte-for-byte protected-file comparison, normalized inline-runtime comparison, expected runtime/API surface assertions and isolated browser startup/lifecycle checks. It did not post test transactions to the user's live business database or contact Supabase.

## Protected-file and architecture results

- Existing JavaScript files compared with v3.8.4: **42/42 identical**.
- SQL files compared with v3.8.4: **10/10 identical**.
- After normalizing only v3.9.0 version/build/cache strings and removing the new Stage 4A script tag, `index.html` was **byte-for-byte identical** to v3.8.4.
- This normalized equality protects the inline FIFO, Sale Out, receipt, Stock In, VAT, Price Adjustment, cash, expense, account, authentication, staff and device code.
- Database key: `tradeflow_v321_zola` — unchanged.
- SQL/Supabase migrations: none.
- IndexedDB/dependency additions: none.
- Stage 4A static persistence/network scan: no `saveDB`, local/session storage, IndexedDB, fetch/XHR, Supabase or SQL operation.

## Syntax, startup, mobile and lifecycle

- External JavaScript syntax: **44/44 PASS** (43 files in `js/` plus `sw.js`).
- Executable inline `index.html` script blocks: **6/6 PASS**.
- `manifest.json`: valid JSON.
- Full app startup at the r38 URL: PASS with the v3.9.0 title, normal secure-login screen and zero browser console errors.
- Service-worker local assets: **42 declared, 42 resolved**.
- Real service-worker lifecycle: registration PASS; activation PASS; r38 cache PASS; Stage 4A asset cached PASS; app reload became service-worker controlled PASS.
- Offline cache fallback with the local server stopped: **PASS**; the exact service-worker fallback lookup returned the v3.9.0 index and final Stage 4A module, including the final numeric-safety code.
- Mobile structure: native `g4` controls stack at the existing phone breakpoint; Stage 4A tables override only their own older phone rule to retain horizontal scrolling; no Stage 4A fixed element exists.

## Timing-sensitive, skipped and failed checks

- Timing-sensitive: the lifecycle harness waited for service-worker activation and app control before the offline probe. The in-app browser isolates new tabs from a prior tab's service-worker context, so the final server-stopped assertion exercised the service worker's exact Cache API fallback chain from the registered/controlled lifecycle tab rather than claiming a cross-tab offline navigation.
- Intermediate failure: the first focused run was 69/70 because the out-of-stock row lacked a `data-product-id` attribute even though its ID cell and calculations were correct. The attribute was added; the complete unmodified 70-check suite then passed. A later responsive integration audit found and corrected the non-native `cols-4` class before the final run. Final result remained 70/70.
- Skipped mandatory checks: none.
- Final failed checks: none.

## Known limitations

- There is no reliable sales-history coverage-start marker, so full-window completeness cannot be automatically proved; no confidence score is invented.
- Historical sale lines without Product IDs are used only when exact canonical-name identity is unique.
- The rate is an observed recent average, not a demand forecast.
- No sale in a window is not stock age, dead stock or obsolescence.
- Reference restock capital uses current weighted remaining cost, not a supplier quotation.
- Stage 4A creates no Purchase Order, persistent reorder level, forecast, ageing bucket, ABC class or Stage 4B behavior.
