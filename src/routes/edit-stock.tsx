import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { applyMovements, fetchFlavours } from "@/lib/gelato";

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

type Variance = { name: string; before: number; after: number; diff: number };

function EditStock() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [variances, setVariances] = useState<Variance[] | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const flavours = useQuery({ queryKey: ["flavours"], queryFn: fetchFlavours });

  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (flavours.data ?? [])
      .filter((f) => f.active)
      .filter((f) => f.name.toLowerCase().includes(query));
  }, [flavours.data, q]);

  const changes = (flavours.data ?? [])
    .filter((f) => draft[f.id] !== undefined && draft[f.id] !== f.stock_qty)
    .map((f) => ({
      id: f.id,
      name: f.name,
      before: f.stock_qty,
      after: draft[f.id] as number,
      diff: (draft[f.id] as number) - f.stock_qty,
    }));

  const save = useMutation({
    mutationFn: () =>
      applyMovements(
        changes.map((c) => ({ flavour_id: c.id, qty: c.diff })),
        "adjustment",
        "Stock take correction",
      ),
    onSuccess: () => {
      setVariances(
        [...changes].sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).map((c) => ({
          name: c.name,
          before: c.before,
          after: c.after,
          diff: c.diff,
        })),
      );
      setDraft({});
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
            <div key={v.name} className="surface flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1 truncate font-display">{v.name}</span>
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

  return (
    <AppShell title="Edit Stock Levels" subtitle="Enter the counts from your stock take">
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search flavours…"
          className="h-13 rounded-2xl pl-12 text-base"
        />
      </div>

      <div className="space-y-2 pb-24">
        {list.map((f, i) => {
          const value = draft[f.id] ?? f.stock_qty;
          const changed = value !== f.stock_qty;
          return (
            <div key={f.id} className="surface flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-base">{f.name}</span>
                <span className="text-xs text-muted-foreground">
                  system says {f.stock_qty}
                  {changed
                    ? ` · variance ${value - f.stock_qty > 0 ? "+" : ""}${value - f.stock_qty}`
                    : ""}
                </span>
              </span>
              <Input
                ref={(el) => {
                  inputRefs.current[i] = el;
                }}
                type="number"
                inputMode="numeric"
                value={value}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    [f.id]: Math.max(0, Math.round(Number(e.target.value) || 0)),
                  }))
                }
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const next = inputRefs.current[i + 1];
                    if (next) next.focus();
                  }
                }}
                className={`h-12 w-24 text-center font-display text-lg ${
                  changed ? "border-primary" : ""
                }`}
                aria-label={`${f.name} count`}
              />
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
