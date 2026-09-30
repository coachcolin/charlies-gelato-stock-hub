import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useVoiceStockTake } from "@/components/VoiceStockTake";
import { applyMovements, fetchFlavours, type Unit } from "@/lib/gelato";

export const Route = createFileRoute("/edit-stock")({
  head: () => ({
    meta: [
      { title: "Edit Stock Levels — Charlie's Gelato" },
      {
        name: "description",
        content:
          "Correct tray counts after a stock take and see a variance report of what changed at Charlie's Gelato.",
      },
      { property: "og:title", content: "Edit Stock Levels — Charlie's Gelato" },
      {
        property: "og:description",
        content: "Stock take corrections with an automatic variance report.",
      },
    ],
  }),
  component: EditStock,
});

type Variance = { name: string; unit: Unit; before: number; after: number; diff: number };

function EditStock() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [tubDraft, setTubDraft] = useState<Record<string, number>>({});
  const [variances, setVariances] = useState<Variance[] | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const flavours = useQuery({ queryKey: ["flavours"], queryFn: fetchFlavours });

  const voice = useVoiceStockTake(flavours.data ?? [], (counts) => {
    setDraft((d) => ({ ...d, ...counts.tray }));
    setTubDraft((d) => ({ ...d, ...counts.tub }));
  });

  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (flavours.data ?? [])
      .filter((f) => f.active)
      .filter((f) => f.name.toLowerCase().includes(query));
  }, [flavours.data, q]);

  const changes = (flavours.data ?? []).flatMap((f) => {
    const out: (Variance & { id: string })[] = [];
    const t = draft[f.id];
    if (t !== undefined && t !== f.stock_qty)
      out.push({ id: f.id, name: f.name, unit: "tray", before: f.stock_qty, after: t, diff: t - f.stock_qty });
    const tb = tubDraft[f.id];
    const tubNow = f.tub_qty ?? 0;
    if (tb !== undefined && tb !== tubNow)
      out.push({ id: f.id, name: f.name, unit: "tub", before: tubNow, after: tb, diff: tb - tubNow });
    return out;
  });

  const save = useMutation({
    mutationFn: () =>
      applyMovements(
        changes.map((c) => ({ flavour_id: c.id, qty: c.diff, unit: c.unit })),
        "adjustment",
        "Stock take correction",
      ),
    onSuccess: () => {
      setVariances(
        [...changes]
          .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
          .map(({ id: _id, ...v }) => v),
      );
      setDraft({});
      setTubDraft({});
      qc.invalidateQueries();
      toast.success("Stock levels updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (variances) {
    return (
      <AppShell title="Variance Report" subtitle="What changed in this stock take">
        <div className="space-y-2">
          {variances.map((v) => (
            <div key={`${v.name}-${v.unit}`} className="surface flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1 truncate font-display">{v.name}</span>
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                {v.unit === "tub" ? "Tubs" : "Trays"}
              </span>
              <span className="text-sm text-muted-foreground">
                {v.before} → {v.after}
              </span>
              <span
                className={`rounded-full px-3 py-1 font-display ${
                  v.diff < 0 ? "bg-primary text-primary-foreground" : "bg-sky text-sky-foreground"
                }`}
              >
                {v.diff > 0 ? "+" : ""}
                {v.diff}
              </span>
            </div>
          ))}
          {variances.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No variances — the system matched the shelf.
            </p>
          ) : null}
        </div>
        <Button className="mt-6 h-14 w-full rounded-2xl" onClick={() => setVariances(null)}>
          Done
        </Button>
      </AppShell>
    );
  }

  const focusNext = (idx: number) => inputRefs.current[idx + 1]?.focus();

  return (
    <AppShell title="Edit Stock Levels" subtitle="Enter the tray and tub counts from your stock take">
      {voice.panel}

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search flavours…"
          className="h-13 rounded-2xl pl-12 text-base"
        />
      </div>

      <div className="mb-2 flex justify-end gap-2 pr-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        <span className="w-20 text-center">Trays</span>
        <span className="w-20 text-center">Tubs</span>
      </div>

      <div className="space-y-2 pb-24">
        {list.map((f, i) => {
          const tray = draft[f.id] ?? f.stock_qty;
          const tub = tubDraft[f.id] ?? f.tub_qty ?? 0;
          const trayChanged = tray !== f.stock_qty;
          const tubChanged = tub !== (f.tub_qty ?? 0);
          const bits: string[] = [];
          if (trayChanged) bits.push(`trays ${tray - f.stock_qty > 0 ? "+" : ""}${tray - f.stock_qty}`);
          if (tubChanged)
            bits.push(`tubs ${tub - (f.tub_qty ?? 0) > 0 ? "+" : ""}${tub - (f.tub_qty ?? 0)}`);
          const box = (
            value: number,
            changed: boolean,
            idx: number,
            set: typeof setDraft,
            label: string,
          ) => (
            <Input
              ref={(el) => {
                inputRefs.current[idx] = el;
              }}
              type="number"
              inputMode="numeric"
              value={value}
              onChange={(e) =>
                set((d) => ({ ...d, [f.id]: Math.max(0, Math.round(Number(e.target.value) || 0)) }))
              }
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  focusNext(idx);
                }
              }}
              className={`h-12 w-20 text-center font-display text-lg ${changed ? "border-primary" : ""}`}
              aria-label={`${f.name} ${label}`}
            />
          );
          return (
            <div key={f.id} className="surface flex items-center gap-2 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-base">{f.name}</span>
                <span className="text-xs text-muted-foreground">
                  system says {f.stock_qty} trays · {f.tub_qty ?? 0} tubs
                  {bits.length ? ` · variance ${bits.join(", ")}` : ""}
                </span>
              </span>
              {box(tray, trayChanged, i * 2, setDraft, "trays")}
              {box(tub, tubChanged, i * 2 + 1, setTubDraft, "tubs")}
            </div>
          );
        })}
      </div>

      {changes.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 p-4 backdrop-blur">
          <div className="mx-auto max-w-4xl">
            <Button
              className="h-16 w-full rounded-2xl text-lg"
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              Save {changes.length} change{changes.length === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
