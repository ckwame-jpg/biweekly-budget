import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import {
  Home, Wallet, PlusCircle, CalendarDays, TrendingUp, Settings, X, Check,
  Plus, Trash2, Pencil, Target, Sparkles, RotateCcw, Lock, Unlock, Delete, ArrowDownToLine, RefreshCw, CloudOff,
  Download, Upload, Save,
} from "lucide-react";

import { C, GROUP_KEYS, GROUP_META, THEMES } from "./lib/theme.js";
import { ThemeMascotPanel, ChartCat } from "./components/ThemeMascot.jsx";
import { TourOverlay } from "./components/Tour.jsx";
import { DEFAULT_STATE, normalizeState } from "./lib/defaults.js";
import { num, fmt, fmtSigned, pct, fmtDate, cyclePosition } from "./lib/format.js";
import { useCalc, spendStatusKey } from "./lib/calc.js";
import { cycleDaysFor, advanceDaysFor, nextPeriodNumber, normalizeHistory, monthlyActualsFromHistory, emptyPeriod, buildPeriodSnapshot, addDays, autoRollover } from "./lib/period.js";
import { useReducedMotion, useCountUp, useIsDesktop } from "./lib/hooks.js";
import { loadLocal, saveState, pullCloud, clearLocal, getLastEmail, setLastEmail, localUpdatedAt } from "./lib/storage.js";
import { supabaseConfigured, signInWithEmail, signInWithPassword, signUpWithPassword, updatePassword, signOut, getUser, onAuthChange } from "./lib/supabase.js";

// recharts is one of the two heaviest deps in the app (see CLAUDE.md backlog);
// split into its own chunk and only fetched once a chart actually renders.
const GoalBarChart = lazy(() => import("./components/Charts.jsx").then((m) => ({ default: m.GoalBarChart })));
const SpendDonutChart = lazy(() => import("./components/Charts.jsx").then((m) => ({ default: m.SpendDonutChart })));
const CategoryBarChart = lazy(() => import("./components/Charts.jsx").then((m) => ({ default: m.CategoryBarChart })));
const TrendChart = lazy(() => import("./components/Charts.jsx").then((m) => ({ default: m.TrendChart })));
function ChartSkeleton() {
  return <div className="w-full h-full rounded-xl" style={{ background: C.bg }} />;
}

/* ============================== UI atoms ============================== */
function Card({ children, style, className = "", ...rest }) {
  return (
    <div {...rest} className={"rounded-3xl " + className}
      style={{ background: C.surface, border: `1px solid ${C.border}`, boxShadow: "var(--card-shadow)", ...style }}>
      {children}
    </div>
  );
}

// Keeps only digits and a single decimal point from raw typed text.
function cleanDecimal(raw) {
  let v = String(raw).replace(/[^0-9.]/g, "");
  const dot = v.indexOf(".");
  if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, ""); // keep only the first dot
  return v;
}

function NumInput({ value, onChange, align = "right", placeholder = "0", bold = false, disabled = false, ariaLabel }) {
  // While focused, hold the raw string being typed (draft) so intermediate values
  // like "0", "0." and "0.50" survive instead of being wiped by a parse-on-every-
  // keystroke round-trip — 0 is falsy, so the old field blanked itself and cents
  // were untypeable. type is "text" + inputMode="decimal" because type="number"
  // drops a trailing "." in many browsers. Downstream calc still updates live.
  const [draft, setDraft] = useState(null);
  const shown = draft != null ? draft : (value ? String(value) : "");
  const chWidth = Math.max((shown.length || String(placeholder).length) + 1, 3);
  const handle = (e) => { const v = cleanDecimal(e.target.value); setDraft(v); onChange(parseFloat(v) || 0); };
  return (
    <div className="flex items-center rounded-xl px-2" style={{ background: C.bg, border: `1px solid ${C.border}`, flexShrink: 0, opacity: disabled ? 0.55 : 1 }}>
      <span className="ff-num" style={{ color: C.muted, fontSize: 13 }}>$</span>
      <input
        type="text" inputMode="decimal" placeholder={placeholder} aria-label={ariaLabel}
        value={shown}
        onFocus={(e) => setDraft(e.target.value)}
        onChange={handle}
        onBlur={() => setDraft(null)}
        readOnly={disabled}
        className="ff-num bg-transparent outline-none py-2 px-1"
        style={{
          textAlign: align, color: C.ink, fontSize: 15, fontWeight: bold ? 600 : 500,
          fontVariantNumeric: "tabular-nums", width: chWidth + "ch", transition: "width 0.15s ease",
          cursor: disabled ? "not-allowed" : "text",
        }}
      />
    </div>
  );
}

function PercentInput({ value, onChange, ariaLabel = "Percent" }) {
  // value is a decimal (0.2 = 20%); the field shows/edits the whole percent. Same
  // draft-string handling as NumInput so "22.5" and a leading "0" stay typeable.
  const [draft, setDraft] = useState(null);
  const canonical = value ? String(Math.round(value * 1000) / 10) : "";
  const shown = draft != null ? draft : canonical;
  const chWidth = Math.max((shown.length || 1) + 1, 2);
  const handle = (e) => { const v = cleanDecimal(e.target.value); setDraft(v); onChange((parseFloat(v) || 0) / 100); };
  return (
    <div className="flex items-center rounded-xl px-2" style={{ background: C.bg, border: `1px solid ${C.border}`, flexShrink: 0 }}>
      <input
        type="text" inputMode="decimal" placeholder="0" aria-label={ariaLabel}
        value={shown}
        onFocus={(e) => setDraft(e.target.value)}
        onChange={handle}
        onBlur={() => setDraft(null)}
        className="ff-num bg-transparent outline-none py-2 px-1"
        style={{
          textAlign: "left", color: C.ink, fontSize: 15, fontWeight: 500,
          fontVariantNumeric: "tabular-nums", width: chWidth + "ch", transition: "width 0.15s ease",
        }}
      />
      <span className="ff-num" style={{ color: C.muted, fontSize: 13 }}>%</span>
    </div>
  );
}

