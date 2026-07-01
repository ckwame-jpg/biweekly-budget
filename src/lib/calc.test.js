import { describe, it, expect } from "vitest";
import { computeCalc } from "./calc.js";
import { GROUP_KEYS } from "./theme.js";

// Minimal valid state builder — every field computeCalc reads, with sane defaults.
// Tests override only what they care about.
function makeState(overrides = {}) {
  const emptyGroups = {};
  GROUP_KEYS.forEach((k) => { emptyGroups[k] = { lines: [] }; });

  return {
    goal: 0,
    savingsRateGoal: 0,
    income: [],
    groups: emptyGroups,
    period: { week1: {}, week2: {}, cogs: { materials: 0, labor: 0, shipping: 0 }, cogsOn: false },
    ...overrides,
  };
}

function withGroup(state, key, lines) {
  return { ...state, groups: { ...state.groups, [key]: { lines } } };
}

describe("computeCalc — budget totals", () => {
  it("sums income lines into incomeBudget", () => {
    const state = makeState({ income: [{ id: "a", amount: 1000 }, { id: "b", amount: 500 }] });
    expect(computeCalc(state).incomeBudget).toBe(1500);
  });

  it("sums every line item in a category, not just the first (the Excel bug this app fixes)", () => {
    let state = makeState();
    state = withGroup(state, "housing", [
      { id: "rent", amount: 600 },
      { id: "electric", amount: 80 },
      { id: "insurance", amount: 20 },
    ]);
    expect(computeCalc(state).groupBudget.housing).toBe(700);
  });

  it("expenseBudget is the sum of all six category totals", () => {
    let state = makeState();
    state = withGroup(state, "housing", [{ id: "h", amount: 500 }]);
    state = withGroup(state, "food", [{ id: "f", amount: 200 }]);
    state = withGroup(state, "savings", [{ id: "s", amount: 100 }]);
    expect(computeCalc(state).expenseBudget).toBe(800);
  });

  it("leftOverBudget is income minus total expenses (savings stays inside expenses)", () => {
    let state = makeState({ income: [{ id: "i", amount: 1000 }] });
    state = withGroup(state, "housing", [{ id: "h", amount: 600 }]);
    state = withGroup(state, "savings", [{ id: "s", amount: 200 }]);
    expect(computeCalc(state).leftOverBudget).toBe(200);
  });

  it("savingsRateBudget is savings ÷ income, and 0 when income is 0", () => {
    let state = makeState({ income: [{ id: "i", amount: 1000 }] });
    state = withGroup(state, "savings", [{ id: "s", amount: 250 }]);
    expect(computeCalc(state).savingsRateBudget).toBeCloseTo(0.25);

    const zeroIncome = withGroup(makeState(), "savings", [{ id: "s", amount: 250 }]);
    expect(computeCalc(zeroIncome).savingsRateBudget).toBe(0);
  });
});

describe("computeCalc — actual vs. budget switching", () => {
  it("falls back to budget numbers when nothing has been logged this period", () => {
    let state = makeState({ income: [{ id: "i", amount: 1000 }] });
    state = withGroup(state, "housing", [{ id: "h", amount: 600 }]);
    state = withGroup(state, "savings", [{ id: "s", amount: 100 }]);
    const c = computeCalc(state);
    expect(c.anyActual).toBe(false);
    expect(c.periodLeftOver).toBe(c.leftOverBudget);
    expect(c.savedThisPeriod).toBe(100);
    expect(c.ratio).toBe(0); // nothing spent so far
  });

  it("switches to actuals once anything is logged in week1/week2", () => {
    let state = makeState({ income: [{ id: "i", amount: 1000 }] });
    state = withGroup(state, "housing", [{ id: "h", amount: 600 }]);
    state = withGroup(state, "savings", [{ id: "s", amount: 100 }]);
    state.period.week1["h"] = 300;
    state.period.week2["h"] = 100;
    state.period.week1["i"] = 1000;

    const c = computeCalc(state);
    expect(c.anyActual).toBe(true);
    expect(c.incomeActual).toBe(1000);
    expect(c.groupActual.housing).toBe(400);
    expect(c.spentSoFar).toBe(400);
    expect(c.ratio).toBeCloseTo(400 / 700); // 700 = expenseBudget (600 housing + 100 savings)
  });

  it("sums week1 + week2 for a single line item", () => {
    let state = makeState();
    state = withGroup(state, "food", [{ id: "groceries", amount: 100 }]);
    state.period.week1["groceries"] = 40;
    state.period.week2["groceries"] = 35;
    expect(computeCalc(state).lineActual("groceries")).toBe(75);
  });
});

