import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Search, Star, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  BATCH_SIZE,
  categoryLabel,
  DEFAULT_DAY_CAPACITIES,
  db,
  fetchDayCapacities,
  fetchFlavours,
  fetchSeason,
  setDayCapacity,
  setSeason,
  type Flavour,
  type Season,
} from "@/lib/gelato";

export const Route = createFileRoute("/data")({
  head: () => ({
    meta: [
      { title: "Data Management — Charlie's Gelato" },
      {
        name: "description",
        content:
          "Manage the Charlie's Gelato flavour list: add or retire flavours, set priority flavours and desired stock levels per season.",
      },
      { property: "og:title", content: "Data Management — Charlie's Gelato" },
      {
        property: "og:description",
        content: "Flavours, priorities, photos and seasonal stock targets.",
      },
    ],
  }),
  component: DataPage,
});

const SEASONS: { key: Season; label: string }[] = [
  { key: "peak", label: "Peak" },
  { key: "mid", label: "Mid" },
  { key: "low", label: "Low" },
];

function DataPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Flavour | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const flavours = useQuery({ queryKey: ["flavours"], queryFn: fetchFlavours });
  const season = useQuery({ queryKey: ["season"], queryFn: fetchSeason });

  const refresh = () => qc.invalidateQueries();

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Flavour> }) => {
      const res = await db.from("flavours").update(patch).eq("id", id);
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const create = useMutation({
    mutationFn: async (names: string[]) => {
      const rows = names.map((n) => ({ name: n }));
      const res = await db.from("flavours").insert(rows);
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => {
      refresh();
      setAdding(false);
      setNewName("");
      toast.success("Flavours added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await db.from("flavours").delete().eq("id", id);
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => {
      refresh();
      setEditing(null);
      toast.success("Flavour deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const seasonMut = useMutation({
    mutationFn: setSeason,
    onSuccess: () => {
      refresh();
      toast.success("Season updated");
    },
  });

  const capacities = useQuery({ queryKey: ["dayCapacities"], queryFn: fetchDayCapacities });
  const capacityMut = useMutation({
    mutationFn: ({ season: s, trays }: { season: Season; trays: number }) =>
      setDayCapacity(s, trays),
    onSuccess: () => {
      refresh();
      toast.success("Daily production run updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (flavours.data ?? []).filter((f) => f.name.toLowerCase().includes(query));
  }, [flavours.data, q]);

  return (
    <AppShell
      title="Data Management"
      subtitle={`${(flavours.data ?? []).length} flavours`}
      action={
        <Button size="icon" variant="secondary" className="size-11 rounded-full" onClick={() => setAdding(true)} aria-label="Add flavour">
          <Plus className="size-5" />
        </Button>
      }
    >
      <div className="surface mb-4 p-4">
        <p className="font-display text-base">Current season</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Drives which minimum stock level the production report uses for each flavour.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {SEASONS.map((s) => (
            <Button
              key={s.key}
              variant={season.data === s.key ? "default" : "outline"}
              className="h-12 rounded-xl"
              onClick={() => seasonMut.mutate(s.key)}
            >
              {s.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="surface mb-4 p-4">
        <p className="font-display text-base">Daily production run</p>
        <p className="mb-3 text-xs text-muted-foreground">
          How many trays a production day makes in each season. The production report suggests this
          many trays, always in batches of {BATCH_SIZE} (priority flavours at least {BATCH_SIZE * 2}).
        </p>
        <div className="grid grid-cols-3 gap-2">
          {SEASONS.map((s) => (
            <div key={s.key}>
              <Label className="text-xs text-muted-foreground">{s.label} season</Label>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                step={BATCH_SIZE}
                defaultValue={(capacities.data ?? DEFAULT_DAY_CAPACITIES)[s.key]}
                key={`${s.key}-${(capacities.data ?? DEFAULT_DAY_CAPACITIES)[s.key]}`}
                onFocus={(e) => e.currentTarget.select()}
                onBlur={(e) => {
                  const n = Number(e.currentTarget.value);
                  const current = (capacities.data ?? DEFAULT_DAY_CAPACITIES)[s.key];
                  if (Number.isFinite(n) && n > 0 && n !== current)
                    capacityMut.mutate({ season: s.key, trays: Math.round(n) });
                }}
                className="h-12 rounded-xl text-center text-base"
              />
            </div>
          ))}
        </div>
      </div>



      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search flavours…"
          className="h-13 rounded-2xl pl-12 text-base"
        />
      </div>

      <div className="space-y-2">
        {list.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setEditing(f)}
            className="surface flex w-full items-center gap-3 px-4 py-3 text-left"
          >
            {f.image_url ? (
              <img src={f.image_url} alt="" className="size-11 rounded-full object-cover" />
            ) : (
              <span className="flex size-11 items-center justify-center rounded-full bg-cream font-display text-cream-foreground">
                {f.name.slice(0, 2)}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate font-display text-base">{f.name}</span>
                {f.priority ? <Star className="size-3.5 fill-primary text-primary" /> : null}
              </span>
              <span className="text-xs text-muted-foreground">
                {categoryLabel(f.category)} · min{" "}
                {f.desired_peak}/{f.desired_mid}/{f.desired_low} · {f.stock_qty} in stock
              </span>
            </span>
            {!f.active ? (
              <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-semibold uppercase text-muted-foreground">
                Inactive
              </span>
            ) : null}
          </button>
        ))}
        {list.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No flavours yet — tap + to add your list.
          </p>
        ) : null}
      </div>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Add flavours</DialogTitle>
            <p className="text-sm text-muted-foreground">
              One per line to add several at once.
            </p>
          </DialogHeader>
          <textarea
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            rows={6}
            placeholder={"Hokey Pokey\nChocolate\nSalted Caramel"}
            className="w-full rounded-2xl border border-input bg-background p-3 text-base"
          />
          <Button
            className="h-14 rounded-2xl"
            disabled={create.isPending}
            onClick={() => {
              const names = [
                ...new Set(
                  newName
                    .split("\n")
                    .map((n) => n.trim())
                    .filter(Boolean),
                ),
              ];
              if (names.length === 0) return;
              create.mutate(names);
            }}
          >
            Add
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-sm overflow-y-auto rounded-3xl">
          {editing ? (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-xl">{editing.name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <Field label="Name">
                  <Input
                    defaultValue={editing.name}
                    onBlur={(e) =>
                      e.target.value.trim() &&
                      update.mutate({ id: editing.id, patch: { name: e.target.value.trim() } })
                    }
                  />
                </Field>
                <Field label="Photo URL">
                  <Input
                    defaultValue={editing.image_url ?? ""}
                    placeholder="https://…"
                    onBlur={(e) =>
                      update.mutate({
                        id: editing.id,
                        patch: { image_url: e.target.value.trim() || null },
                      })
                    }
                  />
                </Field>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Category
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ["gelato", "Gelato"],
                        ["sorbetto", "Sorbetto"],
                        ["special", "Specials / Seasonals"],
                      ] as const
                    ).map(([value, label]) => (
                      <Button
                        key={value}
                        type="button"
                        variant={editing.category === value ? "default" : "outline"}
                        className="h-12 rounded-xl"
                        onClick={() => {
                          setEditing({ ...editing, category: value });
                          update.mutate({ id: editing.id, patch: { category: value } });
                        }}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-xl bg-muted px-3 py-2.5">
                  <Label htmlFor="active">Active</Label>
                  <Switch
                    id="active"
                    defaultChecked={editing.active}
                    onCheckedChange={(v) =>
                      update.mutate({ id: editing.id, patch: { active: v } })
                    }
                  />
                </div>
                <div className="flex items-center justify-between rounded-xl bg-muted px-3 py-2.5">
                  <Label htmlFor="priority">Priority flavour</Label>
                  <Switch
                    id="priority"
                    defaultChecked={editing.priority}
                    onCheckedChange={(v) =>
                      update.mutate({ id: editing.id, patch: { priority: v } })
                    }
                  />
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Minimum trays in stock
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        ["Peak", "desired_peak"],
                        ["Mid", "desired_mid"],
                        ["Low", "desired_low"],
                      ] as const
                    ).map(([label, key]) => (
                      <div key={key}>
                        <Label className="text-xs">{label}</Label>
                        <Input
                          type="number"
                          inputMode="numeric"
                          defaultValue={editing[key]}
                          className="h-12 text-center font-display text-lg"
                          onBlur={(e) =>
                            update.mutate({
                              id: editing.id,
                              patch: { [key]: Math.max(0, Number(e.target.value) || 0) } as Partial<Flavour>,
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="h-12 w-full rounded-xl text-destructive"
                  onClick={() => remove.mutate(editing.id)}
                >
                  <Trash2 className="mr-2 size-4" /> Delete flavour
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
