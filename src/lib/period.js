import { GROUP_KEYS } from "./theme.js";
import { num } from "./format.js";

// Pay-period snapshotting + automatic end-of-period rollover. Kept here (and
// unit-tested) rather than in App.jsx because it decides what lands in the
// user's saved history — money logic that must not silently drift.

// Cycle length in days per pay frequency. "job" has no fixed cycle (0 = never
// auto-rolls; those periods are closed manually).
export function cycleDaysFor(freq) {
  return freq === "weekly" ? 7 : freq === "job" ? 0 : 14;
}

export const emptyPeriod = () => ({
  week1: {}, week2: {},
  cogs: { materials: 0, labor: 0, shipping: 0 }, cogsOn: false,
  incomeOverrideOn: false, incomeOverride: 0,
  locks: { week1: {}, week2: {} },
});

// Build a history entry from the state's current period actuals + auto-tracked
// income (or the one-off income override, when set).
export function buildPeriodSnapshot(s, periodNumber, payDate) {
  const lineActual = (id) => num(s.period.week1[id]) + num(s.period.week2[id]);
  const c = {};
  GROUP_KEYS.forEach((k) => { c[k] = s.groups[k].lines.reduce((a, l) => a + lineActual(l.id), 0); });
  const income = s.period.incomeOverrideOn
    ? num(s.period.incomeOverride)
    : s.income.reduce((a, l) => a + num(l.amount), 0);
  const totalExpenses = GROUP_KEYS.reduce((a, k) => a + c[k], 0);
  return { id: "p_" + Date.now() + "_" + periodNumber, periodNumber, payDate, income, ...c, totalExpenses, netProfit: income - totalExpenses };
}

export function periodHasSpending(s) {
  return GROUP_KEYS.some((k) => s.groups[k].lines.some((l) => (num(s.period.week1[l.id]) + num(s.period.week2[l.id])) > 0));
}

export function addDays(iso, days) {
  const d = new Date((iso || new Date().toISOString().slice(0, 10)) + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * If the current pay period has ended (relative to `today`), archive it to
 * history and roll forward to the period that contains today. Only the first
 * ended period is snapshotted, and only when it actually has logged spending
 * (or a recorded income override) — empty elapsed periods just advance the date
 * so history isn't polluted with all-zero rows. "By the job" never auto-rolls.
 * Pure: pass `today` for deterministic behavior/testing. Returns null when
 * nothing has ended.
 */
export function autoRollover(s, today = new Date()) {
  const cd = cycleDaysFor(s.payFrequency);
  if (!cd || !s.periodStart) return null;
  if (isNaN(new Date(s.periodStart + "T00:00:00").getTime())) return null;
  const cutoff = new Date(today); cutoff.setHours(0, 0, 0, 0);

  let periodStart = s.periodStart;
  let history = s.history;
  let period = s.period;
  let saved = false;
  let firstEnded = true;
  let guard = 0;

  while (guard++ < 200) {
    const end = new Date(periodStart + "T00:00:00");
    end.setDate(end.getDate() + cd);
    if (cutoff < end) break; // this period is still ongoing
    const endIso = end.toISOString().slice(0, 10);
    if (firstEnded && (periodHasSpending(s) || s.period.incomeOverrideOn)) {
      const n = (history.length ? Math.max(...history.map((h) => h.periodNumber)) : 0) + 1;
      history = [...history, buildPeriodSnapshot(s, n, endIso)];
      saved = true;
    }
    periodStart = endIso;
    period = emptyPeriod();
    firstEnded = false;
  }
  if (firstEnded) return null; // nothing ended
  return { next: { ...s, history, period, periodStart }, saved };
}
