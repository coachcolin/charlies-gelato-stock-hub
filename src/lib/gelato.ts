import { supabase } from "@/integrations/supabase/client";

export type Season = "peak" | "mid" | "low";

export type FlavourCategory = "gelato" | "sorbetto" | "special";

export const CATEGORY_LABEL: Record<FlavourCategory, string> = {
  gelato: "Gelato",
  sorbetto: "Sorbetto",
  special: "Specials / Seasonals",
};

export function categoryLabel(c: string) {
  return CATEGORY_LABEL[c as FlavourCategory] ?? "Gelato";
}

export type Flavour = {
  id: string;
  name: string;
  active: boolean;
  priority: boolean;
  category: FlavourCategory;
  image_url: string | null;
  stock_qty: number;
  tub_qty: number;
  desired_peak: number;
  desired_mid: number;
  desired_low: number;
  contains_gluten: boolean;
  contains_nuts: boolean;
};

export type Freezer = {
  id: string;
  name: string;
  capacity_trays: number;
  current_trays: number;
  position: number;
};

export type Unit = "tray" | "tub";

/** Freezer space: this many tubs take the room of one tray. */
export const TUBS_PER_TRAY = 5;

export function unitLabel(unit: Unit, n: number) {
  return unit === "tub" ? (n === 1 ? "tub" : "tubs") : n === 1 ? "tray" : "trays";
}

/** "3 trays + 4 tubs" style summary. */
export function formatTraysTubs(trays: number, tubs: number) {
  const parts: string[] = [];
  if (trays || !tubs) parts.push(`${trays} ${unitLabel("tray", trays)}`);
  if (tubs) parts.push(`${tubs} ${unitLabel("tub", tubs)}`);
  return parts.join(" + ");
}

export function trayEquivalents(f: { stock_qty: number; tub_qty: number }) {
  return f.stock_qty + (f.tub_qty ?? 0) / TUBS_PER_TRAY;
}

export type MovementKind =
  | "addition"
  | "removal"
  | "wholesale"
  | "production"
  | "adjustment"
  | "transfer";

export type Movement = {
  id: string;
  flavour_id: string | null;
  flavour_name: string;
  qty: number;
  kind: MovementKind;
  note: string | null;
  session_id: string | null;
  order_id: string | null;
  unit: Unit;
  created_at: string;
};

export type WholesaleOrder = {
  id: string;
  wholesaler: string;
  reference: string | null;
  status: "active" | "completed";
  is_future: boolean;
  send_date: string | null;
  created_at: string;
  completed_at: string | null;
};

export type WholesaleOrderItem = {
  id: string;
  order_id: string;
  flavour_id: string | null;
  flavour_name: string;
  qty: number;
  unit: Unit;
};

export type ProductionReport = {
  id: string;
  status: "active" | "completed";
  season: Season;
  created_at: string;
  completed_at: string | null;
  days: number;
  sorbetto_day: number;
};

export type ProductionItem = {
  id: string;
  report_id: string;
  flavour_id: string | null;
  flavour_name: string;
  suggested_qty: number;
  produced_qty: number | null;
  suggested_tubs: number;
  produced_tubs: number | null;
  done: boolean;
  reason: string | null;
  note: string | null;
  position: number;
  day_index: number;
};

const db = supabase as unknown as {
  from: (table: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []) as T;
}

export async function fetchFlavours(): Promise<Flavour[]> {
  return unwrap(await db.from("flavours").select("*").order("name"));
}

export async function fetchFreezers(): Promise<Freezer[]> {
  return unwrap(await db.from("freezers").select("*").order("position"));
}

export async function fetchMovements(days = 120): Promise<Movement[]> {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  return unwrap(
    await db
      .from("stock_movements")
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000),
  );
}

export async function fetchSeason(): Promise<Season> {
  const res = await db.from("app_settings").select("value").eq("key", "season").maybeSingle();
  if (res.error) throw new Error(res.error.message);
  return ((res.data?.value as Season) ?? "mid") as Season;
}

