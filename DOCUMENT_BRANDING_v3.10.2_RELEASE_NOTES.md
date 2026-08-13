# ZEZMS TradeFlow Owner Edition v3.10.2

Build: `20260813-document-branding-r42`

Release: **Document Branding — APPROVED Stamp & Watermark**

## Scope

This is a document-presentation-only release based on the verified v3.10.1 rollback baseline. It brands Receipt, Invoice and Waybill previews, browser print output, Save-to-PDF output and the app's direct PDF downloads. Purchase Orders and all business workflows remain unchanged.

## Watermark

- Asset: `assets/zez-document-watermark.jpg`
- Source integrity: copied unchanged from the Owner-supplied local Zola Electronics Zone logo.
- SHA-256: `c477963932d6d765d0c2678b701d90aabfe9202ec486d68c2acb1f341b12c695`
- Paper: A5 portrait, `148 mm × 210 mm` (`419.53 × 595.28` PDF points).
- Stretch: deliberately rendered at `100% 100%` across the complete physical page; the original aspect ratio is not preserved, as requested.
- Effective opacity: `0.10`.
- Layering: watermark below document content; content below the APPROVED stamp/signature area.

Browser previews use an absolutely positioned non-interactive watermark layer. Browser print output uses a fixed, out-of-flow page layer with exact print-colour adjustment; Chromium-compatible print engines repeat that fixed layer on each page. Direct PDF downloads embed the same JPEG as an image XObject, apply a 10% PDF graphics state, and place it as the first drawing command on every generated page.

The logo is local and is included in the service-worker precache. If it is unexpectedly unavailable, CSS output continues without the background and direct PDF generation catches the load failure and continues without the image; document data and the APPROVED stamp remain available.

## APPROVED stamp

All three document types use the same restrained design: uppercase bold `APPROVED`, a modest green outlined rounded rectangle, a very light/transparent interior and a slight two-degree rotation. It remains distinct in colour and grayscale.

- Receipt: immediately above the existing Cashier Signature line.
- Invoice: immediately above the existing authorised `For <business name>` signature line.
- Waybill: immediately above the existing `Goods issued by` signature line.

The original signature lines, labels and signatory information are retained. The stamp is emitted only at the normal final authorisation area, not on every page.

## Compatibility and boundaries

- Database key remains `tradeflow_v321_zola`.
- No database, SQL or Supabase migration.
- No operational data write is introduced.
- Sale Out, Quick Sale, Stock In, FIFO, Purchase Orders, VAT, Price Adjustment, cash, expenses, accounts, undo, rollover, Cloud Sync, backup/restore, authentication, staff and device management are unchanged.
- The fixed `TRANSACTION_ENTRY_GUARD_PIN = '0000'` for Price Adjustment and VAT access is unchanged.
- The verified v3.10.1 grouped navigation and direct Management views are unchanged.

## Deployment

Deploy the complete ZIP contents to the GitHub Pages repository root. For a selected-file upgrade from verified v3.10.1, replace:

- `index.html`
- `manifest.json`
- `sw.js`
- `FORCE_UPDATE_MOBILE.html`
- `README.md`
- `RELEASE_FILE_MANIFEST.json`
- `js/operations-update.js`
- `js/invoice-waybill.js`
- `js/pdf-export.js`

Add:

- `assets/zez-document-watermark.jpg`
- `DOCUMENT_BRANDING_v3.10.2_RELEASE_NOTES.md`
- `DOCUMENT_BRANDING_v3.10.2_TEST_REPORT.md`

Preserve the `assets/` and `js/` folder paths exactly. GitHub Pages does not extract ZIP files.
