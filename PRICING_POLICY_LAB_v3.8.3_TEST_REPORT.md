# Pricing Policy Lab v3.8.3 test report

Build: `20260811-pricing-policy-lab-r36`

Result: **PASS**

## Stage 3B feature checks

All 55 mandatory focused checks passed:

1. Existing Dashboard opened with all 13 original KPI tiles.
2. Stage 1 remained intact.
3. Stage 2 remained intact.
4. Stage 3A remained intact.
5. Pricing Policy Lab loaded beneath Stage 3A with its runtime-only notice.
6. The Lab inherited Owner/Admin-only Dashboard access and created no independent route.
7. Product selection reused the same frozen Stage 3A current-stock aggregate.
8. Weighted Remaining Cost matched Stage 3A.
9. Listed Price matched Stage 3A.
10. Blank margin produced no advisory price or preview.
11. A 0% margin produced an advisory price equal to adjusted cost.
12. Negative margin was rejected.
13. A 100% margin was rejected.
14. Margin above 100% was rejected.
15. Decimal margin calculated correctly.
16. Additional Business Cost/Unit defaulted to zero.
17. Negative additional cost was rejected.
18. Adjusted Reference Cost was correct.
19. Advisory Policy Price used the gross-margin formula correctly.
20. Current Price Gap and percentage were correct.
21. Current scenario GP/Unit was correct.
22. Current scenario Margin was correct.
23. Above Temporary Policy Price status was correct.
24. At Temporary Policy Price status was correct.
25. Below Temporary Policy Price status was correct.
26. Missing listed price still allowed a cost-based advisory price and suppressed current comparisons.
27. Multiple listed prices still allowed a cost-based advisory price and suppressed current comparisons.
28. Contemplated GP/Unit was correct.
29. Contemplated margin was correct.
30. Contemplated-vs-policy difference was correct.
31. Contemplated-vs-current-price difference was correct.
32. Portfolio preview used the same margin and cost allowance.
33. Portfolio preview did not save or mutate its results.
34. Below-policy KPI count was correct.
35. Capital Below Policy KPI was correct.
36. Above/At-policy count was correct.
37. Unresolved-price KPI was correct.
38. Portfolio sorting was correct.
39. Reset cleared all runtime controls, result, KPI and preview state.
40. Reset did not alter the database.
41. Navigation away cleared and did not save Lab state.
42. A real page reload did not persist Lab state or its unique test values in localStorage.
43. Lab activity produced zero `saveDB()` calls.
44. Lab activity produced zero Cloud Sync notifications.
45. Product selling prices remained unchanged.
46. Sale Out/FIFO and Quick Sale functions and operational collections remained unchanged.
47. Discount UI and calculation function sources remained unchanged.
48. Repeated Dashboard rendering retained one Lab section.
49. Re-loading the module retained the same Dashboard wrapper.
50. A 390 × 844 portrait render remained inside the app width, kept the table in `table-wrap` and introduced no fixed element.
51. Empty current stock rendered safely.
52. A malformed positive-remaining row did not crash the Lab.
53. Missing weighted cost displayed `—` without a false advisory price.
54. No `NaN` or `Infinity` appeared, including zero contemplated price and 99.99% margin.
55. Changing the historical Dashboard selection to an empty June period did not change Stage 3B's August current-stock basis.

The feature runner also verified the mandatory gross-margin/markup explanation, flat-allowance warning, factual status vocabulary, full-precision preview values, one-pesewa comparison behavior, frozen aggregate identity and absence of a cashier-accessible shortcut.

## Critical regression checks

All required checks 56–87 passed:

