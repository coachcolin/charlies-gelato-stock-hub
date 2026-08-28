import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Check, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { FlavourList } from "@/components/FlavourList";
import { QtyDialog } from "@/components/QtyDialog";
import { Button } from "@/components/ui/button";
import {
  applyMovements,
  fetchFlavours,
  fetchMovements,
  popularIds,
  type Flavour,
  type MovementKind,
} from "@/lib/gelato";

type Line = { id: string; name: string; qty: number };

export function MovementScreen({
  title,
  subtitle,
  kind,
  sign,
  confirmLabel,
}: {
  title: string;
  subtitle: string;
  kind: MovementKind;
  sign: 1 | -1;
  confirmLabel: string;
}) {
  const qc = useQueryClient();
  const router = useRouter();
  const [picked, setPicked] = useState<Flavour | null>(null);
  const [lines, setLines] = useState<Line[]>([]);

  const flavours = useQuery({ queryKey: ["flavours"], queryFn: fetchFlavours });
  const movements = useQuery({ queryKey: ["movements"], queryFn: () => fetchMovements(60) });

  const active = (flavours.data ?? []).filter((f) => f.active);
  const popular = popularIds(flavours.data ?? [], movements.data ?? []);

  const submit = useMutation({
    mutationFn: () =>
      applyMovements(
        lines.map((l) => ({ flavour_id: l.id, qty: sign * l.qty })),
        kind,
      ),
    onSuccess: () => {
      const total = lines.reduce((s, l) => s + l.qty, 0);
      qc.invalidateQueries();
      toast.success(`${total} tray${total === 1 ? "" : "s"} ${sign > 0 ? "added" : "removed"}`);
      setLines([]);
      router.navigate({ to: "/" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addLine = (qty: number) => {
    if (!picked) return;
    setLines((prev) => {
      const found = prev.find((l) => l.id === picked.id);
      if (found)
        return prev.map((l) => (l.id === picked.id ? { ...l, qty: l.qty + qty } : l));
      return [...prev, { id: picked.id, name: picked.name, qty }];
    });
    setPicked(null);
  };

  const total = lines.reduce((s, l) => s + l.qty, 0);

  return (
    <AppShell title={title} subtitle={subtitle}>
      <FlavourList
        flavours={active}
        popular={popular}
        onPick={setPicked}
        renderMeta={(f) => (
          <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
            {f.stock_qty} in stock
          </span>
        )}
      />

      <QtyDialog
        open={Boolean(picked)}
        onOpenChange={(o) => !o && setPicked(null)}
        title={picked?.name ?? ""}
        description={
          picked
            ? `${picked.stock_qty} trays in stock · how many trays are you ${sign > 0 ? "adding" : "taking"}?`
            : undefined
        }
        confirmLabel={sign > 0 ? "Add to list" : "Add to list"}
        onConfirm={addLine}
      />

      {lines.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur">
          <div className="mx-auto max-w-4xl space-y-3 p-4">
            <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
              {lines.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLines((p) => p.filter((x) => x.id !== l.id))}
                  className="flex items-center gap-2 rounded-full bg-cream px-3 py-2 text-sm font-semibold text-cream-foreground"
                >
                  <span>
                    {l.name} × {l.qty}
                  </span>
                  <Trash2 className="size-4 opacity-60" />
                </button>
              ))}
            </div>
            <Button
              className="h-16 w-full rounded-2xl text-lg"
              disabled={submit.isPending}
              onClick={() => submit.mutate()}
            >
              <Check className="mr-2 size-6" />
              {confirmLabel} · {total} tray{total === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
