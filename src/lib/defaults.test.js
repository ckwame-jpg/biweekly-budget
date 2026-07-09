import { describe, it, expect } from "vitest";
import { normalizeState, DEFAULT_STATE } from "./defaults.js";
import { computeCalc } from "./calc.js";
import { buildPeriodSnapshot } from "./period.js";
import { GROUP_KEYS } from "./theme.js";

// normalizeState is the single repair funnel for every blob that reaches state:
// initial localStorage load, a cloud pull, and a JSON import. If it lets a
// malformed shape through, computeCalc / period.js / a screen crashes on it —
// and the bad state has already been persisted. These lock that funnel down.

const hasAllGroupLines = (s) => GROUP_KEYS.every((k) => Array.isArray(s.groups[k]?.lines));

describe("normalizeState — always safe to compute", () => {
  it("returns a fully-shaped state for null / undefined / non-object input", () => {
    for (const bad of [null, undefined, 42, "nope", [], NaN]) {
      const s = normalizeState(bad);
      expect(hasAllGroupLines(s)).toBe(true);
      expect(Array.isArray(s.income)).toBe(true);
      expect(Array.isArray(s.history)).toBe(true);
      expect(s.period.week1).toEqual({});
      expect(s.period.week2).toEqual({});
      expect(s.period.cogs).toEqual({ materials: 0, labor: 0, shipping: 0 });
      expect(s.period.locks.week1).toEqual({});
      expect(s.period.locks.week2).toEqual({});
      expect(typeof s.settings.pin).toBe("string");
      expect(() => computeCalc(s)).not.toThrow();
    }
  });
});

describe("normalizeState — group repair", () => {
  it("fills a missing group with default lines while preserving present ones", () => {
    const s = normalizeState({ groups: { housing: { lines: [{ id: "h", amount: 10 }] } } });
    expect(s.groups.housing.lines).toEqual([{ id: "h", amount: 10 }]);
    expect(Array.isArray(s.groups.food.lines)).toBe(true);
    expect(s.groups.food.lines.length).toBeGreaterThan(0);
  });

  it("repairs a group whose lines field is missing or not an array", () => {
    const s = normalizeState({ groups: { food: {}, debt: { lines: "not-an-array" } } });
    expect(Array.isArray(s.groups.food.lines)).toBe(true);
    expect(Array.isArray(s.groups.debt.lines)).toBe(true);
    expect(() => computeCalc(s)).not.toThrow();
  });

  it("drops non-object line and history entries so a render can't crash on them", () => {
    const s = normalizeState({
      income: [{ id: "i", amount: 5 }, null, 7],
      groups: { savings: { lines: [null, { id: "s", amount: 1 }, "x"] } },
      history: [null, { id: "p1", periodNumber: 1, income: 100, totalExpenses: 40, netProfit: 60 }],
    });
    expect(s.income).toEqual([{ id: "i", amount: 5 }]);
    expect(s.groups.savings.lines).toEqual([{ id: "s", amount: 1 }]);
    expect(s.history).toHaveLength(1);
    expect(() => computeCalc(s)).not.toThrow();
  });
});

describe("normalizeState — period repair", () => {
  it("defaults a partial period (only week1 present)", () => {
    const s = normalizeState({ period: { week1: { x: 5 } } });
    expect(s.period.week1).toEqual({ x: 5 });
    expect(s.period.week2).toEqual({});
    expect(s.period.cogsOn).toBe(false);
    expect(s.period.incomeOverrideOn).toBe(false);
    expect(s.period.locks.week2).toEqual({});
  });

  it("coerces cogs / override numbers and never yields NaN", () => {
    const s = normalizeState({ period: { cogs: { materials: "bad", labor: null }, incomeOverride: undefined } });
    expect(s.period.cogs.materials).toBe(0);
    expect(s.period.cogs.labor).toBe(0);
    expect(s.period.incomeOverride).toBe(0);
  });
});

describe("normalizeState — settings & versioning", () => {
  it("merges settings over defaults and forces pin to a string", () => {
    const s = normalizeState({ settings: { darkMode: true, pin: null } });
    expect(s.settings.darkMode).toBe(true);
    expect(s.settings.theme).toBe(DEFAULT_STATE.settings.theme);
    expect(s.settings.pin).toBe("");
  });

  it("fills in fields added in later versions of an older backup", () => {
    const old = { income: [{ id: "i", amount: 100 }], groups: {}, goal: 300 };
    const s = normalizeState(old);
    expect(s.goal).toBe(300); // preserved
    expect(s.savingsRateGoal).toBe(DEFAULT_STATE.savingsRateGoal); // backfilled
    expect(s.payFrequency).toBe(DEFAULT_STATE.payFrequency); // backfilled
  });

  it("preserves unknown / forward-compat keys like _updatedAt", () => {
    const s = normalizeState({ _updatedAt: 12345, income: [] });
    expect(s._updatedAt).toBe(12345);
  });
});

describe("normalizeState — keeps valid data intact", () => {
  it("passes real user data through end to end", () => {
    const good = {
      income: [{ id: "i", amount: 2000 }],
      groups: {
        housing: { lines: [{ id: "h", amount: 800 }] },
        savings: { lines: [{ id: "s", amount: 300 }] },
      },
    };
    const s = normalizeState(good);
    const c = computeCalc(s);
    expect(c.incomeBudget).toBe(2000);
    expect(c.groupBudget.housing).toBe(800);
    expect(c.savedThisPeriod).toBe(300);
    expect(() => buildPeriodSnapshot(s, 1, "2026-01-15")).not.toThrow();
  });
});
