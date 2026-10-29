# Main laptop responsiveness — PR15 review

Production baseline: `e3e0bf654519f3d9745ec89f3d9dbc394cf53067`.
Review branch: `review/main-laptop-responsiveness-r1`. No merge/deployment or operational-device update is included.

## Problem and change

The 29 October laptop-interaction report identified large reconstructed tables and repeated receipt-edit discovery. The Owner subsequently measured the physical Main laptop at 11,302 ms for Sales Records, 16,928 ms for Products and 4,981 ms for Stock Balance, with 15 long tasks and a longest task of 16,779 ms over eight sidebar clicks. These are click-to-paint-opportunity observations, not complete rendering times or independent additive stages. This review does not treat them as a calibrated synthetic baseline.

The candidate mounts at most 50 rows per Sales Records, Products, Stock Balance and account-holder table. It slices before the existing row templates run. Previous/Next controls expose the complete ordered set. Stock aggregation, complete product search and all original account models still operate on the full data. Account entry history retains its original latest-100 display and full PDF/statement history.

Sales search remains global across every authorized record, including public/internal receipt IDs, customer/contact, formatted financial/date/status text and existing action labels. Nonempty searches construct the original row strings and apply the established reference substitution, then extract searchable text without mounting those rows. Only the matching page is constructed in the live DOM. No financial values, record lists or HTML are retained in a persistent cache. Runtime state consists of page indices, counts, signatures and the current receipt query. Ordinary route renders reset pagination/query; normal guarded renders handle page changes and preserve unposted form inputs, focus and selection.

`installReceiptEditButtons()` builds fresh first-match receipt/sale indexes and obtains the latest period once, only when printed-receipt buttons exist. The original permission/status/date/ID predicates and edit action remain intact. A read-only predicate is also used for the existing Edit-label search semantics. No receipt reference or printing behavior is repaired as a side effect.

## Source and delivery boundaries

The original embedded module blobs, row templates, FIFO, stock aggregation, financial/accounting calculations, security, synchronization and recovery sources are unchanged. A new asserted assembly transform scopes the presentation substitutions. The sole changed existing standalone application file is `js/owner-maintenance-v373.js`; source tests prove every byte outside its receipt-button UI region and the predicate export remains equivalent. All other pre-existing JavaScript and branding assets are compared against exact production Git bytes. Printing sources, receipt layout and bridge/driver configuration remain unchanged.

The verified shell couples the changed owner-maintenance module and new pager with the established PR11/14 modules, including while a prior worker still controls the page. Raw-byte hashes and content-derived shell/cache identities are regenerated consistently for 77 assets. Verification/install/activation code is unchanged outside generated metadata. Existing helper files and caches are retained. `MAIN_RESPONSIVENESS_UPDATE.html` is for a future separately approved controlled update; it never clears storage, claims clients or forces activation.

## Comparison and regression protocol

`tests/main-responsiveness.browser.cjs` reuses the existing isolated PR14 fixture and serves every baseline asset from the exact production commit. Data includes 1,350 sales records, 600 products, 1,800 stock rows, 600 account holders per register and 150 transactions for each register's last account. All credentials and records are synthetic. Test traffic is loopback only, and CI runs in a network namespace without external routes or credentials.

Dedicated CI runners execute production then candidate within each matched profile: Main-style 1440×900/4× CPU and Shop-style 1366×768/2× CPU, seven warm circuits each; mobile 412×915/touch/1× CPU, twenty warm circuits. First visits and all warm samples remain in the artifact. Record click-to-two-animation-frame paint opportunity, synchronous work, a queued-input timer delay, CDP script/layout/style intervals, mounted DOM size, root replacements and long tasks. Timer delay is a responsiveness probe, not trusted physical-input telemetry. Intervals overlap and must not be added. No sample is discarded.

Functional comparison visits every page, reconstructs the complete ordered row HTML/action targets and compares its digest against production. It also compares full-record searches, no-match handling, stock totals, last-receipt/quick-sale actions and reprint dispatch, original product indices, last-account actions and complete statement/PDF models. It asserts business DB and outbox invariance, bounded mounted rows, draft preservation and page reset. Prior full-suite assertions are adapted to enumerate pages rather than expecting the entire dataset to be mounted simultaneously; counts and complete-record requirements are retained.

Run the complete source/unit and Chrome suites as well as all-asset raw Git/HTTP integrity checks with identity/gzip/Brotli transport. Cached upgrade tests cover old bundles and exact PR14 Main/Shop/Camon synthetic installs, natural activation, offline reopen, state/identity/outbox/IndexedDB preservation, stale owner-module responses and interrupted pager downloads.

## Results and limits

Exact review head, final complete-suite outcomes, paired measurements, failures and Actions/artifact links are recorded in the PR description and Owner report after validation. Early development observations support the design but are not final speed claims.

Full-list normalization, filtering, sorting and nonempty receipt-search string generation remain proportional to record count. Stock aggregation and FIFO-tier descriptions are unchanged. The Accounts dropdown retains all account holders, and its latest-100 transaction table is unchanged, so Accounts retains more DOM/layout work than the other paged tables. The candidate does not establish absence of long tasks or long-session memory leaks, live-cloud performance, USB printing latency or physical-laptop improvement. Those require separately approved real-device checks after deployment approval and exact-byte delivery verification.

STOP at Owner review. No merge, deployment, cache clearing, forced worker activation, operational-device action or Supabase access is authorized by this PR.
