# New Product Pricing Simulator v3.8.4 test report

Build: `20260811-new-product-pricing-r37`

Result: **PASS**

## Stage 3B.1 feature checks

All 58 mandatory checks passed:

1. Existing Dashboard opened with all 13 original KPI tiles.
2. Stage 1 remained intact.
3. Stage 2 remained intact.
4. Stage 3A remained intact.
5. Existing Product Pricing Lab remained intact and was the default mode.
6. New Product mode appeared inside the protected Owner/Admin Dashboard with no independent route; restricted-cashier access was denied.
7. Switching modes preserved both in-page scenarios independently.
8. An arbitrary uncatalogued product description was accepted and escaped safely.
9. No catalogue product was created.
10. No Product ID was allocated.
11. No stock row was created or changed.
12. No Stock In record was created.
13. No Purchase Order or supplier entry was created.
14. Quantity defaulted to 1.
15. Quantity zero was rejected.
16. Negative and unsupported fractional quantities were rejected.
17. Supplier Unit Cost calculated/displayed correctly.
18. Batch acquisition-cost allocation was correct.
19. Landed Unit Cost was correct.
20. Additional Business Cost / Unit was correct.
21. Adjusted Reference Cost was correct.
22. A 0% target margin worked.
23. Negative margin was rejected.
24. A 100% margin was rejected.
25. Margin above 100% was rejected.
26. Advisory Selling Price used the gross-margin formula and displayed exact normal currency precision without invented rounding.
27. Projected GP / Unit was correct.
28. Projected Batch GP was correct.
29. Projected Batch Sales was correct.
30. Supplier Purchase Cost and Total Landed Batch Cost were correct.
31. Market Price GP / Unit was correct.
32. Market Price Gross Margin was correct.
33. Market-vs-Advisory gap and status were correct.
34. Market-price batch GP was correct.
35. Market Price below Adjusted Cost displayed the factual Below Adjusted Cost Reference condition.
36. Contemplated GP / Unit was correct.
37. Contemplated margin was correct.
38. Contemplated Batch GP was correct.
39. Contemplated-vs-Advisory gap was correct.
40. Contemplated-vs-Market gap was correct.
41. Projected GP per GH₵1,000 Landed Capital was correct.
42. Market-price GP per GH₵1,000 was correct.
43. Reset restored every required blank/default input and hid results.
44. Reset did not modify DB.
45. A real page refresh did not persist the New Product scenario or its unique test values in localStorage.
46. Navigation away and back did not persist the scenario.
47. Simulator activity produced zero `saveDB()` calls.
48. Simulator activity produced zero Cloud Sync notifications.
49. Simulator activity produced zero VAT helper calls and did not replace the VAT function.
50. Sale Out and Quick Sale sources/collections were unchanged.
51. Stock In source/collections were unchanged.
52. Purchase Order module identity and order/supplier collections were unchanged.
53. Existing Product mode retained its verified weighted-cost/advisory calculation.
54. No `NaN` appeared for blank, zero, near-100%, malformed or very-large scenarios.
55. No `Infinity` appeared; numeric overflow produced a validation state and blank results.
56. A 390 × 844 portrait render stayed within app width, stacked inputs safely and added no fixed element.
57. Repeated Dashboard rendering retained one Lab, one mode selector and one New Product panel.
58. Re-loading the script retained the same Dashboard wrapper and one module installation.

The runner also verified the visible runtime-only/no-creation notice, VAT-basis notice, gross-margin precision, market/advisory factual statuses, zero market/contemplated prices, missing supplier cost, malformed numeric input, capital-efficiency limitation, absence of a public route and safe arbitrary product text.

## Mandatory regression checks

All checks 59–91 passed:

