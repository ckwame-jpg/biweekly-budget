export const num = (v) => (typeof v === "number" && isFinite(v) ? v : 0);

export const sumLines = (lines, pick = (l) => l.amount) =>
  lines.reduce((a, l) => a + num(pick(l)), 0);

export const fmt = (n) => {
  const v = Math.round(num(n));
  return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US");
};

export const fmtSigned = (n) =>
  (num(n) >= 0 ? "+" : "−") + "$" + Math.abs(Math.round(num(n))).toLocaleString("en-US");

export const pct = (n) => (isFinite(n) ? (n * 100).toFixed(1) : "0.0") + "%";

// "2026-07-01" -> "Jul 1, 2026". Falls back to the raw string for old/invalid values.
export const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

// Where "today" falls in the current pay cycle, given its start date and length.
// Handles a start date in the future or long past by wrapping into the 1–cycleDays range.
// cycleDays of 0/falsy (e.g. "by the job", which has no fixed cycle) returns null.
export const cyclePosition = (periodStart, cycleDays = 14) => {
  if (!periodStart || !cycleDays) return null;
  const start = new Date(periodStart + "T00:00:00");
  if (isNaN(start.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((now - start) / 86400000);
  const day = ((diffDays % cycleDays) + cycleDays) % cycleDays + 1;
  return { day, cycleDays, week: cycleDays > 7 ? (day <= 7 ? 1 : 2) : null };
};
