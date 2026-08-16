# ZEZ Print Bridge 1.0.0 (`ZEZPRINT/1`)

ZEZ Print Bridge is the Windows companion for ZEZMS TradeFlow Owner Edition v3.12.1. It receives authenticated A5 documents from a paired PWA device and silently prints them through a selected Windows-installed printer. It does not read the business database and does not use Supabase.

## Requirements

- Windows 10 version 1809 or later, x64
- Microsoft Edge WebView2 Evergreen Runtime
- A printer installed and working in Windows
- For phone/tablet printing, the Windows computer and device must be on the same private LAN/Wi-Fi

The supplied `win-x64-self-contained` package carries the .NET runtime. Visual Studio and a separate .NET installation are not required on the shop computer. If WebView2 is missing, install the Microsoft WebView2 Evergreen Runtime and restart the bridge.

## Install

1. Extract the complete Windows Bridge ZIP to a normal folder.
2. Double-click `INSTALL_ZEZ_PRINT_BRIDGE.cmd`.
3. The bridge installs for the current Windows user under `%LOCALAPPDATA%\Programs\ZEZPrintBridge`, creates a Start-menu shortcut and opens its settings window.
4. Normal localhost use does not require Administrator privileges. LAN firewall setup is deliberately separate.

The executable can also be run directly from the package's `app` folder for evaluation. Only one bridge instance can run at a time.

## Select the printer

1. Open **ZEZ Print Bridge** from Start or the notification area.
2. Select **ZEZMS Default Printer** from the Windows-installed printers list.
3. Select the port (default `43127`) and save.
4. Confirm that **Bridge Status** and **Selected Printer** are ready.

The printer name and all bridge configuration are stored only in the current Windows user's local application-data folder. They are not placed in ZEZMS, Cloud Sync or Customer Master.

## Configure the allowed ZEZMS origin

In **Allowed ZEZMS Origins**, enter the exact production origin only, for example `https://account.github.io`. Enter an origin, not a full page path, and do not add `*`. The release does not guess an origin because no confirmed production GitHub Pages URL was present in the protected application files.

Save and restart the bridge after changing listener, LAN or origin settings.

## Pair the desktop PWA

1. Keep **LAN enabled** off when only the same Windows PC will print.
2. In the bridge, select **Generate Pairing Code**. The six-digit code is single-use and expires after 10 minutes.
3. In ZEZMS open **Settings → Printing & Wireless Printer Readiness**.
4. Select **Direct One-Click Print** and enter `http://127.0.0.1:43127`.
5. Enter the pairing code and choose **Pair Device**.
6. Run **Direct Print Test**.

Each browser/PWA installation pairs independently. **Forget Pairing** revokes the current device token and restores System Print mode.

## Enable LAN and pair a phone

1. In Windows, confirm the network is classified **Private**, not Public.
2. In the bridge, enable **LAN access**, enter the exact ZEZMS production origin, save and restart.
3. Run `Enable-LanFirewallRule.ps1` from an elevated PowerShell window, supplying the installed executable path if prompted by your operating procedure. The script shows the exact executable/port and requires typing `ENABLE`; it creates a Private-network-only inbound rule.
4. The bridge displays its private LAN address, such as `http://192.168.1.25:43127`.
5. Join the phone to the same shop Wi-Fi, open the installed ZEZMS PWA and enter that bridge address in Direct Printing settings.
6. Generate a new temporary pairing code on Windows and pair the phone.
7. If Chrome requests **Local Network Access**, allow it for the ZEZMS site.
8. Run **Direct Print Test** once.

No permanent token is shown in the pairing screen or encoded in a QR code. The phone does not select a printer; the Windows bridge always uses the configured Windows printer.

## Auto-start and tray use

Enable **Start ZEZ Print Bridge with Windows** in the bridge settings if the phone must print whenever the shop PC is on. This is optional and uses the current user's Windows startup entry. Closing the settings window keeps the bridge in the notification area; use the tray menu to reopen settings or exit.

## Printing and fallback

