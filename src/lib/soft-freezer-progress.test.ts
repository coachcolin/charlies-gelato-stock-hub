import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { collectionProgress } from "./soft-freezer-progress";

describe("soft freezer collection", () => {
  it("keeps all selected quantities outstanding before anything is ticked", () => {
    assert.deepEqual(collectionProgress([{ qty: 3, unit: "tray", collected_at: null }, { qty: 5, unit: "tub", collected_at: null }]), {
      collected: 0, total: 2, remainingTrays: 3, remainingTubs: 5, complete: false,
    });
  });
  it("counts a ticked line as collected without changing unticked units", () => {
    assert.deepEqual(collectionProgress([{ qty: 3, unit: "tray", collected_at: "2026-11-01T23:00:00Z" }, { qty: 5, unit: "tub", collected_at: null }]), {
      collected: 1, total: 2, remainingTrays: 0, remainingTubs: 5, complete: false,
    });
  });
  it("finishes only after every selected line is collected", () => {
    assert.equal(collectionProgress([{ qty: 3, unit: "tray", collected_at: "2026-11-01T23:00:00Z" }]).complete, true);
    assert.equal(collectionProgress([]).complete, false);
  });
});