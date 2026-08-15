# ZEZMS TradeFlow Owner Edition v3.12.0

Current build: `20260815-customer-master-print-readiness-r45`

This is the maintenance fork for the Owner Edition. The frozen v3.7.0 r29 package is retained separately and is not modified by this release.

## Current capabilities

- Offline-first sales, FIFO inventory, receipts, accounts and KPI reporting
- Invoice, waybill and configurable sale VAT calculations
- Automatic month rollover and transaction-level Cloud Sync M4
- Local and Google Drive backup/restore
- Commercial tenant, branch, role, device and audit foundations
- Shared-device staff access using salted PBKDF2 password hashes
- Secure one-use device enrollment with independent device identities
- Enrolled-device revocation
- Debtor, Creditor and Depositor dropdown filtering with a clear-to-show-all option
- Purchase orders with supplier management, part-payment posting, creditor balances, FIFO stock commit and reversible open-order cancellation
- Printable purchase orders and offline PDF downloads for purchase orders, receipts, invoices and waybills
- A5 receipt, invoice and waybill output with the packaged Zola logo watermark and an APPROVED mark at the authorised signature area
- Purchase-order product search by name or ID, direct catalog-product creation and an icon in the main navigation
- Cost-only purchase-order lines and documents; products created through Purchase Orders require both cost and selling prices in the catalog
- Safe editing of open purchase orders, open invoices, active waybills and current-period active receipts
- Persisted remote-transaction counter with a top-bar badge and installed-PWA app-icon badge where supported
- Click/tap business navigation grouped under Sales, Purchases, Stock, Finance and Management, with Undo Transactions kept standalone
- Dashboard KPIs now contains only the established Dashboard content; each intelligence stage opens directly from the Management submenu
- Read-only Management Intelligence, including stock-capital concentration, no-sale stock, sell-through, gross margin and best-mover analysis for the selected period
- Read-only Margin & Pricing Intelligence using realised sales and recorded gross profit, including gross-loss visibility, realised unit economics and sales/profit contribution analysis
- Read-only, advisory Current Stock Pricing Guidance with weighted remaining-cost references, factual price-position visibility and a runtime-only What-If Calculator
- Runtime-only Pricing Policy Lab for target gross-margin scenarios, additional business-cost allowances, contemplated-price comparisons and a read-only current-stock portfolio preview
- Isolated New Product mode for landed-cost, advisory-price, market-price, batch-profit and capital-efficiency simulation before a catalogue product, Stock In record or Purchase Order exists
- Read-only Stock Velocity & Reorder Planning Lab with 30/60/90-day sales windows, current-stock movement tables, open-PO-aware inventory position and runtime-only reorder scenarios
- Read-only Portfolio Signals & Capital Allocation Intelligence with relative ranks, quartiles, overlapping attention signals, reference contribution pace and reference capital-productivity views
- Read-only Customer Relationship Intelligence with conservative phone-first/exact-name identity, repeat-customer measures, unidentified-sales coverage, recency, concentration, search and customer product/category purchase summaries
- Optional normal and Quick Sale customer/source capture using a controlled Sales Source list, prospective Walk-in default, historical Unspecified fallback and Other Source detail
- Read-only Sales Channel Intelligence with channel sales/share, average transaction value, identification coverage, distinct customers, repeat-customer measures, Digital/Remote results and customer channel breakdowns
- Scoped high-contrast Customer Relationship Intelligence and Stage 5B form controls for desktop and portrait/mobile use
- One unified Sale Out **Customer & Source** control set shared by Print Receipt and Quick Sale
- Blocking Customer Name and Telephone presence checks for new Print Receipt sales, while Quick Sale identity remains optional
- Owner/Admin-only persistent Customer Master with explicit, previewed and idempotent history import
- Phone-first customer identity, stable non-phone-revealing Customer IDs, editable profile/location/notes and no fuzzy merge or delete
- Transaction-derived Customer Master purchase history, lifetime sales, recency, product/category and Sales Source summaries
- Sale Out **Find Customer**, exact-phone recognition and post-commit Customer Master upsert for valid receipt/phone-identified Quick Sales
- JSON-operation Customer Master Cloud Sync and backup/restore support without a new SQL migration
- Settings-based wireless/network print readiness guidance and an offline A5 system-dialog test page

## Credentials

No default staff passwords or administrator credentials are distributed with this release. Create or recover the Owner through the verified **Owner recovery / first setup** workflow, then add staff from Settings.

The fixed `0000` Price Adjustment/VAT PIN is an operator-entry safeguard requested for this deployment. It is not an authentication boundary and must not replace Owner/Admin authorization for commercial security decisions.

## GitHub Pages deployment