export async function setSeason(season: Season) {
  const res = await db
    .from("app_settings")
    .upsert({ key: "season", value: season, updated_at: new Date().toISOString() });
  if (res.error) throw new Error(res.error.message);
}

/* ---------- production batch settings ---------- */

/** Trays are always produced in multiples of this batch size. */
export const BATCH_SIZE = 4;

export type DayCapacities = Record<Season, number>;

export const DEFAULT_DAY_CAPACITIES: DayCapacities = { low: 56, mid: 80, peak: 100 };

const CAP_KEY: Record<Season, string> = {
  low: "day_capacity_low",
  mid: "day_capacity_mid",
  peak: "day_capacity_peak",
};

export async function fetchDayCapacities(): Promise<DayCapacities> {
  const res = await db
    .from("app_settings")
    .select("key,value")
    .in("key", [CAP_KEY.low, CAP_KEY.mid, CAP_KEY.peak]);
  if (res.error) throw new Error(res.error.message);
  const out = { ...DEFAULT_DAY_CAPACITIES };
  for (const row of res.data ?? []) {
    const season = (Object.keys(CAP_KEY) as Season[]).find((s) => CAP_KEY[s] === row.key);
    const n = Number(row.value);
    if (season && Number.isFinite(n) && n > 0) out[season] = n;
  }
  return out;
}

export async function setDayCapacity(season: Season, trays: number) {
  const res = await db.from("app_settings").upsert({
    key: CAP_KEY[season],
    value: String(trays),
    updated_at: new Date().toISOString(),
  });
  if (res.error) throw new Error(res.error.message);
}

export type MovementLine = { flavour_id: string; qty: number; unit?: Unit; freezer_id?: string };

export async function applyMovements(
  lines: MovementLine[],
  kind: MovementKind,
  note?: string,
  orderId?: string,
  account?: string,
  freezerId?: string,
) {
  const res = await db.rpc("apply_stock_movements", {
    _movements: lines.map((l) => ({ ...l, freezer_id: l.freezer_id ?? freezerId ?? null })),
    _kind: kind,
    _note: note ?? null,
    _order_id: orderId ?? null,
    _account: account ?? null,
  });
  if (res.error) throw new Error(res.error.message);
  return res.data as string;
}

/* ---------- per-freezer stock ---------- */

export type FreezerStock = {
  flavour_id: string;
  freezer_id: string;
  stock_qty: number;
  tub_qty: number;
  counted_at: string | null;
};

export async function fetchFreezerStock(): Promise<FreezerStock[]> {
  return unwrap(await db.from("freezer_stock").select("*"));
}

/** Freezer ids that have had their first (starting) stock take. */
export async function fetchCountedFreezers(): Promise<string[]> {
  const res = await db
    .from("app_settings")
    .select("value")
    .eq("key", "freezers_counted")
    .maybeSingle();
  if (res.error) throw new Error(res.error.message);
  return ((res.data?.value as string) ?? "").split(",").filter(Boolean);
}

/** Lookup: `${flavourId}:${freezerId}` → counts. */
export function freezerStockMap(rows: FreezerStock[]) {
  return new Map(rows.map((r) => [`${r.flavour_id}:${r.freezer_id}`, r]));
}

export async function freezerStockTake(
  freezerId: string,
  counts: { flavour_id: string; tray: number; tub: number }[],
) {
  const res = await db.rpc("freezer_stock_take", { _freezer_id: freezerId, _counts: counts });
  if (res.error) throw new Error(res.error.message);
  return res.data as { baseline_complete: boolean; just_completed: boolean };
}

/** Move stock from one freezer to another (overall totals unchanged). */
export async function moveStock(
  fromId: string,
  toId: string,
  lines: { flavour_id: string; qty: number; unit: Unit }[],
) {
  return applyMovements(
    lines.flatMap((l) => [
      { flavour_id: l.flavour_id, qty: -l.qty, unit: l.unit, freezer_id: fromId },
      { flavour_id: l.flavour_id, qty: l.qty, unit: l.unit, freezer_id: toId },
    ]),
    "transfer",
    "Moved between freezers",
  );
}

