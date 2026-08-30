import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { matchFlavour, parseOrderCsv, type ParsedOrder } from "@/lib/csv";

import { applyMovements, db, fetchFlavours, fetchOrders, type Flavour } from "@/lib/gelato";

export const Route = createFileRoute("/wholesale")({
  head: () => ({
    meta: [
      { title: "Wholesale Orders — Charlie's Gelato" },
      {
        name: "description",
        content:
          "Import wholesale gelato orders from a CSV export, check stock cover, and mark orders complete at Charlie's Gelato.",
      },
      { property: "og:title", content: "Wholesale Orders — Charlie's Gelato" },
      {
        property: "og:description",
        content: "Import, edit and complete bulk gelato orders with live stock cover.",
      },
    ],
  }),
  component: WholesalePage,
});

function WholesalePage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<ParsedOrder[] | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [dueDate, setDueDate] = useState("");
  const [manualOpen, setManualOpen] = useState(false);

  const flavours = useQuery({ queryKey: ["flavours"], queryFn: fetchFlavours });
  const orders = useQuery({ queryKey: ["orders"], queryFn: fetchOrders });

  const activeOrders = (orders.data ?? []).filter((o) => o.status === "active");
  const doneOrders = (orders.data ?? []).filter((o) => o.status === "completed");

  const importOrders = useMutation({
    mutationFn: async ({ list, due }: { list: ParsedOrder[]; due: string }) => {
      const known = flavours.data ?? [];
      const existingRefs = new Set(
        (orders.data ?? []).map((o) => o.reference).filter(Boolean) as string[],
      );
      let created = 0;
      let unmatched = 0;
      let duplicates = 0;

      for (const po of list) {
        const ref = po.orderNumber ?? po.reference;
        if (ref && existingRefs.has(ref)) {
          duplicates++;
          continue;
        }
        const items = po.rows.map((r) => {
          const match = matchFlavour(r.name, known);
          if (!match) unmatched++;
          return {
            flavour_id: match?.id ?? null,
            flavour_name: match?.name ?? r.name,
            qty: r.qty,
          };
        });
        const orderRes = await db
          .from("wholesale_orders")
          .insert({
            wholesaler: po.customer,
            reference: ref,
            is_future: true,
            send_date: due,
          })
          .select("id")
          .single();
        if (orderRes.error) throw new Error(orderRes.error.message);
        const itemsRes = await db
          .from("wholesale_order_items")
          .insert(items.map((i) => ({ ...i, order_id: orderRes.data.id as string })));
        if (itemsRes.error) throw new Error(itemsRes.error.message);
        created++;
      }
      return { created, unmatched, duplicates };
    },
    onSuccess: (r) => {
      qc.invalidateQueries();
      setPending(null);
      toast.success(
        `Imported ${r.created} order${r.created === 1 ? "" : "s"}` +
          (r.unmatched ? ` · ${r.unmatched} lines need matching` : "") +
          (r.duplicates ? ` · ${r.duplicates} already imported` : ""),
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Wholesale Orders" subtitle={`${activeOrders.length} active`}>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.tsv,.txt,text/csv"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          const parsed = parseOrderCsv(await file.text());
          if (parsed.orders.length === 0) {
            toast.error(
              parsed.skippedStatus
                ? "No orders to import — every line was already delivered."
                : "Couldn't find any flavour/quantity rows in that file.",
            );
            return;
          }
          setSkipped(parsed.skippedStatus);
          setDueDate(
            parsed.orders.find((o) => o.deliveryDate)?.deliveryDate ??
              new Date().toISOString().slice(0, 10),
          );
          setPending(parsed.orders);
        }}
      />
      <Button
        className="mb-5 h-16 w-full rounded-2xl text-lg"
        onClick={() => fileRef.current?.click()}
      >
        <Upload className="mr-2 size-5" /> Import order (CSV)
      </Button>

      <Dialog open={Boolean(pending)} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">
              {pending?.length ?? 0} order{pending?.length === 1 ? "" : "s"} to import
            </DialogTitle>
            <DialogDescription>
              Only orders marked Processing or Ordered are imported
              {skipped ? ` · ${skipped} delivered lines skipped` : ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-52 space-y-1 overflow-y-auto text-sm">
            {(pending ?? []).map((o) => (
              <p key={o.orderNumber ?? o.customer} className="flex justify-between gap-3">
                <span className="truncate">{o.customer}</span>
                <span className="shrink-0 text-muted-foreground">
                  {o.rows.reduce((s, r) => s + r.qty, 0)} trays
                </span>
              </p>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="due-date">Due date</Label>
            <Input
              id="due-date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="h-12"
            />
          </div>
          <Button
            className="h-14 w-full rounded-2xl text-base"
            disabled={!dueDate || importOrders.isPending}
            onClick={() => pending && importOrders.mutate({ list: pending, due: dueDate })}
          >
            {importOrders.isPending ? "Importing…" : "Import orders"}
          </Button>
        </DialogContent>
      </Dialog>


      <Tabs defaultValue="active">
        <TabsList className="mb-4 grid h-12 w-full grid-cols-2 rounded-2xl">
          <TabsTrigger value="active" className="h-10 rounded-xl">
            Active ({activeOrders.length})
          </TabsTrigger>
          <TabsTrigger value="completed" className="h-10 rounded-xl">
            Completed ({doneOrders.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="active" className="space-y-4">
          {activeOrders.map((o) => (
            <ActiveOrderCard key={o.id} order={o} flavours={flavours.data ?? []} />
          ))}
          {activeOrders.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No active orders. Import a CSV export to get started.
            </p>
          ) : null}
        </TabsContent>
        <TabsContent value="completed" className="space-y-3">
          {doneOrders.map((o) => (
            <div key={o.id} className="surface p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-sky" />
                <p className="font-display text-base">{o.wholesaler}</p>
                <span className="ml-auto text-xs text-muted-foreground">
                  {o.completed_at ? new Date(o.completed_at).toLocaleDateString() : ""}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {o.items.reduce((s, i) => s + i.qty, 0)} trays ·{" "}
                {o.items.map((i) => `${i.flavour_name} ×${i.qty}`).join(", ")}
              </p>
            </div>
          ))}
          {doneOrders.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Completed orders will be kept here.
            </p>
          ) : null}
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

type OrderWithItems = Awaited<ReturnType<typeof fetchOrders>>[number];

function ActiveOrderCard({ order, flavours }: { order: OrderWithItems; flavours: Flavour[] }) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries();

  const stockOf = (id: string | null) =>
    id ? (flavours.find((f) => f.id === id)?.stock_qty ?? 0) : 0;

  const shortfalls = useMemo(
    () => order.items.filter((i) => i.flavour_id && i.qty > stockOf(i.flavour_id)),
    [order.items, flavours],
  );

  const patchOrder = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const res = await db.from("wholesale_orders").update(patch).eq("id", order.id);
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const patchItem = useMutation({
    mutationFn: async ({ id, qty }: { id: string; qty: number }) => {
      const res = await db.from("wholesale_order_items").update({ qty }).eq("id", id);
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const removeItem = useMutation({
    mutationFn: async (id: string) => {
      const res = await db.from("wholesale_order_items").delete().eq("id", id);
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: refresh,
  });

  const setItemFlavour = useMutation({
    mutationFn: async ({ id, flavour }: { id: string; flavour: Flavour }) => {
      const res = await db
        .from("wholesale_order_items")
        .update({ flavour_id: flavour.id, flavour_name: flavour.name })
        .eq("id", id);
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: refresh,
  });

  const complete = useMutation({
    mutationFn: async () => {
      const lines = order.items
        .filter((i) => i.flavour_id)
        .map((i) => ({ flavour_id: i.flavour_id as string, qty: -i.qty }));
      await applyMovements(lines, "wholesale", `Wholesale: ${order.wholesaler}`, order.id);
      const res = await db
        .from("wholesale_orders")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", order.id);
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => {
      refresh();
      toast.success("Order completed and stock deducted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteOrder = useMutation({
    mutationFn: async () => {
      await db.from("wholesale_order_items").delete().eq("order_id", order.id);
      const res = await db.from("wholesale_orders").delete().eq("id", order.id);
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: refresh,
  });

  return (
    <div className="surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          defaultValue={order.wholesaler}
          onBlur={(e) =>
            e.target.value.trim() && patchOrder.mutate({ wholesaler: e.target.value.trim() })
          }
          className="h-11 max-w-[16rem] flex-1 font-display text-base"
          aria-label="Wholesaler"
        />
        <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
          {order.items.reduce((s, i) => s + i.qty, 0)} trays
        </span>
      </div>
      {order.reference ? (
        <p className="mt-1 text-xs text-muted-foreground">Ref {order.reference}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-muted px-3 py-2.5">
        <Label htmlFor={`future-${order.id}`} className="text-sm">
          Future order
        </Label>
        <Switch
          id={`future-${order.id}`}
          checked={order.is_future}
          onCheckedChange={(v) =>
            patchOrder.mutate({ is_future: v, send_date: v ? order.send_date : null })
          }
        />
        {order.is_future ? (
          <Input
            type="date"
            value={order.send_date ?? ""}
            onChange={(e) => patchOrder.mutate({ send_date: e.target.value || null })}
            className="h-10 w-auto"
            aria-label="Send date"
          />
        ) : null}
      </div>

      {shortfalls.length > 0 ? (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-accent px-3 py-2 text-sm text-accent-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Not enough stock for {shortfalls.map((s) => s.flavour_name).join(", ")}.
        </p>
      ) : null}

      <div className="mt-3 space-y-2">
        {order.items.map((i) => {
          const stock = stockOf(i.flavour_id);
          const short = Boolean(i.flavour_id) && i.qty > stock;
          return (
            <div key={i.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{i.flavour_name}</span>
                {i.flavour_id ? (
                  <span
                    className={`text-xs ${short ? "text-primary" : "text-muted-foreground"}`}
                  >
                    {stock} in stock
                  </span>
                ) : (
                  <select
                    className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-1 text-xs"
                    defaultValue=""
                    onChange={(e) => {
                      const f = flavours.find((x) => x.id === e.target.value);
                      if (f) setItemFlavour.mutate({ id: i.id, flavour: f });
                    }}
                  >
                    <option value="">Match to a flavour…</option>
                    {flavours.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                )}
              </span>
              <Input
                type="number"
                inputMode="numeric"
                defaultValue={i.qty}
                onBlur={(e) =>
                  patchItem.mutate({ id: i.id, qty: Math.max(0, Number(e.target.value) || 0) })
                }
                className="h-11 w-20 text-center font-display"
                aria-label={`${i.flavour_name} quantity`}
              />
              <button
                type="button"
                onClick={() => removeItem.mutate(i.id)}
                className="flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                aria-label={`Remove ${i.flavour_name}`}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex gap-2">
        <Button
          className="h-13 flex-1 rounded-2xl"
          disabled={complete.isPending}
          onClick={() => complete.mutate()}
        >
          Mark as sent
        </Button>
        <Button
          variant="outline"
          className="h-13 rounded-2xl"
          onClick={() => deleteOrder.mutate()}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}
