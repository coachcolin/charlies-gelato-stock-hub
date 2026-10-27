import { describe, expect, it } from "vitest";
import { planDays, type PlanItem } from "./gelato";

const item = (id: string, group: PlanItem["group"], trays = 4): PlanItem => ({
  flavour_id: id, trays, tubs: 0, group,
});

describe("planDays", () => {
  it("puts sorbetti, gluten and nuts on three different days", () => {
    const plan = planDays([item("s", "sorbetto"), item("g", "gluten"), item("n", "nuts")], 3, 2);
    expect(plan.s).toBe(2);
    expect(new Set([plan.s, plan.g, plan.n]).size).toBe(3);
  });
  it("keeps nuts and gluten off the sorbetto day", () => {
    const plan = planDays([item("s", "sorbetto"), item("g", "gluten"), item("n", "nuts")], 4, 1);
    expect(plan.g).not.toBe(1);
    expect(plan.n).not.toBe(1);
    expect(plan.g).not.toBe(plan.n);
  });
  it("puts plain gelato on the least-full day", () => {
    const plan = planDays([item("s", "sorbetto", 40), item("p", "plain", 8)], 2, 1);
    expect(plan.p).toBe(2);
  });
});