export async function fetchOrders(): Promise<
  (WholesaleOrder & { items: WholesaleOrderItem[] })[]
> {
  const orders = unwrap<WholesaleOrder[]>(
    await db.from("wholesale_orders").select("*").order("created_at", { ascending: false }),
  );
  const items = unwrap<WholesaleOrderItem[]>(
    await db.from("wholesale_order_items").select("*"),
  );
  return orders.map((o) => ({ ...o, items: items.filter((i) => i.order_id === o.id) }));
}

export async function fetchReports(): Promise<
  (ProductionReport & { items: ProductionItem[] })[]
> {
  const reports = unwrap<ProductionReport[]>(
    await db.from("production_reports").select("*").order("created_at", { ascending: false }),
  );
  const items = unwrap<ProductionItem[]>(
    await db
      .from("production_report_items")
      .select("*")
      .order("day_index")
      .order("position"),
  );
  return reports.map((r) => ({ ...r, items: items.filter((i) => i.report_id === r.id) }));
}

export { db };

/* ---------- derived helpers ---------- */

export function desiredFor(f: Flavour, season: Season) {
  return season === "peak" ? f.desired_peak : season === "low" ? f.desired_low : f.desired_mid;
}

/** Top 5 flavours by tray movement in the last 30 days, padded with priority + alphabetical. */
export function popularIds(flavours: Flavour[], movements: Movement[], limit = 5): string[] {
  const cutoff = Date.now() - 30 * 86400000;
  const counts = new Map<string, number>();
  for (const m of movements) {
    if (!m.flavour_id) continue;
    if (m.kind !== "removal" && m.kind !== "wholesale") continue;
    if (new Date(m.created_at).getTime() < cutoff) continue;
    counts.set(m.flavour_id, (counts.get(m.flavour_id) ?? 0) + Math.abs(m.qty));
  }
  const active = flavours.filter((f) => f.active);
  const ranked = active
    .filter((f) => (counts.get(f.id) ?? 0) > 0)
    .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0))
    .map((f) => f.id);
  const padded = [
    ...ranked,
    ...active.filter((f) => f.priority).map((f) => f.id),
    ...active.map((f) => f.id),
  ];
  return [...new Set(padded)].slice(0, limit);
}

export type Suggestion = {
  flavour_id: string;
  flavour_name: string;
  qty: number;
  reason: string;
  stock: number;
  weeklyUsage: number;
  committed: number;
  /** Tubs owed to active wholesale orders. */
  tubsNeeded: number;
  desired: number;
  priority: boolean;
  belowMin?: boolean;
  score: number;
  category: FlavourCategory;
  contains_gluten: boolean;
  contains_nuts: boolean;
};

