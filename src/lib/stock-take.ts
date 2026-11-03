import type { Flavour, FreezerStock, Unit } from "./gelato";

export type FreezerCount = { tray: Record<string, number>; tub: Record<string, number> };
export type StockTakeDraft = { counts: Record<string, FreezerCount>; completed: string[] };
export type OverallCount = { flavour_id: string; name: string; tray: number; tub: number; before: { tray: number; tub: number }; seenTray: boolean; seenTub: boolean };
export const stockTakeKey = (id: string, unit: Unit) => `${id}|${unit}`;

export function combinedCounts(flavours: Flavour[], freezerIds: string[], counts: StockTakeDraft["counts"]): OverallCount[] {
  return flavours.map((f) => ({
    flavour_id: f.id, name: f.name,
    tray: freezerIds.reduce((sum, id) => sum + (counts[id]?.tray[f.id] ?? 0), 0),
    tub: freezerIds.reduce((sum, id) => sum + (counts[id]?.tub[f.id] ?? 0), 0),
    before: { tray: f.stock_qty, tub: f.tub_qty },
    seenTray: freezerIds.some((id) => counts[id]?.tray[f.id] !== undefined),
    seenTub: freezerIds.some((id) => counts[id]?.tub[f.id] !== undefined),
  }));
}

/** Keep a globally uncounted unit in its old locations, preserving its overall total. */
export function stockTakePayload(rows: OverallCount[], freezerIds: string[], counts: StockTakeDraft["counts"], stock: FreezerStock[], keep: Record<string, boolean>) {
  return freezerIds.map((freezer_id, index) => ({ freezer_id, counts: rows.map((r) => {
    const quantity = (unit: Unit) => {
      const seen = unit === "tray" ? r.seenTray : r.seenTub;
      if (seen || !keep[stockTakeKey(r.flavour_id, unit)]) return counts[freezer_id]?.[unit][r.flavour_id] ?? 0;
      const total = r.before[unit];
      const field = unit === "tray" ? "stock_qty" : "tub_qty";
      const allocated = freezerIds.slice(0, -1).reduce((sum, id) => sum + Math.min(Math.max(0, total - sum), stock.find((s) => s.freezer_id === id && s.flavour_id === r.flavour_id)?.[field] ?? 0), 0);
      if (index === freezerIds.length - 1) return Math.max(0, total - allocated);
      const earlier = freezerIds.slice(0, index).reduce((sum, id) => sum + (stock.find((s) => s.freezer_id === id && s.flavour_id === r.flavour_id)?.[field] ?? 0), 0);
      return Math.min(Math.max(0, total - earlier), stock.find((s) => s.freezer_id === freezer_id && s.flavour_id === r.flavour_id)?.[field] ?? 0);
    };
    return { flavour_id: r.flavour_id, tray: quantity("tray"), tub: quantity("tub") };
  }) }));
}

export function parseStockTakeDraft(raw: string | null): StockTakeDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || !Array.isArray(value.completed) || !value.completed.every((id: unknown) => typeof id === "string") || !value.counts || typeof value.counts !== "object") return null;
    for (const count of Object.values(value.counts) as FreezerCount[]) {
      if (!count?.tray || !count?.tub) return null;
      for (const unit of [count.tray, count.tub]) if (!Object.values(unit).every((n) => Number.isInteger(n) && n >= 0)) return null;
    }
    return value;
  } catch { return null; }
}

/** A take that never counted a unit anywhere (e.g. a tub-only take) keeps that unit's stock by default. */
export function defaultKeeps(rows: OverallCount[]): Record<string, boolean> {
  const trayCounted = rows.some((r) => r.seenTray);
  const tubCounted = rows.some((r) => r.seenTub);
  const keeps: Record<string, boolean> = {};
  for (const r of rows) {
    if (!trayCounted && !r.seenTray && r.before.tray > 0) keeps[stockTakeKey(r.flavour_id, "tray")] = true;
    if (!tubCounted && !r.seenTub && r.before.tub > 0) keeps[stockTakeKey(r.flavour_id, "tub")] = true;
  }
  return keeps;
}
export type TotalSort = "alpha" | "trayHigh" | "trayLow" | "tubHigh" | "tubLow" | "popular" | "belowMin";
export const TOTAL_SORT_LABELS: Record<TotalSort, string> = {
  alpha: "Alphabetical", trayHigh: "Most trays", trayLow: "Fewest trays", tubHigh: "Most tubs", tubLow: "Fewest tubs",
  popular: "Popular flavours", belowMin: "Furthest below minimum",
};
/** Sort total-stock rows; "belowMin" puts the flavour with the biggest tray shortfall vs its minimum first. */
export function sortTotals<T extends Pick<Flavour, "name" | "stock_qty" | "tub_qty" | "priority">>(list: T[], sort: TotalSort, minFor: (f: T) => number): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name);
  const out = [...list];
  const cmp: Record<TotalSort, (a: T, b: T) => number> = {
    alpha: byName,
    trayHigh: (a, b) => b.stock_qty - a.stock_qty,
    trayLow: (a, b) => a.stock_qty - b.stock_qty,
    tubHigh: (a, b) => b.tub_qty - a.tub_qty,
    tubLow: (a, b) => a.tub_qty - b.tub_qty,
    popular: (a, b) => Number(b.priority) - Number(a.priority),
    belowMin: (a, b) => (a.stock_qty - minFor(a)) - (b.stock_qty - minFor(b)),
  };
  return out.sort((a, b) => cmp[sort](a, b) || byName(a, b));
}
