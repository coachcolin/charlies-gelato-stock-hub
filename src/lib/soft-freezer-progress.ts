export function collectionProgress(items: { qty: number; unit: "tray" | "tub"; collected_at: string | null }[]) {
  const remaining = items.filter((item) => item.collected_at === null);
  return {
    collected: items.length - remaining.length,
    total: items.length,
    remainingTrays: remaining.filter((item) => item.unit === "tray").reduce((sum, item) => sum + item.qty, 0),
    remainingTubs: remaining.filter((item) => item.unit === "tub").reduce((sum, item) => sum + item.qty, 0),
    complete: items.length > 0 && remaining.length === 0,
  };
}