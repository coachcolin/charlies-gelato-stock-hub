import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import {
  db,
  desiredFor,
  fetchFlavours,
  fetchFreezers,
  fetchSeason,
  type Freezer,
} from "@/lib/gelato";

export const Route = createFileRoute("/stock")({
  head: () => ({
    meta: [
      { title: "Current Stock Levels — Charlie's Gelato" },
      {
        name: "description",
        content:
          "See how many trays of each gelato flavour are in stock and how full each of the three freezers is.",
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

function StockPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const flavours = useQuery({ queryKey: ["flavours"], queryFn: fetchFlavours });
  const freezers = useQuery({ queryKey: ["freezers"], queryFn: fetchFreezers });
  const season = useQuery({ queryKey: ["season"], queryFn: fetchSeason });

  const updateFreezer = useMutation({
    mutationFn: async (f: { id: string; patch: Partial<Freezer> }) => {
      const res = await db.from("freezers").update(f.patch).eq("id", f.id);
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["freezers"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const list = useMemo(() => {
    const all = (flavours.data ?? []).filter((f) => f.active);
    const query = q.trim().toLowerCase();
    return all
      .filter((f) => f.name.toLowerCase().includes(query))
      .sort((a, b) => a.stock_qty - b.stock_qty);
  }, [flavours.data, q]);

  const totalTrays = (flavours.data ?? []).reduce((s, f) => s + f.stock_qty, 0);
  const totalCap = (freezers.data ?? []).reduce((s, f) => s + f.capacity_trays, 0);

  return (
    <AppShell
      title="Current Stock Levels"
      subtitle={`${totalTrays} trays across ${(freezers.data ?? []).length} freezers`}
    >
      <section className="mb-6 space-y-3">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Freezer capacity
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {(freezers.data ?? []).map((fz) => {
            const pct = fz.capacity_trays
              ? Math.min(100, Math.round((fz.current_trays / fz.capacity_trays) * 100))
              : 0;
            return (
              <div key={fz.id} className="surface p-4">
                <p className="font-display text-base">{fz.name}</p>
                <div className="mt-2 h-3 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${pct > 90 ? "bg-primary" : "bg-sky"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={fz.current_trays}
                    onChange={(e) =>
                      updateFreezer.mutate({
                        id: fz.id,
                        patch: { current_trays: Math.max(0, Number(e.target.value) || 0) },
                      })
                    }
                    className="h-10 w-20 text-center"
                    aria-label={`${fz.name} trays`}
                  />
                  <span className="text-muted-foreground">of</span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={fz.capacity_trays}
                    onChange={(e) =>
                      updateFreezer.mutate({
                        id: fz.id,
                        patch: { capacity_trays: Math.max(1, Number(e.target.value) || 1) },
                      })
                    }
                    className="h-10 w-20 text-center"
                    aria-label={`${fz.name} capacity`}
                  />
                  <span className="ml-auto font-display">{pct}%</span>
                </div>
              </div>
            );
          })}
        </div>
        {totalCap > 0 && totalTrays > totalCap ? (
          <p className="flex items-center gap-2 rounded-xl bg-accent px-3 py-2 text-sm text-accent-foreground">
            <AlertTriangle className="size-4" /> Stock on record ({totalTrays}) exceeds total
            freezer capacity ({totalCap}).
          </p>
        ) : null}
      </section>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search flavours…"
          className="h-13 rounded-2xl pl-12 text-base"
        />
      </div>

      <div className="space-y-2">
        {list.map((f) => {
          const target = desiredFor(f, season.data ?? "mid");
          const low = target > 0 && f.stock_qty < target * 0.5;
          return (
            <div key={f.id} className="surface flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-base">{f.name}</span>
                <span className="text-xs text-muted-foreground">
                  target {target} trays{f.priority ? " · priority" : ""}
                </span>
              </span>
              <span
                className={`rounded-full px-3 py-1.5 font-display text-lg ${
                  low ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                }`}
              >
                {f.stock_qty}
              </span>
            </div>
          );
        })}
        {list.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No flavours yet — add them in Data Management.
          </p>
        ) : null}
      </div>
    </AppShell>
  );
}
