import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Snowflake } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  fetchFreezerStock,
  fetchFreezers,
  freezerStockMap,
  unitLabel,
  type Unit,
} from "@/lib/gelato";

export type OutLine = { flavour_id: string; name: string; qty: number; unit: Unit };

export function useFreezerData() {
  const freezers = useQuery({ queryKey: ["freezers"], queryFn: fetchFreezers });
  const stock = useQuery({ queryKey: ["freezer-stock"], queryFn: fetchFreezerStock });
  return { freezers: freezers.data ?? [], map: freezerStockMap(stock.data ?? []) };
}

/** Lines taking more out of a freezer than it has on record. */
export function useShortfalls(freezerId: string | null, lines: OutLine[] | undefined) {
  const { map } = useFreezerData();
  if (!freezerId || !lines) return [];
  const totals = new Map<string, OutLine>();
  for (const l of lines) {
    const key = `${l.flavour_id}:${l.unit}`;
    const prev = totals.get(key);
    totals.set(key, prev ? { ...prev, qty: prev.qty + l.qty } : { ...l });
  }
  return [...totals.values()]
    .map((l) => {
      const rec = map.get(`${l.flavour_id}:${freezerId}`);
      const have = l.unit === "tub" ? (rec?.tub_qty ?? 0) : (rec?.stock_qty ?? 0);
      return { ...l, have };
    })
    .filter((l) => l.qty > l.have);
}

export function ShortfallWarning({
  freezerName,
  items,
}: {
  freezerName: string;
  items: (OutLine & { have: number })[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-xl border border-accent bg-accent/30 p-3 text-sm text-accent-foreground">
      <p className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="size-4 shrink-0" />
        More than the {freezerName} has on record
      </p>
      <ul className="mt-1 space-y-0.5 pl-6 text-xs">
        {items.map((i) => (
          <li key={`${i.flavour_id}-${i.unit}`}>
            {i.name}: taking {i.qty} {unitLabel(i.unit, i.qty)}, system says {i.have}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs">You can still confirm. Stock won't go below 0.</p>
    </div>
  );
}

/** Row of freezer buttons. */
export function FreezerButtons({
  value,
  onChange,
  exclude,
}: {
  value: string | null;
  onChange: (id: string) => void;
  exclude?: string | null;
}) {
  const { freezers } = useFreezerData();
  return (
    <div className="grid grid-cols-3 gap-2">
      {freezers
        .filter((f) => f.id !== exclude)
        .map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onChange(f.id)}
            className={`flex min-h-12 items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-sm font-semibold ${
              value === f.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground"
            }`}
          >
            <Snowflake className="size-4 shrink-0" />
            {f.name.replace(/ Freezer$/, "")}
          </button>
        ))}
    </div>
  );
}

/** Inline "which freezer?" block with over-removal warning. */
export function FreezerPicker({
  label,
  value,
  onChange,
  outLines,
}: {
  label: string;
  value: string | null;
  onChange: (id: string) => void;
  outLines?: OutLine[] | undefined;
}) {
  const { freezers } = useFreezerData();
  const short = useShortfalls(value, outLines);
  const name = freezers.find((f) => f.id === value)?.name ?? "freezer";
  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      <FreezerButtons value={value} onChange={onChange} />
      <ShortfallWarning freezerName={name} items={short} />
    </div>
  );
}

/** Promise-based "which freezer?" popup: `const id = await ask({...})`. */
export function useFreezerPrompt() {
  const [state, setState] = useState<{
    title: string;
    outLines?: OutLine[] | undefined;
  } | null>(null);
  const [value, setValue] = useState<string | null>(null);
  const resolver = useRef<((id: string | null) => void) | null>(null);

  const ask = (opts: { title: string; outLines?: OutLine[] }) =>
    new Promise<string | null>((resolve) => {
      resolver.current = resolve;
      setValue(null);
      setState(opts);
    });

  const close = (id: string | null) => {
    resolver.current?.(id);
    resolver.current = null;
    setState(null);
  };

  const dialog: ReactNode = (
    <Dialog open={Boolean(state)} onOpenChange={(o) => !o && close(null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">{state?.title}</DialogTitle>
          <DialogDescription>Pick the freezer.</DialogDescription>
        </DialogHeader>
        <FreezerPicker
          label="Freezer"
          value={value}
          onChange={setValue}
          outLines={state?.outLines}
        />
        <Button
          className="h-14 w-full rounded-2xl text-base"
          disabled={!value}
          onClick={() => close(value)}
        >
          Confirm
        </Button>
      </DialogContent>
    </Dialog>
  );

  return { ask, dialog };
}
