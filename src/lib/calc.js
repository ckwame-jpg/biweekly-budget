import { useMemo } from "react";
import { GROUP_KEYS } from "./theme.js";
import { num, sumLines } from "./format.js";

/**
 * All derived numbers live here. Two inputs only — income and spending —
 * everything else is computed.
 *
 * Math rules (carried over from the user's brief, with the Excel inconsistency fixed):
 *  - Every category total = sum of its line items (Housing includes rent + all utilities + insurance).
 *  - Savings counts inside Total Expenses (pay-yourself-first), so "Money Left Over" is
 *    what's free AFTER you've saved.   [OPEN DECISION — see CLAUDE.md]
 *  - Net Profit = Gross Profit − Total Expenses;  Gross Profit = Income − COGS.
 *  - Savings Rate = Savings ÷ Income.
 *  - Annual projection = current period × 26.
 */
export function computeCalc(state) {
  const incomeBudget = sumLines(state.income);

  const groupBudget = {};
  GROUP_KEYS.forEach((k) => { groupBudget[k] = sumLines(state.groups[k].lines); });

  const expenseBudget = GROUP_KEYS.reduce((a, k) => a + groupBudget[k], 0);
  const leftOverBudget = incomeBudget - expenseBudget;
  const savingsRateBudget = incomeBudget ? groupBudget.savings / incomeBudget : 0;

  // current period actuals (Week 1 + Week 2)
  const lineActual = (id) => num(state.period.week1[id]) + num(state.period.week2[id]);
  const incomeActual = state.income.reduce((a, l) => a + lineActual(l.id), 0);

  const groupActual = {};
  GROUP_KEYS.forEach((k) => {
    groupActual[k] = state.groups[k].lines.reduce((a, l) => a + lineActual(l.id), 0);
  });

  const spentSoFar = GROUP_KEYS.reduce((a, k) => a + groupActual[k], 0);
  const cogs = state.period.cogsOn
    ? num(state.period.cogs.materials) + num(state.period.cogs.labor) + num(state.period.cogs.shipping)
    : 0;

  const anyActual = incomeActual > 0 || spentSoFar > 0;
  const incomeForNet = anyActual ? incomeActual : incomeBudget;
  const grossProfit = incomeForNet - cogs;
  const netProfit = grossProfit - (anyActual ? spentSoFar : expenseBudget);
  const periodLeftOver = anyActual ? incomeActual - spentSoFar : leftOverBudget;
  const savedThisPeriod = anyActual ? groupActual.savings : groupBudget.savings;
  const ratio = expenseBudget ? spentSoFar / expenseBudget : 0;

  // goal tracker — all three bases the user can compare against their goals
  const goal = num(state.goal);
  const goalRatioSavings = goal > 0 ? savedThisPeriod / goal : 0;
  const goalRatioNetProfit = goal > 0 ? netProfit / goal : 0;
  const goalOnTrackSavings = goal > 0 && savedThisPeriod >= goal;
  const goalOnTrackNetProfit = goal > 0 && netProfit >= goal;

  const incomeForRate = anyActual ? incomeActual : incomeBudget;
  const savingsRateThisPeriod = incomeForRate ? savedThisPeriod / incomeForRate : 0;
  const savingsRateGoal = num(state.savingsRateGoal);
  const goalRatioSavingsRate = savingsRateGoal > 0 ? savingsRateThisPeriod / savingsRateGoal : 0;
  const goalOnTrackSavingsRate = savingsRateGoal > 0 && savingsRateThisPeriod >= savingsRateGoal;

  return {
    incomeBudget, groupBudget, expenseBudget, leftOverBudget, savingsRateBudget,
    lineActual, incomeActual, groupActual, spentSoFar, cogs, grossProfit, netProfit,
    periodLeftOver, savedThisPeriod, ratio, anyActual,
    goalRatioSavings, goalRatioNetProfit, goalOnTrackSavings, goalOnTrackNetProfit,
    savingsRateThisPeriod, goalRatioSavingsRate, goalOnTrackSavingsRate,
  };
}

export function useCalc(state) {
  return useMemo(() => computeCalc(state), [state]);
}
