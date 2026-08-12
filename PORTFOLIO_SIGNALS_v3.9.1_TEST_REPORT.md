# Portfolio Signals & Capital Allocation v3.9.1 Test Report

Build: `20260812-portfolio-signals-r39`  
Stage: **4B**  
Final result: **PASS**

## Stage 4B focused feature suite

The deterministic rendered-browser suite passed **75/75** mandatory checks. It verified:

- Dashboard load, Stages 1–4A presence, exactly one Stage 4B section and Owner/Admin-only placement;
- shared 30/60/90-day Stage 4A lookback and independence from the historical Dashboard month;
- all Stage 3A current-stock/pricing and Stage 4A movement/incoming/inventory reconciliations;
- Reference GP Pace and Reference GP per GH₵1,000 Stock Capital formulas;
- missing price/cost dashes and visible negative Reference GP/productivity;
- velocity, capital, cover, contribution and productivity ranks;
- rank-position quartiles and their omission below four eligible observations;
- all six specified advisory signals, multiple signals and Normal Monitoring;
- four KPI calculations, deterministic overview order and every required table order;
- Suggested Reorder Qty absent for an incomplete Stage 4A scenario and reused for a valid scenario;
- overlapping signal-capital percentages and explanatory warning;
- no ABC field, composite score, action command, budget allocator, Purchase Order or operational mutation;
- zero save, Cloud Sync and network activity;
- repeated navigation/module loading, zero-to-three-product portfolios, all-no-sales and no-price portfolios;
- no rendered `NaN` or `Infinity`, and safe mobile/table structure.

The optional exclusive velocity/capital matrix was omitted, so mandatory check 52 verified safe omission rather than matrix arithmetic.

## Critical regression checks 76–110

All **35/35** required regression areas passed:

- 76–82: Sale Out/FIFO, Quick Sale, receipts, Stock In and Purchase Order save/commit/cancel passed protected-source/runtime-surface checks.
- 83–93: VAT, Price Adjustment, `0000` safeguards, cash, expenses, debtors, creditors, depositors, undo/reversal, invoices and waybills remained in the normalized byte-identical runtime.
- 94–104: automatic rollover, Cloud Sync, backup/restore, authentication, cashier restrictions, staff management, device enrollment/revocation, product search, PDF, installed-PWA startup and service-worker lifecycle passed.
- 105–109: Stage 1, Stage 2, Stage 3A, Stage 3B and Stage 3B.1 modules were byte-identical to v3.9.0 and retained their load/API surfaces.
- 110: the complete Stage 4A deterministic feature suite passed **70/70** after the additive snapshot/event interface was applied.

The operational regression method was deliberately non-mutating. It did not post a business transaction or contact Supabase.

## Validation method

- Deterministic browser fixtures validate formula, rank, quartile, signal, sorting, empty/small-portfolio, no-write and repeated-install behavior.
- The full application is served locally for startup, version, module-load, responsive and service-worker checks.
- Protected runtime and module files are compared against the verified v3.9.0 rollback baseline.
- Regression validation is deliberately non-mutating: it combines protected byte comparisons, normalized `index.html` comparison, expected runtime/API surfaces and isolated browser startup/lifecycle checks. No transaction is posted to the user's live business database and Supabase is not contacted.

## Stage 4A adjustment under test

`js/stock-velocity-v390.js` has only a frozen-snapshot/event API addition. The validation explicitly checks that its prior formula and operational-data sections remain byte-equivalent after removing that additive interface, and that its focused formula behavior still passes.

Existing JavaScript files compared with v3.9.0: **42/43 byte-identical**; the sole difference is the documented Stage 4A additive interface. SQL files compared with v3.9.0: **10/10 byte-identical**. After normalizing v3.9.1 version/build/cache strings and removing the new Stage 4B script tag, `index.html` was **byte-for-byte identical** to v3.9.0.

## Syntax, startup, mobile and lifecycle

- External JavaScript syntax: **45/45 PASS** (44 files in `js/` plus `sw.js`).
- Executable inline `index.html` script blocks: **6/6 PASS**.
- `manifest.json`: valid JSON.
- Local script references: **42/42 resolved**.
- Service-worker local asset entries: **44/44 resolved**.
- Full application startup: PASS with the v3.9.1 title and secure-login screen.
- Service worker: registration PASS; activation PASS; r39 cache PASS; 44 cached requests; Stage 4A and Stage 4B modules cached; controlled application reload PASS.
- Exact Cache API fallback: PASS for final v3.9.1 index, Stage 4A snapshot interface and Stage 4B module/formula source.
- Stage 4B adds no fixed element; KPI cards stack at the native breakpoint; every table is inside a scoped horizontal `table-wrap`.

## Release manifest and ZIP

- Release manifest: **194/194 payload hashes matched** before packaging.
- ZIP integrity: **195/195 entries readable**, forward-slash paths, `index.html` at root and no extra wrapper folder.
- ZIP-to-manifest verification: **194/194 payload hashes matched**.

## Timing-sensitive reporting policy

Service-worker activation and control were timing-sensitive and awaited independently. The online lifecycle result became available after the initial 3.5-second probe and passed after an additional 8-second wait. Exact Cache API fallback was then exercised from the registered/controlled lifecycle tab.

## Skipped and failed checks

Skipped mandatory checks: none.  
Final failed checks: none.

## Limitations

- Results inherit Stage 3A pricing/cost availability and Stage 4A identity/history-coverage limitations.
- Quartile-dependent signals intentionally do not appear with fewer than four eligible observations.
- The rate is recent observed pace, not a forecast or realised accounting profit.
- Overlapping signal percentages are independent exposures and cannot be summed.
- The optional exclusive matrix was not implemented.
