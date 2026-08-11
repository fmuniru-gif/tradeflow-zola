# ZEZMS TradeFlow Owner Edition v3.8.0

Current build: `20260811-management-intelligence-r33`

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
- Purchase-order product search by name or ID, direct catalog-product creation and an icon in the main navigation
- Cost-only purchase-order lines and documents; products created through Purchase Orders require both cost and selling prices in the catalog
- Safe editing of open purchase orders, open invoices, active waybills and current-period active receipts
- Persisted remote-transaction counter with a top-bar badge and installed-PWA app-icon badge where supported
- Read-only Management Intelligence beneath the existing Dashboard, including stock-capital concentration, no-sale stock, sell-through, gross margin and best-mover analysis for the selected period

## Credentials

No default staff passwords or administrator credentials are distributed with this release. Create or recover the Owner through the verified **Owner recovery / first setup** workflow, then add staff from Settings.

The fixed `0000` Price Adjustment/VAT PIN is an operator-entry safeguard requested for this deployment. It is not an authentication boundary and must not replace Owner/Admin authorization for commercial security decisions.

## GitHub Pages deployment

1. Back up the working device and confirm Cloud Sync has no queued transactions.
2. Extract the complete release ZIP.
3. Upload the extracted contents to the repository root, preserving the complete `js/` folder.
4. Replace the existing `index.html`, `manifest.json`, `sw.js`, `FORCE_UPDATE_MOBILE.html`, and all matching JavaScript files.
5. Do not upload only the ZIP; GitHub Pages does not extract it.
6. Wait for deployment, close all old tabs/PWA windows, and reopen the app.
7. Confirm the page source build is `20260811-management-intelligence-r33`.
8. Open Purchase Orders and verify that product search, supplier selection and the Edit action load.
9. Open Dashboard and confirm **Management Intelligence** appears beneath the existing KPI, Quick Actions and Cash Wallet sections.
10. When using an installed PWA, confirm that the bell counter is visible in the top bar.

## Supabase prerequisites

The existing deployment requires the M5A-1, M5A-2 and M5A-3 SQL migrations already included in this package. v3.8.0 adds no new SQL migration. Do not rerun completed migrations on a live database without first taking a verified backup.

## Commercialisation boundary

Do not onboard unrelated paying businesses into one production Supabase project yet. Operational sync state, operation logs and concurrency counters remain primarily `owner_id`-scoped. Complete and verify the planned `business_id` tenant-data migration before using a shared multi-tenant backend.

See `COMMERCIALISATION_ROADMAP_M5.md`, `COMMERCIAL_READINESS_EVALUATION_v1.md`, and `COMMERCIALISATION_CONTINUATION_PLAN_v2.md`.

## Upgrade compatibility

v3.8.0 intentionally keeps the existing Owner Edition browser database key so an in-place upgrade retains current records. Management Intelligence derives its figures in memory from selected-period stock rows and does not save or modify them. Take a verified backup before deployment. The service-worker cleanup is scoped so it does not remove the separately developed commercial-pilot cache or browser database.

Receipt financial edits are limited to active receipts in the current open stock period because those records still have safely reversible FIFO details. Committed purchase orders, sold invoices, void documents and historical receipts are protected from editing.

The app-icon badge is updated from M4 remote transactions when the app is running and syncing, and its unread count persists across restarts. Fully closed push notifications would require a separate web-push service and are outside the unchanged Owner Edition architecture.
