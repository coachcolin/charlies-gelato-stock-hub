import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Check, Minus, Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useVoiceStockTake } from "@/components/VoiceStockTake";
import {
  applyMovements,
  fetchFlavours,
  formatTraysTubs,
  type Flavour,
  type Unit,
} from "@/lib/gelato";

const k = (id: string, unit: Unit) => `${id}|${unit}`;
const parseKey = (key: string) => {
  const [id, unit] = key.split("|");
  return { id: id as string, unit: (unit === "tub" ? "tub" : "tray") as Unit };
};

export const Route = createFileRoute("/soft-freezer")({
  head: () => ({
    meta: [
      { title: "Soft Freezer Order — Charlie's Gelato" },
      {
        name: "description",
        content:
          "Top up the display cabinet freezers at Charlie's Gelato and log the trays out of stock.",
      },
      { property: "og:title", content: "Soft Freezer Order — Charlie's Gelato" },
      {
        property: "og:description",
        content: "Top up the display cabinet freezers and log the trays out of stock.",
      },
    ],
  }),
  component: SoftFreezerOrder,
});

type GroupKey = "gelato" | "sorbetto" | "allergen";

const GROUPS: { key: GroupKey; label: string }[] = [
  { key: "gelato", label: "Gelato" },
  { key: "sorbetto", label: "Sorbetto" },
  { key: "allergen", label: "Contains nuts / gluten" },
];

function groupOf(f: Flavour): GroupKey {
  if (f.category === "sorbetto") return "sorbetto";
  if (f.contains_gluten || f.contains_nuts) return "allergen";
  return "gelato";
}

