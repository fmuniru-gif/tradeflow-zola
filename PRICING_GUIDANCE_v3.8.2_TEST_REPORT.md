# Pricing Guidance v3.8.2 test report

Build: `20260811-pricing-guidance-r35`

Result: **PASS**

## Stage 3A feature checks

All 45 mandatory feature checks passed:

1. Existing Dashboard opened with all 13 original KPI tiles.
2. Stage 1 rendered its existing cards and tables.
3. Stage 2 rendered its existing cards and tables.
4. Stage 3A rendered below Stage 2 without altering either earlier section.
5. Multiple current Product A rows aggregated into one product.
6. Total Remaining Stock Cost matched the sum of Remaining Qty × Unit Cost.
7. Weighted Remaining Cost/Unit matched Total Remaining Stock Cost ÷ Remaining Qty.
8. Product A's listed price matched the existing `getBaseUnitPrice()` result, including its last-open-month-row semantics.
9. Sale Out source remained byte-identical to v3.8.1.
10. Conflicting unresolved prices displayed `Multiple`.
11. Those conflicting values were not averaged or otherwise silently selected.
12. Missing and zero prices displayed safely as unavailable.
13. Reference Gross Profit/Unit matched Listed Price − Weighted Cost/Unit.
14. Reference Gross Margin matched Reference Gross Profit/Unit ÷ Listed Price.
15. Absolute headroom matched Listed Price − Weighted Cost/Unit.
16. Headroom % matched absolute headroom ÷ Listed Price.
17. Below-cost factual classification matched the recorded fixture.
18. At-cost classification matched an exact zero reference difference.
19. Above-cost classification matched a positive reference difference.
20. Products with Price Reference counted reliable prices correctly, including a product with unavailable cost.
21. Below-reference product count was correct.
22. Capital in Below-Reference Products summed associated remaining stock cost and was not treated as realised loss.
23. Ambiguous-price count was correct.
24. Current Pricing Position used below-first, margin, stock-cost and name sorting.
25. Largest Price Headroom used absolute headroom descending.
26. What-If product selection populated product ID, remaining quantity, weighted cost and current listed price.
27. A contemplated price produced the correct unit reference, margin and differences.
28. A contemplated price below weighted cost produced Below Cost Reference.
29. A contemplated price equal to weighted cost produced At Cost Reference.
30. A contemplated price above weighted cost produced Above Cost Reference.
31. Reset cleared product, contemplated price and calculated state.
32. Calculator interactions left the catalogue selling price unchanged.
33. A deep DB snapshot was unchanged after calculator interactions.
34. Calculator interactions produced zero `saveDB()` calls.
35. Stage 3A rendering left the DB snapshot unchanged.
36. Rendering and calculator interactions produced zero Cloud Sync notifications.
37. Repeated Dashboard rendering retained exactly one Stage 3A section.
38. Re-loading the Stage 3A script retained the same Dashboard wrapper.
39. Empty database rendered zero KPIs and friendly table states.
40. A malformed positive-remaining row did not crash the section.
41. A missing cost displayed `—` and did not receive a false below/at/above classification.
42. Numeric-string quantity, cost and price values calculated correctly.
43. Current Pricing Guidance remained on the August open period when the historical selector changed to July and June.
44. Stage 1 and Stage 2 followed the July/June historical selector changes independently.
45. A 390 × 844 portrait render kept both tables and the calculator inside the app width with no fixed Stage 3A element.

The feature fixture also verified missing Product ID/category, zero unit cost, zero price, zero remaining quantity exclusion, safe HTML escaping, inherited Dashboard permissions, absence of an independent route and the mandatory calculator safety notice.

## Mandatory critical regression checks

All checks 46–76 passed:

46. Sale Out and FIFO allocation.
47. Quick Sale.
48. Receipt creation.
49. Stock In.
50. Purchase Order save.
51. Purchase Order commit to stock.
52. Open Purchase Order cancellation.
53. VAT calculation.
54. Price Adjustment behaviour.
55. `0000` Price Adjustment and VAT safeguards.
56. Cash transactions.
57. Expense transactions.
58. Debtor operations.
59. Creditor/supplier operations.
60. Depositor operations.
61. Undo/reversal.
62. Invoice workflow/PDF.
63. Waybill workflow/PDF.
64. Automatic rollover.
65. Cloud Sync startup/API state.
66. Backup/restore controls.
67. Authentication and Owner/commercial separation markers.
68. Cashier restrictions.
69. Staff management/deletion safeguards.
70. Device enrolment/revocation safeguards.
71. Product search and Purchase Order catalogue creation.
72. Purchase Order, receipt, invoice and waybill PDF generation.
73. Installed-PWA offline startup with all three Intelligence modules.
74. Service-worker update/cache lifecycle and controlled offline reload.
75. Complete Stage 1 formula, aggregation, sorting, permission, empty-state and portrait suite.
76. Complete Stage 2 formula, aggregation, sorting, loss, permission, empty-state and portrait suite.

## Suite results

- Stage 3A Pricing Guidance focused browser suite: PASS.
- Stage 1 Management Intelligence suite: PASS.
- Stage 2 Margin & Pricing Intelligence suite: PASS.
- Account/Purchase Order/PDF feature suite: PASS.
- Document editing/transaction badge suite: PASS.
- Access-control/PIN/staff/device suite: PASS.
- Owner/commercial separation suite: PASS.
- Critical operational/offline lifecycle suite: PASS.

## Integrity controls

- `recordSaleOutFIFO()`, `quickSaleOut()`, Stock In and receipt-sale protected slices match v3.8.1 byte-for-byte.
- All existing JavaScript files are unchanged except active release references in `index.html`; Stage 1 and Stage 2 module files are byte-identical.
- Pricing Guidance has no `saveDB()`, storage-write, network, transaction-function or catalogue/stock mutation call.
- No SQL file changed or was added.
- Database key remains `tradeflow_v321_zola`.
- No dependency was added.

## Timing-sensitive, skipped and failed tests

- Timing-sensitive: the existing delayed authentication/device initializers can replace deterministic test DOM if a headless fixture is installed immediately after page parsing. The Stage 3A runner waits 1.2 seconds for those existing initializers before installing its fixture; all 45 checks then passed. Stage 1 and Stage 2 were also run independently because of their known multi-browser resource sensitivity, and both passed.
- Skipped: none.
- Final failed: none.

## Limitations

- Weighted remaining cost is a current stock-cost reference, not FIFO COGS or a complete commercial cost.
- Missing cost in any positive-remaining tier suppresses product cost and classification rather than using a partial cost.
- Existing Sale Out price semantics are product-name and open-month-row-order dependent; Stage 3A reports their result without changing that architecture.
- No overhead allocation, target margin, price policy, discount policy, recommendation, warning or enforcement is included.