describe("computeCalc — profit / COGS", () => {
  it("subtracts COGS from income for grossProfit only when cogsOn is true", () => {
    let state = makeState({ income: [{ id: "i", amount: 1000 }] });
    state.period.cogsOn = true;
    state.period.cogs = { materials: 100, labor: 50, shipping: 20 };
    expect(computeCalc(state).cogs).toBe(170);

    state.period.cogsOn = false;
    expect(computeCalc(state).cogs).toBe(0);
  });

  it("netProfit = income − COGS − expenses, using budget figures when nothing is logged", () => {
    let state = makeState({ income: [{ id: "i", amount: 1000 }] });
    state = withGroup(state, "housing", [{ id: "h", amount: 600 }]);
    const c = computeCalc(state);
    expect(c.netProfit).toBe(1000 - 0 - 600);
  });

  it("netProfit can go negative when expenses exceed income", () => {
    let state = makeState({ income: [{ id: "i", amount: 500 }] });
    state = withGroup(state, "housing", [{ id: "h", amount: 900 }]);
    expect(computeCalc(state).netProfit).toBe(500 - 900);
  });
});

describe("computeCalc — goal tracking", () => {
  function goalState(savedAmount, netProfitTarget, goal, savingsRateGoal) {
    let state = makeState({ income: [{ id: "i", amount: 1000 }], goal, savingsRateGoal });
    state = withGroup(state, "savings", [{ id: "s", amount: savedAmount }]);
    if (netProfitTarget !== undefined) {
      // force a specific expenseBudget so netProfit lands on netProfitTarget
      state = withGroup(state, "housing", [{ id: "h", amount: 1000 - savedAmount - netProfitTarget }]);
    }
    return state;
  }

  it("goalRatioSavings / goalOnTrackSavings compare savedThisPeriod to the $ goal", () => {
    const under = computeCalc(goalState(50, undefined, 200, 0));
    expect(under.goalRatioSavings).toBeCloseTo(0.25);
    expect(under.goalOnTrackSavings).toBe(false);

    const met = computeCalc(goalState(200, undefined, 200, 0));
    expect(met.goalRatioSavings).toBeCloseTo(1);
    expect(met.goalOnTrackSavings).toBe(true);
  });

  it("goal of 0 means no goal is tracked (ratio 0, never on-track)", () => {
    const c = computeCalc(goalState(500, undefined, 0, 0));
    expect(c.goalRatioSavings).toBe(0);
    expect(c.goalOnTrackSavings).toBe(false);
  });

  it("goalRatioNetProfit is not clamped and can be negative", () => {
    let state = makeState({ income: [{ id: "i", amount: 500 }], goal: 200 });
    state = withGroup(state, "housing", [{ id: "h", amount: 900 }]); // netProfit = -400
    const c = computeCalc(state);
    expect(c.netProfit).toBe(-400);
    expect(c.goalRatioNetProfit).toBeCloseTo(-2);
    expect(c.goalOnTrackNetProfit).toBe(false);
  });

  it("savingsRateThisPeriod and its goal ratio use whichever income basis is active", () => {
    let state = makeState({ income: [{ id: "i", amount: 1000 }], savingsRateGoal: 0.2 });
    state = withGroup(state, "savings", [{ id: "s", amount: 150 }]);
    const budgetPhase = computeCalc(state);
    expect(budgetPhase.savingsRateThisPeriod).toBeCloseTo(0.15);
    expect(budgetPhase.goalRatioSavingsRate).toBeCloseTo(0.75);
    expect(budgetPhase.goalOnTrackSavingsRate).toBe(false);

    state.period.week1["i"] = 1000;
    state.period.week1["s"] = 250;
    const actualPhase = computeCalc(state);
    expect(actualPhase.savingsRateThisPeriod).toBeCloseTo(0.25);
    expect(actualPhase.goalOnTrackSavingsRate).toBe(true);
  });

  it("savingsRateThisPeriod is 0 (not NaN/Infinity) when income is 0", () => {
    const state = withGroup(makeState({ savingsRateGoal: 0.2 }), "savings", [{ id: "s", amount: 50 }]);
    const c = computeCalc(state);
    expect(c.savingsRateThisPeriod).toBe(0);
    expect(Number.isFinite(c.goalRatioSavingsRate)).toBe(true);
  });
});
