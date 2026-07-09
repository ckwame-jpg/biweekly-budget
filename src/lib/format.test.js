import { describe, it, expect } from "vitest";
import { cyclePosition, fmt, fmtSigned, pct } from "./format.js";

// cyclePosition uses the real "now", so tests derive dates relative to today rather
// than mocking the clock (the codebase deliberately keeps Date out of the pure math).
const isoOffsetFromToday = (days) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

describe("cyclePosition", () => {
  it("reports the day-of-cycle for a period that has already started", () => {
    const c = cyclePosition(isoOffsetFromToday(-3), 14); // started 3 days ago
    expect(c.upcoming).toBe(false);
    expect(c.day).toBe(4); // start day is day 1, so +3 days = day 4
    expect(c.cycleDays).toBe(14);
    expect(c.week).toBe(1);
  });

  it("reports week 2 in the back half of a biweekly cycle", () => {
    const c = cyclePosition(isoOffsetFromToday(-9), 14);
    expect(c.day).toBe(10);
    expect(c.week).toBe(2);
  });

  it("reports an upcoming period (not a wrapped 'Day 4 of 14') for a future start", () => {
    const c = cyclePosition(isoOffsetFromToday(5), 14); // starts in 5 days (e.g. closed early)
    expect(c.upcoming).toBe(true);
    expect(c.daysUntilStart).toBe(5);
    expect(c.startDate).toBe(isoOffsetFromToday(5));
    expect(c.day).toBe(0);
  });

  it("returns null for no cycle (by the job) or a bad date", () => {
    expect(cyclePosition("2026-01-01", 0)).toBeNull();
    expect(cyclePosition("", 14)).toBeNull();
    expect(cyclePosition("not-a-date", 14)).toBeNull();
  });
});

describe("fmt helpers", () => {
  it("formats whole dollars with a leading sign only when negative", () => {
    expect(fmt(1234.6)).toBe("$1,235");
    expect(fmt(-50)).toBe("-$50");
    expect(fmt("bad")).toBe("$0");
  });
  it("fmtSigned always shows a sign", () => {
    expect(fmtSigned(40)).toBe("+$40");
    expect(fmtSigned(-40)).toBe("-$40");
  });
  it("pct guards non-finite input", () => {
    expect(pct(0.25)).toBe("25.0%");
    expect(pct(Infinity)).toBe("0.0%");
  });
});
