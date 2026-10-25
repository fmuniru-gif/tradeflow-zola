# Desktop UI performance review

Approved production baseline: `1241e0ea2a02d05d68e976d16f51164ad72c216b`. Review branch: `review/desktop-ui-performance-r1`.

The selected Dashboard and Management Intelligence routes now call the existing renderers directly. They invoke the existing selected-period calculations on every visit, retain established errors, and avoid constructing analytics that the navigation immediately removes. No financial or inventory cache was added.

**Evidence and responsible functions.** In `js/navigation-v3101-r68.js`, `dashboardOnlyHTML()` and `viewManagementSection()` called `fullDashboardHTML()`, parsed the complete analytics composition into a template, and discarded unrelated sections. Those wrappers came from Management, Margin, Pricing, Stock Velocity, Portfolio and Customer Intelligence. The same navigation is embedded in `index.html`. The full composition produced approximately 1.45 million template characters per repeated visit. Sales Records, rendered by the embedded Operations `viewReceipts()`, creates 1,350 rows, about 1.08 million markup characters and 23,427 live elements; layout/style work remains expensive.

**Reproduction.** The new `tests/desktop-ui-performance.browser.cjs` reuses the fixture and local authentication procedure from `tests/ui-responsiveness.browser.cjs`. It serves every baseline asset from the exact approved commit, blocks external requests, blocks service workers in the performance contexts, and uses disposable Chrome contexts. Fixture: 600 products, 1,800 stock rows, 900 sales, 900 receipts, 450 quick sales, 300 cash entries and 300 expenses. For reproduction, use a full Git history, an installed `playwright-core@1.56.0` through `PLAYWRIGHT_CORE_PATH`, and `CHROME_PATH` if Chrome is not at the default Windows path. Run `node tests/desktop-ui-performance.browser.cjs` with `BENCH_PROFILE=MAIN`, `SHOP` or `MOBILE`; set `BENCH_BASELINE` to the approved SHA for production and leave it empty for the candidate. `BENCH_OUTPUT` saves JSON and `BENCH_COMPARE` validates against a baseline JSON. Existing asynchronous sign-in directory publication settles before database/outbox invariance snapshots. Rejected exploratory runs are excluded.

Profiles: Main 1440×900 at 4× CPU slowdown; Shop 1366×768 at 2× slowdown with paired-device state; mobile 412×915 with touch and device scale 2.625 at 1× CPU. Chrome 155.0.8059.85. These settings are synthetic and were not calibrated to the operational computers or Camon 50 Pro.

A navigation-button click starts the synchronous measurement; two animation frames provide a paint opportunity. CDP supplies JavaScript, layout/style, task, heap and DOM/listener counters. In Main-style baseline Sales Records, median JavaScript was 2,001.7 ms, layout 2,502.6 ms and style 699.4 ms, confirming that this table has a substantial browser-layout cost in addition to JavaScript. An `innerHTML` setter probe measures DOM construction/replacement; its time overlaps JavaScript and must not be added to it. Paint opportunity is not physical screen-presentation telemetry.

One first-visit sample per route is followed by seven circuits through all four routes on each desktop profile, and 20 circuits on mobile. First visits are order-dependent: the old Dashboard also primes hidden Management work. Login and whole-application startup are excluded. These paint-opportunity/throttled values are not directly comparable to the previous unthrottled synchronous benchmark. Desktop tails below are the **worst of seven warm samples**. Mobile tails are the nearest-rank **p95 of 20 warm samples**. Quantiles, including the mobile p50 median, use the nearest-rank convention. An initial seven-sample mobile check had a Stock Balance worst value of 1,481 ms versus 877 ms in production; this prompted the paired 20-sample follow-up rather than dismissing the spike. The JSON includes all samples.

**Warm click-to-visible-content opportunity, milliseconds (median / tail: desktop maximum, mobile p95).**

