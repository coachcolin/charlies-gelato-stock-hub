# Trays + Tubs across the whole app

Every flavour gets two stock numbers: **trays** and **tubs**. Rules agreed:
- Freezer space: 5 tubs = 1 tray.
- Production: one batch can make trays and tubs together.
- Wholesale files have a column that says tray or tub.
- Seasonal minimums and priority stay **trays only**. Tubs are tracked and shown, but they don't drive the production suggestions.

## Section by section

**Home**
- No new buttons. Every existing page handles both.

**Add stock / Remove stock**
- Tap a flavour. The quantity popup gets a Trays / Tubs switch (Trays is the default).
- The list at the bottom shows each line with its unit, e.g. "Chocolate × 3 trays" and "Chocolate × 6 tubs".
- Each flavour row shows both counts: "12 trays · 8 tubs".

**Soft Freezer Order**
- Each skinny row gets two small +/- counters, one for trays and one for tubs. The grouping and order stay the same.
- The review screen lists trays and tubs separately. The total reads like "9 trays + 4 tubs".
- Voice: people can say "two chocolate tubs" or "three strawberry". If they don't say a unit, it counts as trays.

**Current Stock Levels**
- Each flavour shows a tray chip and a tub chip. Below-minimum and watch colours still only look at trays.
- Freezer fullness = trays + tubs ÷ 5, e.g. "312 / 500 tray-equivalents".
- New sort options: most tubs and fewest tubs.

**Edit Stock Levels (stock take)**
- Each flavour has two boxes you can edit: trays and tubs.
- Voice stock take picks up units the same way ("3 cookie dough tubs").
- The variance report shows tray and tub differences in separate columns.

**Wholesale Orders**
- The import reads the tray/tub column. Each order line has a unit.
- Stock checks compare against the right stock: tubs against tub stock, trays against tray stock.
- Active orders can be edited per line, including the unit. Marking an order complete takes off trays and tubs as ordered.
- Manual order entry gets a unit picker.

**Production Report**
- The suggestions still come from tray minimums, usage and wholesale tray orders.
- Future wholesale **tub** orders are added as a "tubs needed" figure next to each flavour, so you can make tubs in the same batch.
- Each line on the report has a trays box and a tubs box. Ticking it done adds both to stock.
- Day totals show trays and tubs.

**Data Management**
- No new minimum fields, because minimums stay trays only. Each flavour shows its current tray and tub stock.

**History**
- Every addition and removal is logged with its unit, so records show trays and tubs separately.

## Technical details
- `flavours.tub_qty` integer, default 0.
- `unit` text column (`tray` | `tub`, default `tray`) on `stock_movements`, `wholesale_order_items` and `production_report_items`. Production items also get `produced_tubs` and `suggested_tubs`.
- `apply_stock_movements` reads an optional `unit` for each movement and updates `stock_qty` or `tub_qty`.
- Usage forecasting keeps using tray movements only.
- Voice matching returns `{flavour_id, qty, unit}`.
- The CSV parser finds the unit column by header name (unit/size/type/format).

## Open question
- Batch yield: how many tubs does one 4-tray batch give up? For example, "a batch is either 4 trays, or 3 trays + 5 tubs". Until I hear back, you type tub quantities in by hand.
