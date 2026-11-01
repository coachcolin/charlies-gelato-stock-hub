import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { combinedCounts, defaultKeeps, stockTakePayload, parseStockTakeDraft } from "./stock-take";
import type { Flavour } from "./gelato";

const flavour = { id: "cherry", name: "Cherry", stock_qty: 3, tub_qty: 8 } as Flavour;
const ids = ["container", "back", "kitchen"];
describe("overall stock take", () => {
  it("combines three freezer counts against overall trays and tubs", () => {
    const rows = combinedCounts([flavour], ids, { container: { tray: { cherry: 1 }, tub: { cherry: 3 } }, back: { tray: { cherry: 2 }, tub: {} }, kitchen: { tray: {}, tub: { cherry: 5 } } });
    assert.equal(rows[0]?.tray, 3);
    assert.equal(rows[0]?.tub, 8);
    assert.deepEqual(rows[0]?.before, { tray: 3, tub: 8 });
    assert.equal(rows[0]?.seenTray, true);
  });
  it("does not mark stock missing when it was counted in another freezer", () => {
    const row = combinedCounts([flavour], ids, { kitchen: { tray: { cherry: 3 }, tub: {} } })[0];
    assert.equal(row?.seenTray, true);
    assert.equal(row?.seenTub, false);
  });
  it("keeps an unseen overall total, not an inaccurate per-freezer total", () => {
    const rows = combinedCounts([flavour], ids, {});
    const payload = stockTakePayload(rows, ids, {}, [{ flavour_id: "cherry", freezer_id: "container", stock_qty: 10, tub_qty: 0, counted_at: null }], { "cherry|tray": true });
    assert.equal(payload.reduce((s, f) => s + (f.counts[0]?.tray ?? 0), 0), 3);
    assert.equal(payload.reduce((s, f) => s + (f.counts[0]?.tub ?? 0), 0), 0);
  });
  it("restores counts and finished freezers after reopening", () => {
    const draft = { counts: { kitchen: { tray: { cherry: 3 }, tub: {} } }, completed: ["kitchen"] };
    assert.deepEqual(parseStockTakeDraft(JSON.stringify(draft)), draft);
    assert.equal(parseStockTakeDraft('{"completed":[],"counts":{"kitchen":{"tray":{"cherry":-1},"tub":{}}}}'), null);
  });
});