import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseProductionDraft, productionDays, unfinishedProductionItem, matchesProductionFlavour } from "./production-plan";

describe("production persistence", () => {
  it("finds Chocolate Fudge Ripple when staff search choc fudge ripple", () => {
    assert.equal(matchesProductionFlavour("Chocolate Fudge Ripple", "choc fudge ripple"), true);
    assert.equal(matchesProductionFlavour("Chocolate", "choc fudge ripple"), false);
  });
  it("finds Chocolate Fudge Ripple on day 4 so it can be moved to day 2 rather than hidden", () => {
    const item = { id: "existing", flavour_id: "choc-fudge", done: false, day_index: 4, suggested_qty: 7 };
    assert.equal(unfinishedProductionItem([item], "choc-fudge"), item);
    assert.equal(unfinishedProductionItem([{ ...item, done: true }], "choc-fudge"), undefined);
  });
  it("restores chosen trays, tubs, day 7 and notes before the report is started", () => {
    const draft = { id: "saved-plan", picks: { strawberry: { trays: 2, tubs: 5, day: 7 } }, ticked: ["order"], notes: { strawberry: "Make first" }, dayCount: 3, reviewing: true };
    assert.deepEqual(parseProductionDraft(JSON.stringify(draft)), draft);
  });
  it("keeps empty days and the highest assigned day when reopening a week", () => {
    assert.deepEqual(productionDays(3, [1, 7]), [1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(productionDays(7, [1]), [1, 2, 3, 4, 5, 6, 7]);
  });
  it("rejects invalid saved day selectors", () => {
    assert.equal(parseProductionDraft(JSON.stringify({ id: "bad", picks: { f: { trays: 1, tubs: 5, day: 8 } }, ticked: [], notes: {}, dayCount: 2 })), null);
  });
});