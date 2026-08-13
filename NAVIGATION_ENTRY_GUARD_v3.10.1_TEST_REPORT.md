# ZEZMS TradeFlow Owner Edition v3.10.1 Test Report

Release: **Navigation Reorganisation & Entry Safeguard Restoration**  
Build: `20260813-navigation-entry-guard-r41`  
Protected comparison baseline: v3.10.0 / `20260812-customer-intelligence-r40`

## Result summary

- Navigation checklist 1–66: **PASS**
- Intelligence checklist 67–78: **PASS**
- `0000` safeguard checklist 79–100: **PASS**
- Operational checklist 101–130: **PASS by protected-code equivalence, non-mutating route smoke, focused runtime checks, and service-worker tests**
- JavaScript syntax: **PASS**
- Mobile/portrait: **PASS**
- Release manifest and ZIP integrity: recorded after packaging below
- Failed required checks: **0**

The verification browser used a temporary isolated QA shell and an empty local database. It did not modify a live business database or send data to Supabase.

## 1–66 Navigation

The rendered registry contained exactly five business groups in the required order and 21 child routes in the required subgroup order. Undo Transactions rendered once as a standalone top-level item. Sync / Backup, Settings, staff switch/Admin Mode and Logout remained present.

Observed desktop behavior:

- click opens a group;
- a second click closes it;
- opening Purchases closed Sales;
- child selection closed the group;
- clicking outside closed the group;
- active parent, active child and collapsed current-child label all matched the selected route;
- reloading `navigation-v3101.js` left exactly 5 groups, 21 children, 1 Undo button and 1 style block.

All direct and established routes rendered non-empty content without `Unknown view` or `View could not open`: Sale Out, Sales Records, Invoices, Waybills, Stock In, Purchase Orders, Products, Stock Balance, Cash Balances, Expenses, Accounts, Dashboard KPIs, KPI Bar Charts, Reports, Undo Transactions, Sync / Backup and Settings.

Each of the seven direct intelligence routes rendered exactly one registered analytical section and one direct Management host. Dashboard KPIs retained its KPI grid, Quick Actions and Cash Wallets and contained zero appended intelligence sections.

Mobile viewport result:

- Sales, Purchases, Stock, Finance and Management all opened by tap;
- each tested child was visible and tappable;
- child selection closed the mobile sidebar;
- layout marker was `phone-portrait`;
- body/html scroll width remained below the viewport width;
- no body-wide horizontal overflow was detected.

Permission check: an ordinary CASHIER saw only the Sales business group; restricted groups and standalone Undo were hidden. Existing route permissions were reused rather than replaced.

## 67–78 Intelligence regression

All eight intelligence module SHA-256 values match v3.10.0 exactly. No intelligence source file changed.

A browser comparison against the protected v3.10.0 runtime verified matching values for representative rendered outputs, including Margin loss count, reliable pricing count, completed sales used, Portfolio no-sales count, identified-customer count and repeat-customer rate. Empty-fixture values matched exactly. Pricing Policy Lab retained its New Product mode in both builds.

Additional runtime checks:

- Stage 4A window `30` propagated to direct Stage 4B as `30`;
- Stage 4B retained zero independent lookback selectors;
- first-open Stage 4B safely defaulted to 90 days;
- Customer Intelligence retained its runtime-selected 30-day window across navigation;
- selecting historical Dashboard month 7 did not retarget Current Stock Pricing Guidance, which remained on open stock month 8;
- the established Dashboard historical selector remained separate from current-stock and customer-history controls.

Because formula files are byte-identical, Stage 1 through Stage 5A formula bodies, ranks, quartiles, weighted cost, reference margin, velocity, reorder and identity rules are unchanged.

## 79–100 `0000` safeguards

Price Adjustment browser checks:

- intentional double-click opened **Price Adjustment Entry Guard**;
- the modal contained no staff-password re-authentication text;
- `0001` left the input read-only and value `0`;
- Cancel left the input read-only and value `0`;
- `0000` closed the modal and removed `readonly`;
- an ordinary CASHIER with legitimate Sale Out access also unlocked it with `0000`.

VAT browser checks:

- intentional click opened **VAT Entry Guard**;
- the modal contained no staff-password re-authentication text;
- an incorrect PIN left the input read-only and value `0`;
- Cancel left the input read-only and value `0`;
- `0000` closed the modal and removed `readonly`;
- an ordinary CASHIER with legitimate Sale Out access also unlocked it with `0000`.

Protected diff review confirmed only these two entry paths use the direct fixed-PIN flag. Staff, recovery, device, MFA and other administrative security controllers are unchanged. VAT and Price Adjustment formula bodies are unchanged.

## 101–130 operational regression

The v3.10.0/v3.10.1 protected-file comparison showed every pre-existing JavaScript file unchanged. This includes Sale Out/FIFO, Stock In, operations, purchase orders, invoices, waybills, rollover, Cloud Sync, backup/restore, shared-device security, device enrollment, product search, PDF export and transaction badges. The only added JavaScript is the presentation/routing module `navigation-v3101.js`.

The `index.html` diff was limited to release identity, the narrowly named `0000` guard constant and two guard labels, service-worker build URL, and the new navigation script include. `recordSaleOutFIFO()`, Quick Sale, receipt, Stock In, VAT calculations, Price Adjustment calculations, cash, accounts and undo bodies were not changed.

Non-mutating route smoke passed for all operational screens. Mutating save/commit/void/undo actions were not executed against a live business database; their implementation files are byte-identical to the protected verified baseline.

Service-worker checks:

- registration: PASS
- activation state: `activated`
- page control: PASS
- controller URL: `sw.js?v=20260813-navigation-entry-guard-r41`
- cache name: `zezms-navigation-entry-guard-20260813-r41`
- cached asset count during browser test: 54
- cached `index.html`: PASS
- cached `manifest.json`: PASS
- cached `js/navigation-v3101.js`: PASS
- offline navigation fallback simulation: PASS; an uncached navigation resolved to cached `index.html`

The browser environment blocked a full server-disconnected navigation attempt before the service worker could return a page. That timing-sensitive end-to-end attempt is therefore recorded as **environment-blocked**, not as an application failure. Registration, activation/control, complete cache population and the actual fallback promise chain were verified independently.

## Syntax and packaging

- 46 external JavaScript files compiled successfully
- 6 inline `index.html` scripts compiled successfully
- `sw.js` compiled successfully
- syntax failures: 0
- JSON parsing: completed during final packaging
- release-manifest hash verification: completed during final packaging
- ZIP entry/hash verification: completed during final packaging

## Limitations and skipped actions

- No live Supabase transaction, MFA challenge, device revocation or staff mutation was executed.
- No live business sale, stock commit, cancellation or reversal was created during this release test.
- The full browser-offline navigation attempt was blocked by the browser test environment; the same fallback was verified deterministically with the real `sw.js` code and populated cache prerequisites.
- No Stage 5B or later commercial intelligence feature was tested or implemented.
