import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatTraysTubs, unitLabel } from "@/lib/gelato";
import { collectItem, finishCollection, type CollectionOrder } from "@/lib/soft-freezer";
import { collectionProgress } from "@/lib/soft-freezer-progress";

export function SoftFreezerCollection({ order, onDone }: { order: CollectionOrder; onDone: () => void }) {
  const qc = useQueryClient();
  const progress = collectionProgress(order.items);
  const collect = useMutation({
    mutationFn: collectItem,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["soft-freezer-orders"] }),
        qc.invalidateQueries({ queryKey: ["flavours"] }),
        qc.invalidateQueries({ queryKey: ["freezer-stock"] }),
      ]);
      // Other stock and sales screens must also read the new movement.
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const finish = useMutation({
    mutationFn: finishCollection,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["soft-freezer-orders"] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Collect Soft Freezer Order" subtitle={progress.complete ? "Everything collected" : `${progress.collected} of ${progress.total} collected`}>
      <div className="space-y-4 pb-24">
        <div className="flex items-center justify-between gap-3 font-display">
          <h2 className="text-lg">{progress.complete ? "Order collected" : "Still to collect"}</h2>
          <span className="text-sm text-muted-foreground">{formatTraysTubs(progress.remainingTrays, progress.remainingTubs)}</span>
        </div>
        <div className="space-y-2">
          {order.items.map((item) => {
            const checked = item.collected_at !== null;
            const pending = collect.isPending && collect.variables === item.id;
            return (
              <label key={item.id} className={`flex min-h-16 items-center gap-4 rounded-lg border border-border px-4 py-3 ${checked ? "bg-muted" : "bg-card"}`}>
                <Checkbox
                  aria-label={`Collected ${item.flavour_name} ${item.unit}`}
                  checked={checked}
                  disabled={checked || collect.isPending}
                  onCheckedChange={(value) => { if (value === true) collect.mutate(item.id); }}
                  className="size-7"
                />
                <span className="min-w-0 flex-1">
                  <span className={`block font-display text-base ${checked ? "text-muted-foreground line-through" : "text-foreground"}`}>{item.flavour_name}</span>
                  <span className="block text-sm text-muted-foreground">{item.qty} {unitLabel(item.unit, item.qty)}</span>
                </span>
                {pending ? <LoaderCircle aria-label="Saving collection" className="size-5 animate-spin text-primary" /> : checked ? <Check className="size-5 text-primary" /> : null}
              </label>
            );
          })}
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur">
        <div className="mx-auto max-w-4xl p-4">
          {progress.complete ? (
            <Button className="h-16 w-full rounded-2xl text-lg" onClick={onDone}><Check className="mr-2 size-6" />Done</Button>
          ) : (
            <Button
              variant="outline"
              className="h-16 w-full rounded-2xl text-lg"
              disabled={finish.isPending || collect.isPending}
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