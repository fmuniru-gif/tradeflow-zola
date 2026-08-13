# ZEZMS TradeFlow Owner Edition v3.10.1

Release: **Navigation Reorganisation & Entry Safeguard Restoration**  
Build: `20260813-navigation-entry-guard-r41`  
Database key: `tradeflow_v321_zola`

## What changed

The sidebar now uses click/tap groups that follow the business workflow:

- **Sales:** Sale Out, Sales Records, Invoices, Waybills
- **Purchases:** Stock In, Purchase Orders
- **Stock:** Products, Stock Balance
- **Finance:** Cash Balances, Expenses, Accounts
- **Management:** Dashboard KPIs, KPI Bar Charts, Reports, Management Intelligence, Margin & Pricing Intelligence, Current Stock Pricing Guidance, Pricing Policy Lab, Stock Velocity & Reorder Planning, Portfolio Signals & Capital Allocation, Customer Relationship Intelligence
- **Undo Transactions:** remains a standalone top-level item
- **System:** the existing Sync / Backup, Settings, staff-switch/Admin Mode and Logout controls remain available under the existing permission rules

Desktop and mobile use the same accessible click/tap behavior. One group is open at a time; clicking an open parent closes it, opening another closes the first, selecting a child closes the submenu/sidebar, clicking outside closes an open group, and both the active group and selected child are marked. The active parent also displays the selected child label when collapsed. No navigation state is stored in the database.

## Direct Management views

`js/navigation-v3101.js` supplies one Management registry and one content host. The module captures the verified v3.10.0 Dashboard render chain, then:

1. removes the registered intelligence sections from the Dashboard KPI output; and
2. extracts and mounts only the requested registered intelligence section for a direct Management route.

The original Dashboard KPI cards, period selector, Quick Actions, Cash Wallets and other original Dashboard content remain on Dashboard KPIs.

The Stage 4B route uses the existing Stage 4B refresh hook when a Stage 4A snapshot already exists. This preserves the active 30/60/90-day Stage 4A window and temporary reorder snapshot instead of resetting the linkage while navigating.

No existing intelligence JavaScript file was changed. All eight intelligence files are byte-identical to the protected v3.10.0 baseline, so their formula bodies and calculation engines remain unchanged:

- `management-intelligence-v380.js`
- `margin-intelligence-v381.js`
- `pricing-guidance-v382.js`
- `pricing-policy-lab-v383.js`
- `new-product-pricing-v384.js`
- `stock-velocity-v390.js`
- `portfolio-signals-v391.js`
- `customer-intelligence-v3100.js`

## Price Adjustment and VAT entry guard

One narrowly scoped code-level constant now names the intended control clearly:

`TRANSACTION_ENTRY_GUARD_PIN = '0000'`

Price Adjustment and VAT entry both force the existing direct-PIN prompt path. They do not call shared-device staff re-authentication, an Administrator password, an Owner password or MFA. Wrong PIN and Cancel leave the field locked and its value unchanged. Correct `0000` unlocks only the selected transaction-entry control according to the existing Sale Out workflow.

`0000` is accidental-entry prevention, not authentication. It is not used for login, Admin Mode, staff administration, deletion, recovery, device management, device enrollment/revocation, MFA, Sync, backup/restore or other protected operations. Genuine Owner/Admin security is unchanged.

Price Adjustment mathematics, VAT mathematics, catalogue/listed prices, discounts, receipt/invoice treatment, FIFO and stock values are unchanged.

## Offline maintenance

The service-worker cache was advanced to `zezms-navigation-entry-guard-20260813-r41` and now includes `js/navigation-v3101.js`. A pre-existing promise-chain error in the navigation fallback was corrected so an uncached offline navigation can reach the cached `index.html` fallback.

## Compatibility and migrations

- No database migration
- No database-key change
- No SQL migration
- No Supabase migration
- No change to FIFO or operational record formats
- No Stage 5B, Customer Master, sales-channel capture, customer messaging, ABC classification, automatic Purchase Orders or automatic repricing

## Files added

- `js/navigation-v3101.js`
- `NAVIGATION_ENTRY_GUARD_v3.10.1_RELEASE_NOTES.md`
- `NAVIGATION_ENTRY_GUARD_v3.10.1_TEST_REPORT.md`

## Active files modified

- `index.html`
- `manifest.json`
- `sw.js`
- `FORCE_UPDATE_MOBILE.html`
- `README.md`
- `RELEASE_FILE_MANIFEST.json` (generated after final verification)

## GitHub Pages upgrade from verified v3.10.0

Upload these files at the same repository paths:

1. `index.html`
2. `manifest.json`
3. `sw.js`
4. `FORCE_UPDATE_MOBILE.html`
5. `js/navigation-v3101.js` — it must be inside the repository's existing `js/` folder
6. `README.md`
7. `RELEASE_FILE_MANIFEST.json`
8. `NAVIGATION_ENTRY_GUARD_v3.10.1_RELEASE_NOTES.md`
9. `NAVIGATION_ENTRY_GUARD_v3.10.1_TEST_REPORT.md`

Uploading the complete extracted v3.10.1 package is also safe. When using the selected-file method, the other v3.10.0 JavaScript files must remain in place because they are unchanged dependencies.