/** The production engine: current stock vs 2-week sales trend, committed wholesale orders and desired season levels. */
export function buildSuggestions(
  flavours: Flavour[],
  movements: Movement[],
  activeOrders: (WholesaleOrder & { items: WholesaleOrderItem[] })[],
  season: Season,
  dayCapacity?: number,
): Suggestion[] {
  const cutoff = Date.now() - 14 * 86400000;
  const sold = new Map<string, number>();
  for (const m of movements) {
    if (!m.flavour_id) continue;
    if (m.kind !== "removal" && m.kind !== "wholesale") continue;
    if (m.unit === "tub") continue;
    if (new Date(m.created_at).getTime() < cutoff) continue;
    sold.set(m.flavour_id, (sold.get(m.flavour_id) ?? 0) + Math.abs(m.qty));
  }

  const committed = new Map<string, number>();
  const tubsOwed = new Map<string, number>();
  const committedBy = new Map<string, Map<string, number>>();
  for (const o of activeOrders) {
    if (o.status !== "active") continue;
    for (const i of o.items) {
      if (!i.flavour_id) continue;
      if (i.unit === "tub") {
        tubsOwed.set(i.flavour_id, (tubsOwed.get(i.flavour_id) ?? 0) + i.qty);
        continue;
      }
      committed.set(i.flavour_id, (committed.get(i.flavour_id) ?? 0) + i.qty);
      const perCustomer = committedBy.get(i.flavour_id) ?? new Map<string, number>();
      perCustomer.set(o.wholesaler, (perCustomer.get(o.wholesaler) ?? 0) + i.qty);
      committedBy.set(i.flavour_id, perCustomer);
    }
  }

  const hasSales = [...sold.values()].some((v) => v > 0);

  const raw = flavours
    .filter((f) => f.active)
    .map((f) => {
      const twoWeek = sold.get(f.id) ?? 0;
      const weeklyUsage = twoWeek / 2;
      const owed = committed.get(f.id) ?? 0;
      const desired = desiredFor(f, season);
      // Projected stock a week out, after committed wholesale orders.
      const projected = f.stock_qty - weeklyUsage - owed;
      const deficit = Math.max(0, Math.ceil(desired - projected));
      const belowMin = f.stock_qty <= desired;
      const score = deficit * (f.priority ? 1.6 : 1) + (projected < 0 ? 15 : 0);

      const bits: string[] = [];
      if (hasSales && twoWeek > 0)
        bits.push(`selling ~${weeklyUsage.toFixed(1)} trays/week`);
      if (owed > 0) {
        const perCustomer = [...(committedBy.get(f.id)?.entries() ?? [])].sort(
          (a, b) => b[1] - a[1],
        );
        if (perCustomer.length > 0) {
          bits.push(
            `${owed} committed to ${perCustomer
              .map(([name, qty]) => (perCustomer.length === 1 ? name : `${name} (${qty})`))
              .join(", ")}`,
          );
        } else {
          bits.push(`${owed} committed to wholesale`);
        }
      }
      bits.push(`${f.stock_qty} in stock vs ${desired} minimum`);
      const tubs = tubsOwed.get(f.id) ?? 0;
      if (tubs > 0) bits.push(`${tubs} tubs on wholesale orders (${f.tub_qty ?? 0} tubs in stock)`);
      if (f.priority) bits.push("priority flavour");

      return {
        flavour_id: f.id,
        flavour_name: f.name,
        qty: deficit,
        reason: bits.join(" · "),
        stock: f.stock_qty,
        weeklyUsage,
        committed: owed,
        tubsNeeded: Math.max(0, (tubsOwed.get(f.id) ?? 0) - (f.tub_qty ?? 0)),
        desired,
        priority: f.priority,
        belowMin,
        score,
        category: f.category,
        contains_gluten: Boolean(f.contains_gluten),
        contains_nuts: Boolean(f.contains_nuts),
      };
    })
    .filter((s) => s.qty > 0);

  // Always put priority flavours that are on or under their minimum ahead of normal flavours.
  const sorted = raw.sort((a, b) => {
    const aUrgent = a.priority && a.belowMin;
    const bUrgent = b.priority && b.belowMin;
    if (aUrgent && !bUrgent) return -1;
    if (!aUrgent && bUrgent) return 1;
    return b.score - a.score;
  });

  // Batch rounding: multiples of 4, with priority flavours getting at least 8.
  for (const s of sorted) {
    const min = s.priority ? BATCH_SIZE * 2 : BATCH_SIZE;
    s.qty = Math.max(min, Math.ceil(s.qty / BATCH_SIZE) * BATCH_SIZE);
  }

  const capacity = dayCapacity ?? DEFAULT_DAY_CAPACITIES[season];
  if (!capacity || capacity <= 0) return sorted;

  // Fit the plan to a day's production run, in whole batches, honouring the priority ordering.
  const kept: Suggestion[] = [];
  let total = 0;
  for (const s of sorted) {
    const min = s.priority ? BATCH_SIZE * 2 : BATCH_SIZE;
    const room = capacity - total;
    if (room < min) continue;
    const qty = Math.min(s.qty, Math.floor(room / BATCH_SIZE) * BATCH_SIZE);
    s.qty = qty;
    kept.push(s);
    total += qty;
  }

  // Under capacity: top up the highest-priority flavours a batch at a time.
  let guard = 0;
  while (total + BATCH_SIZE <= capacity && kept.length > 0 && guard < 500) {
    guard++;
    for (const s of kept) {
      if (total + BATCH_SIZE > capacity) break;
      s.qty += BATCH_SIZE;
      total += BATCH_SIZE;
    }
  }

  return kept;
}

