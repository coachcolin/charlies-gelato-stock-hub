export type ProductionPick = { trays: number; tubs: number; day: number };
export type ProductionDraft = {
  id: string;
  picks: Record<string, ProductionPick>;
  ticked: string[];
  dayCount: number;
  notes: Record<string, string>;
  reviewing: boolean;
};

export const PRODUCTION_DRAFT_KEY = "charlies-production-draft-v1";

export function parseProductionDraft(raw: string | null): ProductionDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as ProductionDraft;
    if (!d || typeof d.id !== "string" || !d.picks || !d.notes || !Array.isArray(d.ticked)) return null;
    if (!Number.isInteger(d.dayCount) || d.dayCount < 1 || d.dayCount > 7) return null;
    for (const p of Object.values(d.picks)) {
      if (!Number.isInteger(p.trays) || p.trays < 0 || !Number.isInteger(p.tubs) || p.tubs < 0) return null;
      if (!Number.isInteger(p.day) || p.day < 1 || p.day > 7) return null;
    }
    return d;
  } catch {
    return null;
  }
}

export function productionDays(days: number, assigned: number[]) {
  const count = Math.min(7, Math.max(1, days, ...assigned));
  return Array.from({ length: count }, (_, i) => i + 1);
}