function StatTile({ label, value, sub, color }) {
  return (
    <Card className="p-3 flex-1" style={{ minWidth: 0 }}>
      <div className="ff-body" style={{ color: C.muted, fontSize: 11, letterSpacing: 0.3, textTransform: "uppercase" }}>{label}</div>
      <div className="ff-num truncate" style={{ color: color || C.ink, fontSize: "calc(1.25rem * var(--num-scale, 1))", fontWeight: 600, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div className="ff-body truncate" style={{ color: C.muted, fontSize: 11, marginTop: 1 }}>{sub}</div>}
    </Card>
  );
}

// Always-visible sync status on Home, so it's never a mystery which account
// (if any) this device is saving to — the main thing that was invisible before.
function AccountBanner({ authUser, cloudOn, onManage }) {
  if (!cloudOn) return null; // no cloud configured — pure on-device, nothing to show
  return (
    <button onClick={onManage} className="w-full flex items-center gap-2 rounded-2xl px-3 py-2 mt-3"
      style={{ background: authUser ? C.surface : C.surfaceWarm, border: `1px solid ${C.border}` }}>
      {authUser ? <RefreshCw size={15} color={C.primary} style={{ flexShrink: 0 }} /> : <CloudOff size={15} color={C.gold} style={{ flexShrink: 0 }} />}
      <span className="ff-body text-left flex-1 truncate" style={{ minWidth: 0, fontSize: 12, color: C.inkSoft }}>
        {authUser
          ? <>Synced as <b style={{ color: C.ink }}>{authUser.email}</b></>
          : <>Saved on this device only — <b style={{ color: C.ink }}>tap to sign in &amp; sync</b></>}
      </span>
      <span className="ff-body" style={{ fontSize: 11, color: C.muted, flexShrink: 0 }}>{authUser ? "Manage" : "Sign in"}</span>
    </button>
  );
}

function SectionTitle({ children, right }) {
  return (
    <div className="flex items-end justify-between mb-2 mt-5 px-1">
      <h2 className="ff-display" style={{ color: C.ink, fontSize: 17, fontWeight: 600 }}>{children}</h2>
      {right}
    </div>
  );
}

function Row({ k, v, color }) {
  return (
    <div className="flex justify-between items-center py-1.5">
      <span className="ff-body" style={{ color: C.inkSoft, fontSize: 14 }}>{k}</span>
      <span className="ff-num" style={{ color: color || C.ink, fontSize: 15, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{v}</span>
    </div>
  );
}

function LineRow({ name, amount, onName, onAmount, onDelete }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <input value={name} onChange={(e) => onName(e.target.value)} aria-label="Line item name"
        className="ff-body flex-1 bg-transparent outline-none py-1"
        style={{ color: C.ink, fontSize: 14, minWidth: 0, textOverflow: "ellipsis" }} />
      <NumInput value={amount} onChange={onAmount} ariaLabel={`${name || "Line item"} amount`} />
      <button onClick={onDelete} className="p-1" style={{ color: C.muted }} aria-label={`Delete ${name || "line item"}`}><Trash2 size={15} /></button>
    </div>
  );
}

function DebtLineRow({ name, amount, balance, onName, onAmount, onBalance, onDelete }) {
  return (
    <div className="py-1.5">
      <div className="flex items-center gap-2">
        <input value={name} onChange={(e) => onName(e.target.value)} aria-label="Debt name"
          className="ff-body flex-1 bg-transparent outline-none py-1"
          style={{ color: C.ink, fontSize: 14, minWidth: 0, textOverflow: "ellipsis" }} />
        <NumInput value={amount} onChange={onAmount} ariaLabel={`${name || "Debt"} payment per period`} />
        <button onClick={onDelete} className="p-1" style={{ color: C.muted }} aria-label={`Delete ${name || "debt"}`}><Trash2 size={15} /></button>
      </div>
      <div className="flex items-center gap-2 mt-0.5">
        <span className="ff-body flex-1" style={{ color: C.muted, fontSize: 11 }}>Balance owed</span>
        <NumInput value={balance} onChange={onBalance} ariaLabel={`${name || "Debt"} balance owed`} />
      </div>
    </div>
  );
}

function TrackRow({ name, value, onChange, total, budget, locked, onToggleLock }) {
  const over = budget > 0 && total > budget;
  return (
    <div className="flex items-center gap-2 py-1.5">
      <div className="flex-1" style={{ minWidth: 0 }}>
        <div className="ff-body" style={{ color: C.ink, fontSize: 14 }}>{name}</div>
        {budget > 0 && (
          <div className="ff-body" style={{ fontSize: 11, color: over ? C.coral : C.muted }}>
            {fmt(total)} of {fmt(budget)}{over ? " · over" : ""}
          </div>
        )}
      </div>
      <NumInput value={value} onChange={onChange} disabled={locked} ariaLabel={`${name} spent this week`} />
      {onToggleLock && (
        <button onClick={onToggleLock} className="p-1" style={{ color: locked ? C.primary : C.muted, flexShrink: 0 }}
          title={locked ? "Unlock this amount" : "Lock this amount"} aria-label={locked ? "Unlock this amount" : "Lock this amount"}>
          {locked ? <Lock size={15} /> : <Unlock size={15} />}
        </button>
      )}
    </div>
  );
}

function GoalCard({ state, calc, className = "p-4 mt-3" }) {
  const goal = num(state.goal);
  const rateGoal = num(state.savingsRateGoal);
  const saved = calc.savedThisPeriod;
  const net = calc.netProfit;
  const rate = calc.savingsRateThisPeriod;

  // Each metric has its own unit ($ or %), so bars are normalized to "% of its own goal"
  // and share one 100%-mark reference line instead of a raw-dollar axis.
  const pctOfGoal = (val, g) => (g > 0 ? Math.max(0, (val / g) * 100) : 0);

  const data = [
    { name: "Savings set aside", value: pctOfGoal(saved, goal), onTrack: calc.goalOnTrackSavings, raw: fmt(saved) },
    { name: "Net profit", value: pctOfGoal(net, goal), onTrack: calc.goalOnTrackNetProfit, raw: fmt(net) },
    { name: "Savings rate", value: pctOfGoal(rate, rateGoal), onTrack: calc.goalOnTrackSavingsRate, raw: pct(rate) },
  ];
  const allOnTrack = data.every((d) => d.onTrack);
  const anyOnTrack = data.some((d) => d.onTrack);

  return (
    <Card data-tour="goalcard" className={className}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target size={18} color={C.primary} />
          <span className="ff-display" style={{ color: C.ink, fontSize: 15, fontWeight: 600 }}>Goal this period</span>
        </div>
        <span className="ff-body px-2 py-1 rounded-full" style={{ fontSize: 12, color: "#fff", background: allOnTrack ? C.primary : anyOnTrack ? C.gold : C.coral }}>
          {allOnTrack ? "✓ On track" : anyOnTrack ? "Almost there" : "Short"}
        </span>
      </div>
      <div className="ff-body mt-1" style={{ color: C.muted, fontSize: 12 }}>
        Progress toward your {fmt(goal)} savings goal and {pct(rateGoal)} savings-rate goal this period.
      </div>
      <div className="mt-2" style={{ height: 140 }}>
        <Suspense fallback={<ChartSkeleton />}>
          <GoalBarChart data={data} />
        </Suspense>
      </div>
      <div className="ff-body mt-1" style={{ color: C.muted, fontSize: 13 }}>
        {fmt(saved)} saved · {fmt(net)} net profit · {pct(rate)} savings rate this period.
      </div>
    </Card>
  );
}

/* ============================== screens ============================== */
function Dashboard({ state, calc, setScreen, authUser, cloudOn, onOpenSettings, isDesktop }) {
  const reduced = useReducedMotion();
  const hero = useCountUp(calc.leftOverBudget, reduced);
  const cycle = cyclePosition(state.periodStart, cycleDaysFor(state.payFrequency));
  // Spend status now weighs pace against how much of the period has elapsed, not
  // just the absolute % of budget — so "80% spent by day 4" reads honestly instead
  // of "On track". See spendStatusKey for the thresholds and the early-period guard.
  const elapsedFraction = cycle && !cycle.upcoming ? cycle.day / cycle.cycleDays : null;
  const ratio = Math.max(0, Math.min(1.35, calc.ratio));
  const statusKey = spendStatusKey(calc.ratio, elapsedFraction);
  const gaugeColor = statusKey === "over" ? C.coral : statusKey === "ontrack" ? C.primary : C.gold;
  const status = { over: "Over budget", close: "Cutting it close", ahead: "Ahead of pace", ontrack: "On track" }[statusKey];
  const mood = statusKey === "ontrack" ? "happy" : statusKey === "over" ? "worried" : "neutral";
  const moodCaption = statusKey === "ontrack" ? "On track — nice work!"
    : statusKey === "over" ? "Over budget — let's adjust."
    : statusKey === "ahead" ? "Spending a little fast — ease up if you can."
    : "Getting close — keep an eye on it.";

  const donutData = GROUP_KEYS
    .map((k) => ({ name: GROUP_META[k].label, value: calc.groupBudget[k], color: GROUP_META[k].color }))
    .filter((d) => d.value > 0);
  const leftToSpend = calc.expenseBudget - calc.spentSoFar;

  // The cards are built once as pieces, then arranged two ways: a vertical stack on
  // mobile (unchanged), a multi-column grid on desktop. Margins are applied by the
  // arrangement, not baked into the pieces.
  const heroCard = (
    <Card data-tour="hero" className="p-5" style={{ background: C.heroGradient, border: "none" }}>
      <div className="flex items-center justify-between">
        <span className="ff-body" style={{ color: "rgba(255,255,255,0.72)", fontSize: 12, letterSpacing: 0.4 }}>MONEY LEFT OVER · THIS PERIOD</span>
        <span className="ff-body px-2 py-1 rounded-full" style={{ fontSize: 11, color: "#fff", background: "rgba(255,255,255,0.16)" }}>{status}</span>
      </div>
      {cycle && (
        <div className="ff-body" style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, marginTop: 3 }}>
          {cycle.upcoming
            ? `Next period starts ${fmtDate(cycle.startDate)}`
            : `Day ${cycle.day} of ${cycle.cycleDays}${cycle.week ? ` · Week ${cycle.week}` : ""}`}
        </div>
      )}
      <div className="ff-num" style={{ color: "#fff", fontSize: "3.4rem", fontWeight: 700, lineHeight: 1.05, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{fmt(hero)}</div>
      <div className="ff-body" style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, marginTop: 2 }}>
        {calc.leftOverBudget >= 0 ? "after every bill and your savings" : "your plan spends more than you make"}
      </div>
      <div className="mt-4 rounded-full overflow-hidden" style={{ height: 10, background: "rgba(255,255,255,0.18)" }}>
        <div style={{ width: (ratio / 1.35 * 100) + "%", height: "100%", background: gaugeColor, borderRadius: 999, transition: reduced ? "none" : "width 0.6s ease" }} />
      </div>
      <div className="flex justify-between mt-2 ff-body" style={{ color: "rgba(255,255,255,0.82)", fontSize: 12 }}>
        <span>{calc.anyActual ? fmt(calc.spentSoFar) + " spent" : "Nothing logged yet"}</span>
        <span>{fmt(leftToSpend)} left to spend</span>
      </div>
    </Card>
  );

  const halfwayCard = (cycle && !cycle.upcoming && cycle.day > cycle.cycleDays / 2 && !calc.anyActual) ? (
    <Card className="p-4 flex items-center gap-3">
      <Sparkles size={18} color={C.gold} />
      <div className="flex-1" style={{ minWidth: 0 }}>
        <div className="ff-body" style={{ color: C.ink, fontSize: 13, fontWeight: 600 }}>You're halfway through this period</div>
        <div className="ff-body mt-0.5" style={{ color: C.muted, fontSize: 12 }}>Nothing logged yet — jot down what you've spent so far.</div>
      </div>
      <button onClick={() => setScreen("track")} className="rounded-xl px-3 py-2" style={{ background: C.primary, color: "#fff", flexShrink: 0 }}>
        <span className="ff-body" style={{ fontWeight: 600, fontSize: 13 }}>Log it</span>
      </button>
    </Card>
  ) : null;

  const mascotCard = (state.settings.theme !== "classic" && state.settings.themeFx) ? (
    <Card className="p-3 flex items-center gap-3">
      <ThemeMascotPanel theme={state.settings.theme} mood={mood} enabled={state.settings.themeFx} />
      <span className="ff-body" style={{ color: C.ink, fontSize: 13 }}>{moodCaption}</span>
    </Card>
  ) : null;

  const statsRow = (
    <div data-tour="stats" className="flex gap-3">
      <StatTile label="Income" value={fmt(calc.incomeBudget)} sub="per period" />
      <StatTile label="Expenses" value={fmt(calc.expenseBudget)} sub="incl. savings" />
      <StatTile label="Savings rate" value={pct(calc.savingsRateBudget)} sub="of income"
        color={calc.savingsRateBudget >= num(state.savingsRateGoal) ? C.primary : C.coral} />
    </div>
  );

  const quickActions = (
    <div data-tour="quickactions" className="flex gap-3">
      <button onClick={() => setScreen("track")} className="flex-1 flex items-center justify-center gap-2 rounded-2xl py-3" style={{ background: C.primary, color: "#fff" }}>
        <PlusCircle size={18} /> <span className="ff-body" style={{ fontWeight: 600, fontSize: 14 }}>Log spending</span>
      </button>
      <button onClick={() => setScreen("budget")} className="flex-1 flex items-center justify-center gap-2 rounded-2xl py-3" style={{ background: C.surface, color: C.ink, border: `1px solid ${C.border}` }}>
        <Wallet size={18} /> <span className="ff-body" style={{ fontWeight: 600, fontSize: 14 }}>Edit budget</span>
      </button>
    </div>
  );

  const donutCard = (
    <Card data-tour="donut" className="p-4">
      {isDesktop && <div className="ff-display mb-2" style={{ color: C.ink, fontSize: 15, fontWeight: 600 }}>Where it goes</div>}
      <div style={{ height: 200, position: "relative" }}>
        <Suspense fallback={<ChartSkeleton />}>
          <SpendDonutChart data={donutData} />
        </Suspense>
        <ChartCat mood={mood} enabled={state.settings.themeFx && state.settings.theme === "pixelkitty"} />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 px-1">
        {donutData.map((d, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span style={{ width: 9, height: 9, borderRadius: 3, background: d.color, display: "inline-block" }} />
            <span className="ff-body" style={{ color: C.inkSoft, fontSize: 12 }}>{d.name}</span>
            <span className="ff-num" style={{ color: C.muted, fontSize: 12 }}>{fmt(d.value)}</span>
          </div>
        ))}
      </div>
    </Card>
  );

  // Desktop: a 2×2 dashboard grid — hero + stats/actions on top, donut + goal below.
  if (isDesktop) {
    return (
      <div className="pb-2">
        <div style={{ display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: 16, alignItems: "start" }}>
          {heroCard}
          <div className="flex flex-col gap-3">
            {statsRow}
            {quickActions}
            {mascotCard}
          </div>
        </div>
        {halfwayCard && <div className="mt-4">{halfwayCard}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start", marginTop: 20 }}>
          {donutCard}
          <GoalCard state={state} calc={calc} className="p-4" />
        </div>
      </div>
    );
  }

  // Mobile: the original single-column stack, unchanged.
  return (
    <div className="px-4 pb-2">
      <AccountBanner authUser={authUser} cloudOn={cloudOn} onManage={onOpenSettings} />
      <div className="mt-3">{heroCard}</div>
      {halfwayCard && <div className="mt-3">{halfwayCard}</div>}
      {mascotCard && <div className="mt-3">{mascotCard}</div>}
      <div className="mt-3">{statsRow}</div>
      <div className="mt-3">{quickActions}</div>
      <SectionTitle>Where it goes</SectionTitle>
      {donutCard}
      <GoalCard state={state} calc={calc} />
    </div>
  );
}

function BudgetScreen({ state, setState, calc, isDesktop }) {
  const setIncome = (id, patch) => setState((s) => ({ ...s, income: s.income.map((l) => l.id === id ? { ...l, ...patch } : l) }));
  const addIncome = () => setState((s) => ({ ...s, income: [...s.income, { id: "inc_" + Date.now(), name: "New income", amount: 0 }] }));
  const delIncome = (id) => setState((s) => ({ ...s, income: s.income.filter((l) => l.id !== id) }));

  const setLine = (g, id, patch) => setState((s) => ({ ...s, groups: { ...s.groups, [g]: { lines: s.groups[g].lines.map((l) => l.id === id ? { ...l, ...patch } : l) } } }));
  const addLine = (g) => setState((s) => ({ ...s, groups: { ...s.groups, [g]: { lines: [...s.groups[g].lines, { id: g[0] + "_" + Date.now(), name: "New item", amount: 0 }] } } }));
  // Deleting a line also prunes its logged actuals + locks from the current period,
  // so spending doesn't silently vanish from category totals into orphaned keys that
  // pile up in saved state. Confirm first if there's spending logged against it.
  const delLine = (g, id) => {
    const loggedThisPeriod = num(state.period.week1[id]) + num(state.period.week2[id]);
    if (loggedThisPeriod > 0 && !window.confirm("This line has spending logged this period. Delete it and its logged amounts too?")) return;
    setState((s) => {
      const drop = (obj) => { if (!obj || !(id in obj)) return obj; const n = { ...obj }; delete n[id]; return n; };
      return {
        ...s,
        groups: { ...s.groups, [g]: { lines: s.groups[g].lines.filter((l) => l.id !== id) } },
        period: {
          ...s.period,
          week1: drop(s.period.week1), week2: drop(s.period.week2),
          locks: { week1: drop(s.period.locks?.week1), week2: drop(s.period.locks?.week2) },
        },
      };
    });
  };

  // debt payoff estimate — the only place a balance owed (not derivable from
  // income/spending) is entered, right where it's used.
  const payoffDate = (() => {
    if (!calc.debtPeriodsToPayoff) return null;
    const days = cycleDaysFor(state.payFrequency) || 14;
    const d = new Date();
    d.setDate(d.getDate() + calc.debtPeriodsToPayoff * days);
    return d.toISOString().slice(0, 10);
  })();

  return (
    <div className={isDesktop ? "pb-2" : "px-4 pb-2"}>
      <div className="ff-body mt-3 px-1" style={{ color: C.muted, fontSize: 13 }}>
        Set what you make and what you plan to spend each pay period. Everything else in the app calculates from here.
      </div>

      <SectionTitle right={<button onClick={addIncome} style={{ color: C.primary }}><Plus size={18} /></button>}>Income</SectionTitle>
      <Card data-tour="income-section" className="px-4 py-2">
        {state.income.map((l) => (
          <LineRow key={l.id} name={l.name} amount={l.amount}
            onName={(v) => setIncome(l.id, { name: v })} onAmount={(v) => setIncome(l.id, { amount: v })} onDelete={() => delIncome(l.id)} />
        ))}
        <div className="flex justify-between items-center pt-2 mt-1" style={{ borderTop: `1px solid ${C.border}` }}>
          <span className="ff-body" style={{ color: C.ink, fontWeight: 600, fontSize: 14 }}>Total income</span>
          <span className="ff-num" style={{ color: C.primary, fontWeight: 600, fontSize: 16 }}>{fmt(calc.incomeBudget)}</span>
        </div>
      </Card>

      {/* desktop: the six categories flow in two columns to use the width */}
      <div style={isDesktop ? { display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 20, alignItems: "start" } : undefined}>
      {GROUP_KEYS.map((g) => (
        <div key={g}>
          <SectionTitle right={<button onClick={() => addLine(g)} style={{ color: C.primary }}><Plus size={18} /></button>}>
            <span className="flex items-center gap-2">
              <span style={{ width: 10, height: 10, borderRadius: 3, background: GROUP_META[g].color, display: "inline-block" }} />
              {GROUP_META[g].label}
            </span>
          </SectionTitle>
          <Card data-tour={g === GROUP_KEYS[0] ? "category-section" : undefined} className="px-4 py-2">
            {state.groups[g].lines.map((l) => (
              g === "debt" ? (
                <DebtLineRow key={l.id} name={l.name} amount={l.amount} balance={l.balance}
                  onName={(v) => setLine(g, l.id, { name: v })} onAmount={(v) => setLine(g, l.id, { amount: v })}
                  onBalance={(v) => setLine(g, l.id, { balance: v })} onDelete={() => delLine(g, l.id)} />
              ) : (
                <LineRow key={l.id} name={l.name} amount={l.amount}
                  onName={(v) => setLine(g, l.id, { name: v })} onAmount={(v) => setLine(g, l.id, { amount: v })} onDelete={() => delLine(g, l.id)} />
              )
            ))}
            <div className="flex justify-between items-center pt-2 mt-1" style={{ borderTop: `1px solid ${C.border}` }}>
              <span className="ff-body" style={{ color: C.ink, fontWeight: 600, fontSize: 14 }}>{GROUP_META[g].label} total</span>
              <span className="ff-num" style={{ color: C.ink, fontWeight: 600, fontSize: 16 }}>{fmt(calc.groupBudget[g])}</span>
            </div>
          </Card>
          {g === "debt" && calc.debtBalance > 0 && (
            <Card data-tour="debt-payoff" className="p-4 mt-2">
              <div className="flex items-center gap-2">
                <TrendingUp size={16} color={C.primary} />
                <span className="ff-display" style={{ color: C.ink, fontSize: 14, fontWeight: 600 }}>Debt payoff</span>
              </div>
              <div className="ff-body mt-1" style={{ color: C.muted, fontSize: 12 }}>
                {fmt(calc.debtBalance)} owed across your debt lines, at {fmt(calc.debtPaymentPerPeriod)} per period.
              </div>
              <div className="flex justify-between items-center mt-2">
                <span className="ff-body" style={{ color: C.ink, fontSize: 14 }}>Periods left</span>
                <span className="ff-num" style={{ color: C.ink, fontWeight: 600, fontSize: 16 }}>{calc.debtPeriodsToPayoff || "—"}</span>
              </div>
              {payoffDate && (
                <div className="flex justify-between items-center mt-1">
                  <span className="ff-body" style={{ color: C.ink, fontSize: 14 }}>Est. payoff</span>
                  <span className="ff-num" style={{ color: C.primary, fontWeight: 600, fontSize: 16 }}>{fmtDate(payoffDate)}</span>
                </div>
              )}
            </Card>
          )}
        </div>
      ))}
      </div>

      <SectionTitle>Per-period summary</SectionTitle>
      <Card className="p-4">
        <Row k="Total income" v={fmt(calc.incomeBudget)} />
        <Row k="Total expenses (incl. savings)" v={fmt(calc.expenseBudget)} />
        <div className="flex justify-between items-center pt-2 mt-1" style={{ borderTop: `1px solid ${C.border}` }}>
          <span className="ff-body" style={{ color: C.ink, fontWeight: 600, fontSize: 15 }}>Money left over</span>
          <span className="ff-num" style={{ color: calc.leftOverBudget >= 0 ? C.primary : C.coral, fontWeight: 700, fontSize: 18 }}>{fmt(calc.leftOverBudget)}</span>
        </div>
      </Card>
    </div>
  );
}

function TrackScreen({ state, setState, calc, onSavePeriod, isDesktop }) {
  const showWeeks = (state.payFrequency || "biweekly") === "biweekly";
  const [weekTab, setWeekTab] = useState("week1");
  const week = showWeeks ? weekTab : "week1"; // weekly/job frequencies just use one bucket
  // Per-week lock: freezes a line's logged amount for the active week (Week 1 and
  // Week 2 lock independently) so a confirmed figure can't be edited by accident.
  const isLocked = (id) => !!(state.period.locks?.[week]?.[id]);
  const toggleLock = (id) => setState((s) => {
    const locks = s.period.locks || {};
    const wk = { ...(locks[week] || {}) };
    if (wk[id]) delete wk[id]; else wk[id] = true;
    return { ...s, period: { ...s.period, locks: { ...locks, [week]: wk } } };
  });
  const setActual = (id, v) => { if (isLocked(id)) return; setState((s) => ({ ...s, period: { ...s.period, [week]: { ...s.period[week], [id]: v } } })); };
  const setCogs = (k, v) => setState((s) => ({ ...s, period: { ...s.period, cogs: { ...s.period.cogs, [k]: v } } }));
  const setIncomeOverride = (v) => setState((s) => ({ ...s, period: { ...s.period, incomeOverride: v } }));
  const toggleIncomeOverride = (on) => setState((s) => ({
    ...s,
    period: {
      ...s.period,
      incomeOverrideOn: on,
      // starting fresh? pre-fill with the budgeted figure so you tweak, not retype
      incomeOverride: on && !num(s.period.incomeOverride) ? calc.incomeBudget : s.period.incomeOverride,
    },
  }));

  // Expenses here is the committed figure (plan, raised where you're already over),
  // so Income − Expenses lines up with the Net bar instead of swinging as you log.
  const barData = [
    { name: "Income", value: calc.incomeThisPeriod, color: C.primary },
    { name: "Expenses", value: calc.committedExpenses, color: C.coral },
    { name: "Net", value: calc.netProfit, color: C.gold },
  ];

  return (
    <div className={isDesktop ? "pb-2" : "px-4 pb-2"}>
      {showWeeks && (
        <div className="flex gap-1 p-1 rounded-2xl mt-3" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          {["week1", "week2"].map((w) => (
            <button key={w} onClick={() => setWeekTab(w)} className="flex-1 rounded-xl py-2 ff-body"
              style={{ background: week === w ? C.primary : "transparent", color: week === w ? "#fff" : C.muted, fontWeight: 600, fontSize: 14 }}>
              {w === "week1" ? "Week 1" : "Week 2"}
            </button>
          ))}
        </div>
      )}

      <SectionTitle>Income</SectionTitle>
      <Card data-tour="track-income" className="px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div style={{ minWidth: 0 }}>
            <div className="ff-body" style={{ color: C.ink, fontSize: 14, fontWeight: 600 }}>
              {state.period.incomeOverrideOn ? "Actual income this period" : "Auto-tracked from your budget"}
            </div>
            <div className="ff-body mt-0.5" style={{ color: C.muted, fontSize: 12 }}>
              {state.period.incomeOverrideOn ? `Budgeted: ${fmt(calc.incomeBudget)}` : "Set income on the Budget tab — no need to re-enter it here."}
            </div>
          </div>
          <span className="ff-num" style={{ color: C.primary, fontWeight: 700, fontSize: 18, flexShrink: 0 }}>{fmt(calc.incomeThisPeriod)}</span>
        </div>
        <label className="flex items-center gap-2 ff-body mt-3" style={{ color: C.muted, fontSize: 13 }}>
          <input type="checkbox" checked={!!state.period.incomeOverrideOn} onChange={(e) => toggleIncomeOverride(e.target.checked)} />
          Actual income was different this period
        </label>
        {state.period.incomeOverrideOn && (
          <div className="flex items-center justify-between pt-2 mt-2" style={{ borderTop: `1px solid ${C.border}` }}>
            <span className="ff-body" style={{ color: C.ink, fontSize: 14 }}>Income received</span>
            <NumInput value={state.period.incomeOverride} onChange={setIncomeOverride} ariaLabel="Actual income received this period" />
          </div>
        )}
      </Card>

      {/* desktop: log categories in two columns */}
      <div style={isDesktop ? { display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 20, alignItems: "start" } : undefined}>
      {GROUP_KEYS.map((g) => (
        <div key={g}>
          <SectionTitle>
            <span className="flex items-center gap-2">
              <span style={{ width: 10, height: 10, borderRadius: 3, background: GROUP_META[g].color, display: "inline-block" }} />
              {GROUP_META[g].label}
            </span>
          </SectionTitle>
          <Card className="px-4 py-2">
            {state.groups[g].lines.map((l) => (
              <TrackRow key={l.id} name={l.name} value={state.period[week][l.id]} onChange={(v) => setActual(l.id, v)} total={calc.lineActual(l.id)} budget={l.amount}
                locked={isLocked(l.id)} onToggleLock={() => toggleLock(l.id)} />
            ))}
            <div className="flex justify-between items-center pt-2 mt-1" style={{ borderTop: `1px solid ${C.border}` }}>
              <span className="ff-body" style={{ color: C.muted, fontSize: 13 }}>Spent of {fmt(calc.groupBudget[g])}</span>
              <span className="ff-num" style={{ color: C.ink, fontWeight: 600, fontSize: 15 }}>{fmt(calc.groupActual[g])}</span>
            </div>
          </Card>
        </div>
      ))}
      </div>

      <div className="mt-4 px-1">
        <label className="flex items-center gap-2 ff-body" style={{ color: C.muted, fontSize: 13 }}>
          <input type="checkbox" checked={state.period.cogsOn} onChange={(e) => setState((s) => ({ ...s, period: { ...s.period, cogsOn: e.target.checked } }))} />
          I have side-hustle costs (materials, labor, shipping)
        </label>
      </div>
      {state.period.cogsOn && (
        <Card className="px-4 py-2 mt-2">
          {["materials", "labor", "shipping"].map((k) => (
            <div key={k} className="flex items-center justify-between py-1.5">
              <span className="ff-body capitalize" style={{ color: C.ink, fontSize: 14 }}>{k}</span>
              <NumInput value={state.period.cogs[k]} onChange={(v) => setCogs(k, v)} ariaLabel={`${k} cost`} />
            </div>
          ))}
        </Card>
      )}

      <SectionTitle>This period</SectionTitle>
      <Card data-tour="track-summary" className="p-4">
        <div style={{ height: 180 }}>
          <Suspense fallback={<ChartSkeleton />}>
            <CategoryBarChart data={barData} margin={{ top: 6, right: 6, left: -16, bottom: 0 }} />
          </Suspense>
        </div>
        <div className="ff-body mt-1 mb-1" style={{ color: C.muted, fontSize: 12 }}>
          Expenses count your full plan until the period closes — logging less doesn't free it up, since the rest is still coming.
        </div>
        {state.period.cogsOn && <Row k="Gross profit (income − COGS)" v={fmt(calc.grossProfit)} />}
        <Row k="Net profit (income − expenses)" v={fmt(calc.netProfit)} color={calc.netProfit >= 0 ? C.primary : C.coral} />
        <Row k="Savings rate" v={pct(calc.savingsRateThisPeriod)} />
      </Card>

      <GoalCard state={state} calc={calc} />
      <button data-tour="save-period" onClick={onSavePeriod} className="w-full mt-4 flex items-center justify-center gap-2 rounded-2xl py-3.5" style={{ background: C.primary, color: "#fff" }}>
        <ArrowDownToLine size={18} /> <span className="ff-body" style={{ fontWeight: 600, fontSize: 15 }}>Close this period now</span>
      </button>
      <div className="ff-body text-center mt-2 mb-1" style={{ color: C.muted, fontSize: 12 }}>
        Pay periods save to your history automatically when they end. Use this only to close the current one early.
      </div>
    </div>
  );
}

function MonthlyScreen({ state, setState, calc, isDesktop }) {
  const freq = state.payFrequency || "biweekly";
  const paycheckOptions = freq === "weekly" ? [4, 5] : freq === "job" ? [1] : [2, 3];
  const bonusCount = paycheckOptions[paycheckOptions.length - 1];
  const m = state.monthlyPaychecks;

  // Actual spend this calendar month is now DERIVED (per the app's "never type a
  // number we can derive" rule): saved periods whose pay date lands in this month,
  // plus what's been logged in the in-flight period. Resets automatically at the
  // month boundary, replacing the old hand-typed monthlyActual that never reset.
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthActual = monthlyActualsFromHistory(state.history, monthKey);
  GROUP_KEYS.forEach((g) => { monthActual[g] += calc.groupActual[g]; });

  const incomeM = calc.incomeBudget * m;
  const expenseM = calc.expenseBudget * m;
  const leftM = incomeM - expenseM;
  const savingsM = calc.groupBudget.savings * m;
  const extra = calc.incomeBudget;

  const toggle = paycheckOptions.length > 1 ? (
    <div data-tour="paycheck-toggle" className="flex gap-1 p-1 rounded-2xl mt-3" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
      {paycheckOptions.map((n) => (
        <button key={n} onClick={() => setState((s) => ({ ...s, monthlyPaychecks: n }))} className="flex-1 rounded-xl py-2 ff-body"
          style={{ background: m === n ? C.primary : "transparent", color: m === n ? "#fff" : C.muted, fontWeight: 600, fontSize: 13 }}>
          {n === bonusCount ? `Bonus month (${n} paychecks)` : `Normal month (${n} paychecks)`}
        </button>
      ))}
    </div>
  ) : null;

  const tableSection = (
    <>
      <SectionTitle>Budget vs actual</SectionTitle>
      <Card data-tour="budget-vs-actual" className="px-4 py-3">
        <div className="flex ff-body pb-2" style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3 }}>
          <span className="flex-1">Category</span>
          <span style={{ width: 76, textAlign: "right" }}>Budget</span>
          <span style={{ width: 96, textAlign: "right" }}>Actual</span>
          <span style={{ width: 72, textAlign: "right" }}>+/−</span>
        </div>
        {GROUP_KEYS.map((g) => {
          const b = calc.groupBudget[g] * m;
          const a = monthActual[g];
          const ou = b - a;
          return (
            <div key={g} className="flex items-center py-1.5" style={{ borderTop: `1px solid ${C.border}` }}>
              <span className="ff-body flex-1 flex items-center gap-2" style={{ color: C.ink, fontSize: 14, minWidth: 0 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: GROUP_META[g].color, display: "inline-block", flexShrink: 0 }} />
                <span>{GROUP_META[g].label}</span>
              </span>
              <span className="ff-num" style={{ width: 76, textAlign: "right", color: C.muted, fontSize: 13, flexShrink: 0 }}>{fmt(b)}</span>
              <span className="ff-num" style={{ width: 96, textAlign: "right", color: C.ink, fontSize: 14, flexShrink: 0 }}>{a === 0 ? "—" : fmt(a)}</span>
              <span className="ff-num" style={{ width: 72, textAlign: "right", color: a === 0 ? C.muted : ou >= 0 ? C.primary : C.coral, fontSize: 13, flexShrink: 0 }}>
                {a === 0 ? "—" : fmtSigned(ou)}
              </span>
            </div>
          );
        })}
        <div className="ff-body mt-2" style={{ color: C.muted, fontSize: 12 }}>
          Actuals are computed from this month's saved periods plus what you've logged in the current one — no need to type them.
        </div>
      </Card>
    </>
  );

  const summarySection = (
    <>
      <SectionTitle>Monthly summary</SectionTitle>
      <Card className="p-4">
        <Row k="Income (budgeted)" v={fmt(incomeM)} />
        <Row k="Expenses (budgeted)" v={fmt(expenseM)} />
        <Row k="Money left over" v={fmt(leftM)} color={leftM >= 0 ? C.primary : C.coral} />
        <Row k="Savings this month" v={fmt(savingsM)} color={C.primary} />
        <Row k="Savings rate" v={pct(incomeM ? savingsM / incomeM : 0)} />
      </Card>
    </>
  );

  const bonusSection = (paycheckOptions.length > 1 && m === bonusCount) ? (
    <>
      <SectionTitle>Your bonus paycheck</SectionTitle>
      <Card className="p-4" style={{ background: C.surfaceWarm }}>
        <div className="flex items-center gap-2">
          <Sparkles size={18} color={C.gold} />
          <span className="ff-display" style={{ color: C.ink, fontWeight: 600, fontSize: 15 }}>{fmt(extra)} extra this month</span>
        </div>
        <div className="ff-body mt-1 mb-3" style={{ color: C.muted, fontSize: 13 }}>A {bonusCount}-paycheck month gives you one full extra paycheck. Suggested split:</div>
        <Row k="50% → extra debt payment" v={fmt(extra * 0.5)} color={C.coral} />
        <Row k="30% → savings" v={fmt(extra * 0.3)} color={C.primary} />
        <Row k="20% → fun money" v={fmt(extra * 0.2)} color={C.gold} />
      </Card>
    </>
  ) : null;

  // Desktop: the budget-vs-actual table sits beside the monthly summary + bonus card.
  if (isDesktop) {
    return (
      <div className="pb-2">
        {toggle}
        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 20, alignItems: "start" }}>
          <div>{tableSection}</div>
          <div>{summarySection}{bonusSection}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pb-2">
      {toggle}
      {tableSection}
      {summarySection}
      {bonusSection}
    </div>
  );
}

