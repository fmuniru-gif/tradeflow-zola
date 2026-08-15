# ZEZMS TradeFlow Owner Edition v3.11.1 Test Report

Release: **Unified Customer Capture & Receipt Customer Requirement**  
Build: `20260815-unified-customer-capture-r44`  
Test date: 2026-08-15  
Protected baseline: v3.11.0 / `20260814-sales-channel-capture-r43`

## Result

- Mandatory numbered matrix: **128/128 PASS** through production-source inspection, actual-function runtime fixtures, responsive-structure checks, analytics fixtures, PDF rendering and protected-hash comparison.
- Focused unified capture runtime: **74/74 PASS**.
- Stage 5B analytics fixture: **21/21 PASS**.
- Failed release tests: **0**.
- Environment-level skipped test: **1** - the in-app browser rejected local `localhost`/`127.0.0.1` URLs under its URL security policy, so the requested local headless visual navigation could not be executed or bypassed.
- Syntax: **PASS** - 46 application JavaScript files plus `sw.js`, and all 6 executable inline blocks.
- Service worker: **PASS** - install, activate, protected commercial cache retention and offline app-code fallback; all 47/47 precache paths resolve.
- Release manifest and ZIP integrity: **PASS** - all tracked paths, byte counts and SHA-256 hashes matched after clean extraction.

## Mandatory matrix

| Checks | Area | Result |
|---:|---|:---:|
| 1-19 | single unified UI, readable controls, responsive structure, unique IDs and no stale references | PASS |
| 20-38 | Print Receipt required-field validation and zero-write failure paths | PASS |
| 39-50 | all optional Quick Sale identity combinations and single-record storage | PASS |
| 51-63 | shared value sourcing and reset behavior | PASS |
| 64-77 | receipt output and Stage 5A/5B intelligence compatibility | PASS |
| 78-87 | historical, Cloud Sync and backup/restore compatibility | PASS |
| 88-128 | protected operational, security, navigation, document and intelligence regression | PASS |

## Unified UI evidence

Production `viewPOS()` contains exactly one literal occurrence of each shared ID: `posCust`, `posTel`, `posSalesChannel` and `posSalesChannelOther`. It contains one `saleCustomerSource` section and no Quick customer/source controls or `_quick*` state. All 25 literal IDs in the Sale Out renderer are unique.

The verified `.stage5b-capture` high-contrast rules remain: dark background, light text, visible border, muted placeholder, teal focus state, dark options and safe autofill. Its 720 px media rule retains `min-width: 0` and `max-width: 100%`; the Sale Out grid collapses to one column on mobile. The local-browser security block noted above prevented an additional rendered screenshot, but source/runtime coverage was not weakened or altered to obtain a pass.

## Print Receipt validation evidence

The production `printReceiptSale()` function was executed with controlled real-function contexts for both blank, name-only, telephone-only and fully valid cases.

Each failure case:

- returned before FIFO;
- generated no transaction ID;
- added no `DB.sales` or `DB.receipts` record;
- called no `saveDB()` and therefore triggered no persistence/sync operation;
- displayed the exact error and focused the missing control;
- did not reset or open a receipt;
- retained the cart, entered value, selected channel and Other detail.

A valid name plus `+44 20-7123 4567` succeeded, proving presence-only international telephone acceptance. It created one analytical sale and one printable receipt copy, ran FIFO once, saved once, opened one receipt and reset once.

The entire receipt calculation/commit suffix beginning at `const subtotal = cartSubtotal();` is byte-identical to v3.11.0.

## Quick Sale evidence

Blank, name-only, telephone-only and complete identity fixtures each created exactly one `DB.inventoryTxns` record. The shared values populated `customerName`, `customerPhone`, `salesChannel` and `salesChannelOther`. Each case ran FIFO, save, reset and render once with no extra dialog. A one-unit GHS 100 line with GHS 5 discount retained quantity 1 and amount GHS 95.

The Quick Sale allocation/calculation/commit suffix beginning at its cart snapshot is byte-identical to v3.11.0.

## Receipt and intelligence evidence

An offline direct receipt PDF contained Abdul Rahman, international telephone, WhatsApp Sales Source, VAT, totals, the local full-page watermark, APPROVED stamp and both signature lines. It remained one-page A5 at `419.53 x 595.28 pt`; rendered inspection showed no clipping or overlap.

The unchanged Stage 5A/5B module passed a 21-check mixed normal/Quick Sale fixture: active totals, phone-only Quick identity, historical Unspecified, attributed/digital sales, top channel, repeat-channel sales, customer Most Used Channel and no printable-receipt duplication all remained correct.

## Protected regression evidence

Compared with protected v3.11.0:

- 16 protected files are byte-identical, including PDF export, Customer Intelligence, invoice/waybill, navigation, Cloud Sync, backup, rollover, product search and Stages 1-4B;
- 16 protected `index.html` function bodies are identical, including `recordSaleOutFIFO`, totals, Stock In, cash, expenses, accounts, both `0000` locks, undo and staff actions;
- all four reversal/restoration function bodies are identical;
- database key remains `tradeflow_v321_zola` and the entry guard remains `0000`.

Cloud Sync continues cloning complete inserted objects and diffing all object fields. Backup continues serializing the complete database JSON and restoring through `Object.assign(defaultDB(), data)`. New receipt and optional Quick values therefore survive without new fields, SQL or migration, and old backups remain valid.

## Timing-sensitive tests

Runtime fixtures use explicit 15 August 2026 timestamps. The Stage 5B analytics fixture uses an explicit All Available History endpoint. Production date logic was not changed.

## Limitations

The in-app browser's security policy blocked local app URLs. This restriction was respected; no alternate browser surface, raw browser command or policy workaround was used. Physical printer hardware, Safari printing and live production Supabase data were also unavailable. No production data or remote schema was changed.