/* ---------- weekly production planning ---------- */

/** Peak season is planned as a single production day; low and mid run as a 2-4 day week. */
export function isWeeklySeason(season: Season) {
  return season !== "peak";
}

export const MIN_WEEK_DAYS = 2;
export const MAX_WEEK_DAYS = 4;

/** Hard ceiling: no production day can ever exceed this many trays. */
export const MAX_DAY_TRAYS = 100;

/** Sorbetti, gluten and nut flavours each need their own separate day. */
export function separateDaysNeeded(suggestions: Suggestion[]) {
  const groups = new Set(suggestions.map(allergenGroup));
  return (["sorbetto", "gluten", "nuts"] as const).filter((g) => groups.has(g)).length;
}

/** How many production days the week needs, based on trays wanted and allergen separation. */
export function recommendedDays(
  traysNeeded: number,
  dayCapacity: number,
  season: Season,
  separateDays = 0,
) {
  const cap = Math.min(MAX_DAY_TRAYS, dayCapacity > 0 ? dayCapacity : MAX_DAY_TRAYS);
  const byTrays = Math.ceil(traysNeeded / cap);
  const floor = isWeeklySeason(season) ? MIN_WEEK_DAYS : 1;
  return Math.min(MAX_WEEK_DAYS, Math.max(floor, byTrays, separateDays));
}

export type AllergenGroup = "sorbetto" | "gluten" | "nuts" | "plain";

export function allergenGroup(s: {
  category: FlavourCategory;
  contains_gluten: boolean;
  contains_nuts: boolean;
}): AllergenGroup {
  if (s.category === "sorbetto") return "sorbetto";
  if (s.contains_gluten) return "gluten";
  if (s.contains_nuts) return "nuts";
  return "plain";
}

export const GROUP_LABEL: Record<AllergenGroup, string> = {
  sorbetto: "Sorbetti",
  gluten: "Contains gluten",
  nuts: "Contains nuts",
  plain: "Gelato",
};

export type ScheduledSuggestion = Suggestion & { day: number; group: AllergenGroup };

/**
 * Spread suggestions across the week's production days:
 * all sorbetti on the chosen sorbetto day; all gluten flavours together at the end of
 * a different day; all nut flavours together at the end of yet another day.
 * No day ever goes over its capacity (hard max 100 trays) — overflow is trimmed in batches.
 */