// Shared editable fields for a single pay period (date + income + the six
// category totals), with a live net-profit readout. Used by both the "add a
// past period" form and the per-entry edit form so they stay identical.
function PeriodDraftFields({ draft, setField }) {
  const expenses = GROUP_KEYS.reduce((a, k) => a + num(draft[k]), 0);
  const net = num(draft.income) - expenses;
  return (
    <>
      <label className="ff-body block" style={{ color: C.muted, fontSize: 11 }}>Pay date</label>
      <input type="date" value={draft.payDate || ""} onChange={(e) => setField("payDate", e.target.value)}
        className="ff-body rounded-xl px-3 py-2 mt-1 mb-3 outline-none" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.ink, fontSize: 14 }} />

      <div className="flex items-center justify-between py-1">
        <span className="ff-body" style={{ color: C.ink, fontSize: 14 }}>Income</span>
        <NumInput value={draft.income} onChange={(v) => setField("income", v)} ariaLabel="Income for this period" />
      </div>
      {GROUP_KEYS.map((k) => (
        <div key={k} className="flex items-center justify-between py-1">
          <span className="ff-body" style={{ color: C.ink, fontSize: 14 }}>{GROUP_META[k].label}</span>
          <NumInput value={draft[k]} onChange={(v) => setField(k, v)} ariaLabel={`${GROUP_META[k].label} total for this period`} />
        </div>
      ))}

      <div className="flex items-center justify-between py-2 mt-1" style={{ borderTop: `1px solid ${C.border}` }}>
        <span className="ff-body" style={{ color: C.muted, fontSize: 13 }}>Net profit</span>
        <span className="ff-num" style={{ color: net >= 0 ? C.primary : C.coral, fontWeight: 600, fontSize: 15 }}>{fmtSigned(net)}</span>
      </div>
    </>
  );
}

