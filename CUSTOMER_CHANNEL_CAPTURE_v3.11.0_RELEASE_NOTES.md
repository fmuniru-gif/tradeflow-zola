# ZEZMS TradeFlow Owner Edition v3.11.0

Build: `20260814-sales-channel-capture-r43`

Release: **Customer Capture & Sales Channel Attribution**

Protected baseline: v3.10.2 / `20260813-document-branding-r42`

## Scope

This release adds optional customer/source capture to new normal and Quick Sale transactions, extends the existing read-only Customer Relationship Intelligence view with factual sales-channel analysis, and repairs the unreadable Customer Intelligence form controls. It is a backward-compatible metadata release: quantities, prices, discounts, VAT, cost, profit, FIFO, cash and stock movement are unchanged.

## Customer Intelligence readability repair

The existing Customer Intelligence controls were rendered outside the application's `.field` wrapper. They therefore inherited light text while retaining the browser's light default control background, producing the reported white-on-white defect.

The repair is scoped to `#customerIntelligenceLab` / `.customer-intelligence-view`. Its `input` and `select` controls use:

- normal background `#0b1220`, text `#f1f5f9`, border `#475569`;
- placeholder `#94a3b8` at full opacity;
- focus border `#14b8a6` with a restrained teal focus ring;
- readable disabled/read-only colours;
- dark dropdown options and WebKit autofill text/background protection;
- mobile `min-width: 0`, 52 px minimum control height and 16 px font sizing.

New transaction controls are scoped through `.stage5b-capture` and use the same contrast model. No global `input`, `select` or `textarea` rule was added or changed.

## Capture model

The controlled channel list is:

1. `Walk-in`
2. `WhatsApp`
3. `Facebook`
4. `TikTok`
5. `Instagram`
6. `Phone Call`
7. `Referral`
8. `Corporate/B2B`
9. `Other`

`Unspecified` is an analytical fallback only. It represents historical records and missing/malformed metadata; historical data is not rewritten and is never inferred to be Walk-in.

Sales Source means where the particular sale originated. It is not payment method, delivery method, customer type or repeat-customer status. New forms default to Walk-in and reset to Walk-in after completion. Choosing Other reveals `Other Source`; its value is trimmed, limited to 100 characters and remains analytically grouped under Other.

Normal Sale Out keeps customer name and telephone optional. When both are blank, a visible reminder explains that the sale will be unidentified, but it never blocks posting. A blank-identity credit sale still uses a transaction-specific debtor label so existing debtor accounting remains valid without fabricating a customer identity on the sale.

## Storage

- Authoritative normal-sale analytics source: each new `DB.sales` record, with optional `salesChannel` and `salesChannelOther` fields. Existing `customer` and `contact` fields remain the customer identity inputs.
- Printable receipt copy: the matching `DB.receipts` record carries `salesChannel` and `salesChannelOther` so it can print without joining to another collection. `DB.receipts` is not scanned by Customer Intelligence.
- Authoritative Quick Sale source: the one existing canonical `DB.inventoryTxns` `SALE_OUT/QUICK` record, with `customerName`, `customerPhone`, `salesChannel` and `salesChannelOther`. No duplicate transaction is created.

Names are trimmed and capped at the existing 120-character convention. Telephone text is trimmed and capped at 40 characters without destructive normalisation. Channel values are accepted only from the controlled list. All captured values are escaped before HTML or print rendering.

## Receipt and records

New receipt preview, print and direct PDF output shows `Sales Source: <Channel>`. Other descriptions appear after the Other label. Old receipts omit the line safely. Sales Records also shows the source and captured Quick Sale identity where available.

The existing A5 layout, full-page local watermark, APPROVED stamp, signatures and all financial values remain intact. Invoice and Waybill capture and calculations are unchanged.

## Sales Channel Intelligence

The new subsection appears inside **Management -> Customer Relationship Intelligence** and reuses Stage 5A's 30/90/180/365-day and All Available History selector. There is no second menu entry or duplicate window control.

For each channel it derives completed distinct transactions, sales, sales share, average transaction value, identified transactions, identification coverage, distinct customers, repeat-customer transactions and repeat-customer sales. Formulas are:

- Sales Share = channel sales / total completed sales x 100; zero when total sales is zero.
- Average Transaction Value = channel sales / channel completed transactions; dash when the channel has no transactions.
- Identification Coverage = identifiable channel transactions / channel transactions x 100.
- Attributed Sales = sales for every channel except Unspecified.
- Attribution Coverage = specified-channel transactions / completed transactions x 100.
- Digital/Remote Sales = WhatsApp + Facebook + TikTok + Instagram + Phone Call.
- Digital/Remote Sales Share = digital/remote sales / total completed sales x 100.
- Top Sales Channel = the specified channel with the highest sales, excluding Unspecified.

Channel identification and customer detail use the existing Stage 5A phone-first/exact-name fallback. Customer Purchase Summary now includes Most Used Sales Channel and a channel transaction/sales breakdown. Referral and Corporate/B2B remain separate factual categories. No advertising ROI, performance target or automatic recommendation is claimed.

## Reversal, sync and backup safety

Customer Intelligence continues to scan only active `DB.sales` and active `DB.inventoryTxns` Quick Sale records. Existing VOID/UNDONE semantics therefore remove reversed transactions from customer and channel results without changing reversal mathematics.

Cloud Sync M4 already serialises the complete transaction objects inside its existing JSON operation payload, so the optional fields survive sync without physical Supabase columns. No SQL or Supabase migration is required. Backup uses the complete JSON database object and restore merges it with defaults, so new metadata is preserved and old backups without the fields remain valid.

## Deliberate boundaries

This release adds no Customer Master, merge/edit workflow, loyalty account, customer scoring, WhatsApp/SMS/email sending, campaign automation, referral rewards, quotation/B2B pipeline, SQL migration or Stage 5C feature.

Database key remains `tradeflow_v321_zola`.

## GitHub Pages selected-file upgrade from verified v3.10.2

Replace these files at their exact existing paths:

- `index.html`
- `manifest.json`
- `sw.js`
- `FORCE_UPDATE_MOBILE.html`
- `README.md`
- `RELEASE_FILE_MANIFEST.json`
- `js/operations-update.js`
- `js/pdf-export.js`
- `js/customer-intelligence-v3100.js`

Add:

- `CUSTOMER_CHANNEL_CAPTURE_v3.11.0_RELEASE_NOTES.md`
- `CUSTOMER_CHANNEL_CAPTURE_v3.11.0_TEST_REPORT.md`

Do not place JavaScript files outside `js/`. GitHub Pages does not extract ZIP files. A complete deployment may instead upload all extracted release contents while preserving every folder path.
