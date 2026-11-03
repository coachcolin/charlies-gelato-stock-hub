import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Check, Minus, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { SoftFreezerCollection } from "@/components/SoftFreezerCollection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useVoiceStockTake } from "@/components/VoiceStockTake";
import {
  fetchFlavours,
  formatTraysTubs,
  type Flavour,
  type Unit,
} from "@/lib/gelato";
import { fetchCollectionOrders, startCollection } from "@/lib/soft-freezer";

const k = (id: string, unit: Unit) => `${id}|${unit}`;
const parseKey = (key: string) => {
  const [id, unit] = key.split("|");
  return { id: id as string, unit: (unit === "tub" ? "tub" : "tray") as Unit };
};

export const Route = createFileRoute("/soft-freezer")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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
  const orders = useQuery({ queryKey: ["soft-freezer-orders"], queryFn: fetchCollectionOrders, refetchInterval: 5000 });
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);
  useEffect(() => {
    const active = orders.data?.find((order) => order.status === "active");
    if (active && !collectionId) setCollectionId(active.id);
  }, [orders.data, collectionId]);
  const [q, setQ] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});

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
      persistKey: "soft-freezer",
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
    return { flavour_id: id, qty, unit };
  });
  let trays = 0;
  let tubs = 0;
  for (const [key, n] of Object.entries(counts)) {
    if (parseKey(key).unit === "tub") tubs += n;
    else trays += n;
  }
  const total = trays + tubs;
  const totalLabel = formatTraysTubs(trays, tubs);

  const submit = useMutation({
    mutationFn: () => {
      requestId.current ??= crypto.randomUUID();
      return startCollection(requestId.current, lines);
    },
    onSuccess: async (id) => {
      setCollectionId(id);
      await qc.invalidateQueries({ queryKey: ["soft-freezer-orders"] });
      setCounts({});
      requestId.current = null;
    },
    onError: (e: Error) => {
      toast.error(e.message);
      void qc.invalidateQueries({ queryKey: ["soft-freezer-orders"] });
    },
  });

  const collection = orders.data?.find((order) => order.id === collectionId)
    ?? orders.data?.find((order) => order.status === "active");
  if (collection) return <SoftFreezerCollection order={collection} flavours={flavours.data ?? []} onDone={() => { router.navigate({ to: "/" }); }} />;
  if (orders.isPending || collectionId) return <AppShell title="Soft Freezer Order"><p className="text-muted-foreground">Loading collection…</p></AppShell>;
  if (orders.isError) return <AppShell title="Soft Freezer Order"><p className="mb-4 text-destructive">{orders.error.message}</p><Button variant="outline" onClick={() => orders.refetch()}>Try again</Button></AppShell>;

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
              <div className="flex items-end px-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                <h2 className="flex-1 -ml-2">{label}</h2>
                <span className="w-[76px] text-center">Trays</span>
                <span className="ml-2 w-[76px] text-center">Tubs</span>
              </div>
              <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
                {list.map((f) => {
                  const counter = (unit: Unit) => {
                    const n = counts[k(f.id, unit)] ?? 0;
                    return (
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          aria-label={`Remove one ${f.name} ${unit}`}
                          disabled={n === 0}
                          onClick={() => bump(f, -1, unit)}
                          className="flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground transition active:scale-90 disabled:opacity-30"
                        >
                          <Minus className="size-4" />
                        </button>
                        <span
                          className={`w-5 text-center font-display text-sm ${
                            n > 0 ? "text-primary" : "text-muted-foreground"
                          }`}
                        >
                          {n}
                        </span>
                        <button
                          type="button"
                          aria-label={`Add one ${f.name} ${unit}`}
                          onClick={() => bump(f, 1, unit)}
                          className={`flex size-7 items-center justify-center rounded-full transition active:scale-90 ${
                            unit === "tub" ? "bg-sky text-sky-foreground" : "bg-primary text-primary-foreground"
                          }`}
                        >
                          <Plus className="size-4" />
                        </button>
                      </div>
                    );
                  };
                  return (
                    <div key={f.id} className="flex items-center gap-2 px-3 py-1.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-sm">{f.name}</span>
                        <span className="block text-[11px] leading-tight text-muted-foreground">
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
              disabled={submit.isPending || !orders.isSuccess}
              onClick={() => submit.mutate()}
            >
              <Check className="mr-2 size-6" />
              {submit.isPending ? "Saving…" : `Start collecting · ${totalLabel}`}
            </Button>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
