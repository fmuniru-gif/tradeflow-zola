# ZEZMS TradeFlow Owner Edition v3.11.1

Build: `20260815-unified-customer-capture-r44`

Release: **Unified Customer Capture & Receipt Customer Requirement**

Protected baseline: v3.11.0 / `20260814-sales-channel-capture-r43`

## Scope

This is a narrow Sale Out customer-capture refinement. The v3.11.0 interface presented separate normal receipt and Quick Sale customer/source controls. v3.11.1 replaces them with one visible **Customer & Source** section shared by both completion actions. It also requires Customer Name and Telephone for newly created Print Receipt sales while keeping both fields optional for Quick Sale.

No Customer Master, Stage 5C feature, messaging, loyalty system or customer merge/edit workflow is introduced.

## Unified controls

The shared authoritative controls are:

- Customer Name: `#posCust`
- Telephone: `#posTel`
- Sales Source: `#posSalesChannel`
- Other Source: `#posSalesChannelOther`, conditionally displayed by `#posSalesChannelOtherWrap`
- Receipt location remains the existing optional `#posLoc` field in the same compact card.

The following duplicated v3.11.0 controls and their independent state/bindings were removed:

- `#quickCustomerName`
- `#quickCustomerPhone`
- `#quickSalesChannel`
- `#quickSalesChannelOther`
- `#quickSalesChannelOtherWrap`
- `_quickCustomerName`, `_quickCustomerPhone`, `_quickSalesChannel`, `_quickSalesChannelOther`

Both Print Receipt and Quick Sale now read the same visible values directly. There are no hidden customer/source copies and no duplicate DOM IDs.

The helper text states that Customer Name and Telephone are required for Print Receipt and optional for Quick Sale. The contradictory v3.11.0 unidentified-receipt reminder was removed.

## Print Receipt validation

After the existing active-cashier and nonempty-cart checks, `printReceiptSale()` reads and trims the shared Customer Name and Telephone controls. It then applies presence-only validation:

1. blank Customer Name shows `Customer Name is required to print a receipt.`, focuses `#posCust` and returns;
2. blank Telephone shows `Customer Telephone is required to print a receipt.`, focuses `#posTel` and returns.

These returns occur before subtotal/VAT/total calculations, receipt-number generation, FIFO, debtors, database insertion, `saveDB()`, receipt preview or sync-triggering persistence. Failed validation therefore preserves the complete cart, supplied customer field, Sales Source, Other Source, location and payment form state and performs zero operational writes.

Telephone validation checks only for nonblank text. Existing formatting is preserved, including spaces, hyphens and international numbers.

## Quick Sale behavior

Quick Sale remains optional for customer identity. Blank, name-only, telephone-only and complete identity combinations all post through the existing one-step action. The canonical `DB.inventoryTxns` `SALE_OUT/QUICK` record retains:

- `customerName`
- `customerPhone`
- `salesChannel`
- `salesChannelOther`

Blank name and telephone remain analytically Unidentified even when Sales Source is Walk-in. No duplicate transaction or customer object is created.

## Storage and reset

Normal receipt sales remain authoritative in `DB.sales`, using the existing `customer` and `contact` identity fields plus `salesChannel` and `salesChannelOther`. The printable `DB.receipts` copy remains unchanged.

After either successful action, the one shared reset clears Customer Name, Telephone and location, resets Sales Source to Walk-in, clears Other Source, hides it on the next render and clears the cart/payment-entry state. Failed validation never invokes the reset.

## Compatibility and protected behavior

- Stage 5A phone-first/exact-name identity is unchanged.
- Stage 5B channel semantics, historical Unspecified behavior and channel formulas are unchanged.
- Customer Intelligence high-contrast styling under `#customerIntelligenceLab`, `.customer-intelligence-view` and `.stage5b-capture` is retained.
- Existing receipts with missing identity or channel metadata continue to reprint safely.
- The A5 watermark, APPROVED stamp, signatures, VAT and totals are unchanged.
- FIFO, quantities, prices, discounts, cost, profit, cash, debtors, Stock In, Purchase Orders and reversal mathematics are unchanged.
- Cloud Sync and backup/restore formats are unchanged; no new metadata fields were added.
- Database key remains `tradeflow_v321_zola`.
- No SQL or Supabase migration is required.

## GitHub Pages selected-file upgrade from verified v3.11.0

Replace:

- `index.html`
- `manifest.json`
- `sw.js`
- `FORCE_UPDATE_MOBILE.html`
- `README.md`
- `RELEASE_FILE_MANIFEST.json`
- `js/operations-update.js`

Add:

- `UNIFIED_CUSTOMER_CAPTURE_v3.11.1_RELEASE_NOTES.md`
- `UNIFIED_CUSTOMER_CAPTURE_v3.11.1_TEST_REPORT.md`

Keep `js/operations-update.js` inside the `js` folder. Uploading the complete extracted release is also safe, but GitHub Pages does not extract the ZIP itself.