- Direct mode supports Receipt, Invoice, Waybill and the customer-free A5 test page.
- Receipt auto-print begins only after the sale and Customer Master work have committed.
- A print failure never reverses a sale, FIFO allocation, cash entry, Invoice or Waybill.
- Intentional **Direct Reprint** creates a new job ID. Accidental duplicate retries of the same job ID are idempotent.
- When Direct Print is unavailable, ZEZMS offers **Retry**, **Use System Print**, or **Cancel**. It never opens a print dialog silently.
- Switch **Print Mode** to **System Print Dialog** at any time to use the retained v3.12.0 path.

## Firewall removal

Run `Disable-LanFirewallRule.ps1` from an elevated PowerShell window with the configured port. It displays the exact rule and requires typing `REMOVE`. Disabling LAN in the bridge returns the listener to loopback only.

## Troubleshooting

- **Bridge unavailable:** confirm the bridge is running, the address/port is correct, and the device is on the same LAN. Do not use a public IP.
- **Pairing required:** generate a new code and pair again. Codes expire after 10 minutes and cannot be reused.
- **Origin rejected:** enter the exact HTTPS origin shown in the PWA address bar, without a path or trailing slash, then restart the bridge.
- **Local network permission:** allow the browser's Local Network Access request. If denied, reset that site permission and retry.
- **Printer unavailable:** print a Windows test page, confirm the selected printer still exists and is online, then reselect it in the bridge.
- **WebView2 unavailable:** install Microsoft Edge WebView2 Evergreen Runtime, then reopen the bridge.
- **Phone cannot connect:** enable LAN explicitly, confirm a Private Windows network and the Private-profile firewall rule, and verify both devices use the same Wi-Fi.
- **Direct output fails but the transaction succeeded:** use **Direct Reprint** or the explicit **Use System Print** fallback; do not repeat the sale.

## Security design

- Loopback-only by default; LAN listeners bind only to active private IPv4 interfaces after explicit enablement.
- Exact CORS origin allowlist; wildcard origins are not supported.
- Six-digit temporary, single-use pairing codes; 32-byte cryptographically random device tokens.
- Windows stores only token hashes inside DPAPI-protected current-user data. PWA tokens use the separate device-local key `zezms_print_bridge_v1`.
- Bearer authentication is required for protected endpoints. Canonical document types are `receipt`, `invoice`, `waybill` and `test`.
- Printable HTML is limited to 4 MB and validated as presentation-only, self-contained A5 content.
- WebView2 scripts, host objects, web messages, dialogs, remote navigation and local-file access are disabled/blocked.
- Logs contain only timestamp, job ID, document type, result and printer name—not HTML, customer identity, item details or totals.
- Idempotency metadata is retained for at most 24 hours/500 jobs. Receipt HTML is not archived.
- No cloud print queue, public listener, network scanner, vendor protocol, WebUSB, WebBluetooth or automatic update is included.

## Physical-printer acceptance checklist

### Windows

- [ ] Install bridge and reopen it from Start/tray.
- [ ] Select the intended installed printer and print its normal Windows test page.
- [ ] Enter the exact production ZEZMS origin.
- [ ] Pair desktop PWA at `127.0.0.1`.
- [ ] Print A5 Direct Test; check A5 portrait, margins, colours, watermark and APPROVED stamp.
- [ ] Direct-print one controlled Receipt; verify customer, phone, Sales Source, VAT, totals and cashier signature.
- [ ] Direct-print one saved Invoice and one Waybill; verify values, quantities and branding.
- [ ] Double-click once during a controlled test and confirm only one copy prints.
- [ ] Stop/offline the printer and confirm ZEZMS reports printer unavailable without changing the saved document.
- [ ] Use Direct Reprint and confirm exactly one deliberate second copy.

### Phone

- [ ] Join the same private shop Wi-Fi as the Windows host.
- [ ] Enable LAN and the explicit Private-profile firewall rule.
- [ ] Pair with a fresh code using the displayed LAN address.
- [ ] Grant Local Network Access if requested.
- [ ] Print A5 Direct Test with one tap.
- [ ] Direct-print a controlled Receipt, Invoice and Waybill.
- [ ] Disconnect internet while retaining shop Wi-Fi/LAN and repeat A5 test plus a locally available Receipt reprint.
- [ ] Leave the shop LAN and confirm the bridge-unreachable message and explicit System Print option.
