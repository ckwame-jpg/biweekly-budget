import { describe, it, expect } from "vitest";
import { GROUP_KEYS } from "./theme.js";
import { autoRollover, buildPeriodSnapshot, periodHasSpending, cycleDaysFor, addDays } from "./period.js";

function makeState(overrides = {}) {
  const groups = {};
  GROUP_KEYS.forEach((k) => { groups[k] = { lines: [] }; });
  return {
    payFrequency: "biweekly",
    periodStart: "2026-01-01",
    income: [{ id: "i", amount: 1000 }],
    groups,
    period: { week1: {}, week2: {}, cogs: { materials: 0, labor: 0, shipping: 0 }, cogsOn: false, incomeOverrideOn: false, incomeOverride: 0, locks: { week1: {}, week2: {} } },
    history: [],
    ...overrides,
  };
}
const withGroup = (s, k, lines) => ({ ...s, groups: { ...s.groups, [k]: { lines } } });

describe("cycleDaysFor", () => {
  it("maps each frequency (job has no cycle)", () => {
    expect(cycleDaysFor("weekly")).toBe(7);
    expect(cycleDaysFor("biweekly")).toBe(14);
    expect(cycleDaysFor("job")).toBe(0);
    expect(cycleDaysFor(undefined)).toBe(14);
  });
});

describe("addDays", () => {
  it("advances an ISO date by whole days across a month boundary", () => {
    expect(addDays("2026-01-20", 14)).toBe("2026-02-03");
  });
});

describe("buildPeriodSnapshot", () => {
  it("uses budgeted income and sums week1+week2 per category", () => {
    let s = makeState();
    s = withGroup(s, "food", [{ id: "f", amount: 100 }]);
    s.period.week1 = { f: 40 };
    s.period.week2 = { f: 35 };
    const snap = buildPeriodSnapshot(s, 1, "2026-01-15");
    expect(snap.income).toBe(1000);
    expect(snap.food).toBe(75);
    expect(snap.totalExpenses).toBe(75);
    expect(snap.netProfit).toBe(925);
    expect(snap.payDate).toBe("2026-01-15");
    expect(snap.periodNumber).toBe(1);
  });

  it("uses the income override when it's on", () => {
    const s = makeState();
    s.period.incomeOverrideOn = true;
    s.period.incomeOverride = 1250;
    expect(buildPeriodSnapshot(s, 1, "2026-01-15").income).toBe(1250);
  });
});

describe("periodHasSpending", () => {
  it("is true only when a logged actual is > 0", () => {
    let s = withGroup(makeState(), "food", [{ id: "f", amount: 100 }]);
    expect(periodHasSpending(s)).toBe(false);
    s.period.week1 = { f: 10 };
    expect(periodHasSpending(s)).toBe(true);
  });
});

describe("autoRollover", () => {
  it("does nothing while the current period is still ongoing", () => {
    const s = makeState({ periodStart: "2026-01-01" }); // biweekly -> ends 2026-01-15
    expect(autoRollover(s, new Date("2026-01-10T12:00:00"))).toBeNull();
  });

  it("archives a period with spending once it ends, then rolls forward one cycle", () => {
    let s = makeState({ periodStart: "2026-01-01" });
    s = withGroup(s, "food", [{ id: "f", amount: 100 }]);
    s.period.week1 = { f: 30 };
    s.period.week2 = { f: 20 };
    const res = autoRollover(s, new Date("2026-01-20T09:00:00"));
    expect(res).not.toBeNull();
    expect(res.saved).toBe(true);
    expect(res.next.history).toHaveLength(1);
    expect(res.next.history[0].food).toBe(50);
    expect(res.next.history[0].income).toBe(1000);
    expect(res.next.history[0].payDate).toBe("2026-01-15");
    expect(res.next.periodStart).toBe("2026-01-15"); // ongoing period contains 01-20
    expect(res.next.period.week1).toEqual({}); // reset for the fresh period
  });

  it("advances the date but writes no entry for an empty ended period", () => {
    const s = makeState({ periodStart: "2026-01-01" }); // ended, nothing logged
    const res = autoRollover(s, new Date("2026-01-20T09:00:00"));
    expect(res).not.toBeNull();
    expect(res.saved).toBe(false);
    expect(res.next.history).toHaveLength(0);
    expect(res.next.periodStart).toBe("2026-01-15");
  });

  it("after several missed cycles, saves only the tracked period and fast-forwards", () => {
    let s = makeState({ periodStart: "2026-01-01" });
    s = withGroup(s, "food", [{ id: "f", amount: 100 }]);
    s.period.week1 = { f: 50 };
    // 2026-02-15 is ~6 weeks later => 3 full biweekly periods elapsed
    const res = autoRollover(s, new Date("2026-02-15T09:00:00"));
    expect(res.next.history).toHaveLength(1); // only the first (tracked) one
    expect(res.next.history[0].food).toBe(50);
    expect(res.next.periodStart).toBe("2026-02-12"); // 01-01 +14 +14 +14
  });

  it("counts an income override as worth archiving even with no spending", () => {
    const s = makeState({ periodStart: "2026-01-01" });
    s.period.incomeOverrideOn = true;
    s.period.incomeOverride = 900;
    const res = autoRollover(s, new Date("2026-01-20T09:00:00"));
    expect(res.saved).toBe(true);
    expect(res.next.history[0].income).toBe(900);
  });

  it("never auto-rolls a by-the-job budget (no fixed cycle)", () => {
    const s = makeState({ payFrequency: "job", periodStart: "2026-01-01" });
    expect(autoRollover(s, new Date("2027-01-01T09:00:00"))).toBeNull();
  });

  it("respects weekly cadence (7-day cycle)", () => {
    let s = makeState({ payFrequency: "weekly", periodStart: "2026-01-01" });
    s = withGroup(s, "food", [{ id: "f", amount: 50 }]);
    s.period.week1 = { f: 25 };
    const res = autoRollover(s, new Date("2026-01-10T09:00:00")); // 01-01 ends 01-08
    expect(res.next.history).toHaveLength(1);
    expect(res.next.periodStart).toBe("2026-01-08");
  });
});
