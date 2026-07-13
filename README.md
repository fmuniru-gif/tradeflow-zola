# Zola Electronics Zone — TradeFlow PWA v3.0

Offline-first Progressive Web App for sales, inventory, cash balances, expenses, debtors/creditors, and month-end KPIs.

**Business:** Zola Electronics Zone · Tamale, Northern Region, Ghana · Currency: GH₵

---

## Deploy in 3 ways (pick one)

### A) Fastest — GitHub Pages (free, multi-device)

1. Create a free GitHub account if you don’t have one.
2. Create a new **public** repository named e.g. `tradeflow-zola`.
3. Upload these 4 files into the repo root:
   - `index.html`
   - `manifest.json`
   - `sw.js`
   - `README.md` (optional)
4. Repo → **Settings** → **Pages** → Source: **Deploy from a branch** → Branch: `main` / root → Save.
5. Wait ~1 minute. Your live URL will be:
   `https://YOUR-USERNAME.github.io/tradeflow-zola/`
6. Open that URL on phone / tablet / laptop → **Add to Home Screen**.

### B) Netlify Drop (no account needed for a quick demo)

1. Go to https://app.netlify.com/drop
2. Drag the whole `sales-pwa` folder onto the page.
3. Copy the free `*.netlify.app` URL and open it on every device.

### C) Local / LAN only (no internet after install)

1. On a PC, open a terminal in this folder and run:
   ```bash
   # Python 3
   python3 -m http.server 8080
   # or Node
   npx --yes serve -l 8080
   ```
2. On the same Wi-Fi, open `http://YOUR-PC-IP:8080` on phones.
3. Use **Add to Home Screen**. Data stays on each device unless you Export/Import.

> ⚠️ Opening `index.html` with double-click (`file://`) will **not** register the service worker. Always serve over `http://` or `https://`.

---

## Install on phone / tablet (Add to Home Screen)

### Android (Chrome)
1. Open the live URL.
2. Menu ⋮ → **Install app** or **Add to Home screen**.
3. Icon appears on home screen — opens full-screen like a native app.

### iPhone / iPad (Safari)
1. Open the live URL in **Safari** (not Chrome).
2. Share button → **Add to Home Screen**.
3. Tap **Add**.

### Windows / Mac laptop
- Chrome/Edge: install icon in the address bar, or Menu → Install TradeFlow.

---

## Logins (defaults — change in Settings after first login)

| Cashier            | Role    | Password  | Tel        |
|--------------------|---------|-----------|------------|
| Muniru Fuseini     | ADMIN   | `trnat330`| 0553486788 |
| Abdul-Basit        | CASHIER2| `6522558` | 0508223452 |

- **Admin Mode PIN** (default): `055348`
- **Price Adjustment PIN** (default): `0000`
- Admin can change PINs, add/edit/delete users under **Settings** (elevated only).
- Cashier 2: Sale Out + own receipts today, unless Admin Mode is ON.

## Import historical Excel (2020–today)

1. Login as ADMIN (or Cashier2 with Admin Mode PIN).
2. **Settings** → **Import Excel workbook**.
3. Choose your VBA `.xlsx` (the real shop file).
4. Mode:
   - **Merge** — keep app data, add/update from Excel
   - **Replace** — replace stock/accounts/sales history; **keeps** security users/PINs
5. Device must be online once so SheetJS can load, then data stays offline.

Mapped sheets include: `STOCK AND SALES RECORDS`, `DEBTORS`, `CREDITORS`, `DEPOSITORS`, monthly snapshots, `ACCOUNT_TRANSACTIONS`, `CASH_BALANCES`, `EXPENSES`, `RECEIPT REGISTER`, `KPI_HISTORY`, `Cashiers`, `BusinessInfo`.

---

## Multi-device data sharing

Each device keeps its own offline database (localStorage). To share:

1. **Export** on device A → Settings → Export `.tradeflow.json`
2. Transfer the file (WhatsApp, USB, email, cloud drive)
3. **Import** on device B → Settings → Import

Optional later: Supabase / Firebase cloud sync (schema stub in Settings notes).

---

## What is included (VBA → PWA map)

| Excel / VBA                         | PWA screen / feature                          |
|-------------------------------------|-----------------------------------------------|
| frmLogin                            | Login gate (2 cashiers)                       |
| frmTransaction                      | POS + Dashboard                               |
| frmCashBalances                     | Cash Balances (Hand / Bank / MOMO / Others)   |
| frmExpenses                         | Expenses (6 categories)                       |
| frmAccountsManager                  | Debtors / Creditors / Depositors + settle     |
| frmStockBalance                     | Current stock popup                           |
| frmAdminPIN / frmPriceAdjPIN        | PIN gates `055348` / `0000`                   |
| RecordSaleOut_FIFO                  | FIFO cost allocation at checkout              |
| StartNewMonth / CarryOverStock      | Month-end rollover + account snapshots        |
| KPI_* functions                     | 12-tile KPI dashboard (exact formulas)        |
| RECEIPT REGISTER                    | Receipt list + credit-sale red flag           |
| CASH_BALANCE_LOG / UndoLog          | Audit logs in Settings                        |

### KPI formulas (matching your VBA)

- **Gross Profit** = Σ PROFIT for selected month
- **Net Profit** = Gross − Expenses (selected month)
- **CR Stock** = Σ remaining stock value (selected month)
- **Outstanding Debt / Creditors / Deposits** = live balances (open month) or monthly snapshot
- **Cash Buckets** = Cash in Hand + Bank Savings + MOMO + Others
- **Liquid Cash** = (CR Stock + Debt + Cash Buckets) − (Creditors + Deposits)
- **Zakaat** = Liquid Cash ÷ 40  (2.5%)

---

## Offline & updates

- First visit online caches the app (service worker `tradeflow-v3-0`).
- After that it opens offline.
- When you publish a new version, bump the cache name in `sw.js` so devices refresh.

---

## Security note

PINs and cashier passwords are stored client-side (same as Excel VBA). For a public internet URL, change default passwords after first login (Settings) and do not share the GitHub repo publicly if it embeds secrets you care about. For shop use on trusted devices this matches your current Excel model.

---

## Support checklist after deploy

- [ ] Login as Muniru (ADMIN) works
- [ ] Login as Abdul-Basit (CASHIER2) works; Stock In hidden
- [ ] Add a product → Stock In → Sale Out (FIFO)
- [ ] Credit sale creates debtor + red receipt row
- [ ] Cash Balances add/deduct updates wallets
- [ ] Expense entry reduces Net Profit
- [ ] KPI tiles update for selected year/month
- [ ] Start New Month carries stock + snapshots accounts
- [ ] Export / Import round-trip on a second device
- [ ] Add to Home Screen works offline

**Version:** 3.0 · Built for Zola Electronics Zone, Tamale · GH₵
