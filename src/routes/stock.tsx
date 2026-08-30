import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpDown, Search, Star } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  categoryLabel,
  desiredFor,
  fetchFlavours,
  fetchFreezers,
  fetchSeason,
  type Flavour,
} from "@/lib/gelato";

export const Route = createFileRoute("/stock")({
  head: () => ({
    meta: [
      { title: "Current Stock Levels — Charlie's Gelato" },
      {
        name: "description",
        content:
          "See how many trays of each gelato flavour are in stock and overall freezer capacity at Charlie's Gelato.",
      },
      { property: "og:title", content: "Current Stock Levels — Charlie's Gelato" },
      {
        property: "og:description",
        content: "Live tray counts by flavour and freezer capacity at a glance.",
      },
    ],
  }),
  component: StockPage,
});

type SortKey = "alpha" | "high" | "low" | "priority";

const SORT_LABELS: Record<SortKey, string> = {
  alpha: "Alphabetical",
  high: "Highest stock",
  low: "Lowest stock",
  priority: "Popular flavours",
};

function StockPage() {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("alpha");
  const flavours = useQuery({ queryKey: ["flavours"], queryFn: fetchFlavours });
  const freezers = useQuery({ queryKey: ["freezers"], queryFn: fetchFreezers });
  const season = useQuery({ queryKey: ["season"], queryFn: fetchSeason });

  const list = useMemo(() => {
    const all = (flavours.data ?? []).filter((f) => f.active);
    const query = q.trim().toLowerCase();
    const filtered = all.filter((f) => f.name.toLowerCase().includes(query));
    const byName = (a: Flavour, b: Flavour) => a.name.localeCompare(b.name);
    switch (sort) {
      case "alpha":
        return filtered.sort(byName);
      case "high":
        return filtered.sort((a, b) => b.stock_qty - a.stock_qty || byName(a, b));
      case "low":
        return filtered.sort((a, b) => a.stock_qty - b.stock_qty || byName(a, b));
      case "priority":
        return filtered.sort(
          (a, b) => Number(b.priority) - Number(a.priority) || byName(a, b),
        );
    }
  }, [flavours.data, q, sort]);

  const totalTrays = (flavours.data ?? []).reduce((s, f) => s + f.stock_qty, 0);
  const totalCap = (freezers.data ?? []).reduce((s, f) => s + f.capacity_trays, 0);
  const pct = totalCap ? Math.min(100, Math.round((totalTrays / totalCap) * 100)) : 0;

  return (
    <AppShell
      title="Current Stock Levels"
      subtitle={`${totalTrays} trays across ${(freezers.data ?? []).length} freezers`}
    >
      <section className="mb-6 space-y-3">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Freezer capacity
        </h2>
        <div className="surface p-4">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-display text-base">All freezers</p>
            <p className="font-display text-base">
              {totalTrays} / {totalCap} trays · {pct}%
            </p>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${pct > 90 ? "bg-primary" : "bg-sky"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {totalCap > 0 && totalTrays > totalCap ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Stock on record exceeds total freezer capacity.
            </p>
          ) : null}
        </div>
      </section>

      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search flavours…"
            className="h-13 rounded-2xl pl-12 text-base"
          />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="h-13 w-44 rounded-2xl" aria-label="Sort flavours">
            <ArrowUpDown className="size-4 shrink-0 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <SelectItem key={k} value={k}>
                {SORT_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="mb-3 px-1 text-xs text-muted-foreground">
        Chips highlight flavours vs their {season.data ?? "mid"} season minimum recommended:{" "}
        <span className="font-semibold text-primary">below minimum</span> needs attention,{" "}
        <span className="font-semibold text-accent-foreground">watch</span> is within 2 trays of
        it.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {list.map((f) => {
          const min = desiredFor(f, season.data ?? "mid");
          const below = min > 0 && f.stock_qty < min;
          const watch = min > 0 && !below && f.stock_qty <= min + 2;
          return (
            <div key={f.id} className="surface flex min-h-16 items-center gap-3 px-4 py-3">
              {f.image_url ? (
                <img
                  src={f.image_url}
                  alt=""
                  className="size-11 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-cream font-display text-base text-cream-foreground">
                  {f.name.slice(0, 2)}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate font-display text-base">{f.name}</span>
                  {f.priority ? (
                    <Star className="size-3.5 shrink-0 fill-primary text-primary" />
                  ) : null}
                </span>
                <span className="text-xs font-medium text-muted-foreground">
                  {categoryLabel(f.category)} · min recommended {min}
                  {below ? " · below minimum" : watch ? " · watch" : ""}
                </span>
              </span>
              <span
                className={`shrink-0 rounded-full px-3 py-1.5 font-display text-lg ${
                  below
                    ? "bg-primary text-primary-foreground"
                    : watch
                      ? "bg-accent text-accent-foreground"
                      : "bg-muted text-foreground"
                }`}
              >
                {f.stock_qty}
              </span>
            </div>
          );
        })}
        {list.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground sm:col-span-2">
            No flavours match that search.
          </p>
        ) : null}
      </div>
    </AppShell>
  );
}
