# ZEZMS TradeFlow Owner Edition v3.12.1

Release: **One-Click Direct Printing & Mobile Wireless Print Bridge**  
Build: `20260816-direct-print-bridge-r46`  
Windows Bridge: `1.0.0`  
Protocol: `ZEZPRINT/1`

## Outcome

Receipts, Invoices and Waybills can now be sent as self-contained branded A5 HTML to an authenticated local Windows companion and printed silently through a selected Windows-installed printer. The same bridge supports the installed desktop PWA over loopback and a paired phone/tablet over the explicitly enabled private shop LAN.

The existing **System Print Dialog** path remains available and is the safe default until a device is paired and Direct mode is selected.

## PWA changes

- Added device-local `local-bridge` transport while retaining `system-dialog` compatibility.
- Added Bridge Address, mode, connection/printer status, pairing, revocation, Direct A5 Test and System A5 Test controls to Printing settings.
- Added modern browser Local Network Access request handling using local target address space and clear permission/network errors.
- Routed production Receipt, Invoice and Waybill output through `ZEZPrint` only when Direct mode is ready.
- Reused the existing production document HTML generators. Direct documents retain A5 portrait layout, full-page embedded watermark, APPROVED mark, signatures, customer details, Sales Source, VAT, items and totals.
- Added automatic one-click Receipt print only after the transaction is committed. Quick Sale semantics are unchanged and Quick Sale does not auto-print.
- Added **Direct Reprint** to saved Receipt output. Saved Invoice/Waybill print actions create a fresh job ID when intentionally reprinted.
- Added in-flight locking, unique UUID job IDs, bounded polling/timeouts and explicit Retry/System/Cancel fallback.
- Added the direct-print module and updated service-worker cache `zezms-direct-print-bridge-20260816-r46` for offline shell use.

Direct configuration uses only `localStorage` key `zezms_print_bridge_v1`. It is not inside `tradeflow_v321_zola`, Customer Master, backup payloads, Supabase or Cloud Sync.

## Windows companion

- .NET 8 Windows tray/settings application with Microsoft WebView2 silent `PrintAsync`.
- Enumerates printers installed in Windows and stores the selected printer in current-user local configuration.
- Explicit A5 portrait custom media (`148 × 210 mm`), backgrounds enabled, one page per side, no print UI.
- Local HTTP endpoints: `/health`, authenticated `/status`, pairing/revocation `/pair`, authenticated `/print`, and authenticated `/job/{id}`.
- Loopback-only binding by default; private IPv4 LAN binding requires explicit Owner enablement.
- Exact-origin CORS allowlist with Local Network Access preflight response; never wildcard CORS.
- Single-use six-digit pairing code expiring after 10 minutes; strong 32-byte random browser token.
- Only SHA-256 token hashes are persisted, protected with Windows DPAPI for the current user.
- 4 MB payload ceiling; only Receipt, Invoice, Waybill and Test document types; UUID IDs, A5 portrait and 1–5 copies validation.
- Presentation-only HTML validation plus a hardened WebView2 with scripts, host objects, web messages, dialogs, remote navigation and local-file access disabled/blocked.
- Serialized print queue and persisted 24-hour/500-job idempotency metadata.
- Operational metadata-only logs; no printable HTML, customer identity, item lines or totals.
- Optional current-user Windows auto-start. Firewall scripts are explicit, Private-network-only and require confirmation/elevation.
- Explicit `--mock-printer` mode exists for QA only and is not enabled in normal startup.

## Transaction safety

Printing is output-only and occurs after business persistence. A print failure does not roll back or repeat a sale, FIFO allocation, cash entry, Customer Master update, Invoice or Waybill. An accidental retry of the same job ID returns the remembered status; an intentional reprint receives a new job ID.

No database key, schema, SQL, Supabase table/column, print queue or Cloud Sync operation was added. Customer Master, FIFO, Sale Out/Quick Sale calculations, Stock In, Purchase Orders, VAT and the two `0000` entry safeguards retain the protected v3.12.0 logic.

## Installation/deployment boundary

GitHub Pages hosts the PWA only. Install the separate Windows Bridge ZIP on the shop Windows PC; do not place its `app` runtime files in the GitHub Pages repository.

The exact production GitHub Pages origin was not present in the protected source (only a placeholder existed), so the Bridge ships deny-by-default. The Owner must enter the exact deployed HTTPS origin in **Allowed ZEZMS Origins** before pairing.

## Mandatory GitHub Pages upgrade files from v3.12.0

Replace these runtime files, preserving paths:

1. `index.html`
2. `manifest.json`
3. `sw.js`
4. `js/operations-update.js`
5. `js/invoice-waybill.js`
6. `js/mobile-vertical-layout.js`
7. `js/print-readiness-v3120.js`
8. `js/direct-print-bridge-v3121.js` (new)

Also upload `README.md`, `RELEASE_FILE_MANIFEST.json`, these release notes and the test report for a complete documented repository release. Existing assets, especially `assets/zez-document-watermark.jpg`, must remain at their current paths.

After GitHub Pages deploys, close all old PWA windows, reopen the app, allow the new service worker to activate and confirm build `20260816-direct-print-bridge-r46` in page source.

## Windows package

Install `ZEZ_PRINT_BRIDGE_v1.0.0_ZEZPRINT1_WIN_X64_SELF_CONTAINED.zip`. Extract it fully and run `INSTALL_ZEZ_PRINT_BRIDGE.cmd`. See `print-bridge/windows/README.md` for printer, origin, LAN, firewall, pairing and physical acceptance steps.

## Not included

No cloud/remote print queue, internet printing, vendor-specific printer protocol, direct printer-IP path, network scan, WebUSB, WebBluetooth, Android companion, automatic bridge updater, remote QR service or Stage 5D was added.
