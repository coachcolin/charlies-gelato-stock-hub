import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Check, Minus, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  GROUP_LABEL,
  MAX_DAY_TRAYS,
  MAX_WEEK_DAYS,
  TUBS_PER_TRAY,
  allergenGroup,
  applyMovements,
  db,
  desiredFor,
  fetchFlavours,
  fetchOrders,
  fetchReports,
  fetchSeason,
  formatTraysTubs,
  planDays,
  type Flavour,
  type Unit,
} from "@/lib/gelato";

export const Route = createFileRoute("/production")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Production Report — Charlie's Gelato" },
      {
        name: "description",
        content:
          "Pick the trays and tubs to make this week, add wholesale orders and get a suggested day plan.",
      },
      { property: "og:title", content: "Production Report — Charlie's Gelato" },
      {
        property: "og:description",
        content: "Choose what to churn, plan the days, and tick flavours off as you make them.",
      },
    ],
  }),
  component: ProductionPage,
});

function DayTabs({
  days,
  selected,
  onSelect,
  trayTotals,
}: {
  days: number[];
  selected: number;
  onSelect: (day: number) => void;
  trayTotals?: Record<number, string>;
}) {
  return (
    <div className="surface flex gap-1 rounded-2xl p-1">
      {days.map((day) => {
        const active = day === selected;
        return (
          <button
            key={day}
            type="button"
            onClick={() => onSelect(day)}
            className={`flex h-12 flex-1 flex-col items-center justify-center rounded-xl transition-colors ${
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <span className="font-display text-sm leading-tight">Day {day}</span>
            {trayTotals ? (
              <span className={`text-[10px] leading-tight ${active ? "opacity-80" : "text-muted-foreground"}`}>
                {trayTotals[day] ?? "0 trays"}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

type Pick = { trays: number; tubs: number };
type Section = "gelato" | "sorbetto" | "allergen" | "special";
const SECTIONS: { key: Section; label: string }[] = [
  { key: "gelato", label: "Gelato" },
  { key: "sorbetto", label: "Sorbetto" },
  { key: "allergen", label: "Contains gluten / nuts" },
  { key: "special", label: "Specials" },
];
function sectionOf(f: Flavour): Section {
  if (f.category === "special") return "special";
  if (f.category === "sorbetto") return "sorbetto";
  if (f.contains_gluten || f.contains_nuts) return "allergen";
  return "gelato";
}

function ProductionPage() {
  const qc = useQueryClient();
  const flavours = useQuery({ queryKey: ["flavours"], queryFn: fetchFlavours });
  const orders = useQuery({ queryKey: ["orders"], queryFn: fetchOrders });
  const season = useQuery({ queryKey: ["season"], queryFn: fetchSeason });
  const reports = useQuery({ queryKey: ["reports"], queryFn: fetchReports });

  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [ticked, setTicked] = useState<string[]>([]);
  const [sort, setSort] = useState<"min" | "alpha">("min");
  const [q, setQ] = useState("");
  const [dayCount, setDayCount] = useState(2);
  const [sorbettoDay, setSorbettoDay] = useState(1);
  const [plan, setPlan] = useState<Record<string, number> | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [selectedDay, setSelectedDay] = useState(1);

  const currentSeason = season.data ?? "mid";
  const activeReport = (reports.data ?? []).find((r) => r.status === "active");
  const activeOrders = (orders.data ?? []).filter((o) => o.status === "active");
  const byId = useMemo(() => new Map((flavours.data ?? []).map((f) => [f.id, f])), [flavours.data]);

  const gap = (f: Flavour) => desiredFor(f, currentSeason) - f.stock_qty;

  const visible = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (flavours.data ?? []).filter((f) => f.active && f.name.toLowerCase().includes(query));
  }, [flavours.data, q]);

  const add = (id: string, unit: Unit, delta: number) =>
    setPicks((prev) => {
      const cur = prev[id] ?? { trays: 0, tubs: 0 };
      const next = { ...cur };
      if (unit === "tub") next.tubs = Math.max(0, cur.tubs + delta);
      else next.trays = Math.max(0, cur.trays + delta);
      const out = { ...prev };
      if (next.trays === 0 && next.tubs === 0) delete out[id];
      else out[id] = next;
      return out;
    });

  const toggleOrder = (orderId: string) => {
    const order = activeOrders.find((o) => o.id === orderId);
    if (!order) return;
    const on = ticked.includes(orderId);
    for (const i of order.items) {
      if (i.flavour_id) add(i.flavour_id, i.unit === "tub" ? "tub" : "tray", on ? -i.qty : i.qty);
    }
    setTicked((t) => (on ? t.filter((x) => x !== orderId) : [...t, orderId]));
  };

  const chosen = Object.entries(picks)
    .map(([id, p]) => ({ flavour: byId.get(id), ...p }))
    .filter((x): x is { flavour: Flavour; trays: number; tubs: number } => Boolean(x.flavour))
    .sort((a, b) => a.flavour.name.localeCompare(b.flavour.name));
  const totalTrays = chosen.reduce((t, c) => t + c.trays, 0);
  const totalTubs = chosen.reduce((t, c) => t + c.tubs, 0);
  const groupsPresent = new Set(chosen.map((c) => allergenGroup(c.flavour)));
  const separateNeeded = (["sorbetto", "gluten", "nuts"] as const).filter((g) => groupsPresent.has(g)).length;

  const makePlan = () =>
    setPlan(
      planDays(
        chosen.map((c) => ({
          flavour_id: c.flavour.id,
          trays: c.trays,
          tubs: c.tubs,
          group: allergenGroup(c.flavour),
        })),
        dayCount,
        sorbettoDay,
      ),
    );

  const createReport = useMutation({
    mutationFn: async () => {
      const res = await db
        .from("production_reports")
        .insert({ season: currentSeason, days: dayCount, sorbetto_day: sorbettoDay })
        .select("id")
        .single();
      if (res.error) throw new Error(res.error.message);
      const id = res.data.id as string;
      const rows = [...chosen]
        .sort((a, b) => (plan?.[a.flavour.id] ?? 1) - (plan?.[b.flavour.id] ?? 1))
        .map((c, idx) => ({
          report_id: id,
          flavour_id: c.flavour.id,
          flavour_name: c.flavour.name,
          suggested_qty: c.trays,
          suggested_tubs: c.tubs,
          reason: null,
          note: notes[c.flavour.id]?.trim() || null,
          day_index: plan?.[c.flavour.id] ?? 1,
          position: idx,
        }));
      const itemsRes = await db.from("production_report_items").insert(rows);
      if (itemsRes.error) throw new Error(itemsRes.error.message);
    },
    onSuccess: () => {
      setPicks({});
      setTicked([]);
      setPlan(null);
      setNotes({});
      qc.invalidateQueries();
      toast.success("Production report started");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (activeReport) {
    return (
      <ActiveReport report={activeReport} onDone={() => qc.invalidateQueries()} season={currentSeason} />
    );
  }

  const counter = (f: Flavour, unit: Unit) => {
    const n = (unit === "tub" ? picks[f.id]?.tubs : picks[f.id]?.trays) ?? 0;
    const step = unit === "tub" ? TUBS_PER_TRAY : 1;
    return (
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          aria-label={`Less ${f.name} ${unit}s`}
          disabled={n === 0}
          onClick={() => add(f.id, unit, -step)}
          className="flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground transition active:scale-90 disabled:opacity-30"
        >
          <Minus className="size-4" />
        </button>
        <span className={`w-6 text-center font-display text-sm ${n > 0 ? "text-primary" : "text-muted-foreground"}`}>
          {n}
        </span>
        <button
          type="button"
          aria-label={`More ${f.name} ${unit}s`}
          onClick={() => add(f.id, unit, step)}
          className={`flex size-7 items-center justify-center rounded-full transition active:scale-90 ${
            unit === "tub" ? "bg-sky text-sky-foreground" : "bg-primary text-primary-foreground"
          }`}
        >
          <Plus className="size-4" />
        </button>
      </div>
    );
  };

  const row = (f: Flavour) => {
    const min = desiredFor(f, currentSeason);
    const g = gap(f);
    return (
      <div key={f.id} className="flex items-center gap-2 px-3 py-1.5">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-sm">{f.name}</span>
          <span className={`block text-[11px] leading-tight ${g > 0 ? "text-destructive" : "text-muted-foreground"}`}>
            {f.stock_qty} / {min} min{g > 0 ? ` · ${g} short` : ""} · {f.tub_qty ?? 0} tubs
          </span>
        </span>
        {counter(f, "tray")}
        {counter(f, "tub")}
      </div>
    );
  };

  const header = (label: string) => (
    <div className="flex items-end px-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
      <h2 className="-ml-2 flex-1">{label}</h2>
      <span className="w-[84px] text-center">Trays</span>
      <span className="ml-2 w-[84px] text-center">Tubs</span>
    </div>
  );

  // ---- day plan step ----
  if (plan) {
    const dayList = Array.from({ length: dayCount }, (_, i) => i + 1);
    const day = Math.min(selectedDay, dayCount);
    const dayItems = chosen.filter((c) => (plan[c.flavour.id] ?? 1) === day);
    const totals = Object.fromEntries(
      dayList.map((d) => {
        const items = chosen.filter((c) => (plan[c.flavour.id] ?? 1) === d);
        return [d, formatTraysTubs(items.reduce((t, c) => t + c.trays, 0), items.reduce((t, c) => t + c.tubs, 0))];
      }),
    );
    const loadOf = (d: number) =>
      chosen
        .filter((c) => (plan[c.flavour.id] ?? 1) === d)
        .reduce((t, c) => t + c.trays + c.tubs / TUBS_PER_TRAY, 0);
    const overDays = dayList.filter((d) => loadOf(d) > MAX_DAY_TRAYS);
    // Rule checks after manual moves.
    const daysOf = (g: string) =>
      new Set(chosen.filter((c) => allergenGroup(c.flavour) === g).map((c) => plan[c.flavour.id] ?? 1));
    const sorbD = daysOf("sorbetto");
    const glutD = daysOf("gluten");
    const nutD = daysOf("nuts");
    const clash = [...glutD].some((d) => nutD.has(d) || sorbD.has(d)) || [...nutD].some((d) => sorbD.has(d));

    return (
      <AppShell title="Day plan" subtitle={`${dayCount}-day week · ${formatTraysTubs(totalTrays, totalTubs)}`}>
        <div className="space-y-4 pb-28">
          <p className="px-1 text-sm text-muted-foreground">
            Suggested days: sorbetti together, gluten at the end of a different day, and nuts at the end of another day. You can move anything.
          </p>
          {dayList.length > 1 ? <DayTabs days={dayList} selected={day} onSelect={setSelectedDay} trayTotals={totals} /> : null}
          {overDays.length > 0 || clash || separateNeeded > dayCount ? (
            <div className="surface flex gap-2 p-3 text-sm">
              <AlertTriangle className="size-5 shrink-0 text-destructive" />
              <div className="space-y-1">
                {overDays.map((d) => (
                  <p key={d}>Day {d} is over {MAX_DAY_TRAYS} trays.</p>
                ))}
                {clash || separateNeeded > dayCount ? (
                  <p>Sorbetti, gluten and nuts should each be on their own day.</p>
                ) : null}
              </div>
            </div>
          ) : null}
          {dayItems.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nothing on day {day}.</p>
          ) : null}
          {dayItems.map((c) => {
            const g = allergenGroup(c.flavour);
            return (
              <div key={c.flavour.id} className="surface space-y-2 p-4">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-base">{c.flavour.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {g !== "plain" ? `${GROUP_LABEL[g]} · ` : ""}
                      {formatTraysTubs(c.trays, c.tubs)}
                    </span>
                  </span>
                </div>
                {dayList.length > 1 ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Move to day</span>
                    {dayList.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setPlan((p) => ({ ...(p ?? {}), [c.flavour.id]: n }))}
                        className={`size-8 rounded-full text-sm font-semibold ${
                          day === n ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                ) : null}
                <Textarea
                  value={notes[c.flavour.id] ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [c.flavour.id]: e.target.value }))}
                  placeholder="Notes for the ice-cream makers…"
                  rows={2}
                  className="min-h-11 resize-y rounded-xl text-sm"
                  aria-label={`${c.flavour.name} production notes`}
                />
              </div>
            );
          })}
        </div>
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 p-4 backdrop-blur">
          <div className="mx-auto flex max-w-4xl gap-2">
            <Button variant="outline" className="h-16 rounded-2xl px-6 text-lg" onClick={() => setPlan(null)}>
              <ArrowLeft className="mr-2 size-5" /> Back
            </Button>
            <Button
              className="h-16 flex-1 rounded-2xl text-lg"
              disabled={createReport.isPending}
              onClick={() => createReport.mutate()}
            >
              <Check className="mr-2 size-6" /> Start production report
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  // ---- pick step ----
  const pastReports = (reports.data ?? []).filter((r) => r.status === "completed");
  const sortedByGap = [...visible].sort((a, b) => gap(b) - gap(a) || a.name.localeCompare(b.name));

  return (
    <AppShell title="Production Report" subtitle={`Choose what to make · ${currentSeason} season`}>
      <div className="space-y-4 pb-28">
        {activeOrders.length > 0 ? (
          <section className="surface space-y-2 p-4">
            <p className="font-display text-base">Add wholesale orders to the plan</p>
            {activeOrders.map((o) => {
              const on = ticked.includes(o.id);
              const tr = o.items.filter((i) => i.unit !== "tub").reduce((t, i) => t + i.qty, 0);
              const tb = o.items.filter((i) => i.unit === "tub").reduce((t, i) => t + i.qty, 0);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => toggleOrder(o.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                    on ? "border-primary bg-primary/10" : "border-border"
                  }`}
                >
                  <span
                    className={`flex size-6 shrink-0 items-center justify-center rounded-md border ${
                      on ? "border-primary bg-primary text-primary-foreground" : "border-border"
                    }`}
                  >
                    {on ? <Check className="size-4" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-sm">{o.wholesaler}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatTraysTubs(tr, tb)}
                      {o.send_date ? ` · due ${new Date(o.send_date).toLocaleDateString()}` : ""}
                    </span>
                  </span>
                </button>
              );
            })}
          </section>
        ) : null}

        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search flavours…"
            inputMode="search"
            className="h-12 rounded-2xl pl-12 text-base"
          />
        </div>

        <div className="surface flex gap-1 rounded-2xl p-1">
          {(
            [
              ["min", "Furthest from minimum"],
              ["alpha", "A–Z by type"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSort(key)}
              className={`h-10 flex-1 rounded-xl text-sm font-semibold ${
                sort === key ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {sort === "min" ? (
          <section className="space-y-1.5">
            {header("All flavours")}
            <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {sortedByGap.map(row)}
            </div>
          </section>
        ) : (
          SECTIONS.map(({ key, label }) => {
            const list = visible.filter((f) => sectionOf(f) === key).sort((a, b) => a.name.localeCompare(b.name));
            if (list.length === 0) return null;
            return (
              <section key={key} className="space-y-1.5">
                {header(label)}
                <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
                  {list.map(row)}
                </div>
              </section>
            );
          })
        )}

        <section className="surface space-y-3 p-4">
          <div>
            <p className="font-display text-base">How many days are you making this week?</p>
            <div className="mt-2 flex gap-2">
              {Array.from({ length: MAX_WEEK_DAYS }, (_, i) => i + 1).map((n) => (
                <Button
                  key={n}
                  variant={dayCount === n ? "default" : "outline"}
                  className="h-12 flex-1 rounded-xl"
                  onClick={() => {
                    setDayCount(n);
                    if (sorbettoDay > n) setSorbettoDay(1);
                  }}
                >
                  {n}
                </Button>
              ))}
            </div>
          </div>
          {groupsPresent.has("sorbetto") && dayCount > 1 ? (
            <div>
              <p className="font-display text-base">Which day are sorbetti made?</p>
              <div className="mt-2 flex gap-2">
                {Array.from({ length: dayCount }, (_, i) => i + 1).map((n) => (
                  <Button
                    key={n}
                    variant={sorbettoDay === n ? "default" : "outline"}
                    className="h-12 flex-1 rounded-xl"
                    onClick={() => setSorbettoDay(n)}
                  >
                    Day {n}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
          {separateNeeded > dayCount ? (
            <p className="text-xs text-destructive">
              Sorbetti, gluten and nuts each need their own day — you need at least {separateNeeded} days.
            </p>
          ) : null}
        </section>

        {pastReports.length > 0 ? (
          <section>
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Past reports
            </h2>
            <div className="space-y-2">
              {pastReports.slice(0, 10).map((r) => (
                <div key={r.id} className="surface p-4 text-sm">
                  <p className="font-display text-base">
                    {new Date(r.created_at).toLocaleDateString()} · {r.season} season
                  </p>
                  <p className="text-muted-foreground">
                    {formatTraysTubs(
                      r.items.reduce((s, i) => s + (i.produced_qty ?? 0), 0),
                      r.items.reduce((s, i) => s + (i.produced_tubs ?? 0), 0),
                    )}{" "}
                    made across {r.items.length} flavours
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {chosen.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur">
          <div className="mx-auto max-w-4xl p-4">
            <Button className="h-16 w-full rounded-2xl text-lg" onClick={makePlan}>
              Plan the days · {formatTraysTubs(totalTrays, totalTubs)}
            </Button>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

function ActiveReport({
  report,
  season,
  onDone,
}: {
  report: Awaited<ReturnType<typeof fetchReports>>[number];
  season: string;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [tubQtys, setTubQtys] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const saveNote = useMutation({
    mutationFn: async ({ itemId, note }: { itemId: string; note: string }) => {
      const res = await db
        .from("production_report_items")
        .update({ note: note.trim() || null })
        .eq("id", itemId);
      if (res.error) throw new Error(res.error.message);
    },
    onError: (e: Error) => toast.error(e.message),
  });



  const tick = useMutation({
    mutationFn: async ({
      itemId,
      flavourId,
      name,
      qty,
      tubs,
    }: {
      itemId: string;
      flavourId: string | null;
      name: string;
      qty: number;
      tubs: number;
    }) => {
      if (flavourId) {
        await applyMovements(
          [
            { flavour_id: flavourId, qty, unit: "tray" },
            { flavour_id: flavourId, qty: tubs, unit: "tub" },
          ],
          "production",
          `Made ${name}`,
        );
      }
      const res = await db
        .from("production_report_items")
        .update({ done: true, produced_qty: qty, produced_tubs: tubs })
        .eq("id", itemId);
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Added to stock");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const finish = useMutation({
    mutationFn: async () => {
      const res = await db
        .from("production_reports")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", report.id);
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => {
      onDone();
      toast.success("Report closed");
    },
  });

  const outstanding = report.items.filter((i) => !i.done);
  const dayNumbers = Array.from(new Set(report.items.map((i) => i.day_index ?? 1))).sort(
    (a, b) => a - b,
  );
  const multiDay = dayNumbers.length > 1;
  const activeDay = selectedDay ?? dayNumbers[0] ?? 1;
  const dayTrayTotals = Object.fromEntries(
    dayNumbers.map((day) => [
      day,
      report.items
        .filter((i) => (i.day_index ?? 1) === day)
        .reduce((t, i) => t + i.suggested_qty, 0),
    ]),
  );

  return (
    <AppShell
      title="Active Production Report"
      subtitle={`${outstanding.length} of ${report.items.length} left · ${season} season${
        multiDay ? ` · ${dayNumbers.length}-day week` : ""
      }`}
    >
      <div className="space-y-4">
        {multiDay ? (
          <DayTabs
            days={dayNumbers}
            selected={activeDay}
            onSelect={setSelectedDay}
            trayTotals={Object.fromEntries(Object.entries(dayTrayTotals).map(([d, n]) => [d, `${n} trays`]))}
          />
        ) : null}
        <section className="space-y-2">
          {report.items
            .filter((i) => (multiDay ? (i.day_index ?? 1) === activeDay : true))
            .map((i) => {
          const value = qtys[i.id] ?? i.produced_qty ?? i.suggested_qty;
          const tubValue = tubQtys[i.id] ?? i.produced_tubs ?? i.suggested_tubs ?? 0;
          return (
            <div key={i.id} className={`surface space-y-3 p-4 ${i.done ? "opacity-60" : ""}`}>

              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-base">{i.flavour_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {i.done
                      ? `Made ${formatTraysTubs(i.produced_qty ?? 0, i.produced_tubs ?? 0)}`
                      : `Suggested ${formatTraysTubs(i.suggested_qty, i.suggested_tubs ?? 0)}`}
                  </span>
                </span>
                {!i.done ? (
                  <>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={value}
                      onChange={(e) =>
                        setQtys((q) => ({
                          ...q,
                          [i.id]: Math.max(0, Number(e.target.value) || 0),
                        }))
                      }
                      className="h-12 w-20 text-center font-display text-lg"
                      aria-label={`${i.flavour_name} trays made`}
                    />
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={tubValue}
                      onChange={(e) =>
                        setTubQtys((q) => ({
                          ...q,
                          [i.id]: Math.max(0, Number(e.target.value) || 0),
                        }))
                      }
                      className="h-12 w-16 text-center font-display text-lg"
                      aria-label={`${i.flavour_name} tubs made`}
                      placeholder="tubs"
                    />
                    <Button
                      size="icon"
                      className="size-12 shrink-0 rounded-full"
                      aria-label={`Mark ${i.flavour_name} as made`}
                      onClick={() =>
                        tick.mutate({
                          itemId: i.id,
                          flavourId: i.flavour_id,
                          name: i.flavour_name,
                          qty: value,
                          tubs: tubValue,
                        })
                      }
                    >
                      <Check className="size-5" />
                    </Button>
                  </>
                ) : (
                  <span className="flex size-12 items-center justify-center rounded-full bg-sky text-sky-foreground">
                    <Check className="size-5" />
                  </span>
                )}
              </div>

              {i.done ? (
                i.note ? (
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{i.note}</p>
                ) : null
              ) : (
                <Textarea
                  value={notes[i.id] ?? i.note ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [i.id]: e.target.value }))}
                  onBlur={(e) => saveNote.mutate({ itemId: i.id, note: e.target.value })}
                  placeholder="Notes for the ice-cream makers…"
                  rows={2}
                  className="min-h-11 resize-y rounded-xl text-sm"
                  aria-label={`${i.flavour_name} production notes`}
                />
              )}
            </div>
          );
              })}
        </section>
      </div>


      <Button
        variant={outstanding.length === 0 ? "default" : "outline"}
        className="mt-6 h-16 w-full rounded-2xl text-lg"
        onClick={() => finish.mutate()}
      >
        Close report
      </Button>
    </AppShell>
  );
}
