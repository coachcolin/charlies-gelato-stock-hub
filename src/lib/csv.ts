export type ParsedRow = { name: string; qty: number };

function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === delim && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim().replace(/^"|"$/g, ""));
}

const NAME_KEYS = ["flavour", "flavor", "product", "item", "description", "name", "sku"];
const QTY_KEYS = ["qty", "quantity", "units", "trays", "amount", "count", "ordered"];
const SUPPLIER_KEYS = ["wholesaler", "customer", "client", "account", "company", "buyer"];
const REF_KEYS = ["order", "reference", "ref", "invoice", "number"];

export type CsvResult = {
  rows: ParsedRow[];
  wholesaler: string | null;
  reference: string | null;
  headers: string[];
};

/** Parses a CSV/TSV wholesale order export into flavour + quantity lines. */
export function parseOrderCsv(text: string): CsvResult {
  const clean = text.replace(/\r/g, "");
  const lines = clean.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rows: [], wholesaler: null, reference: null, headers: [] };

  const delim = (lines[0].match(/\t/g) ?? []).length > (lines[0].match(/,/g) ?? []).length ? "\t" : ",";

  // find the header row within the first 10 lines
  let headerIdx = 0;
  let headers: string[] = [];
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const cells = splitLine(lines[i], delim).map((c) => c.toLowerCase());
    const hasName = cells.some((c) => NAME_KEYS.some((k) => c.includes(k)));
    const hasQty = cells.some((c) => QTY_KEYS.some((k) => c.includes(k)));
    if (hasName && hasQty) {
      headerIdx = i;
      headers = cells;
      break;
    }
  }
  if (headers.length === 0) headers = splitLine(lines[0], delim).map((c) => c.toLowerCase());

  const findCol = (keys: string[]) =>
    headers.findIndex((h) => keys.some((k) => h.includes(k)));

  let nameCol = findCol(NAME_KEYS);
  let qtyCol = findCol(QTY_KEYS);
  const supplierCol = findCol(SUPPLIER_KEYS);
  const refCol = findCol(REF_KEYS);
  if (nameCol < 0) nameCol = 0;
  if (qtyCol < 0) qtyCol = headers.length - 1;

  const rows: ParsedRow[] = [];
  let wholesaler: string | null = null;
  let reference: string | null = null;

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = splitLine(lines[i], delim);
    const name = (cells[nameCol] ?? "").trim();
    const qty = Number((cells[qtyCol] ?? "").replace(/[^0-9.\-]/g, ""));
    if (!name || !Number.isFinite(qty) || qty === 0) continue;
    if (/^(total|subtotal|sum)/i.test(name)) continue;
    rows.push({ name, qty: Math.round(Math.abs(qty)) });
    if (supplierCol >= 0 && !wholesaler && cells[supplierCol]) wholesaler = cells[supplierCol];
    if (refCol >= 0 && !reference && cells[refCol]) reference = cells[refCol];
  }

  return { rows, wholesaler, reference, headers };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/gelato|sorbet|tray|trays|\d+\s?l\b/g, "")
    .replace(/[^a-z0-9]/g, "");

/** Best-effort match of an imported line description to a known flavour. */
export function matchFlavour<T extends { id: string; name: string }>(
  raw: string,
  flavours: T[],
): T | null {
  const target = norm(raw);
  if (!target) return null;
  let best: T | null = null;
  let bestScore = 0;
  for (const f of flavours) {
    const n = norm(f.name);
    if (!n) continue;
    let score = 0;
    if (n === target) score = 100;
    else if (target.includes(n)) score = 70 + n.length;
    else if (n.includes(target)) score = 60 + target.length;
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }
  return bestScore > 0 ? best : null;
}
