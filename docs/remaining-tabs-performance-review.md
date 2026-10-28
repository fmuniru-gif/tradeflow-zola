# Remaining sidebar tabs — performance review only

Exact application baseline: `83c7450483f0063fd7857aff696634830d70f8d8`.
Review branch: `review/remaining-tabs-performance-r1`.
No merge, deployment, operational-device update or Supabase access is authorized.

## Confirmed work and selected changes

Sales Records constructs every authorized receipt/quick-sale row and rewrites the whole HTML once per referenced receipt. Products repeatedly calls the established `stockOnHand()` calculation, rescanning stock rows and latest-month evidence once per displayed product. All four target views repeatedly construct equivalent numeric-formatting machinery through `toLocaleString()` with the same explicit locale/options. Large-table DOM, layout, style and post-render decoration also remain significant.

This change retains every mounted record and the original views, searches, sorting, actions, permissions and exports. It changes three presentation operations only:

1. Reuse one `Intl.NumberFormat('en-GH', {minimumFractionDigits:2, maximumFractionDigits:2})`, preserving `(Number(value)||0)` coercion and the exact `GH₵ ` prefix. Only formatting machinery is reused; numeric/business values are never cached.
2. Build a fresh exact-name quantity Map once inside each product-catalog render using the unchanged `getLatestMonth()` and strict original year/month/name matching. Accumulation retains original row order and nonfinite-number behavior. The global `stockOnHand()` function used by POS/business callers is untouched.
3. Use one literal-ID replacement pass for provably non-overlapping, token-bounded receipt IDs whose public references cannot cascade into another internal ID. Duplicate/overlapping/short/unbounded/unsupported IDs and cascading references retain the exact sequential split/join fallback. Labels and original financial/reference generation stay unchanged.

Date expressions remain unchanged. No pagination, virtualization, financial/stock snapshot cache, route rewrite, security rewrite or background synchronization change is introduced. In particular, Accounts retains its complete account-holder register, original latest-100 transaction display and full stable-ID statement history.

The stock sidebar is a group containing **Products** and **Stock Balance**. Both routes are measured. **Stock In** and **Dashboard** are controls; no claim is based on treating a sidebar group as a separate route.

## Source and delivery safety

All existing standalone JavaScript files and original embedded `_B64` constants remain exact production bytes. Asserted assembly replacements affect only the three presentation expressions above, leaving the original verified baseline blob/proof intact. Source tests compare the entire compiled result with exactly those edits and prove the global stock calculation remains identical. Formatting and ID rewriting are tested against original behavior, including coercion, malformed/nonfinite values, duplicate names, historical periods, overlap/cascade cases and generated reference fixtures.

The proven raw-byte delivery builder still signs exact staged Git blobs and refuses unstaged served-asset edits. The new helper and presentation asset bring the complete manifest to **75** entries; every entry is verified. Delivery revision is `20261028-remaining-tabs-r1`. Content-derived shell/worker identities are regenerated; strict SHA-256, passive activation and recovery/client safeguards stay unchanged. Previous helpers/caches remain intact; the new helper path is `REMAINING_TABS_UPDATE.html` for a future separately approved rollout. No update has been applied to a device.

## Exact-baseline benchmark and regression protocol

`tests/remaining-tabs-performance.browser.cjs` reuses the existing PR #11 fixture, authentication and CDP timing methodology, serving **all** baseline assets from the exact SHA. It adds referenced receipts and populated accounts. Fixtures contain 600 products, 1,800 stock rows, 900 receipts plus 450 quick sales, and 600 accounts per register; each register's last account has 150 statement-history entries while its table retains the original latest-100 display. All data is disposable and synthetic.

Profiles: Main-style 1440×900 / 4× CPU; Shop-style 1366×768 / 2× CPU; mobile 412×915 with touch / 1× CPU. These are controlled synthetic profiles, not calibrated Main/Shop/Camon measurements. Each dedicated CI job runs baseline then candidate in the same Chrome/runner environment: one first visit followed by seven warm circuits on each desktop profile and twenty on mobile. Quantiles use nearest rank; desktop tail is the maximum, mobile tail includes p95 and maximum. No extreme sample is discarded.

A click starts synchronous timing; two animation frames provide a paint opportunity, not physical screen-presentation telemetry. CDP records script/layout/style/task/heap counters, a DOM-setter probe and Long Tasks. DOM setter time overlaps script time and stages are not additive. Root replacements are recorded to expose background/deferred rendering. Existing convergence startup evidence settles before timing; ordinary application behavior is otherwise retained.

Functional checks retain all 1,350 unique sales records, full-list date order, off-screen public/internal reference/customer searches, last receipt/quick-sale view and reprint targets, all 600 products/stock rows, complete-search totals, all account registers/settlement targets and account PDF histories beyond the table's 100-row window. Complete rendered markup hashes and functional results must match baseline. Navigation and read-only checks preserve database/outbox snapshots; memory/DOM/listener observations return to the same Cash view.

The complete existing unit/source and Chrome suites run in addition to these checks. Test expectations change only for new delivery IDs/helper path/manifest count and the scoped review-file allowlist. The new benchmark and source proofs add coverage; existing performance findings and benchmark files remain unchanged.

## Review results and limits

The draft PR and Owner report record the exact tested review SHA, full-suite Actions URL, downloadable paired JSON and measured before/after tables. A one-sample local smoke run confirmed identical route markup and actions but had variable/slower paint windows despite lower script work, so it is not used to claim a latency improvement. Final claims must use the repeated dedicated-runner evidence, including control routes and tails.

Every table still mounts all rows, so large-table layout and post-render decorators can remain slow even after repeated JavaScript work is reduced. Unsupported receipt-ID patterns deliberately retain the original slower path. This review does not claim physical-device speed, formal absence of long-session leaks or live-cloud synchronization testing. Offline, raw-byte upgrade/recovery and synthetic-state tests remain part of full CI. Production data, M4/3, FIFO, financial/stock/accounting calculations, permissions, branding and public website files are untouched.

STOP at Owner review. Do not merge or deploy.
