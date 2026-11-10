import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchFlavour, parseOrderCsv } from "./csv";

const flavours = [
  { id: "walnut", name: "Coffee and Walnut" },
  { id: "coffee", name: "Coffee" },
  { id: "strawberry", name: "Strawberry" },
];

describe("wholesale flavour matching", () => {
  it("assigns Coffee to Coffee, not Coffee and Walnut", () => {
    assert.equal(matchFlavour("Coffee", flavours)?.id, "coffee");
    assert.equal(matchFlavour("Coffee gelato 5L tray", flavours)?.id, "coffee");
  });
  it("matches packaging and punctuation without losing the full flavour", () => {
    assert.equal(matchFlavour("Coffee & Walnut Gelato - 5 litres", flavours)?.id, "walnut");
  });
  it("does not assign a short name to a different compound flavour", () => {
    assert.equal(matchFlavour("Coffee", [flavours[0]].filter((f) => f !== undefined)), null);
  });
  it("leaves ambiguous descriptions for staff to choose", () => {
    assert.equal(matchFlavour("Coffee / Strawberry", flavours), null);
    assert.equal(matchFlavour("Coffee", [...flavours, { id: "duplicate", name: "Coffee gelato" }]), null);
  });
  it("handles a clear typo but not unrelated wording", () => {
    assert.equal(matchFlavour("Strawbery", flavours)?.id, "strawberry");
    assert.equal(matchFlavour("Mystery flavour", flavours), null);
  });
  it("does not automatically choose inactive flavours", () => {
    assert.equal(matchFlavour("Coffee", [{ id: "old", name: "Coffee", active: false }]), null);
  });
  it("keeps tray and tub quantities separate in an upload", () => {
    const result = parseOrderCsv("Customer,Product name,Quantity,Unit\nTest,Coffee gelato,2,tray\nTest,Coffee gelato,3,tub");
    assert.deepEqual(result.orders[0]?.rows.map(({ qty, unit }) => ({ qty, unit })), [
      { qty: 2, unit: "tray" }, { qty: 3, unit: "tub" },
    ]);
  });
});