import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Check, EyeOff, Search, Snowflake } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useVoiceStockTake } from "@/components/VoiceStockTake";
import { fetchFlavours, fetchFreezerStock, fetchFreezers, overallStockTake, type Unit } from "@/lib/gelato";
import { combinedCounts, defaultKeeps, parseStockTakeDraft, stockTakeKey, stockTakePayload, type StockTakeDraft } from "@/lib/stock-take";

export const Route = createFileRoute("/edit-stock")({
  head: () => ({ meta: [
    { title: "Stock Take — Charlie's Gelato" },
    { name: "description", content: "Count all Charlie's Gelato freezers and review combined stock totals in one variance report." },
    { property: "og:title", content: "Stock Take — Charlie's Gelato" },
    { property: "og:description", content: "An overall stock review after all freezers have been counted." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: EditStock,
});
const STORAGE_KEY = "charlies-overall-stock-take-v1";
type Variance = { name: string; unit: Unit; before: number; after: number; diff: number };
const emptyDraft = (): StockTakeDraft => ({ counts: {}, completed: [] });

function EditStock() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<StockTakeDraft>(emptyDraft);
  const [restored, setRestored] = useState(false);
  const [started, setStarted] = useState(false);
  const [freezerId, setFreezerId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [checking, setChecking] = useState(false);
  const [keep, setKeep] = useState<Record<string, boolean>>({});
  const [variances, setVariances] = useState<Variance[] | null>(null);
  useEffect(() => {
    try { const saved = parseStockTakeDraft(localStorage.getItem(STORAGE_KEY)); if (saved) setDraft(saved); }
    catch { toast.error("Saved counts could not be restored on this device."); }
    setRestored(true);
  }, []);
  const updateDraft = (next: StockTakeDraft) => {
    setDraft(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }
    catch { toast.error("Counts could not be saved on this device. Keep this page open."); }
  };
  const flavours = useQuery({ queryKey: ["flavours"], queryFn: fetchFlavours });
  const freezers = useQuery({ queryKey: ["freezers"], queryFn: fetchFreezers });
  const stock = useQuery({ queryKey: ["freezer-stock"], queryFn: fetchFreezerStock });
  const allFlavours = flavours.data ?? [];
  const freezerList = freezers.data ?? [];
  const ids = freezerList.map((f) => f.id);
  const allDone = ids.length > 0 && ids.every((id) => draft.completed.includes(id));
  const freezer = freezerList.find((f) => f.id === freezerId);
  const current = freezerId ? draft.counts[freezerId] ?? { tray: {}, tub: {} } : { tray: {}, tub: {} };
  const setCounts = (counts: typeof current) => {
    if (!freezerId) return;
    updateDraft({ ...draft, counts: { ...draft.counts, [freezerId]: counts } });
  };
  const voice = useVoiceStockTake(allFlavours, (counts) => setCounts({ tray: { ...current.tray, ...counts.tray }, tub: { ...current.tub, ...counts.tub } }), { persistKey: `stock-take-${freezerId ?? "none"}` });
  const rows = useMemo(() => combinedCounts(allFlavours, ids, draft.counts), [allFlavours, ids.join(","), draft.counts]);
  const trayCounted = rows.some((r) => r.seenTray);
  const tubCounted = rows.some((r) => r.seenTub);
  const effectiveKeep = { ...keep, ...defaultKeeps(rows) };
  const skippedUnit = !trayCounted && tubCounted ? "Only tubs were counted. All tray levels stay the same." : trayCounted && !tubCounted ? "Only trays were counted. All tub levels stay the same." : null;
  const unseen = rows.flatMap((r) => (["tray", "tub"] as Unit[]).flatMap((unit) => (!(unit === "tray" ? r.seenTray : r.seenTub) && r.before[unit] > 0 && (unit === "tray" ? trayCounted : tubCounted) ? [{ id: r.flavour_id, name: r.name, unit, have: r.before[unit] }] : [])));
  const changes = rows.flatMap((r) => (["tray", "tub"] as Unit[]).flatMap((unit) => {
    const seen = unit === "tray" ? r.seenTray : r.seenTub;
    const after = !seen && effectiveKeep[stockTakeKey(r.flavour_id, unit)] ? r.before[unit] : r[unit];
    return after !== r.before[unit] ? [{ name: r.name, unit, before: r.before[unit], after, diff: after - r.before[unit] }] : [];
  }));
  const save = useMutation({
    mutationFn: async () => {
      if (!allDone) throw new Error("Count all freezers first.");
      return overallStockTake(stockTakePayload(rows, ids, draft.counts, stock.data ?? [], effectiveKeep), rows.map((r) => ({ flavour_id: r.flavour_id, tray: r.before.tray, tub: r.before.tub })));
    },
    onSuccess: (result) => {
      setVariances(result.variances.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)));
      updateDraft(emptyDraft()); setChecking(false); setStarted(false); setFreezerId(null); setKeep({});
      qc.invalidateQueries(); toast.success("Overall stock take saved");
    }, onError: (e: Error) => toast.error(e.message),
  });
  const varianceRows = (items: Variance[]) => items.map((v) => <div key={`${v.name}-${v.unit}`} className="surface flex items-center gap-2 px-3 py-3">
    <span className="min-w-0 flex-1 break-words font-display">{v.name}</span>
    <span className="shrink-0 text-xs text-muted-foreground">{v.unit === "tray" ? "Trays" : "Tubs"}</span>
    <span className="shrink-0 text-sm">{v.before} → {v.after}</span>
    <span className={`shrink-0 rounded-full px-2 py-1 font-display ${v.diff < 0 ? "bg-primary text-primary-foreground" : "bg-sky text-sky-foreground"}`}>{v.diff > 0 ? "+" : ""}{v.diff}</span>
  </div>);
  if (variances) return <AppShell title="Overall Variance Report" subtitle="All freezers combined">
    <div className="mb-4 flex gap-4 font-display"><span>Trays: {variances.filter((v) => v.unit === "tray").reduce((s, v) => s + v.diff, 0)}</span><span>Tubs: {variances.filter((v) => v.unit === "tub").reduce((s, v) => s + v.diff, 0)}</span></div>
    <div className="space-y-2">{varianceRows(variances)}{!variances.length && <p className="py-8 text-center text-muted-foreground">No variances. Overall stock matches the count.</p>}</div>
    <Button className="mt-6 h-14 w-full" onClick={() => setVariances(null)}>Done</Button>
  </AppShell>;
  if (!restored || flavours.isPending || freezers.isPending || stock.isPending) return <AppShell title="Stock Take"><p>Loading stock…</p></AppShell>;
  if (flavours.isError || freezers.isError || stock.isError) return <AppShell title="Stock Take"><p>Stock could not be loaded.</p><Button onClick={() => qc.invalidateQueries()}>Try again</Button></AppShell>;
  if (checking && allDone) return <AppShell title="Review Overall Stock" subtitle="All freezers combined">
    <div className="space-y-5 pb-28">
      {skippedUnit && <div className="surface px-4 py-3 font-display">{skippedUnit}</div>}
      <section className="space-y-2"><h2 className="font-display">Changes vs overall stock</h2>{varianceRows(changes)}{!changes.length && <p className="text-muted-foreground">No changes. Overall stock matches.</p>}</section>
      {unseen.length > 0 && <section className="space-y-2"><h2 className="flex items-center gap-2 font-display"><EyeOff className="size-4" /> Missed flavours — on record but not counted anywhere</h2>
        {unseen.map((u) => { const key = stockTakeKey(u.id, u.unit); const kept = Boolean(keep[key]); return <div key={key} className="surface space-y-2 px-4 py-3">
          <div className="font-display">{u.name}</div><p className="text-sm text-muted-foreground">{`Overall stock says ${u.have} ${u.unit === "tray" ? "trays" : "tubs"}; none counted across all freezers.`}</p>
          <div className="flex gap-2"><Button size="sm" variant={kept ? "outline" : "default"} onClick={() => setKeep({ ...keep, [stockTakeKey(u.id, u.unit)]: false })}>Remove</Button><Button size="sm" variant={kept ? "default" : "outline"} onClick={() => setKeep({ ...keep, [stockTakeKey(u.id, u.unit)]: true })}>Keep {u.have}</Button></div>
        </div>; })}</section>}
    </div>
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 p-4 backdrop-blur"><div className="mx-auto flex max-w-4xl gap-3"><Button variant="outline" className="h-14" disabled={save.isPending} onClick={() => setChecking(false)}><ArrowLeft className="mr-2 size-4" />Back</Button><Button className="h-14 flex-1" disabled={save.isPending} onClick={() => save.mutate()}><Check className="mr-2 size-5" />{save.isPending ? "Saving…" : "Save overall stock take"}</Button></div></div>
  </AppShell>;
  const inProgress = draft.completed.length > 0 || Object.keys(draft.counts).length > 0;
  if (!freezerId && !started) {
    const shown = allFlavours.filter((f) => f.active || f.stock_qty > 0 || f.tub_qty > 0).filter((f) => f.name.toLowerCase().includes(q.trim().toLowerCase()));
    return <AppShell title="Total Stock" subtitle={`${allFlavours.reduce((a, f) => a + f.stock_qty, 0)} trays · ${allFlavours.reduce((a, f) => a + f.tub_qty, 0)} tubs across all freezers`}>
      <Button className="mb-4 h-16 w-full text-lg" onClick={() => { setStarted(true); setQ(""); }}>{inProgress ? `Continue stock take (${draft.completed.length} of ${ids.length} freezers done)` : "Do stock take"}</Button>
      <div className="relative mb-3"><Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" /><Input className="h-13 pl-12" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search flavours…" /></div>
      <div className="mb-2 flex justify-end gap-2 pr-3 text-xs font-semibold text-muted-foreground"><span className="w-14 text-center">Trays</span><span className="w-14 text-center">Tubs</span></div>
      <div className="space-y-2">{shown.map((f) => <div key={f.id} className="surface flex items-center gap-2 px-3 py-3"><span className="min-w-0 flex-1 break-words font-display">{f.name}</span><span className="w-14 text-center font-display text-lg">{f.stock_qty}</span><span className="w-14 text-center font-display text-lg">{f.tub_qty}</span></div>)}</div>
    </AppShell>;
  }
  if (!freezerId) return <AppShell title="Stock Take" subtitle={`${ids.filter((id) => draft.completed.includes(id)).length} of ${ids.length} freezers counted`}>
    <Button variant="ghost" className="mb-3" onClick={() => setStarted(false)}><ArrowLeft className="mr-2 size-4" />Total stock</Button>
    <div className="grid gap-3">{freezerList.map((f) => { const count = draft.counts[f.id]; const done = draft.completed.includes(f.id); return <Button key={f.id} variant="outline" className="surface h-auto justify-start gap-4 whitespace-normal px-5 py-5 text-left" onClick={() => { setFreezerId(f.id); setQ(""); }}><Snowflake className="size-6 shrink-0 text-sky-foreground" /><span className="min-w-0 flex-1"><span className="block font-display text-lg">{f.name}</span><span className="text-xs text-muted-foreground">{done ? `${Object.values(count?.tray ?? {}).reduce((a,b) => a+b,0)} trays · ${Object.values(count?.tub ?? {}).reduce((a,b) => a+b,0)} tubs counted` : `Not counted yet · on record ${(stock.data ?? []).filter((r) => r.freezer_id === f.id).reduce((a, r) => a + r.stock_qty, 0)} trays · ${(stock.data ?? []).filter((r) => r.freezer_id === f.id).reduce((a, r) => a + r.tub_qty, 0)} tubs`}</span></span>{done && <Check className="size-5 shrink-0" />}</Button>; })}</div>
    {allDone && <Button className="mt-6 h-16 w-full text-lg" onClick={() => { setKeep((prev) => { const next = defaultKeeps(rows); for (const u of unseen) { const key = stockTakeKey(u.id, u.unit); const prior = prev[key]; if (prior !== undefined) next[key] = prior; } return next; }); setChecking(true); }}>Review overall stock</Button>}
  </AppShell>;
  const list = allFlavours.filter((f) => (f.active || f.stock_qty > 0 || f.tub_qty > 0 || rows.some((r) => r.flavour_id === f.id && (r.tray > 0 || r.tub > 0))) && f.name.toLowerCase().includes(q.trim().toLowerCase()));
  return <AppShell title={`Stock take · ${freezer?.name ?? ""}`} subtitle="Count trays and tubs">
    <Button variant="ghost" className="mb-3" onClick={() => setFreezerId(null)}><ArrowLeft className="mr-2 size-4" />All freezers</Button>
    {voice.panel}
    <div className="relative mb-3"><Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" /><Input className="h-13 pl-12" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search flavours…" /></div>
    <div className="mb-2 flex justify-end gap-2 pr-3 text-xs font-semibold text-muted-foreground"><span className="w-16 text-center">Trays</span><span className="w-16 text-center">Tubs</span></div>
    <div className="space-y-2 pb-28">{list.map((f) => <div className="surface flex items-center gap-2 px-3 py-3" key={f.id}><span className="min-w-0 flex-1"><span className="block break-words font-display">{f.name}</span><span className="text-xs text-muted-foreground">On record here: {(stock.data ?? []).find((r) => r.freezer_id === freezerId && r.flavour_id === f.id)?.stock_qty ?? 0} trays · {(stock.data ?? []).find((r) => r.freezer_id === freezerId && r.flavour_id === f.id)?.tub_qty ?? 0} tubs</span></span>{(["tray", "tub"] as Unit[]).map((unit) => <Input key={unit} type="number" inputMode="numeric" min={0} className="h-12 w-16 shrink-0 text-center font-display text-lg" aria-label={`${f.name} ${unit === "tray" ? "trays" : "tubs"}`} value={current[unit][f.id] ?? ""} placeholder="—" onFocus={(e) => e.target.select()} onChange={(e) => { const values = { ...current[unit] }; if (!e.target.value) delete values[f.id]; else values[f.id] = Math.max(0, Math.round(Number(e.target.value) || 0)); setCounts({ ...current, [unit]: values }); }} />)}</div>)}</div>
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 p-4 backdrop-blur"><div className="mx-auto max-w-4xl"><Button className="h-16 w-full text-lg" onClick={() => { if (voice.hasPending) { toast.error("Tap \"Fill in counts\" on your recording first, or discard it."); window.scrollTo({ top: 0, behavior: "smooth" }); return; } if (!Object.keys(current.tray).length && !Object.keys(current.tub).length && !window.confirm("Nothing has been counted in this freezer. Finish it anyway?")) return; updateDraft({ ...draft, counts: { ...draft.counts, [freezerId]: current }, completed: [...new Set([...draft.completed, freezerId])] }); setFreezerId(null); }}>Finish this freezer <Check className="ml-2 size-5" /></Button></div></div>
  </AppShell>;
}
