export type ParsedRow = { name: string; qty: number };

function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] as string;
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

const NAME_KEYS = ["product name", "flavour", "flavor", "product", "item", "description", "name", "sku"];
const QTY_KEYS = ["quantity", "qty", "units", "trays", "amount", "count", "ordered"];
const CUSTOMER_KEYS = ["customer", "wholesaler", "client", "account", "company", "buyer"];
const ORDER_NO_KEYS = ["order number", "order no", "order #"];
const STATUS_KEYS = ["order status", "status"];
const DELIVERY_KEYS = ["delivery date", "due date", "ship date"];
const REF_KEYS = ["reference", "invoice"];

/** Order statuses that still need fulfilling. */
const OPEN_STATUSES = ["processing", "ordered"];

const SKIP_PRODUCTS = /^(freight|delivery|shipping|total|subtotal|sum)/i;

export type ParsedOrder = {
  /** Order number from the export, when present. */
  orderNumber: string | null;
  customer: string;
  reference: string | null;
  /** ISO yyyy-mm-dd delivery date from the export, when present. */
  deliveryDate: string | null;
  rows: ParsedRow[];
};

export type CsvResult = {
  orders: ParsedOrder[];
  /** Rows dropped because their status was not open (e.g. Delivered). */
  skippedStatus: number;
  headers: string[];
};

/** dd/mm/yyyy hh:mm (or yyyy-mm-dd) -> yyyy-mm-dd */
function toIsoDate(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy)
    return `${dmy[3]}-${String(dmy[2]).padStart(2, "0")}-${String(dmy[1]).padStart(2, "0")}`;
  return null;
}

/** Parses a wholesale sales-platform export into one or more orders. */
export function parseOrderCsv(text: string): CsvResult {
  const clean = text.replace(/\r/g, "");
  const lines = clean.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { orders: [], skippedStatus: 0, headers: [] };

  const first = lines[0] ?? "";
  const delim =
    (first.match(/\t/g) ?? []).length > (first.match(/,/g) ?? []).length ? "\t" : ",";

  let headerIdx = 0;
  let headers: string[] = [];
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const cells = splitLine(lines[i] ?? "", delim).map((c) => c.toLowerCase());
    const hasName = cells.some((c) => NAME_KEYS.some((k) => c.includes(k)));
    const hasQty = cells.some((c) => QTY_KEYS.some((k) => c.includes(k)));
    if (hasName && hasQty) {
      headerIdx = i;
      headers = cells;
      break;
    }
  }
  if (headers.length === 0) headers = splitLine(first, delim).map((c) => c.toLowerCase());

  const findCol = (keys: string[]) => {
    for (const k of keys) {
      const idx = headers.findIndex((h) => h === k);
      if (idx >= 0) return idx;
    }
    return headers.findIndex((h) => keys.some((k) => h.includes(k)));
  };

  let nameCol = findCol(NAME_KEYS);
  let qtyCol = findCol(QTY_KEYS);
  const customerCol = findCol(CUSTOMER_KEYS);
  const orderNoCol = findCol(ORDER_NO_KEYS);
  const statusCol = findCol(STATUS_KEYS);
  const deliveryCol = findCol(DELIVERY_KEYS);
  const refCol = findCol(REF_KEYS);
  if (nameCol < 0) nameCol = 0;
  if (qtyCol < 0) qtyCol = headers.length - 1;

  const map = new Map<string, ParsedOrder>();
  let skippedStatus = 0;

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = splitLine(lines[i] ?? "", delim);
    const name = (cells[nameCol] ?? "").trim();
    const qty = Number((cells[qtyCol] ?? "").replace(/[^0-9.\-]/g, ""));
    if (!name || !Number.isFinite(qty) || qty === 0) continue;
    if (SKIP_PRODUCTS.test(name)) continue;

    if (statusCol >= 0) {
      const status = (cells[statusCol] ?? "").trim().toLowerCase();
      if (!OPEN_STATUSES.includes(status)) {
        skippedStatus++;
        continue;
      }
    }

    const orderNumber = orderNoCol >= 0 ? (cells[orderNoCol] ?? "").trim() || null : null;
    const customer = customerCol >= 0 ? (cells[customerCol] ?? "").trim() : "";
    const key = orderNumber ?? customer ?? "order";

    let order = map.get(key);
    if (!order) {
      order = {
        orderNumber,
        customer: customer || "Unknown wholesaler",
        reference: refCol >= 0 ? (cells[refCol] ?? "").trim() || null : null,
        deliveryDate: deliveryCol >= 0 ? toIsoDate(cells[deliveryCol] ?? "") : null,
        rows: [],
      };
      map.set(key, order);
    }

    const existing = order.rows.find((r) => r.name === name);
    if (existing) existing.qty += Math.round(Math.abs(qty));
    else order.rows.push({ name, qty: Math.round(Math.abs(qty)) });
  }

  return { orders: [...map.values()], skippedStatus, headers };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/gelato|sorbetto|sorbetti|sorbet|flavour|tray|trays|\d+\s?l\b/g, "")
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
