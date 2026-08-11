# ZEZMS TradeFlow Owner Edition v3.8.4

## New Product Pricing Simulator — Stage 3B.1

Build: `20260811-new-product-pricing-r37`

This release adds an isolated, runtime-only New Product mode to the existing Pricing Policy Lab. It lets the Owner/Admin test proposed purchase quantity, supplier cost, batch acquisition costs, additional business cost, target gross margin, market price and contemplated price before the product exists in the catalogue or inventory.

## Existing Product versus New Product

- **Existing Product — Analyse pricing for inventory already in stock.** This is the unchanged v3.8.3 Lab. It continues to use the frozen Stage 3A current-stock aggregate, weighted remaining cost, current listed price, temporary margin, additional business cost, contemplated price, portfolio preview and four temporary KPIs.
- **New Product — Estimate pricing before purchasing or creating the product in inventory.** It uses only values typed into the new form. It does not require a catalogue match and does not reuse or merge existing-stock weighted cost.

The two scenarios remain separate while switching modes. Re-rendering the Dashboard, navigating away or refreshing clears runtime state.

## Isolated architecture

The new `js/new-product-pricing-v384.js` module loads after Stages 1, 2, 3A and 3B. It wraps the verified Dashboard output, adds the two-mode interface and performs only DOM/runtime calculations. The inherited `js/pricing-policy-lab-v383.js` and all other existing JavaScript files remain byte-for-byte unchanged.

The simulator does not read or write `DB`, storage, IndexedDB, Supabase, Cloud Sync or operational collections. It contains no `saveDB()`, Stock In, Purchase Order, Sale Out, Quick Sale or transaction-function reference.

## Inputs and formulas

Let:

- `Q` = Proposed Quantity, a positive whole number
- `S` = Supplier Unit Cost
- `B` = Additional Batch Acquisition Costs
- `A` = Additional Business Cost / Unit
- `m` = Target Gross Margin % as a decimal
- `M` = optional Market / Competitor Price
- `P` = optional Contemplated Selling Price

Cost and capital formulas:

- Acquisition Extras / Unit = `B / Q`
- Landed Unit Cost = `S + (B / Q)`
- Adjusted Reference Cost / Unit = `Landed Unit Cost + A`
- Supplier Purchase Cost = `S × Q`
- Total Landed Batch Cost = `Landed Unit Cost × Q`
- Adjusted Cost Reference = `Adjusted Reference Cost / Unit`

Advisory scenario formulas:

- Advisory Selling Price = `Adjusted Reference Cost / (1 − m)`
- Projected GP / Unit = `Advisory Selling Price − Adjusted Reference Cost`
- Projected Batch Gross Profit = `Projected GP / Unit × Q`
- Projected Batch Sales = `Advisory Selling Price × Q`
- Projected GP per GH₵1,000 Landed Capital = `Projected Batch GP / Total Landed Batch Cost × 1000`, when landed batch cost is above zero

Market-price formulas:

- Market GP / Unit = `M − Adjusted Reference Cost`
- Market Gross Margin = `(M − Adjusted Reference Cost) / M × 100`, when `M` is above zero
- Market vs Advisory Gap = `M − Advisory Selling Price`
- Projected Batch GP at Market Price = `Market GP / Unit × Q`
- GP per GH₵1,000 at Market Price = `Market Batch GP / Total Landed Batch Cost × 1000`, when landed batch cost is above zero

Contemplated-price formulas:

- Contemplated GP / Unit = `P − Adjusted Reference Cost`
- Contemplated Gross Margin = `Contemplated GP / Unit / P × 100`, when `P` is above zero
- Contemplated Batch GP = `Contemplated GP / Unit × Q`
- Contemplated vs Advisory = `P − Advisory Selling Price`
- Contemplated vs Market = `P − M`, when a market price exists

Gross-margin mathematics—not markup—is used. Full precision is retained internally, normal currency precision is used for display and no psychological or automatic rounding policy is applied.

## Runtime-only and no-creation guarantees

The Product Name / Description is merely a temporary scenario label. The simulator does not:

- create or update a catalogue product;
- allocate a Product ID;
- create a stock row or Stock In record;
- create a Purchase Order or supplier entry;
- save a selling price;
- call `saveDB()` or trigger Cloud Sync;
- create a buy/do-not-buy recommendation;
- transfer any value to Stock In or Sale Out.

Reset restores Product Name blank, Quantity 1, Supplier Unit Cost blank, both additional-cost inputs to zero, margin blank, market price blank and contemplated price blank, and hides all calculated results.

## VAT and capital-efficiency limitations

Supplier costs, market prices and contemplated prices must be entered on a consistent tax basis. Existing transaction VAT behavior remains authoritative and is not called, modified or recalculated by the simulator.

Projected GP per GH₵1,000 of landed capital is a pricing-scenario ratio, not an ROI or time-adjusted return. A new product has no reliable demand, sell-through or turnover history; a faster lower-margin product may outperform a slower higher-margin product. The simulator therefore presents economics without a purchase recommendation.

## Protected boundaries

- No FIFO, Sale Out, Quick Sale, Stock In, Purchase Order, supplier, receipt, invoice, waybill, VAT, Price Adjustment, `0000`, discount, cash, expense, account, undo, rollover, sync, backup, authentication, staff, device, product-search, product-creation or historical KPI logic changed.
- Stage 1, Stage 2, Stage 3A and Stage 3B Existing Product files/formulas remain unchanged.
- No permanent margin, price floor, Sale Out warning, block or enforcement.
- No database, IndexedDB, SQL or Supabase migration.
- No new dependency or framework.
- Database key remains `tradeflow_v321_zola`.
- Stage 3C is not included.

## Files

Added:

- `js/new-product-pricing-v384.js`
- `NEW_PRODUCT_PRICING_v3.8.4_RELEASE_NOTES.md`
- `NEW_PRODUCT_PRICING_v3.8.4_TEST_REPORT.md`

Active release files updated:

- `index.html`
- `manifest.json`
- `sw.js`
- `FORCE_UPDATE_MOBILE.html`
- `README.md`
- `RELEASE_FILE_MANIFEST.json`
