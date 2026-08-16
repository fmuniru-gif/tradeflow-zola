# v3.12.1 Direct Print Bridge Test Report

Release: **ZEZMS TradeFlow Owner Edition v3.12.1 — One-Click Direct Printing & Mobile Wireless Print Bridge**  
Build: `20260816-direct-print-bridge-r46`  
Bridge: `1.0.0` / `ZEZPRINT/1`  
Test date: 16 August 2026

## Final result

**PASS — 143/143 mandatory release checks.** No automated test failed and none was weakened or skipped. The Windows bridge built successfully and its unit/integration suite passed 14/14 with 0 failed and 0 skipped.

Physical paper output on the Owner's actual printer and real phone-to-shop-Wi-Fi acceptance remain manual because that hardware/network was not available in the development environment.

## Mandatory matrix

| Checks | Result | Evidence |
|---|---:|---|
| 1–30 PWA Direct Printing | 30/30 PASS | Transport registration, local-only configuration, pairing/revocation, health/status, auth failures, validation, idempotency, locking, errors, explicit fallback and both A5 tests |
| 31–55 Windows Bridge | 25/25 PASS | .NET application/API, DPAPI pairing, CORS, printer enumeration, WebView2 restrictions/A5 settings/status mapping, queue, job persistence, logging, bindings and startup |
| 56–70 Receipt | 15/15 PASS | Post-commit direct invocation, exact production generator, branded/customer/VAT/total/signature content, failure ordering and explicit reprint |
| 71–76 Invoice | 6/6 PASS | Saved calculations unchanged, Direct route, no Direct dialog, A5 branding and no print-side mutation |
| 77–82 Waybill | 6/6 PASS | Workflow/content unchanged, Direct route, no Direct dialog, branding and no print-side mutation |
| 83–92 Mobile | 10/10 PASS | 390 px portrait QA, usable controls/status, one-action print, Local Network Access/unreachable guidance, no overflow and fallback |
| 93–97 Offline | 5/5 PASS | Cached shell/direct module, private-LAN path, Direct A5 test, local record reprint and no Supabase dependency |
| 98–143 Critical regression | 46/46 PASS | Protected-file hashes and function-level equivalence for Customer Master, transaction logic, operational modules, navigation and Stages 1–5B; branding assertions |

The executable matrix is `tests/release-verification-v3121.test.js`; it reports each numbered check individually and verifies protected v3.12.0 source equivalence where unchanged behavior is required.

## Additional PWA suites

- Direct transport behavior: **43 assertions PASS**.
- Stage 5C functional/static regression: **122 assertions PASS**.
- Customer JSON-operation sync: **15 assertions PASS**.
- Customer backup/restore: **7 assertions PASS**.
- Customer Master performance fixture (5,000 transactions/1,000 customers): preview 54.8 ms, import 111.2 ms, model render 290.0 ms, 250 searches 0.3 ms in the final run.
- Service-worker lifecycle harness: **PASS** for install, activation, offline navigation fallback and non-interception of cross-origin LAN bridge traffic.
- JavaScript syntax: **PASS** for all source/test `.js` files.
- Inline scripts: **PASS**, 6 blocks.
- `sw.js` syntax: **PASS**.
- `manifest.json` parse: **PASS**.

## Native bridge suite

Command: `dotnet test ZEZPrintBridge.sln -c Release`

- Build: **PASS** (`net8.0-windows10.0.17763.0`).
- Tests: **14 passed, 0 failed, 0 skipped**.
- Covered: accepted/blocked HTML, invalid types, active/remote content rejection, 4 MB limit, persistent idempotency/conflict, DPAPI token-hash storage, token revocation, code expiration, exact-origin normalization, privacy-minimized logging, Windows printer enumeration, WebView2 Runtime detection, API startup/health, CORS rejection, pairing, bearer authentication, mock queued printing, duplicate acknowledgement/job completion and revoked-token rejection.
- Self-contained Windows x64 publish: **PASS**; `ZEZPrintBridge.exe` and runtime dependencies produced without requiring Visual Studio on the target PC.

