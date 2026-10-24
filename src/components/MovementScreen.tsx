import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Check, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { FlavourList } from "@/components/FlavourList";
import { QtyDialog } from "@/components/QtyDialog";
import { Button } from "@/components/ui/button";
import {
  applyMovements,
  fetchFlavours,
  fetchMovements,
  fetchOrders,
  popularIds,
  type Flavour,
  formatTraysTubs,
  type MovementKind,
  type Unit,
  unitLabel,
} from "@/lib/gelato";

type Line = { id: string; name: string; qty: number; unit: Unit };

export function MovementScreen({
  title,
  subtitle,
  kind,
  sign,
  confirmLabel,
}: {
  title: string;
  subtitle: string;
  kind: MovementKind;
  sign: 1 | -1;
  confirmLabel: string;
}) {
  const qc = useQueryClient();
  const router = useRouter();
  const [picked, setPicked] = useState<Flavour | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [account, setAccount] = useState("Charlie's Shop");
  const [otherAccount, setOtherAccount] = useState("");

  const flavours = useQuery({ queryKey: ["flavours"], queryFn: fetchFlavours });
  const movements = useQuery({ queryKey: ["movements"], queryFn: () => fetchMovements(60) });
  const orders = useQuery({
    queryKey: ["orders"],
    queryFn: fetchOrders,
    enabled: kind === "removal",
  });

  const wholesalers = Array.from(
    new Set((orders.data ?? []).map((o) => o.wholesaler).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));

  const resolvedAccount =
    account === "__other__" ? otherAccount.trim() : account;

  const active = (flavours.data ?? []).filter((f) => f.active);
  const popular = popularIds(flavours.data ?? [], movements.data ?? []);

  const submit = useMutation({
    mutationFn: () =>
      applyMovements(
        lines.map((l) => ({ flavour_id: l.id, qty: sign * l.qty, unit: l.unit })),
        kind,
        undefined,
        undefined,
        kind === "removal" && resolvedAccount ? resolvedAccount : undefined,
      ),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success(`${formatTraysTubs(trays, tubs)} ${sign > 0 ? "added" : "removed"}`);
      setLines([]);
      router.navigate({ to: "/" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addLine = (qty: number, unit: Unit) => {
    if (!picked) return;
    setLines((prev) => {
      const found = prev.find((l) => l.id === picked.id && l.unit === unit);
      if (found)
        return prev.map((l) => (l === found ? { ...l, qty: l.qty + qty } : l));
      return [...prev, { id: picked.id, name: picked.name, qty, unit }];
    });
    setPicked(null);
  };

  const trays = lines.filter((l) => l.unit === "tray").reduce((s, l) => s + l.qty, 0);
  const tubs = lines.filter((l) => l.unit === "tub").reduce((s, l) => s + l.qty, 0);

  return (
    <AppShell title={title} subtitle={subtitle}>
      <FlavourList
        flavours={active}
        popular={popular}
        onPick={setPicked}
        renderMeta={(f) => (
          <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
            {f.stock_qty} trays · {f.tub_qty ?? 0} tubs
          </span>
        )}
      />

      <QtyDialog
        open={Boolean(picked)}
        onOpenChange={(o) => !o && setPicked(null)}
        title={picked?.name ?? ""}
        description={
          picked
            ? `${picked.stock_qty} trays · ${picked.tub_qty ?? 0} tubs in stock · how many are you ${sign > 0 ? "adding" : "taking"}?`
            : undefined
        }
        confirmLabel={sign > 0 ? "Add to list" : "Add to list"}
        onConfirm={addLine}
        showUnit
      />

      {lines.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur">
          <div className="mx-auto max-w-4xl space-y-3 p-4">
            <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
              {lines.map((l) => (
                <button
                  key={`${l.id}-${l.unit}`}
                  type="button"
                  onClick={() => setLines((p) => p.filter((x) => x !== l))}
                  className="flex items-center gap-2 rounded-full bg-cream px-3 py-2 text-sm font-semibold text-cream-foreground"
                >
                  <span>
                    {l.name} × {l.qty} {unitLabel(l.unit, l.qty)}
                  </span>
                  <Trash2 className="size-4 opacity-60" />
                </button>
              ))}
            </div>
            {kind === "removal" ? (
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Where is this stock going?
                </label>
                <div className="flex flex-wrap gap-2">
                  {["Charlie's Shop", ...wholesalers, "__other__"].map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setAccount(w)}
                      className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                        account === w
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-foreground"
                      }`}
                    >
                      {w === "__other__" ? "Someone else…" : w}
                    </button>
                  ))}
                </div>
                {account === "__other__" ? (
                  <input
                    value={otherAccount}
                    onChange={(e) => setOtherAccount(e.target.value)}
                    placeholder="Who is it for? e.g. Café Milano"
                    className="h-12 w-full rounded-xl border border-border bg-background px-4 text-sm"
                  />
                ) : null}
              </div>
            ) : null}
            <Button
              className="h-16 w-full rounded-2xl text-lg"
              disabled={
                submit.isPending || (kind === "removal" && !resolvedAccount)
              }
              onClick={() => submit.mutate()}
            >
              <Check className="mr-2 size-6" />
              {confirmLabel} · {formatTraysTubs(trays, tubs)}
            </Button>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
