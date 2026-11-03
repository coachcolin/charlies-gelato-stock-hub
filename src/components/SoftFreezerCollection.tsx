import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, LoaderCircle, Minus, Plus, Search, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { formatTraysTubs, unitLabel, type Flavour, type Unit } from "@/lib/gelato";
import { collectItem, finishCollection, setCollectionItem, uncollectItem, type CollectionOrder } from "@/lib/soft-freezer";
import { collectionProgress } from "@/lib/soft-freezer-progress";

export function SoftFreezerCollection({ order, flavours, onDone }: { order: CollectionOrder; flavours: Flavour[]; onDone: () => void }) {
  const qc = useQueryClient();
  const progress = collectionProgress(order.items);
  const [q, setQ] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["soft-freezer-orders"] });
  const syncStock = async () => {
    await Promise.all([
      refresh(),
      qc.invalidateQueries({ queryKey: ["flavours"] }),
      qc.invalidateQueries({ queryKey: ["freezer-stock"] }),
    ]);
    // Other stock and sales screens must also read the new movement.
    void qc.invalidateQueries();
  };
  const collect = useMutation({
    mutationFn: collectItem,
    onSuccess: syncStock,
    onError: (e: Error) => toast.error(e.message),
  });
  const uncollect = useMutation({
    mutationFn: uncollectItem,
    onSuccess: syncStock,
    onError: (e: Error) => toast.error(e.message),
  });
  const edit = useMutation({
    mutationFn: setCollectionItem,
    onSuccess: () => refresh(),
    onError: (e: Error) => { toast.error(e.message); void refresh(); },
  });
  const finish = useMutation({
    mutationFn: finishCollection,
    onSuccess: async () => {
      await refresh();
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const busy = collect.isPending || edit.isPending;
  const setQty = (flavourId: string, unit: Unit, qty: number) => edit.mutate({ orderId: order.id, flavourId, unit, qty });

  const query = q.trim().toLowerCase();
  const matches = query
    ? flavours.filter((f) => f.active && f.name.toLowerCase().includes(query)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 8)
    : [];
  const has = (id: string, unit: Unit) => order.items.some((i) => i.flavour_id === id && i.unit === unit);

  return (
    <AppShell title="Collect Soft Freezer Order" subtitle={progress.complete ? "Everything collected" : `${progress.collected} of ${progress.total} collected`}>
      <div className="space-y-4 pb-24">
        <div className="flex items-center justify-between gap-3 font-display">
          <h2 className="text-lg">{progress.complete ? "Order collected" : "Tick each one as you bring it in"}</h2>
          <span className="text-sm text-muted-foreground">{formatTraysTubs(progress.remainingTrays, progress.remainingTubs)} left</span>
        </div>
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {order.items.map((item) => {
            const checked = item.collected_at !== null;
            const pending = collect.isPending && collect.variables === item.id;
            return (
              <div key={item.id} className={`flex min-h-16 items-center gap-3 px-3 py-2 ${checked ? "bg-muted" : ""}`}>
                <Checkbox
                  aria-label={`Collected ${item.flavour_name} ${item.unit}`}
                  checked={checked}
                  disabled={checked || busy}
                  onCheckedChange={(value) => { if (value === true) collect.mutate(item.id); }}
                  className="size-7"
                />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate font-display text-base ${checked ? "text-muted-foreground line-through" : "text-foreground"}`}>{item.flavour_name}</span>
                  <span className="block text-sm text-muted-foreground">{item.qty} {unitLabel(item.unit, item.qty)}</span>
                </span>
                {pending ? <LoaderCircle aria-label="Saving collection" className="size-5 animate-spin text-primary" /> : checked ? <Check className="size-5 text-primary" /> : (
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" aria-label={`Remove one ${item.flavour_name}`} disabled={busy}
                      onClick={() => setQty(item.flavour_id, item.unit, item.qty - 1)}
                      className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground transition active:scale-90 disabled:opacity-40">
                      <Minus className="size-4" />
                    </button>
                    <button type="button" aria-label={`Add one ${item.flavour_name}`} disabled={busy}
                      onClick={() => setQty(item.flavour_id, item.unit, item.qty + 1)}
                      className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground transition active:scale-90 disabled:opacity-40">
                      <Plus className="size-4" />
                    </button>
                    <button type="button" aria-label={`Remove ${item.flavour_name} from order`} disabled={busy}
                      onClick={() => setQty(item.flavour_id, item.unit, 0)}
                      className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted active:scale-90 disabled:opacity-40">
                      <X className="size-4" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {order.items.length === 0 ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing on this order — add a flavour below.</p> : null}
        </div>

        {!progress.complete ? (
          <section className="space-y-2">
            <h3 className="px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Add a flavour</h3>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search flavours…" inputMode="search" className="h-12 rounded-2xl pl-12 text-base" />
            </div>
            {matches.length > 0 ? (
              <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
                {matches.map((f) => (
                  <div key={f.id} className="flex items-center gap-2 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate font-display text-sm">{f.name}</span>
                    {(["tray", "tub"] as const).map((unit) => (
                      <Button key={unit} size="sm" variant={unit === "tub" ? "secondary" : "default"} disabled={busy || has(f.id, unit)}
                        onClick={() => { setQty(f.id, unit, 1); setQ(""); }}>
                        <Plus className="mr-1 size-4" />{unit === "tub" ? "Tub" : "Tray"}
                      </Button>
                    ))}
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur">
        <div className="mx-auto max-w-4xl p-4">
          {progress.complete ? (
            <Button className="h-16 w-full rounded-2xl text-lg" onClick={onDone}><Check className="mr-2 size-6" />Done</Button>
          ) : (
            <Button
              variant="outline"
              className="h-16 w-full rounded-2xl text-lg"
              disabled={finish.isPending || busy}
              onClick={() => {
                if (window.confirm("Finish this collection? Anything not ticked stays in stock.")) finish.mutate(order.id);
              }}
            >
              {finish.isPending ? "Finishing…" : "Finish collection"}
            </Button>
          )}
        </div>
      </div>
    </AppShell>
  );
}
