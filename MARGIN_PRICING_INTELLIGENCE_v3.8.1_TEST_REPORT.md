# Margin & Pricing Intelligence v3.8.1 test report

Build: `20260811-margin-intelligence-r34`

Result: **PASS**

## Stage 2 feature checks

All 35 mandatory focused checks passed:

1. Dashboard opened normally with no browser error.
2. The original 13 Dashboard KPI tiles remained present.
3. Stage 1 Management Intelligence rendered normally.
4. Stage 2 rendered below and inside the Stage 1 Management Intelligence area.
5. Two Product A cost rows aggregated into one product.
6. Realised Gross Margin matched `Gross Profit / Total Sales × 100`.
7. Avg Realised Selling Price matched `Total Sales / Qty Sold`.
8. Implied COGS matched `Total Sales - Gross Profit`.
9. Avg Realised Cost/Unit matched `Implied COGS / Qty Sold`.
10. Gross Profit/Unit matched `Gross Profit / Qty Sold`.
11. Sales Contribution matched product sales divided by all sold-product sales.
12. Gross Profit Contribution matched product Gross Profit divided by positive overall Gross Profit and permitted negative contributions.
13. Products Sold at Gross Loss counted the two expected aggregate products.
14. Sales Value at Gross Loss summed associated sales revenue and did not present it as the loss amount.
15. Avg Gross Profit/Unit KPI matched total Gross Profit divided by total Qty Sold.
16. Top-5 Profit Concentration used only positive-profit products in its numerator and denominator.
17. Margin Watch used the required three-level ascending sort.
18. Profit Engines used the required Gross Profit, Total Sales and name sort.
19. Sales vs Profit used Total Sales descending and name ascending.
20. Gross-Loss Products placed the largest negative Gross Profit first.
21. A stocked zero-sale product was excluded from all realised-margin tables.
22. A zero-sales period rendered zero KPIs and safe table states without division by zero.
23. Negative-profit products retained negative Gross Profit, margin and contribution values.
24. A zero-profit product rendered zero margin and zero Gross Profit/Unit safely.
25. A completely empty selected period rendered safely.
26. A historical KPI-only period without detailed stock rows retained the established Stage 1 and Stage 2 empty states.
27. Missing Product ID and category values displayed safely.
28. Numeric-string values produced the expected numeric results.
29. A malformed row did not crash the Dashboard or enter realised-sales tables.
30. Negative implied COGS displayed `—` and the inconsistency tooltip instead of a cost value.
31. A deep database snapshot was identical before and after Stage 2 rendering.
32. The `saveDB()` call counter remained zero during Stage 2 rendering.
33. Repeated Dashboard rendering kept exactly one Stage 2 subsection.
34. Re-loading the Stage 2 script retained the same Dashboard wrapper and did not install another wrapper.
35. A 390 × 844 portrait render stayed within the application width, retained four responsive table containers and introduced no fixed-position element.

The focused fixture also verified safe HTML escaping, zero Total Sales with Qty Sold above zero, zero overall Gross Profit contribution denominators, reuse of the Stage 1 Sell-Through result, inherited Dashboard permissions and absence of an independent Stage 2 route.

## Critical regression checks

All mandatory regression areas passed through the carried-forward browser suites:

36. Sale Out and FIFO inventory transaction creation.
37. Quick Sale.
38. Receipt creation using the normal sale workflow.
39. Stock In.
40. Purchase Order save.
41. Purchase Order commit to stock.
42. Reversible open Purchase Order cancellation.
43. Cash transactions.
44. Expense transactions.
45. Debtor operations and filtering.
46. Creditor/supplier operations and filtering.
47. Depositor operations and filtering.
48. Undo/reversal.
49. VAT calculation.
50. `0000` Price Adjustment safeguard.
51. `0000` VAT safeguard.
52. Invoice creation/editing/PDF workflow.
53. Waybill creation/editing/PDF workflow.
54. Automatic month rollover.
55. Cloud Sync startup and normal API/state.
56. Backup/restore controls.
57. Authentication baseline and Owner/commercial separation markers.
58. Cashier restrictions and Dashboard denial.
59. Staff management, deactivation and deletion safeguards.
60. Device enrolment/revocation safeguards.
61. Product search and Purchase Order catalogue-product creation.
62. Purchase Order, receipt, invoice and waybill PDF generation.
63. Installed-PWA offline startup with both Intelligence modules.
64. Service-worker installation, cache update and controlled offline reload.
65. Stage 1 formulas, aggregation, sorting, escaping, permissions, empty states and portrait behaviour.

## Suite results

- Stage 2 Margin & Pricing Intelligence focused browser suite: PASS.
- Stage 1 Management Intelligence browser suite: PASS.
- Account/Purchase Order/PDF feature suite: PASS.
- Document editing and transaction-badge suite: PASS.
- Access-control, PIN, staff and device regression suite: PASS.
- Owner/commercial separation suite: PASS.
- Critical operational/offline lifecycle suite: PASS.

## Integrity checks

- Stage 2 source contains no `saveDB()`, IndexedDB, local/session-storage write, network, Supabase, transaction-function or direct `DB.stockRows` reference.
- Stage 2 uses `ZEZMS.managementIntelligence.getSelectedPeriodAggregate()` once per render.
- Stage 1's selected-period aggregate is exposed as a frozen array of frozen product objects.
- The v3.8.0 protected transaction/FIFO function slices remain byte-for-byte unchanged in v3.8.1.
- Database key remains `tradeflow_v321_zola`.
- No existing SQL file changed and no SQL file was added.
- No dependency was added.

## Timing-sensitive, skipped or failed tests

- Timing-sensitive: the Stage 1 Management Intelligence browser suite was run independently because it has previously shown resource contention when executed beside several browsers. It passed on its first v3.8.1 run.
- Skipped: none.
- Failed: none.

## Limitations

- A historical period without detailed `stockRows` cannot provide product-level margin analysis and therefore shows the established empty state.
- Implied COGS is analytical only. When recorded Total Sales and Gross Profit imply a negative cost, the derived cost cell is suppressed rather than treated as valid.
- Stage 2 supplies factual visibility only; it does not define acceptable margins, stock ageing, prices, discount limits or recommendations.

