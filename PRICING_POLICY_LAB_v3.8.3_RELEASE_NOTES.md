# ZEZMS TradeFlow Owner Edition v3.8.3

## Pricing Policy Lab — Stage 3B

Build: `20260811-pricing-policy-lab-r36`

This release adds a read-only, advisory-only and runtime-only Pricing Policy Lab beneath Current Stock Pricing Guidance. It lets the Owner/Admin test a gross-margin target, a manually estimated additional business cost per unit and an optional contemplated selling price. Nothing entered or calculated by the Lab is saved, synced, enforced or applied to Sale Out.

## Runtime-only design

- The Lab is part of the existing protected Dashboard; it has no independent route or cashier shortcut.
- It reuses the exact frozen current-stock aggregate already built by Stage 3A. It does not independently rescan operational data or recreate the current-stock cost model.
- Selected product, target margin, additional cost, contemplated price, calculated prices, statuses, preview and KPIs exist only in the rendered page.
- Reset clears the scenario, returns Additional Business Cost/Unit to zero and removes temporary results, KPIs and preview rows.
- Leaving the Dashboard or refreshing may clear the scenario. This is intentional.
- No Lab state is written to `DB`, localStorage, Supabase, IndexedDB, Cloud Sync, cookies or any other persistence layer.

## Formulas

Let:

- `C` = Weighted Remaining Cost/Unit from Stage 3A
- `A` = manually entered Additional Business Cost/Unit
- `m` = Target Gross Margin % expressed as a decimal
- `L` = reliable Current Listed Price
- `P` = optional Contemplated Selling Price

The Lab calculates:

- Adjusted Reference Cost/Unit = `C + A`
- Advisory Policy Price = `(C + A) / (1 - m)`
- Current Price Gap = `L - Advisory Policy Price`
- Current Price Gap % = `Current Price Gap / Advisory Policy Price × 100`, when the advisory price is above zero
- Scenario GP/Unit at Current Price = `L - (C + A)`
- Scenario Margin at Current Price = `Scenario GP/Unit / L × 100`, when `L` is above zero
- Contemplated GP/Unit = `P - (C + A)`
- Contemplated Margin = `Contemplated GP/Unit / P × 100`, when `P` is above zero
- Contemplated vs Policy = `P - Advisory Policy Price`
- Contemplated vs Current = `P - L`, when a reliable listed price exists

The advisory-price calculation uses gross-margin mathematics, not markup. Gross margin is profit divided by selling price; markup is profit divided by cost.

## Product result and portfolio preview

The selected-product panel shows Product, Product ID, Category, Remaining Qty, Remaining Stock Cost, Weighted Remaining Cost/Unit and Current Listed Price. A missing or ambiguous listed price does not prevent cost-based advisory-price calculation; current-price comparisons display `—`.

Once the Target Gross Margin is valid, the same temporary margin and additional cost are applied in memory to the Stage 3A current-stock aggregate. The preview reports adjusted cost, advisory price, gap, scenario margin and factual Above/At/Below/Price Unavailable status. Below-policy products sort first by greatest negative gap, then remaining stock cost descending and product name.

The temporary KPI row reports:

- Products Below Temporary Policy
- Capital in Products Below Temporary Policy
- Products Above Temporary Policy, including products exactly at the temporary policy
- Current Stock with Unresolved Price

Capital Below Policy is associated remaining stock capital, not a realised loss.

## Validation and numeric safety

- Target Gross Margin starts blank and accepts `0.00` through `99.99` only.
- Additional Business Cost/Unit starts at zero and rejects negative or malformed values.
- Contemplated Selling Price is optional and rejects negative or malformed values.
- Zero/missing cost, zero margin, near-100% margin, missing/Multiple listed price, blank/zero contemplated price, numeric strings and malformed rows render without `NaN` or `Infinity`.
- Full precision is retained internally; existing GH₵ formatting is used for display.
- One pesewa is used as the At Temporary Policy comparison tolerance.

## Protected boundaries

- No product price, price floor, permanent margin, category default or product policy is created.
- No Sale Out, Quick Sale, FIFO, Stock In, Purchase Order, receipt, invoice, waybill, VAT, Price Adjustment, `0000` safeguard, discount, cash, expense, account, undo, rollover, sync, backup, authentication, staff, device, search or historical KPI behavior changed.
- No warning, blocking, override or enforcement is connected to Sale Out.
- No expenses, salaries, rent, delivery or other overhead are auto-allocated. The flat allowance is entered manually.
- No database or Supabase/SQL migration is required.
- No IndexedDB, dependency, framework or network request was added.
- Database key remains `tradeflow_v321_zola`.
- Stage 1, Stage 2 and Stage 3A modules remain byte-for-byte unchanged.
- Stage 3C is not included.

## Files

Added:

- `js/pricing-policy-lab-v383.js`
- `PRICING_POLICY_LAB_v3.8.3_RELEASE_NOTES.md`
- `PRICING_POLICY_LAB_v3.8.3_TEST_REPORT.md`

Active release files updated:

- `index.html`
- `manifest.json`
- `sw.js`
- `FORCE_UPDATE_MOBILE.html`
- `README.md`
- `RELEASE_FILE_MANIFEST.json`

## Limitation

One flat additional cost per unit may be unrealistic across products with very different values, handling needs, warranty exposure or delivery costs. The preview is a scenario test only; it is not a saved category/product policy or a market-price recommendation.
