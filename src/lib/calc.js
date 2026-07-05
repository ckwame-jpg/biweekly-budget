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

  // Current-period spending actuals (Week 1 + Week 2). Income is NOT logged on
  // Track — it's auto-tracked from the Budget screen (the user only ever enters
  // income once), so income always uses the budgeted figure. Only spending is
  // logged per period, so "actuals" here means spending actuals.
  const lineActual = (id) => num(state.period.week1[id]) + num(state.period.week2[id]);

  const groupActual = {};
  GROUP_KEYS.forEach((k) => {
    groupActual[k] = state.groups[k].lines.reduce((a, l) => a + lineActual(l.id), 0);
  });

  const spentSoFar = GROUP_KEYS.reduce((a, k) => a + groupActual[k], 0);
  const cogs = state.period.cogsOn
    ? num(state.period.cogs.materials) + num(state.period.cogs.labor) + num(state.period.cogs.shipping)
    : 0;

  const anyActual = spentSoFar > 0; // has any spending been logged this period
  const grossProfit = incomeBudget - cogs;
  const netProfit = grossProfit - (anyActual ? spentSoFar : expenseBudget);
  const periodLeftOver = anyActual ? incomeBudget - spentSoFar : leftOverBudget;
  const savedThisPeriod = anyActual ? groupActual.savings : groupBudget.savings;
  const ratio = expenseBudget ? spentSoFar / expenseBudget : 0;

  // goal tracker — all three bases the user can compare against their goals
  const goal = num(state.goal);
  const goalRatioSavings = goal > 0 ? savedThisPeriod / goal : 0;
  const goalRatioNetProfit = goal > 0 ? netProfit / goal : 0;
  const goalOnTrackSavings = goal > 0 && savedThisPeriod >= goal;
  const goalOnTrackNetProfit = goal > 0 && netProfit >= goal;

  const savingsRateThisPeriod = incomeBudget ? savedThisPeriod / incomeBudget : 0;
  const savingsRateGoal = num(state.savingsRateGoal);
  const goalRatioSavingsRate = savingsRateGoal > 0 ? savingsRateThisPeriod / savingsRateGoal : 0;
  const goalOnTrackSavingsRate = savingsRateGoal > 0 && savingsRateThisPeriod >= savingsRateGoal;

  // debt payoff estimate — the one place a balance (not derivable from income/spending)
  // is entered, on each debt line item, alongside its per-period payment amount.
  const debtBalance = sumLines(state.groups.debt.lines, (l) => l.balance);
  const debtPaymentPerPeriod = groupBudget.debt;
  const debtPeriodsToPayoff = debtBalance > 0 && debtPaymentPerPeriod > 0
    ? Math.ceil(debtBalance / debtPaymentPerPeriod) : 0;

  return {
    incomeBudget, groupBudget, expenseBudget, leftOverBudget, savingsRateBudget,
    lineActual, groupActual, spentSoFar, cogs, grossProfit, netProfit,
    periodLeftOver, savedThisPeriod, ratio, anyActual,
    goalRatioSavings, goalRatioNetProfit, goalOnTrackSavings, goalOnTrackNetProfit,
    savingsRateThisPeriod, goalRatioSavingsRate, goalOnTrackSavingsRate,
    debtBalance, debtPaymentPerPeriod, debtPeriodsToPayoff,
  };
}

export function useCalc(state) {
  return useMemo(() => computeCalc(state), [state]);
}
