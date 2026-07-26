# ZEZMS v3.4.5 — Responsive Mobile Interface

## Delivered

- The desktop left navigation automatically becomes an off-canvas drawer on screens 900 px wide or narrower.
- A visible menu button opens the drawer on phones and tablets.
- The drawer closes by selecting a page, tapping the shaded background, pressing Escape, tapping the close button, or swiping left.
- Background scrolling is locked while the mobile drawer is open.
- Mobile-safe spacing is applied for display cut-outs and phone bottom bars.
- Dashboard grids collapse from multiple columns to two columns on tablets and one column on narrow phones.
- Sale Out, Invoice, Waybill and Stock In layouts stack vertically on small screens.
- Tables remain readable through smooth horizontal scrolling instead of compressing columns.
- Form fields use phone-friendly sizing and avoid unwanted iPhone input zoom.
- Dialogs become bottom-sheet style panels on mobile devices.
- Tabs can be scrolled horizontally on narrow screens.
- Touch targets have been enlarged for easier phone operation.

## Desktop behaviour

Desktop navigation remains permanently visible. No existing business, VAT, invoice, waybill, cloud-sync, backup, undo, KPI or automatic-month-rollover logic was removed.

## Deployment

Extract the full release and replace all existing GitHub files, including the complete `js` folder. No new Supabase SQL is required.
