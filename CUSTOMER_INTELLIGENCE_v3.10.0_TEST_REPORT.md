# Customer Relationship Intelligence v3.10.0 — Test Report

Version: **3.10.0**  
Build: **20260812-customer-intelligence-r40**

## Result summary

This report is finalised from the automated deterministic feature harness, existing frozen regression suites, full-page browser checks, JavaScript syntax validation, service-worker/offline checks, release-manifest validation and ZIP integrity validation.

<!-- TEST_RESULTS_START -->
- Stage 5A deterministic rendered-browser checks: **65/65 PASS**.
- Existing v3.8.4 operational/feature/security/Stage 1–3B.1 suites adapted only to the v3.10.0 path/build: **10/10 suites PASS**.
- Stage 4A focused regression: **70/70 PASS**.
- Stage 4B focused regression: **75/75 PASS**.
- External JavaScript syntax: **46/46 PASS** (45 `js/` files plus `sw.js`).
- Executable inline scripts: `index.html` **6/6 PASS**; `FORCE_UPDATE_MOBILE.html` **1/1 PASS**.
- Full app startup/title and Stage 5A API load: **PASS**.
- Service worker: registration/activation/control **PASS**; r40 cache **PASS**; **45** cached requests; Stages 4A, 4B and 5A cached.
- Exact Cache API offline fallback: **PASS** for v3.10.0 index and Stages 4A/4B/5A assets.
- Protected JavaScript comparison: every pre-existing module is byte-identical to v3.9.1; **190** copied payloads are unchanged and only the five expected active shell/doc files differ before adding Stage 5A files.
- Release manifest: **197/197 payload hashes PASS**.
- ZIP integrity: **198/198 entries readable**; ZIP-to-manifest **197/197 payload hashes PASS**.
- Skipped mandatory checks: **none**.
- Final failed checks: **none**.
<!-- TEST_RESULTS_END -->

## Tested Stage 5A contract

The test data covers normal receipts, multi-line receipts, phone-format variants, exact-name fallback, punctuation-distinct names, identified and unidentified Quick Sales, duplicate IDs, void/cancel records, finite and All History windows, product/category affinity, recency and malformed values/dates. It verifies the requested 65 feature checks, including Owner/Admin visibility, non-persistence, no network/Cloud Sync, idempotent installation, empty states and portrait-safe structure.

## Source and formula confirmations

- Normal receipts/customer metadata: active `DB.sales`.
- Quick Sales: active `DB.inventoryTxns` `SALE_OUT/QUICK` records.
- Printable `DB.receipts`: not scanned.
- Repeat customer: two or more distinct completed transactions.
- Unidentified transactions: counted separately, never merged into one customer.
- Gross profit: omitted because no uniformly safe customer-cost join exists.
- Customer normalisation: runtime-only; no fuzzy match and no historical rewrite.
- Database key: `tradeflow_v321_zola`.
- Migration: none.

## Timing and exclusions

The adapted legacy suite took about 100 seconds. Service-worker activation/control was awaited independently: the lifecycle record was available after an additional nine-second wait, then exact offline fallback passed. Browser viewport emulation in this desktop host retained a wide host viewport, so portrait coverage relies on the deterministic 390px CSS/media structure check and confirmation that every Stage 5A table is horizontally contained, with no fixed-position element. No live Supabase write was required or authorised.
