import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { planDays, type PlanItem } from "./gelato";

const item = (id: string, group: PlanItem["group"], trays = 4): PlanItem => ({
  flavour_id: id, trays, tubs: 0, group,
});

describe("planDays", () => {
  it("puts sorbetti, gluten and nuts on three different days", () => {
    const plan = planDays([item("s", "sorbetto"), item("g", "gluten"), item("n", "nuts")], 3, 2);
    assert.equal(plan["s"], 2);
    assert.equal(new Set([plan["s"], plan["g"], plan["n"]]).size, 3);
  });
  it("keeps nuts and gluten off the sorbetto day", () => {
    const plan = planDays([item("s", "sorbetto"), item("g", "gluten"), item("n", "nuts")], 4, 1);
    assert.notEqual(plan["g"], 1);
    assert.notEqual(plan["n"], 1);
    assert.notEqual(plan["g"], plan["n"]);
  });
  it("puts plain gelato on the least-full day", () => {
    const plan = planDays([item("s", "sorbetto", 40), item("p", "plain", 8)], 2, 1);
    assert.equal(plan["p"], 2);
  });
});
