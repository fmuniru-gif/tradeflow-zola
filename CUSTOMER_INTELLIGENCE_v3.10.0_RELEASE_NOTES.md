# Customer Relationship Intelligence v3.10.0 — Release Notes

Version: **3.10.0**  
Build: **20260812-customer-intelligence-r40**  
Release: **Customer Relationship Intelligence Foundation**

## Scope

Stage 5A adds an Owner/Admin-only, read-only Dashboard section after Stage 4B. It provides runtime-only 30/90/180/365-day and All Available History windows, customer KPIs, coverage, transparent recency views, customer search, purchase summaries, product/category affinity, and value/frequency/concentration tables.

No Customer Master, edit/merge tool, customer score, customer tier, loyalty programme, messaging, contact automation or sales-channel field is introduced.

## Authoritative transaction and customer sources

- Normal receipt transactions, their stable receipt identity, customer name, telephone, location, date, authoritative receipt total and product lines come from active `DB.sales` records.
- Quick Sales come only from active `DB.inventoryTxns` records whose type/subtype is `SALE_OUT/QUICK`. Current Quick Sale capture does not store customer identity, so its value is normally classified as unidentified. A legacy/imported Quick Sale is identified only if that same transaction safely contains a usable customer name or telephone.
- `DB.receipts` is deliberately not scanned because it is the printable-register copy of normal receipts and would double-count them.
- Records flagged `voided` or with status `VOID`, `UNDONE` or `CANCELLED` are excluded, matching the existing active-sale semantics.
- Stable receipt/transaction IDs are deduplicated within each authoritative source. A multi-line receipt counts as one transaction.

## Identity rules

Telephone is primary when it contains 7–15 usable digits and only harmless telephone formatting. Spaces, hyphens, parentheses and periods are removed. Exact Ghana presentations `0XXXXXXXXX`, `233XXXXXXXXX`, `+233XXXXXXXXX` and `00233XXXXXXXXX` normalise to the same 12-digit identity. No number is invented and partial numbers are not matched.

When no usable telephone exists, the fallback is an exact customer name after trimming, collapsing repeated spaces and case normalisation. No fuzzy matching or punctuation removal is used: `Abdul Rahman` and `Abdul-Rahman` remain separate. Name-only and phone-keyed identities also remain separate because linking them automatically would be unsafe. Common anonymous placeholders are not treated as people.

Transactions without both a usable telephone and a safe customer name remain separate **Unidentified Customer** transactions. They contribute to total/unidentified sales and coverage, but never become one shared customer.

## Formulas and presentation

- Repeat Customer: distinct completed transactions `>= 2`.
- Repeat Customer Rate: repeat customers / identified customers × 100.
- Sales from Repeat Customers: sum of selected-window transaction totals assigned to repeat customers.
- Repeat Sales Share: repeat-customer sales / identified-customer sales × 100.
- Unidentified Sales Share: unidentified completed-sale value / total completed-sale value × 100.
- Average Identified Customer Value: identified-customer sales / identified customers.
- Top-5 Concentration: top-five identified-customer sales / total identified-customer sales × 100.
- Per-customer Avg Transaction Value: customer total sales / distinct completed transactions.
- Customer Identification Coverage: identifiable transactions / all completed transactions × 100.
- Recency buckets are factual: within 30, 31–90, 91–180, 181–365 and more than 365 calendar days. They are not active/dormant/lost labels.

Receipt totals are used exactly once. Line values are used only for quantity and product/category affinity; they do not allocate receipt VAT. Categories are used only from an explicit line category or an unambiguous exact product-catalogue match.

Customer-level gross profit is omitted. The current/legacy completed-sale sources do not expose one uniform customer-level cost field whose interpretation is safe across all records; Stage 5A therefore does not invent a costing rule.

## Safety and compatibility

All matching and calculation is in memory. The window, search and selected customer are not saved. The module contains no `saveDB()`, database mutation, storage write, Cloud Sync invocation or network call. Historical customer fields are not rewritten.

The browser database key remains `tradeflow_v321_zola`. No SQL, Supabase or IndexedDB migration is required. FIFO, Sale Out, Quick Sale, Stock In, Purchase Orders, receipts, VAT, Price Adjustment, Cloud Sync, pricing stages, Stage 4A and Stage 4B are unchanged from the protected v3.9.1 baseline.

## Deployment

Deploy the complete extracted package to the GitHub Pages repository root, preserving the `js/` directory. The new required asset is `js/customer-intelligence-v3100.js`; the updated `index.html`, `manifest.json`, `sw.js`, `FORCE_UPDATE_MOBILE.html`, `README.md` and release documents/manifest must accompany it.

