import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Plus, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  BATCH_SIZE,
  DEFAULT_DAY_CAPACITIES,
  applyMovements,
  buildSuggestions,
  fetchDayCapacities,
  db,
  fetchFlavours,
  fetchMovements,
  fetchOrders,
  fetchReports,
  fetchSeason,
  type Suggestion,
} from "@/lib/gelato";

export const Route = createFileRoute("/production")({
  head: () => ({
    meta: [
      { title: "Production Report — Charlie's Gelato" },
      {
        name: "description",
        content:
          "Weekly gelato production plan built from stock levels, recent sales trends, wholesale commitments and seasonal targets.",
      },
      { property: "og:title", content: "Production Report — Charlie's Gelato" },
      {
        property: "og:description",
        content: "Know exactly which flavours to churn next, and tick them off as you make them.",
      },
    ],
  }),
  component: ProductionPage,
});

type Draft = {
  flavour_id: string;
  flavour_name: string;
  qty: number;
  reason: string;
  note: string;
};

function ProductionPage() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft[] | null>(null);

  const flavours = useQuery({ queryKey: ["flavours"], queryFn: fetchFlavours });
  const movements = useQuery({ queryKey: ["movements"], queryFn: () => fetchMovements(120) });
  const orders = useQuery({ queryKey: ["orders"], queryFn: fetchOrders });
  const season = useQuery({ queryKey: ["season"], queryFn: fetchSeason });
  const capacities = useQuery({ queryKey: ["dayCapacities"], queryFn: fetchDayCapacities });
  const reports = useQuery({ queryKey: ["reports"], queryFn: fetchReports });

  const activeReport = (reports.data ?? []).find((r) => r.status === "active");

  const suggestions: Suggestion[] = useMemo(() => {
    if (!flavours.data || !movements.data || !orders.data || !season.data) return [];
    return buildSuggestions(
      flavours.data,
      movements.data,
      orders.data.filter((o) => o.status === "active"),
      season.data,
      (capacities.data ?? DEFAULT_DAY_CAPACITIES)[season.data],
    );
  }, [flavours.data, movements.data, orders.data, season.data, capacities.data]);

  const createReport = useMutation({
    mutationFn: async (items: Draft[]) => {
      const res = await db
        .from("production_reports")
        .insert({ season: season.data ?? "mid" })
        .select("id")
        .single();
      if (res.error) throw new Error(res.error.message);
      const id = res.data.id as string;
      const itemsRes = await db.from("production_report_items").insert(
        items.map((i, idx) => ({
          report_id: id,
          flavour_id: i.flavour_id,
          flavour_name: i.flavour_name,
          suggested_qty: i.qty,
          reason: i.reason,
          note: i.note.trim() || null,

          position: idx,
        })),
      );
      if (itemsRes.error) throw new Error(itemsRes.error.message);
    },
    onSuccess: () => {
      setDraft(null);
      qc.invalidateQueries();
      toast.success("Production report started");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---- active report view ----
  if (activeReport) {
    return (
      <ActiveReport
        report={activeReport}
        onDone={() => qc.invalidateQueries()}
        season={season.data ?? "mid"}
      />
    );
  }

  // ---- draft / editing view ----
  if (draft) {
    const remaining = (flavours.data ?? []).filter(
      (f) => f.active && !draft.some((d) => d.flavour_id === f.id),
    );
    return (
      <AppShell title="Review the plan" subtitle="Adjust quantities, remove or add flavours">
        <div className="space-y-2 pb-28">
          {draft.map((d) => (
            <div key={d.flavour_id} className="surface space-y-3 p-4">
              <div className="flex items-start gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-base">{d.flavour_name}</span>
                  <span className="text-xs text-muted-foreground">{d.reason}</span>
                </span>
                <Input
                  type="number"
                  inputMode="numeric"
                  step={BATCH_SIZE}
                  min={0}
                  value={d.qty}
                  onChange={(e) =>
                    setDraft((prev) =>
                      (prev ?? []).map((x) =>
                        x.flavour_id === d.flavour_id
                          ? { ...x, qty: Math.max(0, Number(e.target.value) || 0) }
                          : x,
                      ),
                    )
                  }
                  onBlur={(e) =>
                    setDraft((prev) =>
                      (prev ?? []).map((x) =>
                        x.flavour_id === d.flavour_id
                          ? {
                              ...x,
                              qty:
                                Math.ceil(
                                  (Math.max(0, Number(e.target.value) || 0)) / BATCH_SIZE,
                                ) * BATCH_SIZE,
                            }
                          : x,
                      ),
                    )
                  }
                  className="h-12 w-20 shrink-0 text-center font-display text-lg"
                  aria-label={`${d.flavour_name} trays`}
                />

                <button
                  type="button"
                  aria-label={`Remove ${d.flavour_name}`}
                  onClick={() =>
                    setDraft((prev) => (prev ?? []).filter((x) => x.flavour_id !== d.flavour_id))
                  }
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-accent"
                >
                  <X className="size-4" />
                </button>
              </div>

              <Textarea
                value={d.note}
                onChange={(e) =>
                  setDraft((prev) =>
                    (prev ?? []).map((x) =>
                      x.flavour_id === d.flavour_id ? { ...x, note: e.target.value } : x,
                    ),
                  )
                }
                placeholder="Notes for the ice-cream makers…"
                rows={2}
                className="min-h-11 resize-y rounded-xl text-sm"
                aria-label={`${d.flavour_name} production notes`}
              />
            </div>

          ))}

          <AddFlavourSearch
            remaining={remaining}
            onAdd={(f) =>
              setDraft((prev) => [
                ...(prev ?? []),
                {
                  flavour_id: f.id,
                  flavour_name: f.name,
                  qty: BATCH_SIZE,
                  reason: "Added manually",
                  note: "",
                },
              ])
            }
          />
        </div>

        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 p-4 backdrop-blur">
          <div className="mx-auto flex max-w-4xl gap-2">
            <Button variant="outline" className="h-16 rounded-2xl" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              className="h-16 flex-1 rounded-2xl text-lg"
              disabled={draft.filter((d) => d.qty > 0).length === 0 || createReport.isPending}
              onClick={() => createReport.mutate(draft.filter((d) => d.qty > 0))}
            >
              Start production report
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  // ---- suggestion view ----
  const pastReports = (reports.data ?? []).filter((r) => r.status === "completed");

  return (
    <AppShell title="Production Report" subtitle="What to make next">
      <div className="surface mb-4 flex items-start gap-3 p-4">
        <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" />
        <p className="text-sm">
          Based on recent sales, wholesale orders still to go out and your{" "}
          <strong>{season.data ?? "mid"} season</strong> minimums, this is what we think you'll
          need — {suggestions.reduce((t, s) => t + s.qty, 0)} of the{" "}
          {(capacities.data ?? DEFAULT_DAY_CAPACITIES)[season.data ?? "mid"]} trays in a{" "}
          {season.data ?? "mid"} season production day, in batches of {BATCH_SIZE}.
        </p>
      </div>


      <div className="space-y-2">
        {suggestions.map((s) => (
          <div key={s.flavour_id} className="surface flex items-center gap-3 p-4">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display text-base">{s.flavour_name}</span>
              <span className="text-xs text-muted-foreground">{s.reason}</span>
            </span>
            <span className="rounded-full bg-primary px-3 py-1.5 font-display text-lg text-primary-foreground">
              {s.qty}
            </span>
          </div>
        ))}
        {suggestions.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Everything is at or above its minimum — nothing urgent to make.
          </p>
        ) : null}
      </div>

      <Button
        className="mt-6 h-16 w-full rounded-2xl text-lg"
        onClick={() =>
          setDraft(
            suggestions.map((s) => ({
              flavour_id: s.flavour_id,
              flavour_name: s.flavour_name,
              qty: s.qty,
              reason: s.reason,
              note: "",

            })),
          )
        }
      >
        Review &amp; create report
      </Button>

      {pastReports.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Past reports
          </h2>
          <div className="space-y-2">
            {pastReports.slice(0, 10).map((r) => (
              <div key={r.id} className="surface p-4 text-sm">
                <p className="font-display text-base">
                  {new Date(r.created_at).toLocaleDateString()} · {r.season} season
                </p>
                <p className="text-muted-foreground">
                  {r.items.reduce((s, i) => s + (i.produced_qty ?? 0), 0)} trays made across{" "}
                  {r.items.length} flavours
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}

function AddFlavourSearch({
  remaining,
  onAdd,
}: {
  remaining: { id: string; name: string; category?: string | null }[];
  onAdd: (f: { id: string; name: string; category?: string | null }) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const normalized = query.trim().toLowerCase();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);
  const filtered = normalized
    ? remaining
        .filter((f) => f.name.toLowerCase().includes(normalized))
        .slice(0, 8)
    : remaining.slice(0, 8);

  return (
    <div className="surface relative p-3">
      <div className="flex items-center gap-2">
        <Plus className="size-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Type to find a flavour to add…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          className="h-11 rounded-xl border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
        />
      </div>
      {open && filtered.length > 0 ? (
        <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-60 overflow-auto rounded-2xl border border-border bg-card p-2 shadow-lg">
          {filtered.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                onAdd(f);
                setQuery("");
                setOpen(false);
              }}
              className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left hover:bg-muted"
            >
              <span className="font-display text-base">{f.name}</span>
              {f.category ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">
                  {f.category}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
      {open && normalized && filtered.length === 0 ? (
        <div className="absolute inset-x-0 top-full z-30 mt-1 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-lg">
          No flavours match “{query}”
        </div>
      ) : null}
    </div>
  );
}

function ActiveReport({
  report,
  season,
  onDone,
}: {
  report: Awaited<ReturnType<typeof fetchReports>>[number];
  season: string;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const saveNote = useMutation({
    mutationFn: async ({ itemId, note }: { itemId: string; note: string }) => {
      const res = await db
        .from("production_report_items")
        .update({ note: note.trim() || null })
        .eq("id", itemId);
      if (res.error) throw new Error(res.error.message);
    },
    onError: (e: Error) => toast.error(e.message),
  });



  const tick = useMutation({
    mutationFn: async ({
      itemId,
      flavourId,
      name,
      qty,
    }: {
      itemId: string;
      flavourId: string | null;
      name: string;
      qty: number;
    }) => {
      if (flavourId) {
        await applyMovements([{ flavour_id: flavourId, qty }], "production", `Made ${name}`);
      }
      const res = await db
        .from("production_report_items")
        .update({ done: true, produced_qty: qty })
        .eq("id", itemId);
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Added to stock");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const finish = useMutation({
    mutationFn: async () => {
      const res = await db
        .from("production_reports")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", report.id);
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => {
      onDone();
      toast.success("Report closed");
    },
  });

  const outstanding = report.items.filter((i) => !i.done);

  return (
    <AppShell
      title="Active Production Report"
      subtitle={`${outstanding.length} of ${report.items.length} left · ${season} season`}
    >
      <div className="space-y-2">
        {report.items.map((i) => {
          const value = qtys[i.id] ?? i.produced_qty ?? i.suggested_qty;
          return (
            <div key={i.id} className={`surface space-y-3 p-4 ${i.done ? "opacity-60" : ""}`}>
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-base">{i.flavour_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {i.done ? `Made ${i.produced_qty} trays` : `Suggested ${i.suggested_qty} trays`}
                  </span>
                </span>
                {!i.done ? (
                  <>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={value}
                      onChange={(e) =>
                        setQtys((q) => ({
                          ...q,
                          [i.id]: Math.max(0, Number(e.target.value) || 0),
                        }))
                      }
                      className="h-12 w-20 text-center font-display text-lg"
                      aria-label={`${i.flavour_name} trays made`}
                    />
                    <Button
                      size="icon"
                      className="size-12 shrink-0 rounded-full"
                      aria-label={`Mark ${i.flavour_name} as made`}
                      onClick={() =>
                        tick.mutate({
                          itemId: i.id,
                          flavourId: i.flavour_id,
                          name: i.flavour_name,
                          qty: value,
                        })
                      }
                    >
                      <Check className="size-5" />
                    </Button>
                  </>
                ) : (
                  <span className="flex size-12 items-center justify-center rounded-full bg-sky text-sky-foreground">
                    <Check className="size-5" />
                  </span>
                )}
              </div>

              {i.done ? (
                i.note ? (
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{i.note}</p>
                ) : null
              ) : (
                <Textarea
                  value={notes[i.id] ?? i.note ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [i.id]: e.target.value }))}
                  onBlur={(e) => saveNote.mutate({ itemId: i.id, note: e.target.value })}
                  placeholder="Notes for the ice-cream makers…"
                  rows={2}
                  className="min-h-11 resize-y rounded-xl text-sm"
                  aria-label={`${i.flavour_name} production notes`}
                />
              )}
            </div>

          );
        })}
      </div>

      <Button
        variant={outstanding.length === 0 ? "default" : "outline"}
        className="mt-6 h-16 w-full rounded-2xl text-lg"
        onClick={() => finish.mutate()}
      >
        Close report
      </Button>
    </AppShell>
  );
}
