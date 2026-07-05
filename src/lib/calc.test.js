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

  it("switches to actuals once spending is logged in week1/week2", () => {
    let state = makeState({ income: [{ id: "i", amount: 1000 }] });
    state = withGroup(state, "housing", [{ id: "h", amount: 600 }]);
    state = withGroup(state, "savings", [{ id: "s", amount: 100 }]);
    state.period.week1["h"] = 300;
    state.period.week2["h"] = 100;

    const c = computeCalc(state);
    expect(c.anyActual).toBe(true);
    expect(c.groupActual.housing).toBe(400);
    expect(c.spentSoFar).toBe(400);
    expect(c.ratio).toBeCloseTo(400 / 700); // 700 = expenseBudget (600 housing + 100 savings)
  });

  it("income is auto-tracked from the budget — logging income buckets does not change it", () => {
    let state = makeState({ income: [{ id: "i", amount: 1000 }] });
    state = withGroup(state, "housing", [{ id: "h", amount: 600 }]);
    // even if a stale income value sits in a period bucket, income stays budgeted
    state.period.week1["i"] = 9999;
    const c = computeCalc(state);
    expect(c.anyActual).toBe(false); // only spending flips this now
    expect(c.incomeThisPeriod).toBe(1000);
    expect(c.grossProfit).toBe(1000); // income = budget, not the 9999 in the bucket
    expect(c.netProfit).toBe(1000 - 600);
  });

  it("a one-off income override drives this period's numbers without touching the budget", () => {
    let state = makeState({ income: [{ id: "i", amount: 1000 }], savingsRateGoal: 0 });
    state = withGroup(state, "housing", [{ id: "h", amount: 600 }]);
    state = withGroup(state, "savings", [{ id: "s", amount: 100 }]);
    state.period.incomeOverrideOn = true;
    state.period.incomeOverride = 1200; // e.g. overtime this period

    const c = computeCalc(state);
    expect(c.incomeThisPeriod).toBe(1200);
    expect(c.incomeBudget).toBe(1000); // plan is untouched
    expect(c.leftOverBudget).toBe(1000 - 700); // budget view unchanged (700 = 600 + 100 savings)
    expect(c.netProfit).toBe(1200 - 700); // this period reflects the override
    expect(c.savingsRateThisPeriod).toBeCloseTo(100 / 1200);
  });

  it("override off (or missing) falls back to budgeted income", () => {
    let state = makeState({ income: [{ id: "i", amount: 800 }] });
    state = withGroup(state, "housing", [{ id: "h", amount: 300 }]);
    // incomeOverride sits in state but the flag is off — must be ignored
    state.period.incomeOverrideOn = false;
    state.period.incomeOverride = 5000;
    const c = computeCalc(state);
    expect(c.incomeThisPeriod).toBe(800);
    expect(c.netProfit).toBe(800 - 300);
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

describe("computeCalc — debt payoff estimate", () => {
  it("computes periods to payoff from balance ÷ per-period payment, rounded up", () => {
    let state = makeState();
    state = withGroup(state, "debt", [{ id: "cc", amount: 60, balance: 500 }]);
    const c = computeCalc(state);
    expect(c.debtBalance).toBe(500);
    expect(c.debtPaymentPerPeriod).toBe(60);
    expect(c.debtPeriodsToPayoff).toBe(9); // 500/60 = 8.33 -> 9
  });

  it("sums balance across multiple debt lines", () => {
    let state = makeState();
    state = withGroup(state, "debt", [
      { id: "cc", amount: 50, balance: 200 },
      { id: "loan", amount: 100, balance: 800 },
    ]);
    expect(computeCalc(state).debtBalance).toBe(1000);
  });

  it("is 0 (not null/NaN/Infinity) when there's no balance or no payment", () => {
    let state = makeState();
    state = withGroup(state, "debt", [{ id: "cc", amount: 0, balance: 500 }]);
    expect(computeCalc(state).debtPeriodsToPayoff).toBe(0);

    let state2 = makeState();
    state2 = withGroup(state2, "debt", [{ id: "cc", amount: 60, balance: 0 }]);
    expect(computeCalc(state2).debtPeriodsToPayoff).toBe(0);
  });

  it("treats a missing balance field as 0 (old saves without the field)", () => {
    let state = makeState();
    state = withGroup(state, "debt", [{ id: "cc", amount: 60 }]);
    expect(computeCalc(state).debtBalance).toBe(0);
    expect(computeCalc(state).debtPeriodsToPayoff).toBe(0);
  });
});

describe("computeCalc — randomized stress test (100 runs, $45k–$100k salaries)", () => {
  // Deterministic PRNG (mulberry32) so a failure is reproducible from the seed alone.
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = mulberry32(20260701);
  const between = (min, max) => min + rand() * (max - min);

  function randomScenario() {
    const annualSalary = between(45000, 100000);
    const incomePerPeriod = annualSalary / 26;
    // split income across 1-3 income lines
    const incomeLineCount = 1 + Math.floor(rand() * 3);
    let remaining = incomePerPeriod;
    const income = [];
    for (let i = 0; i < incomeLineCount; i++) {
      const amt = i === incomeLineCount - 1 ? remaining : remaining * between(0.3, 0.7);
      income.push({ id: "inc_" + i, amount: Math.max(0, amt) });
      remaining -= amt;
    }

    // random expenses per category, deliberately spanning under- and over-budget scenarios
    const expenseFactor = between(0.5, 1.3); // total planned expenses as a fraction of income
    const totalExpenseTarget = incomePerPeriod * expenseFactor;
    const weights = GROUP_KEYS.map(() => rand());
    const weightSum = weights.reduce((a, w) => a + w, 0);
    const groups = {};
    GROUP_KEYS.forEach((k, i) => {
      const catTotal = totalExpenseTarget * (weights[i] / weightSum);
      const lineCount = 1 + Math.floor(rand() * 3);
      const lines = [];
      let catRemaining = catTotal;
      for (let j = 0; j < lineCount; j++) {
        const amt = j === lineCount - 1 ? catRemaining : catRemaining * between(0.3, 0.7);
        lines.push({ id: `${k}_${j}`, amount: Math.max(0, amt) });
        catRemaining -= amt;
      }
      groups[k] = { lines };
    });

    // randomly log partial/no/full actuals to exercise the anyActual branch both ways
    const loggedFraction = rand(); // 0 = nothing logged, 1 = fully logged
    const week1 = {}, week2 = {};
    if (loggedFraction > 0.15) {
      [...income, ...GROUP_KEYS.flatMap((k) => groups[k].lines)].forEach((l) => {
        if (rand() < loggedFraction) {
          week1[l.id] = l.amount * between(0.4, 0.6);
          week2[l.id] = l.amount * between(0.4, 0.6);
        }
      });
    }

    const goal = between(0, 400);
    const savingsRateGoal = between(0, 0.4);
    const cogsOn = rand() < 0.2;

    return {
      goal, savingsRateGoal, income, groups,
      period: {
        week1, week2,
        cogs: cogsOn
          ? { materials: between(0, 200), labor: between(0, 200), shipping: between(0, 100) }
          : { materials: 0, labor: 0, shipping: 0 },
        cogsOn,
      },
    };
  }

  const isFiniteNum = (n) => typeof n === "number" && Number.isFinite(n);

  it("never produces NaN/Infinity and holds its core invariants across 100 random scenarios", () => {
    for (let run = 0; run < 100; run++) {
      const state = randomScenario();
      const c = computeCalc(state);

      // every numeric field computeCalc returns must be a finite number
      for (const [key, val] of Object.entries(c)) {
        if (typeof val === "function" || typeof val === "boolean") continue;
        if (key === "groupBudget" || key === "groupActual") {
          GROUP_KEYS.forEach((g) => expect(isFiniteNum(val[g]), `${key}.${g} run ${run}`).toBe(true));
          continue;
        }
        expect(isFiniteNum(val), `${key} run ${run}`).toBe(true);
      }

      // core arithmetic invariants
      const expectedExpenseBudget = GROUP_KEYS.reduce((a, k) => a + c.groupBudget[k], 0);
      expect(c.expenseBudget).toBeCloseTo(expectedExpenseBudget, 6);
      expect(c.leftOverBudget).toBeCloseTo(c.incomeBudget - c.expenseBudget, 6);
      expect(c.netProfit).toBeCloseTo(c.grossProfit - (c.anyActual ? c.spentSoFar : c.expenseBudget), 6);
      expect(c.grossProfit).toBeCloseTo(c.incomeBudget - c.cogs, 6); // income is always the budgeted figure now

      // goal ratios: 0 (never NaN/Infinity) whenever the corresponding goal is 0
      if (state.goal <= 0) {
        expect(c.goalRatioSavings).toBe(0);
        expect(c.goalRatioNetProfit).toBe(0);
        expect(c.goalOnTrackSavings).toBe(false);
        expect(c.goalOnTrackNetProfit).toBe(false);
      }
      if (state.savingsRateGoal <= 0) {
        expect(c.goalRatioSavingsRate).toBe(0);
        expect(c.goalOnTrackSavingsRate).toBe(false);
      }

      // ratio (spend pace) is never negative, and 0 when there's no budget to spend against
      expect(c.ratio).toBeGreaterThanOrEqual(0);
      if (c.expenseBudget === 0) expect(c.ratio).toBe(0);
    }
  });
});