56. Sale Out/FIFO allocation.
57. Quick Sale.
58. Receipt creation and receipt PDF.
59. Stock In.
60. Purchase Order save.
61. Purchase Order commit to stock.
62. Open Purchase Order cancellation.
63. VAT calculation.
64. Price Adjustment behavior.
65. Fixed `0000` Price Adjustment/VAT safeguards.
66. Cash transactions.
67. Expense transactions.
68. Debtor operations/filtering.
69. Creditor/supplier operations/filtering.
70. Depositor operations/filtering.
71. Undo/reversal.
72. Invoice workflow, editing and PDF.
73. Waybill workflow, editing and PDF.
74. Automatic month rollover.
75. Cloud Sync startup/API and transaction path.
76. Backup/restore controls.
77. Authentication and Owner/commercial separation markers.
78. Cashier restrictions.
79. Staff management/deletion safeguards.
80. Device enrollment/revocation safeguards.
81. Product search and Purchase Order catalogue creation.
82. Purchase Order, receipt, invoice and waybill PDF generation.
83. Installed-PWA offline startup with Stages 1, 2, 3A and 3B.
84. Service-worker install/update/cache lifecycle and controlled offline reload.
85. Complete Stage 1 feature/regression suite.
86. Complete Stage 2 feature/regression suite.
87. Complete Stage 3A feature/regression suite.

## Browser suite results and observed wall times

- Stage 3B Pricing Policy Lab, 55 checks: PASS, 11.0 seconds.
- Stage 1 Management Intelligence: PASS, 19.6 seconds while run in the four-suite parallel batch.
- Stage 2 Margin & Pricing Intelligence, 35 checks: PASS, 19.8 seconds in that batch.
- Stage 3A Pricing Guidance, 45 checks: PASS, 19.7 seconds in that batch.
- Access/PIN/staff/device regression: PASS, 19.5 seconds in that batch.
- Account/Purchase Order/PDF feature suite: PASS, 21.4 seconds while run in the four-suite parallel batch.
- Document editing/transaction badge suite: PASS, 21.6 seconds in that batch.
- Owner/commercial separation suite: PASS, 21.0 seconds in that batch.
- Critical transaction/offline/service-worker lifecycle suite: PASS, 21.1 seconds in that batch.

## Static, offline and integrity verification

- New module and every existing external JavaScript file passed syntax validation.
- Every executable inline `index.html` script passed syntax validation.
- Every local service-worker asset resolves to a packaged file, including `pricing-policy-lab-v383.js`.
- Script load order is Stage 1, Stage 2, Stage 3A, then Stage 3B.
- Service-worker cache identity is `zezms-pricing-policy-lab-20260811-r36`.
- Manifest/start URL, force-update URL, page metadata and active query strings use build r36.
- No old active r35 release marker remains in active release/runtime metadata; Stage 3A's internal component build correctly remains r35.
- All 40 JavaScript files inherited from v3.8.2 are byte-for-byte unchanged.
- After normalizing only v3.8.3 identity markers and removing the new script tag, `index.html` is byte-for-byte identical to v3.8.2. This protects FIFO, Sale Out, Quick Sale, Stock In, Purchase Orders, receipts, VAT, Price Adjustment, account and Cloud Sync logic.
- No SQL file changed and no SQL file was added.
- Database key remains `tradeflow_v321_zola`.
- Release-manifest hashes and ZIP entries were regenerated from the final payload and independently revalidated.

## Timing-sensitive, skipped and failed tests

- Timing-sensitive: the feature runner waits 1.2 seconds for the existing delayed authentication/device initializers before installing its deterministic fixture. The fixture carries the already-completed August rollover marker so the app's scheduled rollover check cannot alter the deliberately historical Dashboard selection during the runtime-only mutation assertion.
- Timing-sensitive: offline startup waits for the active service worker, verifies all four staged modules are cached, waits for a controlling worker, then performs a real offline reload. It passed in the 21.1-second lifecycle suite.
- Stage 3A test maintenance: its Reset locator was narrowed to the exact existing `Reset` name because the new `Reset Policy Lab` control correctly created a second partial-name match. No behavior assertion was removed or weakened.
- Skipped: none.
- Final failed: none.

## Limitations

- Weighted remaining cost is a current-stock analytical reference, not FIFO COGS or a complete commercial cost.
- A single flat additional cost per unit may not fit products with materially different delivery, handling, installation, warranty or marketing exposure.
- Missing cost suppresses cost-dependent advice; unavailable/Multiple listed prices suppress current-price comparisons.
- The Lab does not consider market demand, competitor prices, taxes outside existing listed-price semantics or a full overhead-allocation methodology.
- No policy persistence, category defaults, permanent product margins, Sale Out warning, price floor, block or enforcement is included.
