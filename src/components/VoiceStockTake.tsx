import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { History, Loader2, Mic, Square, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Flavour, Unit } from "@/lib/gelato";
import { transcribeStockTake } from "@/lib/voice.functions";
import { clearRecording, loadRecording, saveRecording } from "@/lib/voice-store";
import { prepareVoiceAudio, startWavRecording, type WavRecorder } from "@/lib/voice-audio";

type VoiceRow = { id: string; name: string; qty: number; flavourId: string | null; unit: Unit };

export type VoiceCounts = { tray: Record<string, number>; tub: Record<string, number> };

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
  if (partial.length === 1) return partial[0] ?? null;
  if (partial.length > 1) {
    return [...partial].sort((a, b) => a.name.length - b.name.length)[0] ?? null;
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

export function useVoiceStockTake(
  flavours: Flavour[],
  onApply: (counts: VoiceCounts) => void,
  options?: {
    recordLabel?: string;
    hint?: string;
    applyLabel?: string;
    appliedMessage?: (n: number) => string;
    persistKey?: string;
  },
) {
  const persistKey = options?.persistKey ?? "default";
  const recordLabel = options?.recordLabel ?? "Record stock take";
  const hint =
    options?.hint ??
    "Speak your counts, e.g. “one strawberry, one chocolate, three cookie dough tubs”. Say “tubs” for tubs, otherwise it counts trays. You can check and edit the list before it fills in the counts.";
  const applyLabel = options?.applyLabel ?? "Fill in counts";
  const appliedMessage =
    options?.appliedMessage ?? ((n: number) => `Filled in ${n} flavour${n === 1 ? "" : "s"}`);

  const active = useMemo(() => flavours.filter((f) => f.active), [flavours]);
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [rows, setRows] = useState<VoiceRow[] | null>(null);
  const [transcript, setTranscript] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [audioData, setAudioData] = useState<number[] | null>(null);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ blob: Blob; url: string; savedAt: number } | null>(null);

  // Restore an unfinished recording (e.g. the phone screen turned off mid-take).
  useEffect(() => {
    let cancelled = false;
    setSaved(null);
    setRows(null);
    setTranscript("");
    setRecordError(null);
    setPlaybackUrl(null);
    loadRecording(persistKey).then((rec) => {
      if (cancelled || !rec) return;
      setSaved({ blob: rec.blob, url: URL.createObjectURL(rec.blob), savedAt: rec.savedAt });
    });
    return () => {
      cancelled = true;
    };
  }, [persistKey]);

  const recorderRef = useRef<WavRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const transcribe = useServerFn(transcribeStockTake);

  const releaseWakeLock = () => {
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  };

  const send = useMutation({
    mutationFn: async (blob: Blob) => {
      setRecordError(null);
      const segments = await prepareVoiceAudio(blob);
      const text: string[] = [];
      const items: Awaited<ReturnType<typeof transcribe>>["items"] = [];
      for (const segment of segments) {
        const buf = new Uint8Array(await segment.arrayBuffer());
        let bin = "";
        for (const byte of buf) bin += String.fromCharCode(byte);
        const result = await transcribe({ data: {
          audio: btoa(bin), mime: "audio/wav", flavours: active.map((f) => f.name),
        } });
        text.push(result.text);
        items.push(...result.items);
      }
      return { text: text.join(" "), items };
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
            unit: it.unit === "tub" ? "tub" : "tray",
          };
        }),
      );
    },
    onError: (e: Error) => {
      setRecordError(e.message);
      toast.error(e.message);
    },
  });

  const cleanupAudio = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setAudioData(null);
    setElapsed(0);
  };

  useEffect(() => () => {
    recorderRef.current?.dispose();
    recorderRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    releaseWakeLock();
  }, [persistKey]);

  function finish(interrupted = false) {
    const rec = recorderRef.current;
    if (!rec) return;
    recorderRef.current = null;
    const blob = rec.stop();
    setRecording(false);
    releaseWakeLock();
    cleanupAudio();
    if (blob.size < 2048) {
      setRecordError("The recording was too short. Please record your counts again.");
      return;
    }
    void saveRecording(persistKey, blob);
    setSaved((previous) => {
      if (previous) URL.revokeObjectURL(previous.url);
      return { blob, url: URL.createObjectURL(blob), savedAt: Date.now() };
    });
    setPlaybackUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return URL.createObjectURL(blob);
    });
    if (!interrupted) send.mutate(blob);
  }

  async function start() {
    if (starting || recorderRef.current) return;
    setStarting(true);
    setRecordError(null);
    try {
      recorderRef.current = await startWavRecording({
        onCheckpoint: (blob) => { void saveRecording(persistKey, blob); },
        onLevels: setAudioData,
        onInterrupted: () => finish(true),
      });
      setRows(null);
      setTranscript("");
      setRecording(true);
      startTimeRef.current = performance.now();
      timerRef.current = window.setInterval(() => {
        setElapsed(performance.now() - startTimeRef.current);
      }, 80);
      // Wake lock is optional and never blocks starting the microphone.
      const nav = navigator as Navigator & {
        wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> };
      };
      void nav.wakeLock?.request("screen").then((lock) => {
        if (recorderRef.current) wakeLockRef.current = lock;
        else void lock.release().catch(() => {});
      }).catch(() => {});
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      const message = name === "NotAllowedError"
        ? "Microphone access was blocked. Allow microphone access in your browser and try again."
        : name === "NotFoundError" ? "No microphone was found on this device."
        : error instanceof Error ? error.message : "Could not start recording. Please try again.";
      setRecordError(message);
      toast.error(message);
    } finally {
      setStarting(false);
    }
  }

  function stop() { finish(); }

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
        disabled={send.isPending || starting}
        onClick={() => (recording ? stop() : start())}
      >
        {starting ? <><Loader2 className="size-5 animate-spin" /> Starting microphone…</> : send.isPending ? (
          <>
            <Loader2 className="size-5 animate-spin" /> Working out what you said…
          </>
        ) : recording ? (
          <>
            <Square className="size-5" /> Stop recording
          </>
        ) : (
          <>
            <Mic className="size-5" /> {recordLabel}
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
            Speak your counts clearly, e.g. “one strawberry, one chocolate, three cookie dough tubs”
          </p>
        </div>
      ) : (
        <p className="mt-2 px-1 text-xs text-muted-foreground">{hint}</p>
      )}

      {recordError ? <p role="alert" className="mt-3 text-sm text-destructive">{recordError}</p> : null}

      {saved && !recording && !rows ? (
        <div className="mt-3 space-y-2 rounded-2xl border border-primary/30 bg-primary/5 p-3">
          <p className="flex items-center gap-2 font-display text-sm">
            <History className="size-4 text-primary" />
            Unfinished recording from{" "}
            {new Date(saved.savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </p>
          <audio src={saved.url} controls className="w-full" preload="metadata" />
          <div className="flex gap-2">
            <Button
              type="button"
              className="h-11 flex-1 rounded-xl"
              disabled={send.isPending}
              onClick={() => {
                const blob = saved.blob;
                send.mutate(blob);
              }}
            >
              Use this recording
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl"
              onClick={() => {
                URL.revokeObjectURL(saved.url);
                setSaved(null);
                void clearRecording(persistKey);
              }}
            >
              Discard
            </Button>
          </div>
        </div>
      ) : null}

      {playbackUrl && !recording && (!saved || rows) ? (
        <div className="mt-3 rounded-2xl bg-muted/60 p-3">
          <p className="mb-2 font-display text-sm">Your recording</p>
          <audio src={playbackUrl} controls className="w-full" preload="metadata" />
        </div>
      ) : null}

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
              <button
                type="button"
                onClick={() =>
                  setRows((rs) =>
                    (rs ?? []).map((x) =>
                      x.id === r.id ? { ...x, unit: x.unit === "tub" ? "tray" : "tub" } : x,
                    ),
                  )
                }
                className={`h-11 shrink-0 rounded-xl px-3 font-display text-sm ${
                  r.unit === "tub" ? "bg-sky text-sky-foreground" : "bg-cream text-cream-foreground"
                }`}
                aria-label={`Switch ${r.name} between trays and tubs`}
              >
                {r.unit === "tub" ? "Tubs" : "Trays"}
              </button>
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
                const counts: VoiceCounts = { tray: {}, tub: {} };
                rows.forEach((r) => {
                  if (r.flavourId) counts[r.unit][r.flavourId] = (counts[r.unit][r.flavourId] ?? 0) + r.qty;
                });
                const n = Object.keys(counts.tray).length + Object.keys(counts.tub).length;
                if (!n) {
                  toast.error("Nothing to apply");
                  return;
                }
                onApply(counts);
                setSaved(null);
                setSaved(null);
                setRows(null);
                setTranscript("");
                void clearRecording(persistKey);
                toast.success(appliedMessage(n));
              }}
            >
              {applyLabel}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12 rounded-2xl"
              onClick={() => {
                setSaved(null);
                setRows(null);
                setTranscript("");
                void clearRecording(persistKey);
              }}
            >
              Discard
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );

  return { panel, hasPending: Boolean(rows?.length) || send.isPending };
}