export function scheduleWeek(
  suggestions: Suggestion[],
  days: number,
  dayCapacity: number,
  sorbettoDay: number,
): ScheduledSuggestion[] {
  const dayCount = Math.max(1, days);
  const cap = Math.min(MAX_DAY_TRAYS, dayCapacity > 0 ? dayCapacity : MAX_DAY_TRAYS);
  const buckets: { used: number; items: ScheduledSuggestion[] }[] = Array.from(
    { length: dayCount },
    () => ({ used: 0, items: [] }),
  );

  const tagged: ScheduledSuggestion[] = suggestions.map((s) => ({
    ...s,
    day: 1,
    group: allergenGroup(s),
  }));
  const byGroup = (g: AllergenGroup) => tagged.filter((t) => t.group === g);

  /** Put as much of the item on this day as fits, in whole batches. */
  const place = (item: ScheduledSuggestion, index: number) => {
    const b = buckets[index];
    if (!b) return false;
    const room = Math.floor((cap - b.used) / BATCH_SIZE) * BATCH_SIZE;
    if (room < BATCH_SIZE) return false;
    item.qty = Math.min(item.qty, room);
    item.day = index + 1;
    b.items.push(item);
    b.used += item.qty;
    return true;
  };

  const sorbettoItems = byGroup("sorbetto");
  const glutenItems = byGroup("gluten");
  const nutItems = byGroup("nuts");

  // 1. Pick one day for each group — all different.
  const taken = new Set<number>();
  const sorbIdx =
    sorbettoItems.length > 0 ? Math.min(dayCount, Math.max(1, sorbettoDay)) - 1 : -1;
  if (sorbIdx >= 0) taken.add(sorbIdx);
  const pickFree = () => {
    for (let i = 0; i < dayCount; i++) if (!taken.has(i)) return taken.add(i), i;
    return -1;
  };
  const glutenIdx = glutenItems.length > 0 ? pickFree() : -1;
  const nutsIdx = nutItems.length > 0 ? pickFree() : -1;

  for (const item of sorbettoItems) place(item, sorbIdx);
  for (const item of glutenItems) if (glutenIdx >= 0) place(item, glutenIdx);
  for (const item of nutItems) if (nutsIdx >= 0) place(item, nutsIdx);

  // 2. Plain gelato fills whatever room is left, least-full day first.
  for (const item of byGroup("plain")) {
    const order = buckets
      .map((b, i) => ({ i, used: b.used }))
      .sort((a, b) => a.used - b.used)
      .map((x) => x.i);
    for (const idx of order) if (place(item, idx)) break;
  }

  // Allergen batches run at the end of their day.
  const rank: Record<AllergenGroup, number> = { plain: 0, sorbetto: 1, nuts: 2, gluten: 3 };
  return buckets.flatMap((b) =>
    [...b.items].sort((a, c) => rank[a.group] - rank[c.group]),
  );
}

/* ---------- hand-picked production plan ---------- */

export type PlanItem = { flavour_id: string; trays: number; tubs: number; group: AllergenGroup };

/**
 * Suggest a day for each chosen flavour: sorbetti on the sorbetto day, gluten on its own
 * other day, nuts on yet another day; plain gelato fills the least-full day.
 * Returns flavour_id → day number (1-based).
 */
export function planDays(items: PlanItem[], days: number, sorbettoDay: number) {
  const n = Math.max(1, days);
  const load: number[] = Array.from({ length: n }, () => 0);
  const size = (i: PlanItem) => i.trays + i.tubs / TUBS_PER_TRAY;
  const has = (g: AllergenGroup) => items.some((i) => i.group === g);
  const leastLoaded = (exclude: Set<number>) => {
    let best = -1;
    for (let d = 0; d < n; d++)
      if (!exclude.has(d) && (best < 0 || load[d]! < load[best]!)) best = d;
    return best < 0 ? load.indexOf(Math.min(...load)) : best;
  };
  const taken = new Set<number>();
  const groupDay: Partial<Record<AllergenGroup, number>> = {};
  if (has("sorbetto")) {
    groupDay.sorbetto = Math.min(n, Math.max(1, sorbettoDay)) - 1;
    taken.add(groupDay.sorbetto);
  }
  for (const g of ["gluten", "nuts"] as const) {
    if (!has(g)) continue;
    const d = leastLoaded(taken);
    groupDay[g] = d;
    taken.add(d);
  }
  const out: Record<string, number> = {};
  for (const i of items) {
    const d = groupDay[i.group];
    if (i.group === "plain" || d === undefined) continue;
    out[i.flavour_id] = d + 1;
    load[d]! += size(i);
  }
  for (const i of [...items].filter((x) => x.group === "plain").sort((a, b) => size(b) - size(a))) {
    const d = leastLoaded(new Set());
    out[i.flavour_id] = d + 1;
    load[d]! += size(i);
  }
  return out;
}