function AnnualScreen({ state, calc, setState, isDesktop }) {
  const freq = state.payFrequency || "biweekly";
  const periodsPerYear = freq === "weekly" ? 52 : freq === "job" ? 12 : 26;
  const weeksPerPeriod = freq === "weekly" ? 1 : freq === "job" ? 52 / 12 : 2;

  // "By the job" has no fixed cycle, so project off a trailing average of saved
  // periods instead of one snapshot — more honest for irregular income.
  const recentJobHistory = freq === "job" ? state.history.slice(-3) : [];
  const useTrailingAvg = freq === "job" && recentJobHistory.length > 0;
  const avg = (key) => recentJobHistory.reduce((a, h) => a + h[key], 0) / recentJobHistory.length;

  // Projection basis: a trailing average of real saved periods when we have them
  // ("by the job"), otherwise the plan (committed expenses) — never the in-flight
  // period's raw partial actuals, which mid-period would project e.g. one logged
  // coffee × 26. baseNet is derived as income − expenses so the trailing and plan
  // paths stay consistent (avg is linear, so this equals avg(netProfit)).
  const baseIncome = useTrailingAvg ? avg("income") : calc.incomeBudget;
  const baseExp = useTrailingAvg ? avg("totalExpenses") : calc.committedExpenses;
  const baseNet = baseIncome - baseExp;
  const savingsPerPeriod = useTrailingAvg ? avg("savings") : calc.groupBudget.savings;
  const annualIncome = baseIncome * periodsPerYear, annualExp = baseExp * periodsPerYear, annualNet = baseNet * periodsPerYear;
  const annualSavings = savingsPerPeriod * periodsPerYear;
  // Extra income from the "bonus" paychecks a year — the 26-vs-24 (biweekly) or
  // 52-vs-48 (weekly) gap between pay periods and calendar months. Derived from the
  // pay frequency, not read off a hard-coded seed income id that silently returns 0
  // the moment the user deletes and re-adds their bonus line (new ids are timestamped).
  const extraChecksPerYear = freq === "weekly" ? 4 : freq === "job" ? 0 : 2;
  const extraPerYear = calc.incomeBudget * extraChecksPerYear;

  const proj = [
    { name: "Income", value: annualIncome, color: C.primary },
    { name: "Expenses", value: annualExp, color: C.coral },
    { name: "Net", value: annualNet, color: C.gold },
  ];

  const milestones = [
    { label: "Projected annual net", value: fmt(annualNet), color: annualNet >= 0 ? C.primary : C.coral },
    { label: "Monthly avg profit", value: fmt(annualNet / 12) },
    { label: "Weeks to $500 fund", value: savingsPerPeriod > 0 ? Math.ceil(500 / savingsPerPeriod * weeksPerPeriod) + " wks" : "—" },
    { label: "Years to $10k saved", value: annualSavings > 0 ? (10000 / annualSavings).toFixed(1) + " yrs" : "—" },
    { label: "Bonus pay / year", value: fmt(extraPerYear) },
    { label: "Bonus paycheck value", value: fmt(calc.incomeBudget) },
  ];

  const hist = state.history;
  const totals = hist.reduce((a, h) => ({ netProfit: a.netProfit + h.netProfit }), { netProfit: 0 });
  const trendData = hist.slice(-8).map((h) => ({
    name: "P" + h.periodNumber,
    netProfit: h.netProfit,
    savingsRate: h.income ? h.savings / h.income : 0,
  }));
  const deletePeriod = (id) => setState((s) => ({ ...s, history: normalizeHistory(s.history.filter((h) => h.id !== id)) }));

  // edit an existing saved period in place — recompute its expense/net totals from
  // the edited category values so the same invariants hold as a freshly-saved one
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const draftFromHistory = (h) => {
    const d = { payDate: h.payDate || new Date().toISOString().slice(0, 10), income: h.income };
    GROUP_KEYS.forEach((k) => { d[k] = h[k]; });
    return d;
  };
  const startEdit = (h) => { setAdding(false); setEditingId(h.id); setEditDraft(draftFromHistory(h)); };
  const cancelEdit = () => { setEditingId(null); setEditDraft(null); };
  const saveEdit = () => {
    setState((s) => ({
      ...s,
      // Editing a pay date can reorder history, so re-normalize (sort + renumber).
      history: normalizeHistory(s.history.map((h) => {
        if (h.id !== editingId) return h;
        const c = {};
        GROUP_KEYS.forEach((k) => { c[k] = num(editDraft[k]); });
        const totalExpenses = GROUP_KEYS.reduce((a, k) => a + c[k], 0);
        return { ...h, payDate: editDraft.payDate, income: num(editDraft.income), ...c, totalExpenses, netProfit: num(editDraft.income) - totalExpenses };
      })),
    }));
    cancelEdit();
  };

  // manually add a past period — e.g. one from before you started using the
  // app, or one you forgot to save at the time
  const emptyDraft = () => ({ payDate: new Date().toISOString().slice(0, 10), income: 0,
    housing: 0, food: 0, transport: 0, debt: 0, savings: 0, personal: 0 });
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const draftExpenses = GROUP_KEYS.reduce((a, k) => a + num(draft[k]), 0);
  const draftNet = num(draft.income) - draftExpenses;
  const addPeriod = () => {
    setState((s) => {
      const c = {};
      GROUP_KEYS.forEach((k) => { c[k] = num(draft[k]); });
      const snap = {
        id: "p_" + Date.now(), periodNumber: nextPeriodNumber(s.history), payDate: draft.payDate,
        income: num(draft.income), ...c, totalExpenses: draftExpenses, netProfit: draftNet,
      };
      // normalizeHistory slots a back-filled past period into date order and renumbers.
      return { ...s, history: normalizeHistory([...s.history, snap]) };
    });
    setDraft(emptyDraft());
    setAdding(false);
  };

  const projectionSection = (
    <>
      <SectionTitle>Annual projection</SectionTitle>
      <div className="ff-body px-1 mb-2" style={{ color: C.muted, fontSize: 12 }}>
        {useTrailingAvg
          ? `Based on the average of your last ${recentJobHistory.length} saved period${recentJobHistory.length > 1 ? "s" : ""} × 12 months.`
          : freq === "job"
            ? "Based on this period × 12 months — save a few periods for a steadier average."
            : `Based on this period × ${periodsPerYear} pay periods.`}
      </div>
      <Card data-tour="annual-chart" className="p-4">
        <div style={{ height: 190 }}>
          <Suspense fallback={<ChartSkeleton />}>
            <CategoryBarChart data={proj} margin={{ top: 6, right: 6, left: -8, bottom: 0 }} yTickFormatter={(v) => "$" + (v / 1000).toFixed(0) + "k"} />
          </Suspense>
        </div>
      </Card>
    </>
  );

  const trendSection = trendData.length >= 2 ? (
    <>
      <SectionTitle>Your trend</SectionTitle>
      <Card data-tour="trends" className="p-4">
        <div style={{ height: 180 }}>
          <Suspense fallback={<ChartSkeleton />}>
            <TrendChart data={trendData} />
          </Suspense>
        </div>
        <div className="ff-body mt-1" style={{ color: C.muted, fontSize: 12 }}>
          Net profit and savings rate over your last {trendData.length} saved periods.
        </div>
      </Card>
    </>
  ) : null;

  const milestonesSection = (
    <>
      <SectionTitle>Milestones</SectionTitle>
      <div data-tour="milestones" className="grid grid-cols-2 gap-3">
        {milestones.map((mi, i) => (
          <Card key={i} className="p-3">
            <div className="ff-body" style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3 }}>{mi.label}</div>
            <div className="ff-num" style={{ color: mi.color || C.ink, fontSize: 18, fontWeight: 600, marginTop: 3 }}>{mi.value}</div>
          </Card>
        ))}
      </div>
    </>
  );

  const historySection = (
    <>
      <div data-tour="history">
        <SectionTitle right={<button onClick={() => setAdding((a) => !a)} style={{ color: C.primary }}><Plus size={18} /></button>}>Pay period history</SectionTitle>
      </div>

      {adding && (
        <Card className="p-4 mb-3">
          <div className="ff-body mb-2" style={{ color: C.muted, fontSize: 12 }}>
            Add a past period — e.g. one from before you started using the app.
          </div>
          <PeriodDraftFields draft={draft} setField={(k, v) => setDraft((d) => ({ ...d, [k]: v }))} />
          <div className="flex gap-2 mt-3">
            <button onClick={() => { setAdding(false); setDraft(emptyDraft()); }} className="flex-1 rounded-xl py-2.5" style={{ background: C.bg, color: C.ink, border: `1px solid ${C.border}` }}>
              <span className="ff-body" style={{ fontWeight: 600, fontSize: 14 }}>Cancel</span>
            </button>
            <button onClick={addPeriod} className="flex-1 rounded-xl py-2.5" style={{ background: C.primary, color: "#fff" }}>
              <span className="ff-body" style={{ fontWeight: 600, fontSize: 14 }}>Add period</span>
            </button>
          </div>
        </Card>
      )}

      {hist.length === 0 ? (
        <Card className="p-5 text-center">
          <CalendarDays size={28} color={C.muted} style={{ margin: "0 auto 8px" }} />
          <div className="ff-body" style={{ color: C.ink, fontSize: 14, fontWeight: 600 }}>No periods logged yet</div>
          <div className="ff-body mt-1" style={{ color: C.muted, fontSize: 13 }}>
            Enter your spending on the Track tab, then tap “Save this period” to start building your 26-period year.
          </div>
        </Card>
      ) : (
        <Card className="px-4 py-2">
          {hist.map((h, i) => (
            <div key={h.id} className="py-2" style={{ borderTop: i ? `1px solid ${C.border}` : "none" }}>
              <div className="flex items-center">
                <div className="flex-1" style={{ minWidth: 0 }}>
                  <div className="ff-body" style={{ color: C.ink, fontSize: 14, fontWeight: 600 }}>Period {h.periodNumber}</div>
                  <div className="ff-body" style={{ color: C.muted, fontSize: 12 }}>{fmtDate(h.payDate)} · in {fmt(h.income)} · out {fmt(h.totalExpenses)}</div>
                </div>
                <div className="ff-num" style={{ color: h.netProfit >= 0 ? C.primary : C.coral, fontWeight: 600, fontSize: 15 }}>{fmtSigned(h.netProfit)}</div>
                <button onClick={() => (editingId === h.id ? cancelEdit() : startEdit(h))} className="p-1 ml-2" style={{ color: editingId === h.id ? C.primary : C.muted }}><Pencil size={15} /></button>
                <button onClick={() => deletePeriod(h.id)} className="p-1 ml-1" style={{ color: C.muted }}><Trash2 size={15} /></button>
              </div>
              {editingId === h.id && editDraft && (
                <div className="mt-2 rounded-2xl p-3" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                  <PeriodDraftFields draft={editDraft} setField={(k, v) => setEditDraft((d) => ({ ...d, [k]: v }))} />
                  <div className="flex gap-2 mt-3">
                    <button onClick={cancelEdit} className="flex-1 rounded-xl py-2" style={{ background: C.surface, color: C.ink, border: `1px solid ${C.border}` }}>
                      <span className="ff-body" style={{ fontWeight: 600, fontSize: 13 }}>Cancel</span>
                    </button>
                    <button onClick={saveEdit} className="flex-1 rounded-xl py-2" style={{ background: C.primary, color: "#fff" }}>
                      <span className="ff-body" style={{ fontWeight: 600, fontSize: 13 }}>Save changes</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          <div className="flex items-center py-2 mt-1" style={{ borderTop: `2px solid ${C.border}` }}>
            <span className="ff-body flex-1" style={{ color: C.ink, fontWeight: 700, fontSize: 14 }}>{hist.length} periods · net</span>
            <span className="ff-num" style={{ color: totals.netProfit >= 0 ? C.primary : C.coral, fontWeight: 700, fontSize: 16 }}>{fmtSigned(totals.netProfit)}</span>
          </div>
        </Card>
      )}
    </>
  );

  // Desktop: charts + milestones on the left, the pay-period history on the right.
  if (isDesktop) {
    return (
      <div className="pb-2">
        <div style={{ display: "grid", gridTemplateColumns: "1.05fr 1fr", gap: 24, alignItems: "start" }}>
          <div>{projectionSection}{trendSection}{milestonesSection}</div>
          <div>{historySection}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pb-2">
      {projectionSection}
      {trendSection}
      {milestonesSection}
      {historySection}
    </div>
  );
}

/* ============================== PIN lock ============================== */
function PinLock({ pin, onUnlock }) {
  const [entry, setEntry] = useState("");
  const [shake, setShake] = useState(false);
  const press = (d) => {
    const next = (entry + d).slice(0, 4);
    setEntry(next);
    if (next.length === 4) {
      if (next === pin) onUnlock();
      else { setShake(true); setTimeout(() => { setShake(false); setEntry(""); }, 400); }
    }
  };
  return (
    <div className="flex flex-col items-center justify-center" style={{ minHeight: "100vh", background: C.bg }}>
      <Lock size={28} color={C.primary} />
      <div className="ff-display mt-3" style={{ color: C.ink, fontSize: 18, fontWeight: 600 }}>Enter your PIN</div>
      <div className="flex gap-3 mt-5" style={{ animation: shake ? "shk 0.4s" : "none" }}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} style={{ width: 14, height: 14, borderRadius: 999, background: i < entry.length ? C.primary : "transparent", border: `2px solid ${i < entry.length ? C.primary : C.border}` }} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4 mt-8">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button key={n} onClick={() => press(String(n))} className="ff-num rounded-full" style={{ width: 64, height: 64, background: C.surface, border: `1px solid ${C.border}`, color: C.ink, fontSize: 22 }}>{n}</button>
        ))}
        <span />
        <button onClick={() => press("0")} className="ff-num rounded-full" style={{ width: 64, height: 64, background: C.surface, border: `1px solid ${C.border}`, color: C.ink, fontSize: 22 }}>0</button>
        <button onClick={() => setEntry(entry.slice(0, -1))} className="rounded-full flex items-center justify-center" style={{ width: 64, height: 64, color: C.muted }}><Delete size={22} /></button>
      </div>
    </div>
  );
}

/* ============================== settings ============================== */
function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportJson(state) {
  const stamp = new Date().toISOString().slice(0, 10);
  // Don't write the soft-lock PIN into a file the user might email or drop in cloud
  // storage — a shared backup shouldn't carry it. They re-set it on import if wanted.
  const safe = { ...state, settings: { ...state.settings, pin: "" } };
  downloadFile(`biweekly-budget-backup-${stamp}.json`, JSON.stringify(safe, null, 2), "application/json");
}

// Wrap a CSV field in quotes (escaping embedded quotes) when it contains a comma,
// quote, or newline — so a category label like "Food, dining" can't shift columns.
function csvCell(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportHistoryCsv(state) {
  const headers = ["Period", "Pay date", "Income", ...GROUP_KEYS.map((k) => GROUP_META[k].label), "Total expenses", "Net profit"];
  const rows = state.history.map((h) => [
    h.periodNumber, h.payDate, h.income, ...GROUP_KEYS.map((k) => h[k]), h.totalExpenses, h.netProfit,
  ]);
  const csv = [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
  const stamp = new Date().toISOString().slice(0, 10);
  downloadFile(`biweekly-budget-history-${stamp}.csv`, csv, "text/csv");
}

function WelcomeSheet({ name, onClose, onStartTour }) {
  return (
    <div className="fixed inset-0 flex items-end justify-center" style={{ background: C.overlay, zIndex: 70 }} onClick={onClose}>
      <div className="w-full rounded-t-3xl p-5" style={{ background: C.surface, maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-center mb-3">
          <span style={{ width: 40, height: 4, borderRadius: 2, background: C.border, display: "block" }} />
        </div>
        <span className="ff-display block" style={{ color: C.ink, fontSize: 20, fontWeight: 700 }}>
          {name ? `Welcome, ${name}!` : "Welcome!"}
        </span>
        <div className="ff-body mt-2" style={{ color: C.inkSoft, fontSize: 14, lineHeight: 1.5 }}>
          This app exists for one reason: to help you break the paycheck-to-paycheck cycle,
          one pay period at a time. You're not behind — you're building a plan, and that's the
          whole game.
        </div>

        <div className="mt-4 space-y-3">
          <div className="flex gap-3">
            <Wallet size={18} color={C.primary} style={{ flexShrink: 0, marginTop: 2 }} />
            <div className="ff-body" style={{ color: C.ink, fontSize: 14 }}>
              <b>Budget</b> — set what you make and plan to spend each pay period. This is the only place you type in numbers.
            </div>
          </div>
          <div className="flex gap-3">
            <PlusCircle size={18} color={C.primary} style={{ flexShrink: 0, marginTop: 2 }} />
            <div className="ff-body" style={{ color: C.ink, fontSize: 14 }}>
              <b>Track</b> — log what actually happens as the period goes, so you always know where you stand.
            </div>
          </div>
          <div className="flex gap-3">
            <CalendarDays size={18} color={C.primary} style={{ flexShrink: 0, marginTop: 2 }} />
            <div className="ff-body" style={{ color: C.ink, fontSize: 14 }}>
              <b>Monthly</b> — see your plan zoomed out across the whole month, bonus paychecks included.
            </div>
          </div>
          <div className="flex gap-3">
            <TrendingUp size={18} color={C.primary} style={{ flexShrink: 0, marginTop: 2 }} />
            <div className="ff-body" style={{ color: C.ink, fontSize: 14 }}>
              <b>Annual</b> — watch every saved period add up into real, long-term progress.
            </div>
          </div>
        </div>

        <div className="ff-body mt-4" style={{ color: C.muted, fontSize: 13 }}>
          Everything else — goals, savings rate, projections — is calculated for you. You've got this.
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 rounded-2xl py-3" style={{ background: C.bg, color: C.ink, border: `1px solid ${C.border}` }}>
            <span className="ff-body" style={{ fontWeight: 600, fontSize: 15 }}>Let's go</span>
          </button>
          <button onClick={onStartTour} className="flex-1 rounded-2xl py-3" style={{ background: C.primary, color: "#fff" }}>
            <span className="ff-body" style={{ fontWeight: 600, fontSize: 15 }}>Show me around</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsSheet({ state, setState, onClose, onReset, onSyncNow, syncBusy, authUser, authBusy, authMessage, onSendMagicLink, onLogIn, onCreateAccount, onSetPassword, onSignOut, onStartTour }) {
  const [pinDraft, setPinDraft] = useState(state.settings.pin || "");
  const [emailDraft, setEmailDraft] = useState(getLastEmail());
  const [pwDraft, setPwDraft] = useState("");
  const [showAuthExtra, setShowAuthExtra] = useState(false); // magic-link fallback (signed out) / set-password panel (signed in)
  const cloudOn = supabaseConfigured();

  const handleImportFile = (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.income)) throw new Error("not a backup file");
        if (window.confirm("Import this backup? It will replace all data currently on this device.")) {
          setState(normalizeState(parsed));
        }
      } catch {
        window.alert("That file doesn't look like a valid backup.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 flex items-end justify-center" style={{ background: C.overlay, zIndex: 50 }} onClick={onClose}>
      <div className="w-full rounded-t-3xl p-5" style={{ background: C.surface, maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <span className="ff-display" style={{ color: C.ink, fontSize: 18, fontWeight: 600 }}>Settings</span>
          <button onClick={onClose} style={{ color: C.muted }}><X size={20} /></button>
        </div>

        <label className="ff-body block" style={{ color: C.muted, fontSize: 12 }}>Your name</label>
        <input value={state.settings.name} placeholder="optional"
          onChange={(e) => setState((s) => ({ ...s, settings: { ...s.settings, name: e.target.value } }))}
          className="ff-body w-full rounded-xl px-3 py-2 mt-1 mb-4 outline-none" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.ink, fontSize: 15 }} />

        <div data-tour="goal-fields">
          <label className="ff-body block" style={{ color: C.muted, fontSize: 12 }}>Bi-weekly savings goal</label>
          <div className="mt-1 mb-4"><NumInput value={state.goal} onChange={(v) => setState((s) => ({ ...s, goal: v }))} align="left" ariaLabel="Bi-weekly savings goal" /></div>

          <label className="ff-body block" style={{ color: C.muted, fontSize: 12 }}>Savings rate goal</label>
          <div className="mt-1 mb-4"><PercentInput value={state.savingsRateGoal} onChange={(v) => setState((s) => ({ ...s, savingsRateGoal: v }))} ariaLabel="Savings rate goal percent" /></div>
        </div>

        <label className="ff-body block" style={{ color: C.muted, fontSize: 12 }}>Current period started</label>
        <input type="date" value={state.periodStart || ""} onChange={(e) => setState((s) => ({ ...s, periodStart: e.target.value }))}
          className="ff-body rounded-xl px-3 py-2 mt-1 mb-4 outline-none" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.ink, fontSize: 15 }} />

        <label className="ff-body block mb-2" style={{ color: C.muted, fontSize: 12 }}>Pay frequency</label>
        <div className="flex gap-2 mb-4">
          {[
            { id: "biweekly", label: "Bi-weekly", paychecks: 2 },
            { id: "weekly", label: "Weekly", paychecks: 4 },
            { id: "job", label: "By the job", paychecks: 1 },
          ].map((f) => {
            const active = (state.payFrequency || "biweekly") === f.id;
            return (
              <button key={f.id}
                onClick={() => setState((s) => ({ ...s, payFrequency: f.id, monthlyPaychecks: f.paychecks }))}
                className="flex-1 ff-body rounded-xl py-2" style={{
                  fontSize: 12, fontWeight: 600,
                  background: active ? C.primary : C.bg,
                  color: active ? "#fff" : C.ink,
                  border: `1px solid ${active ? C.primary : C.border}`,
                }}>
                {f.label}
              </button>
            );
          })}
        </div>

        {/* sync */}
        <div data-tour="sync-section" className="rounded-2xl p-3 mb-4" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-2 mb-1">
            {cloudOn ? <RefreshCw size={15} color={C.primary} /> : <CloudOff size={15} color={C.muted} />}
            <span className="ff-body" style={{ color: C.ink, fontSize: 14, fontWeight: 600 }}>Cloud sync</span>
          </div>
          {cloudOn ? (
            authUser ? (
              <>
                <div className="ff-body" style={{ color: C.muted, fontSize: 12, marginBottom: 8 }}>
                  Signed in as <span style={{ color: C.ink, fontWeight: 600 }}>{authUser.email}</span>. Sign in with
                  this same email on your other device to share one budget.
                </div>
                <div className="flex gap-2">
                  <button onClick={onSyncNow} disabled={syncBusy}
                    className="flex-1 ff-body rounded-xl py-2" style={{ background: C.primary, color: "#fff", fontWeight: 600, fontSize: 13, opacity: syncBusy ? 0.6 : 1 }}>
                    {syncBusy ? "Syncing…" : "Sync now"}
                  </button>
                  <button onClick={onSignOut}
                    className="flex-1 ff-body rounded-xl py-2" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.ink, fontWeight: 600, fontSize: 13 }}>
                    Sign out
                  </button>
                </div>
                {showAuthExtra ? (
                  <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${C.border}` }}>
                    <input value={pwDraft} placeholder="new password (6+ characters)" type="password" autoComplete="new-password"
                      onChange={(e) => setPwDraft(e.target.value)}
                      className="ff-body w-full rounded-xl px-3 py-2 outline-none" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.ink, fontSize: 14 }} />
                    <button onClick={() => onSetPassword(pwDraft)} disabled={authBusy || !pwDraft}
                      className="ff-body w-full mt-2 rounded-xl py-2" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.ink, fontWeight: 600, fontSize: 13, opacity: authBusy || !pwDraft ? 0.6 : 1 }}>
                      {authBusy ? "Saving…" : "Save password"}
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setShowAuthExtra(true)} className="ff-body w-full mt-2" style={{ color: C.muted, fontSize: 11, textDecoration: "underline" }}>
                    Set a password for this account
                  </button>
                )}
                {authMessage && (
                  <div className="ff-body mt-2" style={{ color: C.inkSoft, fontSize: 12 }}>{authMessage}</div>
                )}
              </>
            ) : (
              <>
                <div className="ff-body" style={{ color: C.muted, fontSize: 12, marginBottom: 8 }}>
                  Log in with your email &amp; password to load your budget — this works on any device. New here? Create an account.
                </div>
                <input value={emailDraft} placeholder="you@example.com" type="email" autoComplete="email"
                  onChange={(e) => setEmailDraft(e.target.value.trim())}
                  className="ff-body w-full rounded-xl px-3 py-2 outline-none" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.ink, fontSize: 14 }} />
                <input value={pwDraft} placeholder="password (6+ characters)" type="password" autoComplete="current-password"
                  onChange={(e) => setPwDraft(e.target.value)}
                  className="ff-body w-full mt-2 rounded-xl px-3 py-2 outline-none" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.ink, fontSize: 14 }} />
                <div className="flex gap-2 mt-2">
                  <button onClick={() => onLogIn(emailDraft, pwDraft)} disabled={authBusy || !emailDraft || !pwDraft}
                    className="flex-1 ff-body rounded-xl py-2" style={{ background: C.primary, color: "#fff", fontWeight: 600, fontSize: 13, opacity: authBusy || !emailDraft || !pwDraft ? 0.6 : 1 }}>
                    {authBusy ? "Working…" : "Log in"}
                  </button>
                  <button onClick={() => onCreateAccount(emailDraft, pwDraft)} disabled={authBusy || !emailDraft || !pwDraft}
                    className="flex-1 ff-body rounded-xl py-2" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.ink, fontWeight: 600, fontSize: 13, opacity: authBusy || !emailDraft || !pwDraft ? 0.6 : 1 }}>
                    Create account
                  </button>
                </div>
                {authMessage && (
                  <div className="ff-body mt-2" style={{ color: C.inkSoft, fontSize: 12 }}>{authMessage}</div>
                )}
                {showAuthExtra ? (
                  <button onClick={() => onSendMagicLink(emailDraft)} disabled={authBusy || !emailDraft}
                    className="ff-body w-full mt-2 rounded-xl py-2" style={{ background: C.surface, border: `1px dashed ${C.border}`, color: C.inkSoft, fontWeight: 600, fontSize: 12, opacity: authBusy || !emailDraft ? 0.6 : 1 }}>
                    {authBusy ? "Sending…" : "Email me a one-time sign-in link instead"}
                  </button>
                ) : (
                  <button onClick={() => setShowAuthExtra(true)} className="ff-body w-full mt-2" style={{ color: C.muted, fontSize: 11, textDecoration: "underline" }}>
                    Forgot password? Use a one-time email link
                  </button>
                )}
              </>
            )
          ) : (
            <div className="ff-body" style={{ color: C.muted, fontSize: 12 }}>
              Add your Supabase keys to <span className="ff-num">.env</span> to turn this on. Until then your data is saved on this device.
            </div>
          )}
        </div>

        {/* backup */}
        <div data-tour="backup-section" className="rounded-2xl p-3 mb-4" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-2 mb-2">
            <Download size={15} color={C.primary} />
            <span className="ff-body" style={{ color: C.ink, fontSize: 14, fontWeight: 600 }}>Backup</span>
          </div>
          <div className="ff-body" style={{ color: C.muted, fontSize: 12, marginBottom: 8 }}>
            Save a full copy of your data, or your pay period history as a spreadsheet.
          </div>
          <div className="flex gap-2">
            <button onClick={() => exportJson(state)} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2"
              style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.ink }}>
              <Download size={14} /> <span className="ff-body" style={{ fontSize: 13, fontWeight: 600 }}>Export JSON</span>
            </button>
            <button onClick={() => exportHistoryCsv(state)} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2"
              style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.ink }}>
              <Download size={14} /> <span className="ff-body" style={{ fontSize: 13, fontWeight: 600 }}>Export CSV</span>
            </button>
          </div>
          <label className="flex items-center justify-center gap-1.5 rounded-xl py-2 mt-2 cursor-pointer"
            style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.ink }}>
            <Upload size={14} /> <span className="ff-body" style={{ fontSize: 13, fontWeight: 600 }}>Import JSON</span>
            <input type="file" accept="application/json" onChange={handleImportFile} style={{ display: "none" }} />
          </label>
        </div>

        <div className="flex items-center justify-between py-2">
          <span className="ff-body" style={{ color: C.ink, fontSize: 15 }}>Dark mode</span>
          <input type="checkbox" checked={state.settings.darkMode}
            onChange={(e) => setState((s) => ({ ...s, settings: { ...s.settings, darkMode: e.target.checked } }))} />
        </div>

        <div data-tour="theme-picker" className="py-2 mb-2">
          <span className="ff-body block mb-2" style={{ color: C.ink, fontSize: 15 }}>Theme</span>
          <div className="flex flex-wrap gap-2">
            {THEMES.map((t) => {
              const active = (state.settings.theme || "classic") === t.id;
              return (
                <button key={t.id} onClick={() => setState((s) => ({ ...s, settings: { ...s.settings, theme: t.id } }))}
                  className="ff-body px-3 py-1.5 rounded-full"
                  style={{
                    fontSize: 12, fontWeight: 600,
                    background: active ? C.primary : C.bg,
                    color: active ? "#fff" : C.ink,
                    border: `1px solid ${active ? C.primary : C.border}`,
                  }}>
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {(state.settings.theme || "classic") !== "classic" && (
          <div className="flex items-center justify-between py-2">
            <span className="ff-body" style={{ color: C.ink, fontSize: 15 }}>Character & effects</span>
            <input type="checkbox" checked={state.settings.themeFx}
              onChange={(e) => setState((s) => ({ ...s, settings: { ...s.settings, themeFx: e.target.checked } }))} />
          </div>
        )}

        <div className="flex items-center justify-between py-2">
          <span className="ff-body" style={{ color: C.ink, fontSize: 15 }}>Lock with a PIN</span>
          <input type="checkbox" checked={state.settings.pinEnabled}
            onChange={(e) => setState((s) => ({ ...s, settings: { ...s.settings, pinEnabled: e.target.checked, pin: e.target.checked ? (s.settings.pin || "") : "" } }))} />
        </div>
        {state.settings.pinEnabled && (
          <div className="mb-4">
            <input value={pinDraft} inputMode="numeric" maxLength={4} placeholder="4-digit PIN"
              onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 4); setPinDraft(v); setState((s) => ({ ...s, settings: { ...s.settings, pin: v } })); }}
              className="ff-num w-full rounded-xl px-3 py-2 mt-1 outline-none tracking-widest" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.ink, fontSize: 18 }} />
          </div>
        )}

        <button onClick={onStartTour} className="w-full flex items-center justify-center gap-2 rounded-2xl py-3 mt-2" style={{ background: C.bg, color: C.ink, border: `1px solid ${C.border}` }}>
          <Target size={16} /> <span className="ff-body" style={{ fontWeight: 600, fontSize: 14 }}>Take a tour</span>
        </button>

        <button onClick={onReset} className="w-full flex items-center justify-center gap-2 rounded-2xl py-3 mt-2" style={{ background: C.surfaceDanger, color: C.coral }}>
          <RotateCcw size={16} /> <span className="ff-body" style={{ fontWeight: 600, fontSize: 14 }}>Reset all data</span>
        </button>
      </div>
    </div>
  );
}

/* ============================== root ============================== */
const SCREENS = [
  { id: "home", label: "Home", icon: Home },
  { id: "budget", label: "Budget", icon: Wallet },
  { id: "track", label: "Track", icon: PlusCircle },
  { id: "monthly", label: "Monthly", icon: CalendarDays },
  { id: "annual", label: "Annual", icon: TrendingUp },
];

/* ===== desktop shell (≥1024px): left sidebar rail + wide multi-column content =====
   Shares every screen component and all state with the mobile shell — only the
   chrome differs. Save + Settings keep their data-tour anchors so the Tour still
   finds them here. */
function Sidebar({ name, screen, setScreen, onSave, saveBusy, onOpenSettings, authUser, cloudOn }) {
  return (
    <aside style={{ width: 248, flexShrink: 0, height: "100vh", position: "sticky", top: 0, background: C.surface, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", padding: "22px 14px" }}>
      <div className="px-2 mb-5">
        <div className="ff-display" style={{ color: C.ink, fontSize: 19, fontWeight: 700, lineHeight: 1.15 }}>Bi-Weekly Budget</div>
        <div className="ff-body" style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>{name ? `Hi, ${name}` : "Your money"}</div>
      </div>
      <nav className="flex flex-col gap-1">
        {SCREENS.map((s) => {
          const I = s.icon, active = screen === s.id;
          return (
            <button key={s.id} onClick={() => setScreen(s.id)}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 ff-body text-left"
              style={{ background: active ? C.primary : "transparent", color: active ? "#fff" : C.inkSoft, fontWeight: active ? 600 : 500, fontSize: 14.5 }}>
              <I size={19} color={active ? "#fff" : C.muted} strokeWidth={active ? 2.4 : 2} style={{ flexShrink: 0 }} />
              {s.label}
            </button>
          );
        })}
      </nav>
      <div className="mt-auto flex flex-col gap-2 pt-4">
        {cloudOn && <AccountBanner authUser={authUser} cloudOn={cloudOn} onManage={onOpenSettings} />}
        <div className="flex gap-2">
          <button data-tour="save-button" onClick={onSave} disabled={saveBusy}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5" style={{ background: C.primary, color: "#fff", opacity: saveBusy ? 0.6 : 1 }}>
            <Save size={15} /> <span className="ff-body" style={{ fontWeight: 600, fontSize: 13 }}>{saveBusy ? "Saving…" : "Save"}</span>
          </button>
          <button data-tour="settings-gear" onClick={onOpenSettings} aria-label="Settings"
            className="rounded-xl p-2.5" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.inkSoft }}>
            <Settings size={18} />
          </button>
        </div>
      </div>
    </aside>
  );
}

function DesktopShell({ title, name, screen, setScreen, onSave, saveBusy, onOpenSettings, authUser, cloudOn, children }) {
  return (
    <div className="app-root" style={{ minHeight: "100vh", display: "flex", alignItems: "flex-start" }}>
      <Sidebar name={name} screen={screen} setScreen={setScreen} onSave={onSave} saveBusy={saveBusy}
        onOpenSettings={onOpenSettings} authUser={authUser} cloudOn={cloudOn} />
      <main className="flex-1" style={{ minWidth: 0 }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 32px 72px" }}>
          <h1 className="ff-display" style={{ color: C.ink, fontSize: 26, fontWeight: 700, marginBottom: 18 }}>{title}</h1>
          {children}
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState(DEFAULT_STATE);
  const [loaded, setLoaded] = useState(false);
  const [screen, setScreen] = useState("home");
  const [showSettings, setShowSettings] = useState(false);
  const [touring, setTouring] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [toast, setToast] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [authUser, setAuthUser] = useState(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");

  // Initial load: render instantly from the local copy (synchronous — no network,
  // no Supabase import), then reconcile with the cloud in the background, adopting
  // it only if it's newer than what this device last saved. Previously the first
  // paint awaited the whole cloud round-trip (download the ~210KB Supabase SDK +
  // validate the login + fetch the row), which is what made "Loading your budget…"
  // linger for signed-in users even though their data was already on the device.
  useEffect(() => {
    const local = loadLocal();
    if (local) setState(normalizeState(local));
    setLoaded(true);
    (async () => {
      try {
        const cloud = await pullCloud();
        if (cloud && (cloud._updatedAt || 0) > localUpdatedAt()) setState(normalizeState(cloud));
      } catch { /* offline / cloud unreachable — the local copy is already showing */ }
    })();
  }, []);

  // debounced persist on any change
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => { saveState(state); }, 400);
    return () => clearTimeout(t);
  }, [state, loaded]);

  // Flush immediately when the app is backgrounded/closed, so a change made
  // right before switching away (e.g. picking a theme, then leaving the PWA)
  // isn't lost to the 400ms debounce getting cut off — common on mobile.
  const stateRef = useRef(state);
  stateRef.current = state; // updated synchronously during render (not via useEffect) so it's
                             // never a tick stale if the app backgrounds right after a change
  useEffect(() => {
    if (!loaded) return;
    const flush = () => { saveState(stateRef.current); };
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
    };
  }, [loaded]);

  // track sign-in state for cloud sync (Phase 3 real auth — see CLAUDE.md and supabase/schema.sql)
  useEffect(() => {
    if (!supabaseConfigured()) return;
    getUser().then(setAuthUser);
    return onAuthChange(async (user, event) => {
      setAuthUser(user);
      // On a genuine sign-in (e.g. the magic-link landing), the account is the
      // source of truth: pull this email's saved budget and load it, so signing
      // in on any device brings your data back. If the account has no row yet,
      // seed it with whatever's on this device.
      if (user && event === "SIGNED_IN") {
        if (user.email) setLastEmail(user.email);
        const cloud = await pullCloud();
        if (cloud) {
          setState(normalizeState(cloud));
          showToast("Your budget is synced to this account");
        } else {
          await saveState(stateRef.current);
          showToast("This device is now saved to your account");
        }
      }
    });
  }, []);

  // "classic" theme follows the dark mode toggle; the fun themes are self-contained
  // looks (colors + fonts + accents in index.css) and ignore dark mode.
  useEffect(() => {
    const theme = state.settings.theme && state.settings.theme !== "classic"
      ? state.settings.theme
      : (state.settings.darkMode ? "dark" : "light");
    document.documentElement.dataset.theme = theme;
  }, [state.settings.darkMode, state.settings.theme]);

  const calc = useCalc(state);
  const isDesktop = useIsDesktop(); // ≥1024px → sidebar + multi-column shell; below → mobile shell

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2400); };

  // notify once when nearing (>=80%) and once when meeting the savings goal this period
  const goalTierRef = useRef(null);
  useEffect(() => {
    if (!loaded || num(state.goal) <= 0) return;
    // Notify on REAL saved progress (logged savings), not the committed/planned
    // figure — otherwise editing the budget up to the goal would fire "goal met".
    const savedRatio = calc.groupActual.savings / num(state.goal);
    const tier = savedRatio >= 1 ? 2 : savedRatio >= 0.8 ? 1 : 0;
    if (goalTierRef.current === null) { goalTierRef.current = tier; return; }
    if (tier > goalTierRef.current) {
      showToast(tier === 2 ? "🎉 Goal met — you set aside your full savings goal this period" : "Almost there — you're close to your savings goal");
    }
    goalTierRef.current = tier;
  }, [loaded, calc.groupActual.savings, state.goal]);

  const savePeriod = useCallback(() => {
    setState((s) => {
      const snap = buildPeriodSnapshot(s, nextPeriodNumber(s.history), new Date().toISOString().slice(0, 10));
      return {
        ...s, history: normalizeHistory([...s.history, snap]),
        period: emptyPeriod(),
        periodStart: addDays(s.periodStart, advanceDaysFor(s.payFrequency)),
      };
    });
    showToast("Period saved to your Annual tracker");
    setScreen("annual");
  }, []);

  // Automatic rollover: when the current pay period ends, archive it and start a
  // fresh one — no button required. Runs on load and whenever the app returns to
  // the foreground (so a period that ends while the app is open still rolls over).
  useEffect(() => {
    if (!loaded) return;
    const run = () => {
      const res = autoRollover(stateRef.current);
      if (!res) return;
      setState(res.next);
      showToast(res.saved ? "Last pay period saved to your history" : "A new pay period has started");
    };
    run();
    const onVis = () => { if (document.visibilityState === "visible") run(); };
    document.addEventListener("visibilitychange", onVis);
    // Also check periodically while the app stays open, so a period that ends with
    // the tab in the foreground still rolls over without needing a blur/refocus.
    const timer = setInterval(run, 3600000); // hourly
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // Explicit save: persist locally and, when signed in, push to this account's
  // cloud row immediately (rather than waiting on the debounced auto-save).
  const saveNow = useCallback(async () => {
    setSaveBusy(true);
    const { cloudSaved } = await saveState(stateRef.current);
    setSaveBusy(false);
    const wantsCloud = supabaseConfigured() && authUser;
    showToast(wantsCloud
      ? (cloudSaved ? "Saved to your account" : "Saved on this device — couldn't reach the cloud")
      : "Saved on this device");
  }, [authUser]);

  const syncNow = useCallback(async () => {
    setSyncBusy(true);
    const cloud = await pullCloud();
    // Only adopt the cloud copy when it's genuinely newer than what this device
    // last saved; otherwise a stale cloud row (e.g. edits made here while offline
    // that never reached it) would overwrite newer local data. When local is
    // newer, push it up instead so both ends converge on the latest.
    const cloudNewer = cloud && (cloud._updatedAt || 0) > localUpdatedAt();
    if (cloudNewer) {
      setState(normalizeState(cloud));
      showToast("Pulled the latest from the cloud");
    } else {
      const { cloudSaved } = await saveState(state);
      showToast(cloudSaved
        ? (cloud ? "This device had the latest — saved it up" : "Saved this device to the cloud")
        : "Couldn't reach the cloud — saved on this device");
    }
    setSyncBusy(false);
  }, [state]);

  const sendMagicLink = useCallback(async (email) => {
    setAuthBusy(true);
    setAuthMessage("");
    const { error } = await signInWithEmail(email);
    if (!error) setLastEmail(email); // remember it so this device always pre-fills the same address
    setAuthMessage(error ? "Couldn't send that link — check the email and try again." : `Check ${email} for a sign-in link.`);
    setAuthBusy(false);
  }, []);

  // Email + password login — works on any device (unlike the magic link, which
  // must be opened on the device you're signing in on). SIGNED_IN then pulls the
  // account's cloud budget automatically.
  const logIn = useCallback(async (email, password) => {
    setAuthBusy(true);
    setAuthMessage("");
    const { error } = await signInWithPassword(email, password);
    if (!error) setLastEmail(email);
    else setAuthMessage(/invalid/i.test(error.message) ? "Wrong email or password. New here? Tap Create account." : error.message);
    setAuthBusy(false);
  }, []);

  const createAccount = useCallback(async (email, password) => {
    if (!password || password.length < 6) { setAuthMessage("Pick a password of at least 6 characters."); return; }
    setAuthBusy(true);
    setAuthMessage("");
    const { data, error } = await signUpWithPassword(email, password);
    if (error) {
      setAuthMessage(/registered|exists/i.test(error.message) ? "That email already has an account — tap Log in instead." : error.message);
    } else {
      setLastEmail(email);
      // If the project requires email confirmation, there's no session yet.
      setAuthMessage(data?.session ? "" : `Account created. Check ${email} to confirm it, then log in.`);
    }
    setAuthBusy(false);
  }, []);

  const setPassword = useCallback(async (password) => {
    if (!password || password.length < 6) { setAuthMessage("Pick a password of at least 6 characters."); return; }
    setAuthBusy(true);
    setAuthMessage("");
    const { error } = await updatePassword(password);
    setAuthMessage(error ? error.message : "Password set — you can now log in with it on any device.");
    setAuthBusy(false);
  }, []);

  const handleSignOut = useCallback(async () => {
    // Flush the latest to this account's cloud while still signed in. Only wipe the
    // device once that write has actually landed — otherwise an offline sign-out
    // would clearLocal() away the sole copy and restore a stale budget next login.
    const { cloudSaved } = await saveState(stateRef.current);
    if (!cloudSaved && !window.confirm(
      "Couldn't save your latest changes to the cloud — you may be offline. " +
      "Sign out anyway? Your changes stay saved on this device."
    )) return;
    if (cloudSaved) clearLocal(); // cloud has the latest; next account starts clean
    await signOut();
    window.location.reload();
  }, []);

  const reset = () => { setState(DEFAULT_STATE); setShowSettings(false); showToast("All data reset"); };

  if (!loaded) {
    return <div className="flex items-center justify-center" style={{ minHeight: "100vh", background: C.bg }}>
      <span className="ff-body" style={{ color: C.muted }}>Loading your budget…</span>
    </div>;
  }

  if (state.settings.pinEnabled && state.settings.pin.length === 4 && !unlocked) {
    return <PinLock pin={state.settings.pin} onUnlock={() => setUnlocked(true)} />;
  }

  const title = { home: state.settings.name ? `Hi, ${state.settings.name}` : "Your money", budget: "Budget", track: "Track spending", monthly: "Monthly", annual: "Annual" }[screen];

  // One place the active screen is chosen, shared by both shells; isDesktop lets
  // each screen switch to a multi-column layout on wide viewports.
  const renderScreen = () => {
    switch (screen) {
      case "home": return <Dashboard state={state} calc={calc} setScreen={setScreen} authUser={authUser} cloudOn={supabaseConfigured()} onOpenSettings={() => setShowSettings(true)} isDesktop={isDesktop} />;
      case "budget": return <BudgetScreen state={state} setState={setState} calc={calc} isDesktop={isDesktop} />;
      case "track": return <TrackScreen state={state} setState={setState} calc={calc} onSavePeriod={savePeriod} isDesktop={isDesktop} />;
      case "monthly": return <MonthlyScreen state={state} setState={setState} calc={calc} isDesktop={isDesktop} />;
      case "annual": return <AnnualScreen state={state} calc={calc} setState={setState} isDesktop={isDesktop} />;
      default: return null;
    }
  };

  // Modals/overlays are position:fixed and self-center — shared by both shells.
  const overlays = (
    <>
      {toast && (
        <div className="fixed left-0 right-0 flex justify-center" style={{ bottom: "calc(100px + env(safe-area-inset-bottom, 0px))", zIndex: 60 }}>
          <div className="ff-body flex items-center gap-2 px-4 py-2 rounded-full" style={{ background: C.ink, color: "#fff", fontSize: 13 }}>
            <Check size={15} color={C.primaryBright} /> {toast}
          </div>
        </div>
      )}
      {showSettings && (
        <SettingsSheet state={state} setState={setState} onClose={() => setShowSettings(false)} onReset={reset}
          onSyncNow={syncNow} syncBusy={syncBusy}
          authUser={authUser} authBusy={authBusy} authMessage={authMessage}
          onSendMagicLink={sendMagicLink} onLogIn={logIn} onCreateAccount={createAccount} onSetPassword={setPassword} onSignOut={handleSignOut}
          onStartTour={() => { setShowSettings(false); setTouring(true); }} />
      )}
      {!state.settings.hasSeenWelcome && (
        <WelcomeSheet name={state.settings.name}
          onClose={() => setState((s) => ({ ...s, settings: { ...s.settings, hasSeenWelcome: true } }))}
          onStartTour={() => {
            setState((s) => ({ ...s, settings: { ...s.settings, hasSeenWelcome: true } }));
            setTouring(true);
          }} />
      )}
      {touring && (
        <TourOverlay screen={screen} setScreen={setScreen} showSettings={showSettings} setShowSettings={setShowSettings}
          onFinish={() => setTouring(false)} />
      )}
    </>
  );

  if (isDesktop) {
    return (
      <>
        <DesktopShell title={title} name={state.settings.name} screen={screen} setScreen={setScreen}
          onSave={saveNow} saveBusy={saveBusy} onOpenSettings={() => setShowSettings(true)}
          authUser={authUser} cloudOn={supabaseConfigured()}>
          {renderScreen()}
        </DesktopShell>
        {overlays}
      </>
    );
  }

  return (
    <div className="app-root" style={{ minHeight: "100vh", maxWidth: 480, margin: "0 auto", position: "relative" }}>
      <div className="flex items-center justify-between px-4 pt-4 pb-1">
        <h1 className="ff-display" style={{ color: C.ink, fontSize: 22, fontWeight: 700 }}>{title}</h1>
        <div className="flex items-center gap-2">
          <button data-tour="save-button" onClick={saveNow} disabled={saveBusy}
            className="flex items-center gap-1.5 rounded-full pl-2.5 pr-3 py-2" style={{ background: C.primary, color: "#fff", opacity: saveBusy ? 0.6 : 1 }}>
            <Save size={15} /> <span className="ff-body" style={{ fontWeight: 600, fontSize: 13 }}>{saveBusy ? "Saving…" : "Save"}</span>
          </button>
          <button data-tour="settings-gear" onClick={() => setShowSettings(true)} className="rounded-full p-2" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.inkSoft }}>
            <Settings size={18} />
          </button>
        </div>
      </div>

      <div style={{ paddingBottom: "calc(92px + env(safe-area-inset-bottom, 0px))" }}>
        {renderScreen()}
      </div>

      <div className="fixed left-0 right-0 bottom-0 flex justify-center" style={{ zIndex: 40 }}>
        <div className="flex w-full bottom-nav" style={{ maxWidth: 480 }}>
          {SCREENS.map((s) => {
            const I = s.icon, active = screen === s.id;
            return (
              <button key={s.id} onClick={() => setScreen(s.id)} className="flex-1 flex flex-col items-center gap-1 py-2.5">
                <I size={21} color={active ? C.primary : C.muted} strokeWidth={active ? 2.4 : 2} />
                <span className="ff-body" style={{ fontSize: 10.5, color: active ? C.primary : C.muted, fontWeight: active ? 600 : 500 }}>{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {overlays}
    </div>
  );
}