## Print-document equivalence and visual QA

Production Receipt, Invoice and Waybill builders were executed with controlled fixtures. The exact resulting HTML was rendered through an isolated WebView2 A5 renderer to PDF and then rasterized/inspected.

- Receipt: 1 page, A5 (`420 × 594.96 pt`), watermark, APPROVED, customer, Sales Source, VAT, totals and cashier signature visible; no clipping.
- Invoice: 1 page, A5 (`420 × 594.96 pt`), watermark, APPROVED, customer/value/signature content visible; no clipping.
- Waybill: 1 page, A5 (`420 × 594.96 pt`), watermark, APPROVED, quantity/content/signature blocks visible; no clipping.
- All three PDFs parsed successfully as PDF 1.4 and retained the expected searchable text.
- Direct HTML contained no script blocks and used an embedded watermark data URI.

This QA proves the renderer/document path and A5 layout. It does not replace a physical printer-driver/paper acceptance test.

## Browser/mobile visual QA

The settings UI and live application shell were inspected at a 390 × 844 portrait viewport.

- Document width equaled viewport width (390 px); no horizontal overflow.
- Address/device/code inputs and mode selector used full mobile width.
- Pair/forget and test controls fit the available row/wrap layout.
- Connection status and Windows printer status remained separate/readable.
- v3.12.1/r46 title, header and service-worker registration were visible.

## Safety/regression evidence

- Protected v3.12.0 ZIP SHA-256 remained `2B1EF684FB3D98E5CF52C0C147D0BF00A22134AE94DE073235FAF2A43A60258C`.
- Customer Master, Cloud Sync, backup/restore, grouped navigation and all intelligence module files required to remain unchanged are byte-identical to the protected baseline.
- `recordSaleOutFIFO()`, Stock In, Quick Sale calculation sections, Invoice totals/VAT, Waybill creation and Undo/reversal functions required to remain unchanged were function/section-equivalent to the baseline.
- `tradeflow_v321_zola` and both `0000` entry safeguards remain unchanged.
- No SQL file, database migration, Supabase print queue, printer Cloud Sync operation or business-data print configuration was added.

## Skipped physical tests

The following were deliberately not claimed as executed:

1. A5 paper output through the Owner's actual printer/driver.
2. Receipt, Invoice and Waybill paper acceptance on that printer.
3. Real phone pairing over the Owner's shop Wi-Fi and browser Local Network Access prompt.
4. Internet-disconnected real-phone LAN printing.
5. Windows Firewall confirmation on the Owner's production PC.

The exact manual checklist is in `print-bridge/windows/README.md`.

## Limitations requiring Owner action

- Enter the exact deployed GitHub Pages HTTPS origin in the bridge. It was not available in the protected source, so wildcard or guessed origins were not shipped.
- Install/confirm WebView2 Evergreen Runtime on the Windows host.
- Select and test the actual Windows-installed printer.
- Enable LAN and a Private-profile firewall rule only if phone/tablet printing is required.
- Grant the browser's one-time Local Network Access permission if prompted.
- Validate physical A5 margins/printable area for the selected printer driver.

## Release-manifest and ZIP integrity

- `RELEASE_FILE_MANIFEST.json`: **PASS**, version 3.12.1/r46 with 254 hashed release files and no `bin`, `obj` or `artifacts` entries.
- PWA full ZIP: **PASS**, 255 file entries (254 manifest-controlled files plus the manifest itself); every manifest entry was present and every SHA-256 matched the compressed entry.
- Windows Bridge ZIP: **PASS**, 615 file entries; self-contained executable, one-click installer launcher, PowerShell installer/firewall scripts and README were present and readable.
- Both ZIP archives opened successfully through `System.IO.Compression` and were independently SHA-256 hashed after packaging.

## Final status

Automated result: **PASS**.  
Failed automated tests: **none**.  
Manual hardware/network acceptance: **pending Owner execution**.