| Profile | Route | Production | Candidate | Median reduction |
| --- | --- | ---: | ---: | ---: |
| main | Dashboard | 7108.0 / 7523.2 | 219.2 / 257.5 | 96.9% |
| main | Management Intelligence | 7118.4 / 7917.0 | 118.5 / 133.6 | 98.3% |
| main | Sales Records | 5666.3 / 6987.3 | 5331.4 / 6336.9 | 5.9% |
| main | Stock Balance | 3009.0 / 3229.2 | 3317.7 / 3854.5 | -10.3% |
| shop | Dashboard | 2564.3 / 3204.1 | 85.3 / 110.1 | 96.7% |
| shop | Management Intelligence | 2469.9 / 2748.0 | 49.8 / 69.3 | 98.0% |
| shop | Sales Records | 1964.4 / 2359.1 | 2005.1 / 2483.5 | -2.1% |
| shop | Stock Balance | 1088.3 / 1259.0 | 1080.2 / 1221.9 | 0.7% |
| mobile | Dashboard | 785.3 / 942.6 | 45.9 / 66.8 | 94.2% |
| mobile | Management Intelligence | 781.0 / 922.1 | 27.0 / 50.1 | 96.5% |
| mobile | Sales Records | 1555.9 / 2026.3 | 1642.2 / 2089.0 | -5.5% |
| mobile | Stock Balance | 675.9 / 1100.0 | 711.4 / 906.6 | -5.3% |

Mobile Stock Balance worst observations in the 20-sample follow-up were 1117.5 ms before and 1247.3 ms after; p95 is reported in the table. No extreme sample is removed.

**First measured visits, milliseconds (production → candidate; one sample).**

| Profile | Dashboard | Management | Sales Records | Stock Balance |
| --- | ---: | ---: | ---: | ---: |
| main | 16013.8 → 441.0 | 8235.8 → 200.8 | 6708.5 → 6998.3 | 2058.5 → 3132.4 |
| shop | 5969.9 → 162.3 | 2786.8 → 175.8 | 2402.3 → 4520.8 | 1131.2 → 1255.8 |
| mobile | 2337.3 → 82.1 | 1160.1 → 41.8 | 2247.7 → 1991.5 | 664.2 → 721.5 |

**Dominant stages, warm medians in milliseconds (production → candidate).**

| Profile / route | JavaScript | DOM construction/replacement | Layout + style | Largest observed long task |
| --- | ---: | ---: | ---: | ---: |
| main / Dashboard | 7029.8 → 177.0 | 537.8 → 58.8 | 30.0 → 28.0 | 7459.0 → 198.0 |
| main / Management Intelligence | 7051.3 → 77.5 | 478.6 → 7.8 | 33.6 → 23.7 | 7847.0 → 78.0 |
| shop / Dashboard | 2543.5 → 67.8 | 207.4 → 25.9 | 11.1 → 10.0 | 3180.0 → 84.0 |
| shop / Management Intelligence | 2448.1 → 33.2 | 179.1 → 3.4 | 10.2 → 10.9 | 2722.0 → 0.0 |
| mobile / Dashboard | 776.9 → 39.7 | 80.5 → 19.3 | 3.7 → 3.6 | 932.0 → 65.0 |
| mobile / Management Intelligence | 764.9 → 12.1 | 64.2 → 1.3 | 15.4 → 14.6 | 1141.0 → 0.0 |

Dashboard template construction falls to 4,065 characters and Management to 7,302. Dashboard retains 150 visible elements; Management retains 216, with only three empty legacy dividers removed. Sales Records and Stock Balance retain 23,427 and 6,657 live elements respectively.

**Repeated navigation and memory.** Measurements return to the same Cash page before garbage collection.

| Profile | Production heap MB, before → after | Candidate heap MB, before → after | DOM nodes / listeners, before → after |
| --- | ---: | ---: | --- |
| main | 4.83 → 7.13 | 4.82 → 5.52 | production 5098/470 → 5098/470; candidate 5098/470 → 5097/470 |
| shop | 4.80 → 7.25 | 4.79 → 5.45 | production 5098/470 → 5097/470; candidate 5098/470 → 5098/470 |
| mobile | 4.91 → 7.45 | 4.91 → 5.77 | production 6314/469 → 6314/469; candidate 6314/469 → 6315/469 |

