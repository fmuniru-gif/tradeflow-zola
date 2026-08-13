# ZEZMS TradeFlow Owner Edition v3.10.2 Test Report

Release: **Document Branding — APPROVED Stamp & Watermark**  
Build: `20260813-document-branding-r42`  
Test date: 2026-08-13  
Protected baseline: v3.10.1 / `20260813-navigation-entry-guard-r41`

## Result

- Mandatory visual/operational matrix: **82/82 PASS**
- Failed tests: **0**
- Skipped tests: **0**
- JavaScript syntax: **PASS** — 46 external JavaScript files, `sw.js`, and 6 inline script blocks parsed.
- Direct generated PDFs: **PASS** — A5 receipt/invoice/waybill, missing-watermark fallback, and four-page invoice/waybill samples.
- Browser print/Save-to-PDF: **PASS** — Chrome produced A5 receipt/invoice/waybill PDFs plus a five-page invoice and four-page waybill.
- Offline: **PASS** — controlled service-worker restart, local-logo cache and all three branded PDF builders executed with the network disabled.
- Preserved intelligence modules: **PASS** — Stage 4A 70/70, Stage 4B 75/75 and Stage 5A 65/65.
- Release manifest and ZIP gates: **PASS**.

## Branding implementation under test

- Asset: `assets/zez-document-watermark.jpg`
- Asset bytes: `131307`
- Asset SHA-256: `c477963932d6d765d0c2678b701d90aabfe9202ec486d68c2acb1f341b12c695`
- Source and packaged SHA-256 matched; no redraw, crop, recolour or re-encoding occurred.
- Direct PDF page size: `419.53 × 595.28 pt` (A5 portrait, 148 × 210 mm).
- Chrome print page size: `420 × 594.96 pt` (Chrome's A5 rounding).
- Watermark stretch: full page, `100% 100%`.
- Effective opacity: `0.10`.
- Stack: watermark below content; content below APPROVED/signature.
- Stamp: green outlined rounded rectangle, uppercase bold label, light interior, modest two-degree rotation.

## 82 mandatory checks

| # | Check | Result |
|---:|---|:---:|
| 1 | Receipt opens normally | PASS |
| 2 | Receipt remains A5 portrait | PASS |
| 3 | Receipt watermark appears | PASS |
| 4 | Receipt watermark spans full A5 width | PASS |
| 5 | Receipt watermark spans full A5 height | PASS |
| 6 | Receipt watermark is behind content | PASS |
| 7 | Receipt watermark is sufficiently faint | PASS |
| 8 | Receipt product text remains readable | PASS |
| 9 | Receipt quantities remain readable | PASS |
| 10 | Receipt prices remain readable | PASS |
| 11 | Receipt VAT remains readable | PASS |
| 12 | Receipt totals remain readable | PASS |
| 13 | Receipt customer information remains readable | PASS |
| 14 | Receipt APPROVED stamp appears | PASS |
| 15 | Receipt stamp is associated with signature area | PASS |
| 16 | Receipt stamp does not cover signature | PASS |
| 17 | Receipt stamp does not cover financial values | PASS |
| 18 | Receipt browser print output contains watermark | PASS |
| 19 | Receipt Save-to-PDF/direct PDF contains watermark | PASS |
| 20 | Offline receipt output contains watermark | PASS |
| 21 | Invoice opens normally | PASS |
| 22 | Invoice uses intended A5 layout | PASS |
| 23 | Invoice watermark appears full-page | PASS |
| 24 | Invoice watermark is behind all content | PASS |
| 25 | Invoice line items remain readable | PASS |
| 26 | Invoice VAT remains readable | PASS |
| 27 | Invoice totals remain readable | PASS |
| 28 | Invoice customer details remain readable | PASS |
| 29 | Invoice APPROVED stamp appears correctly | PASS |
| 30 | Invoice signature remains readable | PASS |
| 31 | Invoice browser print retains watermark | PASS |
| 32 | Invoice direct PDF retains watermark | PASS |
| 33 | Offline invoice retains watermark | PASS |
| 34 | Multi-page invoice watermark/stamp behaviour is correct | PASS |
| 35 | Waybill opens normally | PASS |
| 36 | Waybill uses intended A5 layout | PASS |
| 37 | Waybill watermark appears full-page | PASS |
| 38 | Waybill item descriptions remain readable | PASS |
| 39 | Waybill quantities remain readable | PASS |
| 40 | Waybill recipient/delivery information remains readable | PASS |
| 41 | Waybill APPROVED stamp appears | PASS |
| 42 | Waybill signature fields remain usable | PASS |
| 43 | Waybill browser print retains watermark | PASS |
| 44 | Waybill direct PDF retains watermark | PASS |
| 45 | Offline waybill retains watermark | PASS |
| 46 | Multi-page waybill watermark/stamp behaviour is correct | PASS |
| 47 | Same local logo asset is used on all three documents | PASS |
| 48 | Same 0.10 effective opacity principle is used | PASS |
| 49 | Same stamp style is used | PASS |
| 50 | Watermark does not distort document content | PASS |
| 51 | Watermark does not add an extra page | PASS |
| 52 | Watermark does not alter document calculations | PASS |
| 53 | Watermark does not obstruct signatures | PASS |
| 54 | Watermark layer does not affect selection/click/print flow | PASS |
| 55 | Missing watermark does not crash document generation | PASS |
| 56 | Sale Out unchanged | PASS |
| 57 | Quick Sale unchanged | PASS |
| 58 | Receipt calculations unchanged | PASS |
| 59 | Stock In unchanged | PASS |
| 60 | Purchase Order save unchanged | PASS |
| 61 | Purchase Order commit unchanged | PASS |
| 62 | Purchase Order cancel unchanged | PASS |
| 63 | Invoice calculations unchanged | PASS |
| 64 | Waybill workflow unchanged | PASS |
| 65 | VAT unchanged | PASS |
| 66 | Price Adjustment unchanged | PASS |
| 67 | `0000` Price Adjustment safeguard unchanged | PASS |
| 68 | `0000` VAT safeguard unchanged | PASS |
| 69 | Cash unchanged | PASS |
| 70 | Expenses unchanged | PASS |
| 71 | Accounts unchanged | PASS |
| 72 | Undo unchanged | PASS |
| 73 | Rollover unchanged | PASS |
| 74 | Cloud Sync unchanged | PASS |
| 75 | Backup/restore unchanged | PASS |
| 76 | Authentication unchanged | PASS |
| 77 | Staff management unchanged | PASS |
| 78 | Device management unchanged | PASS |
| 79 | v3.10.1 grouped navigation unchanged | PASS |
| 80 | Seven direct Management views unchanged | PASS |
| 81 | Offline installed-PWA startup succeeds | PASS |
| 82 | Service-worker lifecycle/cache succeeds | PASS |

## Evidence and focused results

The direct PDF generator produced one-page Receipt, Invoice and Waybill PDFs at exactly `419.53 × 595.28 pt`. It also produced four-page invoice and waybill samples. Each direct-PDF page contained the embedded watermark image; `APPROVED` text appeared only on final signature pages: `[false, false, false, true]` for both multi-page samples.

The actual production browser-print HTML was captured from `printReceiptDocument()` and `printCommercialDocument()` and sent through Chrome's real PDF print engine. One-page output remained A5. The 60-line invoice produced five A5 pages and the 70-line waybill produced four A5 pages. Rendered intermediate and final pages retained the watermark. `APPROVED` occurred only on the final pages: invoice `[false, false, false, false, true]`, waybill `[false, false, false, true]`.

The missing-watermark fallback generated a valid one-page A5 receipt without the logo and with all text, totals, signature lines and APPROVED stamp intact.

The operational browser suites passed account filtering; Purchase Order save/commit/cancel; four PDF downloads; document editing and downstream stock/sale behaviour; transaction badges; confirmation guards; both `0000` locks; staff deletion; device revocation; Owner/commercial separation; Stock In; Quick Sale and undo; VAT receipt; cash; expenses; accounts; rollover; backup; Cloud Sync; and offline PWA module loading.

The v3.10.1 navigation regression passed five groups, 21 children, one standalone Undo control, all seven direct Management views, portrait tap behaviour and no mutation of operational arrays while navigating. The legacy v3.8.4 `#navPurchaseOrders` assertion was updated to the verified v3.10.1 grouped Purchases child because the old flat control intentionally no longer exists; test coverage was preserved.

The Stage 5A feature harness contains a historical fixed-date expectation for 12 August 2026. The clock was fixed to that documented harness date, after which all 65 checks passed. No production date logic was changed.

## Source-scope verification

Compared with protected v3.10.1, only the required presentation/release files differ. All stock, purchase-order, cash, accounts, Cloud Sync, backup, authentication, staff/device and intelligence JavaScript files retain their v3.10.1 hashes. Diffs in `js/operations-update.js` and `js/invoice-waybill.js` are confined to release identity plus receipt/invoice/waybill markup and CSS. Purchase Order direct PDF remains A4 and contains no APPROVED mark, confirming the requested branding scope did not expand to Purchase Orders.

Database key remains `tradeflow_v321_zola`. No database, SQL or Supabase migration is required. No operational data write was added.

## Packaging gates

- Service-worker precache references: 47/47 resolved.
- Local logo offline cache and exact-byte retrieval: PASS.
- Release file manifest: all tracked path/byte/hash entries verified.
- Full ZIP: archive listing, extraction, file count and hashes verified against the release manifest.

## Limitations

Chrome/Edge browser preview, print and PDF output were tested. Physical printer hardware and Safari's print engine were not available in this environment. The implementation uses standards-compatible print CSS and a failure-safe local asset, but browser-specific printer-driver differences may still affect colour intensity.
