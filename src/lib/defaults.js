import { GROUP_KEYS } from "./theme.js";
import { num } from "./format.js";
import { normalizeHistory } from "./period.js";

// Starter state. These dollar amounts are just placeholders carried over from
// the original Excel — the user overwrites them on the Budget screen.
// All category totals are computed as the sum of their line items (see calc.js),
// so the bi-weekly view and the profit view always agree.

export const DEFAULT_STATE = {
  settings: { name: "", pinEnabled: false, pin: "", darkMode: false, theme: "classic", themeFx: true, hasSeenWelcome: false },
  goal: 200, // bi-weekly savings goal ($)
  savingsRateGoal: 0.2, // target share of income saved (decimal, e.g. 0.2 = 20%)
  monthlyPaychecks: 2, // 2/3 (biweekly), 4/5 (weekly), or 1 (by the job)
  payFrequency: "biweekly", // "biweekly" | "weekly" | "job"
  periodStart: new Date().toISOString().slice(0, 10), // start of the current pay cycle
  income: [
    { id: "inc_p1", name: "Paycheck #1", amount: 1600 },
    { id: "inc_p2", name: "Paycheck #2", amount: 0 },
    { id: "inc_bonus", name: "Extra / Bonus", amount: 0 },
    { id: "inc_side", name: "Side Hustle / Other", amount: 0 },
  ],
  groups: {
    housing: { lines: [
      { id: "h_rent", name: "Rent / Mortgage", amount: 600 },
      { id: "h_util", name: "Electric / Gas", amount: 80 },
      { id: "h_water", name: "Water / Trash", amount: 30 },
      { id: "h_net", name: "Internet", amount: 50 },
      { id: "h_ins", name: "Renters Insurance", amount: 20 },
    ]},
    food: { lines: [
      { id: "f_groc", name: "Groceries", amount: 160 },
      { id: "f_out", name: "Eating Out", amount: 80 },
      { id: "f_coffee", name: "Coffee / Drinks", amount: 30 },
    ]},
    transport: { lines: [
      { id: "t_gas", name: "Gas", amount: 80 },
      { id: "t_ins", name: "Car Insurance", amount: 50 },
      { id: "t_pay", name: "Car Payment", amount: 140 },
      { id: "t_bus", name: "Bus / Rideshare", amount: 0 },
      { id: "t_maint", name: "Maintenance", amount: 20 },
    ]},
    debt: { lines: [
      { id: "d_cc", name: "Credit Card", amount: 50, balance: 0 },
      { id: "d_loan", name: "Student Loans", amount: 60, balance: 0 },
      { id: "d_med", name: "Medical Bills", amount: 0, balance: 0 },
      { id: "d_other", name: "Other Debt", amount: 0, balance: 0 },
    ]},
    savings: { lines: [
      { id: "s_ef", name: "Emergency Fund", amount: 50 },
      { id: "s_goal", name: "Savings Goal", amount: 40 },
      { id: "s_401k", name: "401k Extra", amount: 0 },
    ]},
    personal: { lines: [
      { id: "p_cloth", name: "Clothing", amount: 20 },
      { id: "p_ent", name: "Entertainment / Streaming", amount: 30 },
      { id: "p_health", name: "Health / Gym", amount: 20 },
      { id: "p_care", name: "Personal Care", amount: 20 },
      { id: "p_gift", name: "Gifts / Misc", amount: 20 },
    ]},
  },
  period: { week1: {}, week2: {}, cogs: { materials: 0, labor: 0, shipping: 0 }, cogsOn: false, incomeOverrideOn: false, incomeOverride: 0, locks: { week1: {}, week2: {} } },
  monthlyActual: { housing: 0, food: 0, transport: 0, debt: 0, savings: 0, personal: 0 },
  history: [],
};

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const cloneDefault = (v) => JSON.parse(JSON.stringify(v));

/**
 * Turn any parsed/loaded blob into a state object that is always safe to feed to
 * computeCalc and period.js — every group has a `lines` array, `period` has its
 * sub-objects, and settings/monthlyActual carry their keys. A partial, older, or
 * corrupt save (from a JSON import, a cloud pull, or localStorage) is repaired to
 * the current shape instead of white-screening a screen that reads, e.g.,
 * `state.groups[k].lines` directly. Unknown keys are preserved (forward-compatible);
 * non-object line/history entries are dropped so a stray null can't crash a render.
 */
export function normalizeState(raw) {
  const base = isObj(raw) ? raw : {};

  const rawGroups = isObj(base.groups) ? base.groups : {};
  const groups = {};
  GROUP_KEYS.forEach((k) => {
    const lines = rawGroups[k]?.lines;
    groups[k] = { lines: Array.isArray(lines) ? lines.filter(isObj) : cloneDefault(DEFAULT_STATE.groups[k].lines) };
  });

  const p = isObj(base.period) ? base.period : {};
  const period = {
    week1: isObj(p.week1) ? p.week1 : {},
    week2: isObj(p.week2) ? p.week2 : {},
    cogs: { materials: num(p.cogs?.materials), labor: num(p.cogs?.labor), shipping: num(p.cogs?.shipping) },
    cogsOn: !!p.cogsOn,
    incomeOverrideOn: !!p.incomeOverrideOn,
    incomeOverride: num(p.incomeOverride),
    locks: {
      week1: isObj(p.locks?.week1) ? p.locks.week1 : {},
      week2: isObj(p.locks?.week2) ? p.locks.week2 : {},
    },
  };

  const monthlyActual = {};
  GROUP_KEYS.forEach((k) => { monthlyActual[k] = num(base.monthlyActual?.[k]); });

  const settings = { ...DEFAULT_STATE.settings, ...(isObj(base.settings) ? base.settings : {}) };
  if (typeof settings.pin !== "string") settings.pin = ""; // read as pin.length at the lock gate

  return {
    ...DEFAULT_STATE,
    ...base,
    settings,
    income: Array.isArray(base.income) ? base.income.filter(isObj) : cloneDefault(DEFAULT_STATE.income),
    groups,
    period,
    monthlyActual,
    history: normalizeHistory(Array.isArray(base.history) ? base.history.filter(isObj) : []),
  };
}