Mounted-route node counts stay constant across samples and listener counts match before/after; the same-page post-GC DOM count differs by at most one node. Document count rises from one to two after template use, rather than growing once per visit. This bounded run cannot rule out long-session leaks.

**Functional equivalence and safety.** All four rendered-route hashes match production on each profile after excluding only empty decorative dividers. Every other value, record and action attribute remains in the comparison. Both baseline and candidate find all 1,350 unique sales records, search and clear to the full list, retain descending date order, open the last receipt and quick sale, and dispatch the correct last-receipt reprint. Dashboard retains 16 KPI cards and its All-history period selector. Dashboard and Management export dialogs work and generate PDFs; the Management report retains all 600 aggregate product rows and identical financial facts. Database and outbox invariance checks pass. Unit comparisons also cover current, changed, historical and empty Management periods, plus the same visible calculation error. A production control and final-candidate checks verify that hypothetical Stock Velocity scenarios are cleared on both direct routes, and Portfolio restores the original default lookback instead of reusing an old runtime snapshot.

Validation: **148/148 unit/source tests passed** (`node --test tests/*.test.cjs`). Full browser suite: **50 passed, 0 failed** (`node --test --test-concurrency=1 tests/*.browser.cjs`). The original responsiveness/physical-count browser test is included. `git diff --check` passes.

**Exact changed files.**

- `index.html`: synchronize only the embedded navigation module. Every other normalized shell byte and embedded module matches production.
- `js/navigation-v3101-r68.js`: select direct renderers, preserve the legacy hypothetical-scenario reset, and require the original Portfolio refresh after a direct visit; unavailable APIs retain the full-composition fallback.
- `js/management-intelligence-v380.js`: expose the captured pre-analytics Dashboard renderer and the existing Management presentation/error handler; aggregation formulas remain unchanged.
- `js/stock-velocity-v390.js`: expose a method that clears only the hypothetical planning scenario; model/calculation code otherwise matches production.
- `tests/desktop-ui-performance.browser.cjs`: controlled profiles, stage metrics, repeated visits, full-record/UI/export checks and production equivalence.
- `tests/desktop-ui-performance.test.cjs`: production-output equivalence, errors, embedded/source consistency and exhaustive protected-file preservation.
- `tests/prelogin-release.test.cjs`: add only this review’s files to the existing source allowlist.
- `docs/desktop-ui-performance-review.md`: this report and the deferred branding note.

**Remaining limits.** Sales Records still renders the complete large table and remains a major source of layout blocking. Control-route timing differences, including the slower Main-style Stock Balance result, are reported rather than attributed to a proven cause; these sequential synthetic samples cannot establish physical-device performance equivalence. Stock Balance still has substantial DOM cost; its previous indexing improvement is preserved. Some optimised navigation tasks still exceed 50 ms under throttling. Other analytics routes keep their existing full-composition fallback. No pagination, virtualisation, event-model rewrite or speculative financial cache was introduced. Mobile results are synthetic regression checks, not Camon measurements. Physical-device causes and network/synchronisation contributions remain unmeasured; these local findings do not exclude them.

**Review boundary.** Production `main`, GitHub Pages, Supabase, production business records, operational browser profiles and Main/Shop/Camon devices were untouched. FIFO, corrections/physical count, financial/inventory records, sync/outbox/replay, device/security, backup/recovery, print/document business logic and service-worker/release/update mechanisms remain unchanged. No merge, deployment or activation is authorized by this report.

**Deferred branding — recorded only.** Current logo/watermark slogan: “Home Sweet Home”. Future approved replacement: “Buy the right one”, consistently across logos and printable watermarks while preserving clarity/readability. The longer “Buy the right one from the right shop” may later be used on Zola Electronics Zone’s separate public website and promotional materials. No branding asset, printable document or public website was edited.