59. Sale Out/FIFO.
60. Quick Sale.
61. Receipts and receipt PDF.
62. Stock In.
63. Purchase Order save.
64. Purchase Order commit.
65. Purchase Order cancel.
66. VAT.
67. Price Adjustment.
68. Fixed `0000` safeguards.
69. Cash.
70. Expenses.
71. Debtors.
72. Creditors/suppliers.
73. Depositors.
74. Undo/reversal.
75. Invoices/editing/PDF.
76. Waybills/editing/PDF.
77. Automatic rollover.
78. Cloud Sync.
79. Backup/restore.
80. Authentication and Owner/commercial separation.
81. Cashier restrictions.
82. Staff management/deletion.
83. Device enrollment/revocation.
84. Product search and Purchase Order product creation.
85. Purchase Order, receipt, invoice and waybill PDF generation.
86. Installed-PWA offline startup with all five staged pricing-intelligence modules.
87. Service-worker install/update/cache lifecycle and controlled offline reload.
88. Complete Stage 1 suite.
89. Complete Stage 2 suite, 35 checks.
90. Complete Stage 3A suite, 45 checks.
91. Complete Stage 3B Existing Product suite, 55 checks.

## Browser suite results and observed wall times

- Stage 3B.1 New Product, 58 checks: PASS, 10.4 seconds.
- Stage 1 Management Intelligence: PASS, 5.5 seconds on the required isolated rerun.
- Stage 2 Margin & Pricing Intelligence, 35 checks: PASS, 26.6 seconds in the five-browser parallel batch.
- Stage 3A Pricing Guidance, 45 checks: PASS, 25.8 seconds in that batch.
- Stage 3B Existing Product, 55 checks: PASS, 27.7 seconds in that batch.
- Access/PIN/staff/device regression: PASS, 26.4 seconds in that batch.
- Account/Purchase Order/PDF feature suite: PASS, 19.3 seconds in the four-browser batch.
- Editing/transaction badge suite: PASS, 19.2 seconds in that batch.
- Owner/commercial separation: PASS, 19.5 seconds in that batch.
- Critical transaction/offline/service-worker lifecycle: PASS, 19.5 seconds in that batch.

## Static, protected, offline and integrity verification

- 43/43 external JavaScript targets passed syntax validation: 42 files in `js/` plus `sw.js`.
- 6/6 executable inline `index.html` scripts passed syntax validation.
- All 39 local scripts referenced by `index.html` resolve; the one pinned pre-existing Supabase CDN script is unchanged.
- All 42 service-worker assets resolve locally.
- Load order is Stage 1, Stage 2, Stage 3A, Stage 3B, then Stage 3B.1.
- Cache identity is `zezms-new-product-pricing-20260811-r37`.
- All 41 JavaScript files inherited from v3.8.3 are byte-for-byte unchanged, including `pricing-policy-lab-v383.js` SHA-256 `40e0b902feaad713fe409d188e47e9431105595481a70759ffc58dc8badaf321`.
- After normalizing only v3.8.4 identity markers and removing the new script tag, `index.html` is byte-for-byte identical to v3.8.3.
- All 10 SQL files are unchanged; no SQL file was added.
- New module static scan found no database, storage, network, save, transaction, stock, Purchase Order or Cloud Sync reference.
- Database key remains `tradeflow_v321_zola`.
- Release-manifest and ZIP payload hashes were regenerated from the final release and independently revalidated.

## Timing-sensitive, skipped and failed tests

- Timing-sensitive: Stage 1 first ran in a five-browser parallel batch and reached its aggregate assertion before the fixture stabilized, failing after 27.4 seconds. The identical unmodified runner was rerun alone and passed in 5.5 seconds. No assertion, timeout or product code was weakened.
- Timing-sensitive: deterministic analytical fixtures wait 1.2 seconds for the app's existing delayed authentication/device initializers. Historical fixtures include the already-completed August rollover marker so the scheduled rollover check cannot change their selected period.
- Timing-sensitive: offline lifecycle waits for the active service worker, verifies all five staged modules in cache, waits for a controlling worker and then performs a real offline reload. It passed in 19.5 seconds.
- Skipped: none.
- Final failed: none.

## Limitations

- Every input is a temporary Owner assumption; no supplier quote, freight amount, market price or demand forecast is independently verified.
- The simulator has no demand, sell-through, product velocity or time-to-sale data for a genuinely new product.
- GP per GH₵1,000 of landed capital is not time-adjusted and is not ROI.
- VAT is not recalculated; inputs must use a consistent tax basis.
- No automatic price rounding, purchase recommendation, product creation, persistent policy, Sale Out warning or enforcement is included.
- Stage 3C is not implemented.
