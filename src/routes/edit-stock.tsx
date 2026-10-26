import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Check, EyeOff, Search, Snowflake } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useVoiceStockTake } from "@/components/VoiceStockTake";
import {
  fetchCountedFreezers,
  fetchFlavours,
  fetchFreezerStock,
  fetchFreezers,
  freezerStockMap,
  freezerStockTake,
  type Unit,
} from "@/lib/gelato";

export const Route = createFileRoute("/edit-stock")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Edit Stock Levels — Charlie's Gelato" },
      {
        name: "description",
        content:
          "Stock take each freezer at Charlie's Gelato and see a variance report of what changed.",
      },
      { property: "og:title", content: "Edit Stock Levels — Charlie's Gelato" },
      {
        property: "og:description",
        content: "Per-freezer stock takes with an automatic variance report.",
      },
    ],
  }),
  component: EditStock,
});

type Variance = { name: string; unit: Unit; before: number; after: number; diff: number; unseen?: boolean };
type Unseen = { id: string; name: string; unit: Unit; have: number };

const key = (id: string, unit: Unit) => `${id}|${unit}`;

function EditStock() {
  const qc = useQueryClient();
  const [freezerId, setFreezerId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [tubDraft, setTubDraft] = useState<Record<string, number>>({});
  const [checking, setChecking] = useState(false);
  /** For flavours on record but not seen: true = really gone (set to 0). */
  const [goneChoice, setGoneChoice] = useState<Record<string, boolean>>({});
  const [variances, setVariances] = useState<Variance[] | null>(null);
  const [baselineMsg, setBaselineMsg] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const flavours = useQuery({ queryKey: ["flavours"], queryFn: fetchFlavours });
  const freezers = useQuery({ queryKey: ["freezers"], queryFn: fetchFreezers });
  const fstock = useQuery({ queryKey: ["freezer-stock"], queryFn: fetchFreezerStock });
  const counted = useQuery({ queryKey: ["freezers-counted"], queryFn: fetchCountedFreezers });

  const map = useMemo(() => freezerStockMap(fstock.data ?? []), [fstock.data]);
  const rec = (id: string) => {
    const r = freezerId ? map.get(`${id}:${freezerId}`) : undefined;
    return { tray: r?.stock_qty ?? 0, tub: r?.tub_qty ?? 0 };
  };
  const freezer = (freezers.data ?? []).find((f) => f.id === freezerId);
  const countedIds = counted.data ?? [];
  const isStarting = Boolean(freezerId) && !countedIds.includes(freezerId as string);

  const voice = useVoiceStockTake(
    flavours.data ?? [],
    (counts) => {
      setDraft((d) => ({ ...d, ...counts.tray }));
      setTubDraft((d) => ({ ...d, ...counts.tub }));
    },
    { persistKey: `stock-take-${freezerId ?? "none"}` },
  );

  // flavours to show: active ones, plus inactive ones this freezer still has on record
  const relevant = useMemo(
    () =>
      (flavours.data ?? []).filter((f) => {
        const r = rec(f.id);
        return f.active || r.tray > 0 || r.tub > 0;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flavours.data, map, freezerId],
  );

  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return relevant.filter((f) => f.name.toLowerCase().includes(query));
  }, [relevant, q]);

  const unseen: Unseen[] = relevant.flatMap((f) => {
    const r = rec(f.id);
    const out: Unseen[] = [];
    if (draft[f.id] === undefined && r.tray > 0) out.push({ id: f.id, name: f.name, unit: "tray", have: r.tray });
    if (tubDraft[f.id] === undefined && r.tub > 0) out.push({ id: f.id, name: f.name, unit: "tub", have: r.tub });
    return out;
  });

  const isGone = (u: Unseen) => goneChoice[key(u.id, u.unit)] ?? true;

  const finalCounts = () =>
    relevant.map((f) => {
      const r = rec(f.id);
      const tray = draft[f.id] ?? (isGone({ id: f.id, name: f.name, unit: "tray", have: r.tray }) ? 0 : r.tray);
      const tub = tubDraft[f.id] ?? (isGone({ id: f.id, name: f.name, unit: "tub", have: r.tub }) ? 0 : r.tub);
      return { flavour_id: f.id, name: f.name, tray, tub, before: r };
    });

  const changes = (): Variance[] =>
    finalCounts().flatMap((c) => {
      const out: Variance[] = [];
      if (c.tray !== c.before.tray)
        out.push({ name: c.name, unit: "tray", before: c.before.tray, after: c.tray, diff: c.tray - c.before.tray, unseen: draft[c.flavour_id] === undefined });
      if (c.tub !== c.before.tub)
        out.push({ name: c.name, unit: "tub", before: c.before.tub, after: c.tub, diff: c.tub - c.before.tub, unseen: tubDraft[c.flavour_id] === undefined });
      return out;
    });

  const reset = () => {
    setDraft({});
    setTubDraft({});
    setGoneChoice({});
    setChecking(false);
  };

  const save = useMutation({
    mutationFn: () =>
      freezerStockTake(
        freezerId as string,
        finalCounts().map(({ flavour_id, tray, tub }) => ({ flavour_id, tray, tub })),
      ),
    onSuccess: (res) => {
      setVariances([...changes()].sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)));
      setBaselineMsg(
        res.just_completed
          ? "All 3 freezers now have starting counts. Overall stock totals now come from the freezers."
          : !res.baseline_complete
            ? "Starting count saved. Overall stock totals switch over once all 3 freezers are counted."
            : null,
      );
      reset();
      qc.invalidateQueries();
      toast.success(`${freezer?.name ?? "Freezer"} stock take saved`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /* ---------- variance report ---------- */
  if (variances) {
    return (
      <AppShell title="Variance Report" subtitle={`${freezer?.name ?? ""} · what changed`}>
        {baselineMsg ? (
          <p className="mb-3 rounded-xl bg-sky/30 p-3 text-sm">{baselineMsg}</p>
        ) : null}
        <div className="space-y-2">
          {variances.map((v) => (
            <div key={`${v.name}-${v.unit}`} className="surface flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display">{v.name}</span>
                {v.unseen ? (
                  <span className="text-xs text-muted-foreground">Not seen in stock take</span>
                ) : null}
              </span>
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
              No variances. The system matched the shelf.
            </p>
          ) : null}
        </div>
        <Button
          className="mt-6 h-14 w-full rounded-2xl"
          onClick={() => {
            setVariances(null);
            setFreezerId(null);
          }}
        >
          Done
        </Button>
      </AppShell>
    );
  }

  /* ---------- step 1: pick freezer ---------- */
  if (!freezerId) {
    const total = (freezers.data ?? []).length;
    const done = (freezers.data ?? []).filter((f) => countedIds.includes(f.id)).length;
    return (
      <AppShell title="Edit Stock Levels" subtitle="Which freezer are you stock taking?">
        {done < total ? (
          <p className="mb-4 rounded-xl bg-accent/30 p-3 text-sm text-accent-foreground">
            Starting counts: {done} of {total} freezers done. Count every freezer once to set up
            per-freezer stock. Overall totals switch over when all {total} are done.
          </p>
        ) : null}
        <div className="grid gap-3">
          {(freezers.data ?? []).map((f) => {
            const items = (fstock.data ?? []).filter((r) => r.freezer_id === f.id);
            const trays = items.reduce((s, r) => s + r.stock_qty, 0);
            const tubs = items.reduce((s, r) => s + r.tub_qty, 0);
            const last = items
              .map((r) => r.counted_at)
              .filter(Boolean)
              .sort()
              .at(-1);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFreezerId(f.id)}
                className="surface flex items-center gap-4 px-5 py-5 text-left active:scale-[0.99]"
              >
                <span className="flex size-12 items-center justify-center rounded-full bg-sky text-sky-foreground">
                  <Snowflake className="size-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-lg">{f.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {countedIds.includes(f.id)
                      ? `${trays} trays · ${tubs} tubs on record${
                          last ? ` · last counted ${new Date(last).toLocaleDateString()}` : ""
                        }`
                      : "Not counted yet"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </AppShell>
    );
  }

  /* ---------- step 3: end-of-count checks ---------- */
  if (checking) {
    const ch = changes();
    return (
      <AppShell title={`Check · ${freezer?.name ?? ""}`} subtitle="Before saving the stock take">
        <div className="space-y-5 pb-28">
          {unseen.length > 0 ? (
            <section className="space-y-2">
              <h2 className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                <EyeOff className="size-4" /> On record but not seen
              </h2>
              <p className="px-1 text-sm text-muted-foreground">
                These weren't counted. They'll be removed from this freezer unless you say they're
                still there.
              </p>
              {unseen.map((u) => {
                const gone = isGone(u);
                return (
                  <div key={key(u.id, u.unit)} className="surface flex items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display">{u.name}</span>
                      <span className="text-xs text-muted-foreground">
                        System says {u.have} {u.unit === "tub" ? "tubs" : "trays"}, none seen
                      </span>
                    </span>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => setGoneChoice((g) => ({ ...g, [key(u.id, u.unit)]: true }))}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold ${gone ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                      >
                        Remove
                      </button>
                      <button
                        type="button"
                        onClick={() => setGoneChoice((g) => ({ ...g, [key(u.id, u.unit)]: false }))}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold ${!gone ? "bg-sky text-sky-foreground" : "bg-muted text-muted-foreground"}`}
                      >
                        Keep {u.have}
                      </button>
                    </div>
                  </div>
                );
              })}
            </section>
          ) : null}

          <section className="space-y-2">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Changes vs {isStarting ? "nothing on record (starting count)" : "system"}
            </h2>
            {ch.map((v) => (
              <div key={`${v.name}-${v.unit}`} className="surface flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1 truncate font-display text-sm">{v.name}</span>
                <span className="text-xs font-semibold text-muted-foreground">
                  {v.unit === "tub" ? "Tubs" : "Trays"}
                </span>
                <span className="text-sm text-muted-foreground">
                  {v.before} → {v.after}
                </span>
              </div>
            ))}
            {ch.length === 0 ? (
              <p className="px-1 text-sm text-muted-foreground">No changes. Everything matches.</p>
            ) : null}
          </section>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur">
          <div className="mx-auto flex max-w-4xl gap-3 p-4">
            <Button variant="outline" className="h-16 rounded-2xl px-6 text-lg" onClick={() => setChecking(false)}>
              <ArrowLeft className="mr-2 size-5" /> Back
            </Button>
            <Button
              className="h-16 flex-1 rounded-2xl text-lg"
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              <Check className="mr-2 size-6" /> Save stock take
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  /* ---------- step 2: count ---------- */
  const focusNext = (idx: number) => inputRefs.current[idx + 1]?.focus();
  const enteredCount = Object.keys(draft).length + Object.keys(tubDraft).length;

  return (
    <AppShell title={`Stock take · ${freezer?.name ?? ""}`} subtitle="Record or type what you can see">
      <button
        type="button"
        onClick={() => {
          reset();
          setFreezerId(null);
        }}
        className="mb-3 flex items-center gap-1 text-sm font-semibold text-muted-foreground"
      >
        <ArrowLeft className="size-4" /> Change freezer
      </button>
      {isStarting ? (
        <p className="mb-3 rounded-xl bg-accent/30 p-3 text-sm text-accent-foreground">
          Starting count for this freezer. Everything you count becomes its stock.
        </p>
      ) : null}

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
          const r = rec(f.id);
          const trayEntered = draft[f.id] !== undefined;
          const tubEntered = tubDraft[f.id] !== undefined;
          const box = (
            value: number | undefined,
            placeholder: number,
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
              value={value ?? ""}
              placeholder={String(placeholder)}
              onChange={(e) =>
                set((d) => {
                  if (e.target.value === "") {
                    const n = { ...d };
                    delete n[f.id];
                    return n;
                  }
                  return { ...d, [f.id]: Math.max(0, Math.round(Number(e.target.value) || 0)) };
                })
              }
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  focusNext(idx);
                }
              }}
              className={`h-12 w-20 text-center font-display text-lg ${value !== undefined ? "border-primary" : ""}`}
              aria-label={`${f.name} ${label}`}
            />
          );
          return (
            <div key={f.id} className="surface flex items-center gap-2 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-base">{f.name}</span>
                <span className="text-xs text-muted-foreground">
                  system says {r.tray} trays · {r.tub} tubs
                  {trayEntered || tubEntered ? " · counted" : ""}
                </span>
              </span>
              {box(draft[f.id], r.tray, i * 2, setDraft, "trays")}
              {box(tubDraft[f.id], r.tub, i * 2 + 1, setTubDraft, "tubs")}
            </div>
          );
        })}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 p-4 backdrop-blur">
        <div className="mx-auto max-w-4xl">
          <Button className="h-16 w-full rounded-2xl text-lg" onClick={() => setChecking(true)}>
            Finish & check · {enteredCount} counted
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
