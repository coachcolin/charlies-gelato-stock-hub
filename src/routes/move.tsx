import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ArrowRight, Check, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { FlavourList } from "@/components/FlavourList";
import { FreezerButtons, ShortfallWarning, useFreezerData, useShortfalls } from "@/components/FreezerPicker";
import { QtyDialog } from "@/components/QtyDialog";
import { Button } from "@/components/ui/button";
import { fetchFlavours, formatTraysTubs, moveStock, type Flavour, type Unit, unitLabel } from "@/lib/gelato";

export const Route = createFileRoute("/move")({
  head: () => ({
    meta: [
      { title: "Move Stock Between Freezers — Charlie's Gelato" },
      { name: "description", content: "Log trays and tubs moved from one freezer to another at Charlie's Gelato." },
      { property: "og:title", content: "Move Stock Between Freezers — Charlie's Gelato" },
      { property: "og:description", content: "Keep each freezer's stock accurate when stock is shifted." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MovePage,
});

type Line = { id: string; name: string; qty: number; unit: Unit };

function MovePage() {
  const qc = useQueryClient();
  const router = useRouter();
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [picked, setPicked] = useState<Flavour | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const flavours = useQuery({ queryKey: ["flavours"], queryFn: fetchFlavours });
  const { freezers, map } = useFreezerData();
  const outLines = lines.map((l) => ({ flavour_id: l.id, name: l.name, qty: l.qty, unit: l.unit }));
  const short = useShortfalls(from, outLines);
  const name = (id: string | null) => freezers.find((f) => f.id === id)?.name ?? "";

  const trays = lines.filter((l) => l.unit === "tray").reduce((s, l) => s + l.qty, 0);
  const tubs = lines.filter((l) => l.unit === "tub").reduce((s, l) => s + l.qty, 0);

  const submit = useMutation({
    mutationFn: () => moveStock(from as string, to as string, lines.map((l) => ({ flavour_id: l.id, qty: l.qty, unit: l.unit }))),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success(`${formatTraysTubs(trays, tubs)} moved to ${name(to)}`);
      router.navigate({ to: "/" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const here = (f: Flavour) => {
    const r = from ? map.get(`${f.id}:${from}`) : undefined;
    return { tray: r?.stock_qty ?? 0, tub: r?.tub_qty ?? 0 };
  };

  return (
    <AppShell title="Move Stock" subtitle="Shift stock from one freezer to another">
      <div className="mb-4 space-y-3">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">From</p>
          <FreezerButtons value={from} onChange={(id) => { setFrom(id); if (id === to) setTo(null); }} />
        </div>
        <div className="space-y-2">
          <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <ArrowRight className="size-3.5" /> To
          </p>
          <FreezerButtons value={to} onChange={setTo} exclude={from} />
        </div>
      </div>

      {from && to ? (
        <FlavourList
          flavours={(flavours.data ?? []).filter((f) => f.active)}
          popular={[]}
          onPick={setPicked}
          renderMeta={(f) => (
            <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
              {here(f).tray} trays · {here(f).tub} tubs here
            </span>
          )}
        />
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">Pick both freezers to start.</p>
      )}

      <QtyDialog
        open={Boolean(picked)}
        onOpenChange={(o) => !o && setPicked(null)}
        title={picked?.name ?? ""}
        description={picked ? `${here(picked).tray} trays · ${here(picked).tub} tubs in ${name(from)} · how many are you moving?` : undefined}
        confirmLabel="Add to list"
        showUnit
        onConfirm={(qty: number, unit: Unit) => {
          if (!picked) return;
          setLines((prev) => {
            const found = prev.find((l) => l.id === picked.id && l.unit === unit);
            if (found) return prev.map((l) => (l === found ? { ...l, qty: l.qty + qty } : l));
            return [...prev, { id: picked.id, name: picked.name, qty, unit }];
          });
          setPicked(null);
        }}
      />

      {lines.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur">
          <div className="mx-auto max-w-4xl space-y-3 p-4">
            <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
              {lines.map((l) => (
                <button
                  key={`${l.id}-${l.unit}`}
                  type="button"
                  onClick={() => setLines((p) => p.filter((x) => x !== l))}
                  className="flex items-center gap-2 rounded-full bg-cream px-3 py-2 text-sm font-semibold text-cream-foreground"
                >
                  {l.name} × {l.qty} {unitLabel(l.unit, l.qty)}
                  <Trash2 className="size-4 opacity-60" />
                </button>
              ))}
            </div>
            <ShortfallWarning freezerName={name(from)} items={short} />
            <Button className="h-16 w-full rounded-2xl text-lg" disabled={submit.isPending || !from || !to} onClick={() => submit.mutate()}>
              <Check className="mr-2 size-6" />
              Move {formatTraysTubs(trays, tubs)} to {name(to)}
            </Button>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
