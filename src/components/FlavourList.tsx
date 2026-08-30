import { Search, Star } from "lucide-react";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { categoryLabel, type Flavour } from "@/lib/gelato";

export function FlavourList({
  flavours,
  popular,
  onPick,
  renderMeta,
  emptyLabel = "No flavours match that search.",
}: {
  flavours: Flavour[];
  popular: string[];
  onPick: (f: Flavour) => void;
  renderMeta?: (f: Flavour) => React.ReactNode;
  emptyLabel?: string;
}) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();

  const { top, rest } = useMemo(() => {
    const list = flavours.filter((f) => f.name.toLowerCase().includes(query));
    if (query) return { top: [] as Flavour[], rest: list };
    const topList = popular
      .map((id) => list.find((f) => f.id === id))
      .filter((f): f is Flavour => Boolean(f));
    const topIds = new Set(topList.map((f) => f.id));
    return { top: topList, rest: list.filter((f) => !topIds.has(f.id)) };
  }, [flavours, popular, query]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search flavours…"
          inputMode="search"
          className="h-14 rounded-2xl pl-12 text-base"
        />
      </div>

      {top.length > 0 ? (
        <Section label="Popular">
          {top.map((f) => (
            <FlavourButton key={f.id} f={f} onPick={onPick} meta={renderMeta?.(f)} />
          ))}
        </Section>
      ) : null}

      {rest.length > 0 ? (
        <Section label={query ? "Results" : "All flavours"}>
          {rest.map((f) => (
            <FlavourButton key={f.id} f={f} onPick={onPick} meta={renderMeta?.(f)} />
          ))}
        </Section>
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </h2>
      <div className="grid gap-2 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function FlavourButton({
  f,
  onPick,
  meta,
}: {
  f: Flavour;
  onPick: (f: Flavour) => void;
  meta?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(f)}
      className="surface flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-transform active:scale-[0.98]"
    >
      {f.image_url ? (
        <img src={f.image_url} alt="" className="size-11 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-cream font-display text-base text-cream-foreground">
          {f.name.slice(0, 2)}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-display text-base">{f.name}</span>
          {f.priority ? <Star className="size-3.5 shrink-0 fill-primary text-primary" /> : null}
        </span>
        <span className="text-xs font-medium text-muted-foreground">{categoryLabel(f.category)}</span>
      </span>
      {meta}
    </button>
  );
}