function SoftFreezerOrder() {
  const qc = useQueryClient();
  const router = useRouter();
  const flavours = useQuery({ queryKey: ["flavours"], queryFn: fetchFlavours });
  const [q, setQ] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [reviewing, setReviewing] = useState(false);

  const voice = useVoiceStockTake(
    flavours.data ?? [],
    (heard) =>
      setCounts((prev) => {
        const next = { ...prev };
        for (const unit of ["tray", "tub"] as const) {
          for (const [id, qty] of Object.entries(heard[unit])) {
            if (qty > 0) next[k(id, unit)] = qty;
            else delete next[k(id, unit)];
          }
        }
        return next;
      }),
    {
      recordLabel: "Record soft freezer order",
      hint: "Speak what you’re taking, e.g. “one strawberry, two chocolate, three cookie dough tubs”. Say “tubs” for tubs, otherwise it counts trays. You can check and edit the list before it fills in the order.",
      applyLabel: "Add to order",
      appliedMessage: (n) => `Added ${n} flavour${n === 1 ? "" : "s"} to the order`,
    },
  );

  const grouped = useMemo(() => {
    const query = q.trim().toLowerCase();
    const active = (flavours.data ?? [])
      .filter((f) => f.active && f.name.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name));
    const map: Record<GroupKey, Flavour[]> = { gelato: [], sorbetto: [], allergen: [] };
    for (const f of active) map[groupOf(f)].push(f);
    return map;
  }, [flavours.data, q]);

  const bump = (f: Flavour, delta: 1 | -1, unit: Unit = "tray") =>
    setCounts((prev) => {
      const next = { ...prev };
      const key = k(f.id, unit);
      const v = (next[key] ?? 0) + delta;
      if (v <= 0) delete next[key];
      else next[key] = v;
      return next;
    });

  const lines = Object.entries(counts).map(([key, qty]) => {
    const { id, unit } = parseKey(key);
    return { flavour_id: id, qty: -qty, unit };
  });
  let trays = 0;
  let tubs = 0;
  for (const [key, n] of Object.entries(counts)) {
    if (parseKey(key).unit === "tub") tubs += n;
    else trays += n;
  }
  const total = trays + tubs;
  const totalLabel = formatTraysTubs(trays, tubs);

  const selected = useMemo(() => {
    const byId = new Map((flavours.data ?? []).map((f) => [f.id, f]));
    return Object.entries(counts)
      .map(([key, qty]) => {
        const { id, unit } = parseKey(key);
        return { flavour: byId.get(id), qty, unit };
      })
      .filter((x): x is { flavour: Flavour; qty: number; unit: Unit } => Boolean(x.flavour))
      .sort((a, b) => a.flavour.name.localeCompare(b.flavour.name) || a.unit.localeCompare(b.unit));
  }, [counts, flavours.data]);

  const removeLine = (key: string) =>
    setCounts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

  const submit = useMutation({
    mutationFn: () => applyMovements(lines, "removal", "Soft freezer order"),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success(`${totalLabel} sent to the display freezer`);
      setCounts({});
      setReviewing(false);
      router.navigate({ to: "/" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (reviewing) {
    return (
      <AppShell title="Review Soft Freezer Order" subtitle="Check before confirming">
        <div className="space-y-4 pb-28">
          <p className="px-1 text-sm text-muted-foreground">
            These trays will be removed from stock and counted as gone to the display freezer.
          </p>
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {selected.map(({ flavour, qty, unit }) => (
              <div key={k(flavour.id, unit)} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1 truncate font-display text-base">
                  {flavour.name}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    unit === "tub" ? "bg-sky text-sky-foreground" : "bg-cream text-cream-foreground"
                  }`}
                >
                  {unit === "tub" ? "Tubs" : "Trays"}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Remove one ${flavour.name}`}
                    onClick={() => bump(flavour, -1, unit)}
                    className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground transition active:scale-90"
                  >
                    <Minus className="size-4" />
                  </button>
                  <span className="w-7 text-center font-display text-base text-primary">
                    {qty}
                  </span>
                  <button
                    type="button"
                    aria-label={`Add one ${flavour.name}`}
                    onClick={() => bump(flavour, 1, unit)}
                    className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground transition active:scale-90"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${flavour.name} from order`}
                  onClick={() => removeLine(k(flavour.id, unit))}
                  className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted active:scale-90"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
            {selected.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                Nothing selected — go back to add flavours.
              </p>
            ) : null}
          </div>
          <div className="flex items-center justify-between px-1 font-display">
            <span className="text-muted-foreground">Total</span>
            <span className="text-lg">{totalLabel}</span>
          </div>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur">
          <div className="mx-auto flex max-w-4xl gap-3 p-4">
            <Button
              variant="outline"
              className="h-16 rounded-2xl px-6 text-lg"
              disabled={submit.isPending}
              onClick={() => setReviewing(false)}
            >
              <ArrowLeft className="mr-2 size-5" />
              Back
            </Button>
            <Button
              className="h-16 flex-1 rounded-2xl text-lg"
              disabled={submit.isPending || total === 0}
              onClick={() => submit.mutate()}
            >
              <Check className="mr-2 size-6" />
              Confirm · {totalLabel} to display freezer
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Soft Freezer Order" subtitle="Top up the display freezers">
      {voice.panel}

      <div className="space-y-4">
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

        {GROUPS.map(({ key, label }) => {
          const list = grouped[key];
          if (list.length === 0) return null;
          return (
            <section key={key} className="space-y-1.5">
              <h2 className="px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {label}
              </h2>
              <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
                {list.map((f) => {
                  const counter = (unit: Unit) => {
                    const n = counts[k(f.id, unit)] ?? 0;
                    return (
                      <div className="flex shrink-0 items-center gap-0.5">
                        <span className="w-7 text-right text-[10px] font-semibold uppercase text-muted-foreground">
                          {unit === "tub" ? "Tub" : "Tray"}
                        </span>
                        <button
                          type="button"
                          aria-label={`Remove one ${f.name} ${unit}`}
                          disabled={n === 0}
                          onClick={() => bump(f, -1, unit)}
                          className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground transition active:scale-90 disabled:opacity-30"
                        >
                          <Minus className="size-4" />
                        </button>
                        <span
                          className={`w-6 text-center font-display text-base ${
                            n > 0 ? "text-primary" : "text-muted-foreground"
                          }`}
                        >
                          {n}
                        </span>
                        <button
                          type="button"
                          aria-label={`Add one ${f.name} ${unit}`}
                          onClick={() => bump(f, 1, unit)}
                          className={`flex size-8 items-center justify-center rounded-full transition active:scale-90 ${
                            unit === "tub" ? "bg-sky text-sky-foreground" : "bg-primary text-primary-foreground"
                          }`}
                        >
                          <Plus className="size-4" />
                        </button>
                      </div>
                    );
                  };
                  return (
                    <div key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5">
                      <span className="min-w-0 flex-1 truncate font-display text-sm">
                        {f.name}
                        <span className="ml-2 font-sans text-xs text-muted-foreground">
                          {f.stock_qty} trays · {f.tub_qty ?? 0} tubs
                        </span>
                      </span>
                      {counter("tray")}
                      {counter("tub")}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {total > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur">
          <div className="mx-auto max-w-4xl p-4">
            <Button
              className="h-16 w-full rounded-2xl text-lg"
              onClick={() => setReviewing(true)}
            >
              <Check className="mr-2 size-6" />
              Review changes · {totalLabel}
            </Button>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
