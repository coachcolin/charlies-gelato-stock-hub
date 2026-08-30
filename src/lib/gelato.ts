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

export type MovementKind =
  | "addition"
  | "removal"
  | "wholesale"
  | "production"
  | "adjustment";

export type Movement = {
  id: string;
  flavour_id: string | null;
  flavour_name: string;
  qty: number;
  kind: MovementKind;
  note: string | null;
  session_id: string | null;
  order_id: string | null;
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

export async function applyMovements(
  lines: { flavour_id: string; qty: number }[],
  kind: MovementKind,
  note?: string,
  orderId?: string,
) {
  const res = await db.rpc("apply_stock_movements", {
    _movements: lines,
    _kind: kind,
    _note: note ?? null,
    _order_id: orderId ?? null,
  });
  if (res.error) throw new Error(res.error.message);
  return res.data as string;
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
    await db.from("production_report_items").select("*").order("position"),
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
  desired: number;
  priority: boolean;
  belowMin?: boolean;
  score: number;
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
    if (new Date(m.created_at).getTime() < cutoff) continue;
    sold.set(m.flavour_id, (sold.get(m.flavour_id) ?? 0) + Math.abs(m.qty));
  }

  const committed = new Map<string, number>();
  for (const o of activeOrders) {
    if (o.status !== "active") continue;
    for (const i of o.items) {
      if (!i.flavour_id) continue;
      committed.set(i.flavour_id, (committed.get(i.flavour_id) ?? 0) + i.qty);
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
      if (owed > 0) bits.push(`${owed} committed to wholesale`);
      bits.push(`${f.stock_qty} in stock vs ${desired} minimum`);
      if (f.priority) bits.push("priority flavour");

      return {
        flavour_id: f.id,
        flavour_name: f.name,
        qty: deficit,
        reason: bits.join(" · "),
        stock: f.stock_qty,
        weeklyUsage,
        committed: owed,
        desired,
        priority: f.priority,
        belowMin,
        score,
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
