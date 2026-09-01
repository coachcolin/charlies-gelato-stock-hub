import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mic, Search, Square, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { applyMovements, fetchFlavours, type Flavour } from "@/lib/gelato";
import { transcribeStockTake } from "@/lib/voice.functions";

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

  const voice = useVoiceStockTake(flavours.data ?? [], (counts) =>
    setDraft((d) => ({ ...d, ...counts })),
  );

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

type VoiceRow = { id: string; name: string; qty: number; flavourId: string | null };

function normalise(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/s$/, "");
}

function matchFlavour(name: string, flavours: Flavour[]) {
  const n = normalise(name);
  if (!n) return null;
  const exact = flavours.find((f) => normalise(f.name) === n);
  if (exact) return exact;
  const partial = flavours.filter(
    (f) => normalise(f.name).includes(n) || n.includes(normalise(f.name)),
  );
  if (partial.length === 1) return partial[0]!;
  if (partial.length > 1) {
    return [...partial].sort((a, b) => a.name.length - b.name.length)[0]!;
  }
  return null;
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((ms % 1000) / 100);
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${tenths}`;
}

function useVoiceStockTake(
  flavours: Flavour[],
  onApply: (counts: Record<string, number>) => void,
) {
  const active = useMemo(() => flavours.filter((f) => f.active), [flavours]);
  const [recording, setRecording] = useState(false);
  const [rows, setRows] = useState<VoiceRow[] | null>(null);
  const [transcript, setTranscript] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [audioData, setAudioData] = useState<number[] | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const transcribe = useServerFn(transcribeStockTake);

  const send = useMutation({
    mutationFn: async (blob: Blob) => {
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 1) bin += String.fromCharCode(buf[i]!);
      return transcribe({
        data: {
          audio: btoa(bin),
          mime: blob.type || "audio/webm",
          flavours: active.map((f) => f.name),
        },
      });
    },
    onSuccess: (res) => {
      setTranscript(res.text);
      if (!res.items.length) {
        toast.error(res.text ? "Couldn't pick out any flavours" : "Nothing was heard");
        return;
      }
      setRows(
        res.items.map((it, i) => {
          const f = matchFlavour(it.name, active);
          return {
            id: `${i}-${it.name}`,
            name: f?.name ?? it.name,
            qty: Math.max(0, Math.round(it.qty || 0)),
            flavourId: f?.id ?? null,
          };
        }),
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cleanupAudio = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    analyserRef.current = null;
    dataArrayRef.current = null;
    setAudioData(null);
    setElapsed(0);
  };

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        cleanupAudio();
        send.mutate(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      await audioCtx.resume();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.75;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;
      dataArrayRef.current = dataArray;
      sourceRef.current = source;

      const tick = () => {
        if (!analyserRef.current || !dataArrayRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArrayRef.current);
        setAudioData(Array.from(dataArrayRef.current as Uint8Array));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      startTimeRef.current = performance.now();
      timerRef.current = window.setInterval(() => {
        setElapsed(performance.now() - startTimeRef.current);
      }, 80);
    } catch {
      toast.error("Microphone access was blocked");
    }
  }

  function stop() {
    recorderRef.current?.stop();
  }

  const displayData = audioData ?? Array(16).fill(0);

  const panel = (
    <section
      className={`surface mb-4 p-4 transition-all ${
        recording ? "bg-red-500/[0.04] ring-2 ring-red-500/50" : ""
      }`}
    >
      <Button
        type="button"
        size="lg"
        variant={recording ? "destructive" : "default"}
        className="h-14 w-full rounded-2xl text-base"
        disabled={send.isPending}
        onClick={() => (recording ? stop() : start())}
      >
        {send.isPending ? (
          <>
            <Loader2 className="size-5 animate-spin" /> Working out what you said…
          </>
        ) : recording ? (
          <>
            <Square className="size-5" /> Stop recording
          </>
        ) : (
          <>
            <Mic className="size-5" /> Record stock take
          </>
        )}
      </Button>

      {recording ? (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
              </span>
              <span className="font-display text-red-500">Recording…</span>
            </div>
            <span className="font-display text-2xl tabular-nums text-foreground">
              {formatElapsed(elapsed)}
            </span>
          </div>

          <div className="flex h-14 items-end justify-between gap-[3px] rounded-xl bg-muted/50 px-2 py-2">
            {displayData.map((val, i) => {
              const pct = typeof val === "number" ? val / 255 : 0;
              return (
                <div
                  key={i}
                  className="flex-1 rounded-t-sm bg-red-500 transition-[height] duration-75 ease-linear"
                  style={{ height: `${Math.max(6, pct * 100)}%` }}
                />
              );
            })}
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Speak your counts clearly, e.g. “one strawberry, one chocolate, three cookie dough”
          </p>
        </div>
      ) : (
        <p className="mt-2 px-1 text-xs text-muted-foreground">
          Speak your counts, e.g. “one strawberry, one chocolate, three cookie dough”. You can
          check and edit the list before it fills in the counts.
        </p>
      )}

      {transcript && rows ? (
        <p className="mt-3 rounded-2xl bg-muted px-3 py-2 text-xs text-muted-foreground">
          Heard: “{transcript}”
        </p>
      ) : null}

      {rows ? (
        <div className="mt-3 space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-base">{r.name}</span>
                {!r.flavourId ? (
                  <span className="text-xs text-primary">No matching flavour — will be skipped</span>
                ) : null}
              </span>
              <Input
                type="number"
                inputMode="numeric"
                value={r.qty}
                onChange={(e) =>
                  setRows((rs) =>
                    (rs ?? []).map((x) =>
                      x.id === r.id
                        ? { ...x, qty: Math.max(0, Math.round(Number(e.target.value) || 0)) }
                        : x,
                    ),
                  )
                }
                onFocus={(e) => e.target.select()}
                className="h-11 w-20 text-center font-display text-lg"
                aria-label={`${r.name} count`}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-10 shrink-0"
                aria-label={`Remove ${r.name}`}
                onClick={() => setRows((rs) => (rs ?? []).filter((x) => x.id !== r.id))}
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              className="h-12 flex-1 rounded-2xl"
              onClick={() => {
                const counts: Record<string, number> = {};
                rows.forEach((r) => {
                  if (r.flavourId) counts[r.flavourId] = r.qty;
                });
                const n = Object.keys(counts).length;
                if (!n) {
                  toast.error("Nothing to apply");
                  return;
                }
                onApply(counts);
                setRows(null);
                setTranscript("");
                toast.success(`Filled in ${n} flavour${n === 1 ? "" : "s"}`);
              }}
            >
              Fill in counts
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12 rounded-2xl"
              onClick={() => {
                setRows(null);
                setTranscript("");
              }}
            >
              Discard
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );

  return { panel };
}
