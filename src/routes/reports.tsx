import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, Store, Truck } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db, formatTraysTubs } from "@/lib/gelato";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Sales Reports — Charlie's Gelato" },
      {
        name: "description",
        content:
          "See where trays and tubs are going — Charlie's Shop and each wholesale account — and which flavours sell most.",
      },
      { property: "og:title", content: "Sales Reports — Charlie's Gelato" },
      {
        property: "og:description",
        content: "Trays and tubs sold by account and by flavour, over any time period.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});

const SHOP = "Charlie's Shop";

type Sale = {
  flavour_id: string | null;
  flavour_name: string;
  qty: number;
  unit: "tray" | "tub";
  kind: string;
  account: string | null;
  created_at: string;
};

type Range = "7" | "30" | "90" | "year" | "all" | "custom";
const RANGES: { key: Range; label: string }[] = [
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
  { key: "90", label: "90 days" },
  { key: "year", label: "This year" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom" },
];

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

function bounds(range: Range, from: string, to: string): { from: string | null; to: string | null } {
  const now = new Date();
  if (range === "all") return { from: null, to: null };
  if (range === "year") return { from: `${now.getFullYear()}-01-01T00:00:00`, to: null };
  if (range === "custom")
    return {
      from: from ? new Date(`${from}T00:00:00`).toISOString() : null,
      to: to ? new Date(`${to}T23:59:59.999`).toISOString() : null,
    };
  return { from: new Date(Date.now() - Number(range) * 86400000).toISOString(), to: null };
}

async function fetchSales(from: string | null, to: string | null): Promise<Sale[]> {
  const out: Sale[] = [];
  const page = 1000;
  for (let offset = 0; offset < 20000; offset += page) {
    let q = db
      .from("stock_movements")
      .select("flavour_id,flavour_name,qty,unit,kind,account,created_at")
      .in("kind", ["removal", "wholesale"])
      .order("created_at", { ascending: false })
      .range(offset, offset + page - 1);
    if (from) q = q.gte("created_at", from);
    if (to) q = q.lte("created_at", to);
    const res = await q;
    if (res.error) throw new Error(res.error.message);
    const rows = (res.data ?? []) as Sale[];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

type Totals = { trays: number; tubs: number };
const add = (t: Totals, s: Sale) => {
  const n = Math.abs(s.qty);
  if (s.unit === "tub") t.tubs += n;
  else t.trays += n;
};
const accountOf = (s: Sale) =>
  s.account ?? (s.kind === "removal" ? SHOP : "Unknown wholesaler");

type Group = { key: string; totals: Totals; children: Map<string, Totals>; last: string };

function groupBy(sales: Sale[], outer: (s: Sale) => string, inner: (s: Sale) => string) {
  const map = new Map<string, Group>();
  for (const s of sales) {
    const k = outer(s);
    let g = map.get(k);
    if (!g) {
      g = { key: k, totals: { trays: 0, tubs: 0 }, children: new Map(), last: s.created_at };
      map.set(k, g);
    }
    add(g.totals, s);
    const c = inner(s);
    const ct = g.children.get(c) ?? { trays: 0, tubs: 0 };
    add(ct, s);
    g.children.set(c, ct);
    if (s.created_at > g.last) g.last = s.created_at;
  }
  return [...map.values()];
}

type SortKey = "trays" | "tubs" | "name";

function ReportsPage() {
  const [range, setRange] = useState<Range>("30");
  const [from, setFrom] = useState(isoDay(new Date(Date.now() - 30 * 86400000)));
  const [to, setTo] = useState(isoDay(new Date()));
  const [sort, setSort] = useState<SortKey>("tubs");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const b = useMemo(() => bounds(range, from, to), [range, from, to]);

  const sales = useQuery({
    queryKey: ["sales", b.from, b.to],
    queryFn: () => fetchSales(b.from, b.to),
  });

  const data = sales.data ?? [];
  const total = useMemo(() => {
    const t = { trays: 0, tubs: 0 };
    data.forEach((s) => add(t, s));
    return t;
  }, [data]);

  const sorter = (a: { key: string; totals: Totals }, c: { key: string; totals: Totals }) =>
    sort === "name"
      ? a.key.localeCompare(c.key)
      : c.totals[sort] - a.totals[sort] || a.key.localeCompare(c.key);

  const accounts = useMemo(
    () => groupBy(data, accountOf, (s) => s.flavour_name).sort(sorter),
    [data, sort],
  );
  const flavours = useMemo(
    () => groupBy(data, (s) => s.flavour_name, accountOf).sort(sorter),
    [data, sort],
  );

  return (
    <AppShell title="Sales Reports" subtitle="Where trays and tubs are going">
      <section className="surface mb-4 space-y-3 p-4">
        <div className="flex flex-wrap gap-2">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              className={`h-10 rounded-full px-4 text-sm font-semibold transition ${
                range === r.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {range === "custom" ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10 w-auto" aria-label="From" />
            <span className="text-muted-foreground">to</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-10 w-auto" aria-label="To" />
          </div>
        ) : null}
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Tubs sold" value={total.tubs} />
          <Stat label="Trays sold" value={total.trays} />
          <Stat label="Accounts" value={accounts.length} />
        </div>
      </section>

      <Tabs defaultValue="accounts">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <TabsList className="h-11 rounded-2xl">
            <TabsTrigger value="accounts" className="rounded-xl px-4">By account</TabsTrigger>
            <TabsTrigger value="flavours" className="rounded-xl px-4">By flavour</TabsTrigger>
          </TabsList>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="ml-auto h-11 rounded-2xl border border-input bg-card px-3 text-sm"
            aria-label="Sort"
          >
            <option value="tubs">Most tubs</option>
            <option value="trays">Most trays</option>
            <option value="name">A–Z</option>
          </select>
        </div>

        {sales.isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
        ) : null}

        <TabsContent value="accounts" className="space-y-2">
          {accounts.map((g) => (
            <GroupCard
              key={g.key}
              group={g}
              icon={g.key === SHOP ? Store : Truck}
              childLabel="Flavours"
              sort={sort}
            />
          ))}
          {!sales.isLoading && accounts.length === 0 ? <Empty /> : null}
        </TabsContent>

        <TabsContent value="flavours" className="space-y-2">
          {flavours.map((g) => (
            <GroupCard key={g.key} group={g} childLabel="Went to" sort={sort} />
          ))}
          {!sales.isLoading && flavours.length === 0 ? <Empty /> : null}
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function GroupCard({
  group,
  icon: Icon,
  childLabel,
  sort,
}: {
  group: Group;
  icon?: typeof Store;
  childLabel: string;
  sort: SortKey;
}) {
  const [open, setOpen] = useState(false);
  const children = [...group.children.entries()].sort((a, b) =>
    sort === "name" ? a[0].localeCompare(b[0]) : b[1][sort] - a[1][sort] || a[0].localeCompare(b[0]),
  );
  return (
    <div className="surface overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        {Icon ? (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-cream text-cream-foreground">
            <Icon className="size-5" />
          </span>
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-base">{group.key}</span>
          <span className="text-xs text-muted-foreground">
            {group.children.size} {childLabel === "Flavours" ? "flavours" : "accounts"} · last{" "}
            {new Date(group.last).toLocaleDateString()}
          </span>
        </span>
        <Chip n={group.totals.tubs} label="tubs" tone="sky" />
        <Chip n={group.totals.trays} label="trays" tone="cream" />
        {open ? <ChevronDown className="size-5 shrink-0" /> : <ChevronRight className="size-5 shrink-0" />}
      </button>
      {open ? (
        <div className="border-t border-border bg-muted/40 px-4 py-2">
          <p className="py-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {childLabel}
          </p>
          <div className="divide-y divide-border">
            {children.map(([name, t]) => (
              <div key={name} className="flex items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{name}</span>
                <span className="shrink-0 text-muted-foreground">{formatTraysTubs(t.trays, t.tubs)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Chip({ n, label, tone }: { n: number; label: string; tone: "sky" | "cream" }) {
  return (
    <span className="flex shrink-0 flex-col items-center">
      <span
        className={`rounded-full px-2.5 py-1 font-display text-base ${
          tone === "sky" ? "bg-sky/30 text-foreground" : "bg-cream text-cream-foreground"
        }`}
      >
        {n}
      </span>
      <span className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</span>
    </span>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-muted px-3 py-2 text-center">
      <p className="font-display text-2xl leading-tight">{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

function Empty() {
  return (
    <p className="py-10 text-center text-sm text-muted-foreground">
      No sales in this period.
    </p>
  );
}
