# Receipt-specific full payment

Delivery `20261119-receipt-payment-r2` adds **Paid** to credit receipt rows for staff with account-management permission. The panel names the debtor identified by the original credit ledger entry, shows the full remaining amount and the resulting debtor balance, and requires an active receiving wallet plus confirmation that this is new money actually received, not already entered in Accounts. It does not guess accounts from names or clear historical debt in bulk. Missing/ambiguous links, inconsistent receipt/sale balances, a smaller debtor balance and reversed receipts stop before posting.

The receipt and matching sale become paid; one linked negative SETTLE entry reduces the existing debtor balance and one positive cash entry credits the selected wallet. Original sale dates, prices, tax, FIFO allocation, stock and profit remain unchanged. Partial amounts paid at sale are retained. Gross/net withholding-tax amounts remain distinct. This action settles the remainder in full; it does not allocate earlier generic Accounts collections.

## Device authentication

Owner-mode devices follow the existing Cloud lifecycle policy: a missing cached ACTIVE label is valid, while any explicit inactive lifecycle label blocks payment. Paired devices require ACTIVE evidence and their authenticated anonymous session user ID; an email is not required. The existing paired-device context validation runs again before the normal download and commit, checking device, owner, business and branch. No device is re-enrolled and no cached lifecycle flag is rewritten to bypass validation.

## Durability and duplicate prevention

New actions require an active online Cloud device, a current download and no queued/failed/integrity-held operations. Once saved, a lost connection or uncertain acknowledgement leaves the original immutable operation queued for normal retry. A new native receipt-specific entry point uses the existing `syncDurabilityRun` journal and native `onLocalSave`/sealing path. Its validator permits exactly the six linked patches and no unrelated changes. The proven durability, database-service and bounded transport modules are byte-identical to production.

The payment operation ID hashes owner, business, branch, stable internal receipt number and the previous reversed settlement ID. Cashier, wallet choice and device do not create another claim for the same full payment. A second device receiving the accepted claim removes its own speculative claim only inside the existing atomic receive/rebase transaction, then materializes the canonical Cloud payment once. A push payload conflict requests that same normal receive path. Hash, row identity, tenant binding and linked patch amounts must verify before a claim is recognized; an unverified conflict stays queued. Ordinary operations retain their existing handling.

A record marker alone cannot prove a complete financial after-state. Exact repeat detection checks every affected payment field and the debtor/wallet after-values before treating an already present payment as materialized. Incomplete/conflicting evidence stops for review.

## Corrections

Use the existing Accounts Undo action and its Admin PIN confirmation to reverse a receipt payment. This reopens the receipt, restores debtor credit, reverses the cash entry and marks both payment audit entries undone in one journaled operation. The original receiving wallet must have sufficient funds, following the established Others-wallet exception. Reversal has its own deterministic identity; another genuine payment after reversal uses a new chain identity. Receipt editing/sale reversal and independent payment/cash-entry edits are blocked while this linked payment is active. Existing TV trade-in guards remain authoritative.

## Verification and rollout

Synthetic tests cover original partial payments, withholding tax, exact debtor identity, invalid/ambiguous links, existing Accounts payments, missing confirmation, repeated clicks, stale state, both devices racing with different wallets, lost acknowledgements, interruption at every durable write, reopen/retry, complete reversal and permission guards. Real assembled-browser tests exercise the native commit, push/read-back, ordered receive and laptop/mobile panel. An exact reverse transformation protects all prior application behavior. Full source and browser suites run with external networking unavailable.

No real receipt, account balance, cash wallet, device identity or cloud history is changed during development or deployment. This feature does not migrate historical receipts or rewrite generic Accounts settlements. Concurrent unrelated legacy edits are not turned into blind payment overwrites; conflicting evidence remains reviewable. Passing synthetic checks does not certify every physical device's current state or remove all distributed-system failure possibilities.

Update using `RECEIPT_PAYMENT_UPDATE.html?delivery=20261119-receipt-payment-r2`, close all TradeFlow windows after verification, then reopen normally.