1. Back up the working device and confirm Cloud Sync has no queued transactions.
2. Extract the complete release ZIP.
3. Upload the extracted contents to the repository root, preserving the complete `assets/` and `js/` folders.
4. When upgrading directly from verified v3.11.1, replace `index.html`, `manifest.json`, `sw.js`, `FORCE_UPDATE_MOBILE.html`, `README.md`, `RELEASE_FILE_MANIFEST.json`, `js/operations-update.js`, `js/cloud-sync.js`, `js/backup-manager.js`, and `js/navigation-v3101.js`; add `js/customer-master-v3120.js`, `js/print-readiness-v3120.js`, `CUSTOMER_MASTER_PRINT_READINESS_v3.12.0_RELEASE_NOTES.md`, and `CUSTOMER_MASTER_PRINT_READINESS_v3.12.0_TEST_REPORT.md`. Preserve these paths exactly—JavaScript files belong inside `js/`.
5. Do not upload only the ZIP; GitHub Pages does not extract it.
6. Wait for deployment, close all old tabs/PWA windows, and reopen the app.
7. Confirm the page source build is `20260815-customer-master-print-readiness-r45`.
8. Open Purchase Orders and verify that product search, supplier selection and the Edit action load.
9. Open each grouped navigation item by click/tap, confirm another group closes the first, and confirm child selection closes the sidebar on mobile.
10. Open **Management → Dashboard KPIs** and confirm it contains the original KPI, Quick Actions and Cash Wallet content without appended intelligence sections.
11. Open **Management → Margin & Pricing Intelligence** and **Management → Current Stock Pricing Guidance** directly; confirm the latter remains tied to current open stock when the historical Dashboard month changes.
12. Open **Management → Pricing Policy Lab**, calculate a temporary scenario, and confirm **Reset Policy Lab** clears all fields and results.
13. Switch the Lab to **New Product**, calculate a temporary landed-cost scenario, then confirm **Reset New Product Scenario** restores the blank/default state.
14. Open **Management → Stock Velocity & Reorder Planning**, confirm it defaults to 90 days, and confirm reorder guidance remains hidden until lead-time and target-coverage inputs are supplied.
15. Enter a temporary reorder scenario, confirm open uncommitted purchase-order quantities appear once, then use **Reset** and verify the planning result disappears without changing any purchase order.
16. Open **Management → Portfolio Signals & Capital Allocation** directly, confirm it follows the Stage 4A 30/60/90-day lookback, and confirm it contains no independent lookback selector.
17. Confirm portfolio badges, ranks and capital-exposure tables are read only, then verify a valid Stage 4A scenario supplies Suggested Reorder Qty to Stage 4B and resetting the scenario clears it.
18. When using an installed PWA, confirm that the bell counter is visible in the top bar.
19. Open **Management → Customer Relationship Intelligence** directly, confirm it defaults to **Last 365 days**, and switch among 30/90/180/365 days and All Available History without changing the historical Dashboard month.
20. Verify a customer search and purchase summary, then close and reopen Dashboard to confirm the runtime-only search/window selection does not modify any customer or transaction record.
21. Open a receipt, invoice and waybill; confirm each A5 preview and print/PDF output shows the faint full-page logo and the APPROVED stamp without obscuring content.
22. Test once offline after the updated service worker has activated; confirm the same local watermark asset appears.
23. Open Sale Out and confirm normal and Quick Sale Sales Source defaults to Walk-in, Other reveals Other Source, and blank customer identity remains optional.
24. Complete controlled test sales, then open **Management -> Customer Relationship Intelligence**; confirm its inputs are readable and Sales Channel Intelligence follows the same Customer-history window.
25. Confirm Sale Out shows one **Customer & Source** section. Print Receipt must reject a blank Customer Name or Telephone without changing the cart or stock; Quick Sale must still accept either or both fields blank.
26. Open **Management → Customer Master**, review the Sales History build preview, confirm the import deliberately, and run it twice to confirm the second run creates no duplicates.
27. In Sale Out, use **Find Customer** and exact telephone recognition; confirm customer selection fills only Name, Telephone and compatible Location without changing Sales Source, cart, price, discount or VAT.
28. Open **Settings → Printing & Wireless Printer Readiness**, run **Print A5 Test Page**, and confirm the operating-system print dialog shows an A5 portrait page with alignment marks, watermark and sample APPROVED stamp.

## Supabase prerequisites

The existing deployment requires the M5A-1, M5A-2 and M5A-3 SQL migrations already included in this package. v3.12.0 adds no new SQL or Supabase migration: `DB.customers` is carried by the existing M4 JSON payload/operation store. Do not rerun completed migrations on a live database without first taking a verified backup.

## Commercialisation boundary

Do not onboard unrelated paying businesses into one production Supabase project yet. Operational sync state, operation logs and concurrency counters remain primarily `owner_id`-scoped. Complete and verify the planned `business_id` tenant-data migration before using a shared multi-tenant backend.

See `COMMERCIALISATION_ROADMAP_M5.md`, `COMMERCIAL_READINESS_EVALUATION_v1.md`, and `COMMERCIALISATION_CONTINUATION_PLAN_v2.md`.

## Upgrade compatibility

v3.12.0 intentionally keeps the existing Owner Edition browser database key `tradeflow_v321_zola`, adding only a backward-compatible `DB.customers` profile collection. Old databases and backups without that property initialise it as an empty array. Customer Master import is explicit and never rewrites historical sales; all relationship and financial metrics remain derived from active completed receipts and Quick Sales. Print Receipt still validates Name and Telephone before transaction work, and Quick Sale identity remains optional. Customer profile upsert runs only after the financial save and is separately guarded so CRM failure cannot undo a completed sale. The existing A5 production print functions are not routed through the new adapter in this release, avoiding document regression risk. FIFO, document calculations, branding, grouped navigation, `0000` entry safeguards, Stage 1–5B formulas and operational workflows remain unchanged. Take a verified backup before deployment.

Receipt financial edits are limited to active receipts in the current open stock period because those records still have safely reversible FIFO details. Committed purchase orders, sold invoices, void documents and historical receipts are protected from editing.

The app-icon badge is updated from M4 remote transactions when the app is running and syncing, and its unread count persists across restarts. Fully closed push notifications would require a separate web-push service and are outside the unchanged Owner Edition architecture.
