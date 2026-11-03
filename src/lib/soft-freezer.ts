import { supabase } from "@/integrations/supabase/client";
import type { Unit } from "./gelato";

export type CollectionItem = {
  id: string;
  order_id: string;
  flavour_id: string;
  flavour_name: string;
  qty: number;
  unit: Unit;
  position: number;
  collected_at: string | null;
};

export type CollectionOrder = {
  id: string;
  status: "active" | "completed";
  created_at: string;
  items: CollectionItem[];
};

export async function fetchCollectionOrders(): Promise<CollectionOrder[]> {
  const { data, error } = await supabase.from("soft_freezer_orders")
    .select("*, soft_freezer_order_items(*)")
    .order("created_at", { ascending: false }).limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []).map(({ soft_freezer_order_items, ...order }) => ({
    ...order,
    status: order.status === "completed" ? "completed" : "active",
    items: soft_freezer_order_items.map((item) => ({ ...item, unit: item.unit === "tub" ? "tub" as const : "tray" as const }))
      .sort((a, b) => a.position - b.position),
  }));
}

export async function startCollection(requestId: string, items: { flavour_id: string; qty: number; unit: Unit }[]) {
  const { data, error } = await supabase.rpc("start_soft_freezer_order", { _request_id: requestId, _items: items });
  if (error) throw new Error(error.message);
  return data;
}

export async function collectItem(id: string) {
  const { data, error } = await supabase.rpc("collect_soft_freezer_item", { _item_id: id });
  if (error) throw new Error(error.message);
  return data;
}

export async function finishCollection(id: string) {
  const { data, error } = await supabase.rpc("finish_soft_freezer_order", { _order_id: id });
  if (error) throw new Error(error.message);
  return data;
}
export async function setCollectionItem(args: { orderId: string; flavourId: string; unit: Unit; qty: number }) {
  const { error } = await supabase.rpc("set_soft_freezer_item", {
    _order_id: args.orderId, _flavour_id: args.flavourId, _unit: args.unit, _qty: args.qty,
  });
  if (error) throw new Error(error.message);
}
