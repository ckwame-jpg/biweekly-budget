# CLAUDE.md

Context for Claude Code. Read this fully before changing anything.

## What this is
A personal bi-weekly budgeting **PWA** (one React codebase that runs as a website
and installs to a phone home screen). The owner is one person trying to break the
paycheck-to-paycheck cycle. It was converted from a 4-sheet Excel system. Tone:
personal and encouraging, **not** corporate banking. Mobile-first.

## Status
- **Phase 1 (done):** working single-screen prototype, validated.
- **Phase 2 (done):** real Vite + React + Tailwind PWA, service worker for install.
- **Phase 3 (done):** real Supabase Auth + per-user RLS, **live**: Supabase project
  `biweekly-budget` (free tier, user-confirmed) + Vercel deploy at
  `https://biweekly-budget-alpha.vercel.app/` (GitHub `ckwame-jpg/biweekly-budget`,
  Vercel builds the `main` branch — local work is on `master`, push to both).
- **Phase 4 (now):** the app is live and in daily use; work is iterative polish and
  fixes driven by the user's real usage. **This is where you are now.**

## How to run
```bash
npm install
npm run dev          # http://localhost:5173
npm test             # Vitest: calc/period/defaults/format/storage .test.js — keep green
npx playwright test  # touch-event e2e (iPhone profile; needs dev server on :5173)
npm run build        # production build in dist/
npm run preview      # serve the build locally (test the PWA/service worker here)
```
Node 18+ required for the dev server. Supabase is **optional** — the app runs fully
on-device without it; sync turns on once `.env` is filled (see README).

## The product, in two inputs
The user only ever enters **(1) income** and **(2) spending**. Everything else is
**computed** — never ask the user to type a number the app can derive. Income is
entered once on Budget and **auto-tracked** everywhere (Track never asks for it
again); a per-period **income override** on Track records a one-off actual that
differed from plan without touching the budget.

### Five screens (bottom nav)
1. **Home** — account/sync banner, hero "Money Left Over this period" + spend gauge, quick stats, spending donut, savings-goal status, mid-period "nothing logged" nudge.
2. **Budget** — the source of truth: edit every income & expense line per pay period; debt lines carry an optional balance → payoff estimate.
3. **Track** — log Week 1 / Week 2 spending actuals (per-line lock toggles); income auto-tracked (+ optional override); "Close this period now" for early close only.
4. **Monthly** — budget vs actual at the frequency's normal/bonus paycheck counts + the 50/30/20 bonus-paycheck split.
5. **Annual** — projection, trend chart (last 8 saved periods), milestones, and the pay-period history (add/edit/delete).

## Math rules — IMPORTANT (`src/lib/calc.js` + `src/lib/period.js` are the sources of truth)
- Pay frequency (`state.payFrequency`): biweekly = 26 periods/yr, 14-day cycle,
  months of 2–3 paychecks; weekly = 52/yr, 7-day cycle, months of 4–5; "by the
  job" = no fixed cycle (12 projection periods/yr, trailing 3-period average once
  history exists).
- **Pay periods archive to history automatically when they end** (`autoRollover`
  in `period.js`, run on load, hourly while the tab stays open, on foreground, and
  after any cloud pull/import via `normalizeAndRoll` in App.jsx). Empty elapsed
  periods advance the date without writing all-zero rows; "by the job" never
  auto-rolls. Manual "Close this period now" advances `periodStart` by a full
  cycle from the *old* start (`advanceDaysFor`), same as a normal rollover — it
  does NOT jump to today, so an early close still lands the next period on the
  real, regular payday schedule. This can put `periodStart` in the future;
  `cyclePosition` (format.js) returns `{ upcoming: true, daysUntilStart, startDate }`
  for that case so Home shows "Next period starts <date>" instead of a wrapped
  day count.
- History stays **sorted by pay date and renumbered 1..N** (`normalizeHistory`),
  so a manually back-filled past period slots into place instead of appending as
  "latest" — every write path (`autoRollover`, `savePeriod`, add/edit/delete on
  Annual) goes through it.
- **Every category total = the sum of its line items.** (This fixes an Excel bug
  where the Profit Calculator only counted rent for Housing instead of rent + all
  utilities + insurance. Do not reintroduce per-sheet hardcoded category totals.)
- Net Profit = Gross Profit − Total Expenses;  Gross Profit = Income − COGS.
- Money Left Over = Income − Total Expenses.
- Savings Rate = Savings ÷ Income (income = budgeted figure, or the period's override).
- **In-period figures (net profit, money-left, savings) use "committed" expenses**
  = per category `max(logged actual, budget)`. Unspent budget is still coming this
  period (rent/bills), so logging a little can only reveal you're going OVER a
  category, never under. This replaced an `anyActual` cliff where one small logged
  actual collapsed expenses to just that amount and inflated net profit for the rest
  of the period. The Home pace gauge (spentSoFar ÷ budget, via `spendStatusKey`,
  which also weighs time elapsed against the period's midpoint) is a separate signal
  and still uses raw actuals.
- Annual projection = trailing average of saved history (by-the-job) else committed
  expenses × periods/year — never the in-flight period's raw partial actuals.
- Debt payoff = ceil(sum of debt balances ÷ per-period debt payment), interest-free by design.
- Bonus paycheck = one period's income; the number of bonus pay periods/year is
  derived from `payFrequency` (weekly 4, biweekly 2, job 0), not a hardcoded income
  line id (a deleted-and-re-added "bonus" line gets a fresh timestamped id); suggested
  split 50% debt / 30% savings / 20% fun.

## Decisions already made — don't silently flip these
1. **Savings stays INSIDE Total Expenses** (pay-yourself-first) — confirmed. "Money
   Left Over" is what's free *after* saving.
2. **The goal tracker compares BOTH savings-set-aside and net-profit to the $ goal**
   (confirmed — user wanted both, not one or the other), shown as two bars in
   `GoalCard`, plus a third bar for a separate **savings-rate goal** (a % of income,
   `state.savingsRateGoal`) — see `calc.js`'s `goalRatio*`/`goalOnTrack*` fields.
3. PIN lock is a soft client-side lock (personal use), not security.

## Architecture / file map
```
src/
  App.jsx              all screens + nav + root state (kept together on purpose;
                       split into components/ only if it clearly helps). Renders
                       a mobile shell below 1024px and a distinct DesktopShell
                       (Sidebar + multi-column per-screen layouts) at/above it —
                       see "Responsive layout" below. Both shells share the same
                       screen components, state, math, and theming.
  main.jsx             React entry
  index.css            Tailwind + Google fonts + all theme CSS variables (--bg, --primary,
                       --font-display, --card-shadow, --hero-gradient, --overlay, etc.)
                       + fx-* keyframes for mascots
  components/
    ThemeMascot.jsx    reactive per-theme mascot (happy/neutral/worried) + idle ambient fx;
                       purely decorative, gated by settings.themeFx and reduced-motion
    Charts.jsx         all recharts chart bodies, lazy-loaded (code-split) from App.jsx
    Tour.jsx           interactive spotlight tour (TOUR_STEPS + TourOverlay); targets
                       elements by their data-tour="..." attributes (present in both shells)
  lib/
    theme.js           palette (C, values are var(--x) refs) + THEMES list + GROUP_KEYS/META
    defaults.js        DEFAULT_STATE (starter numbers = placeholders, user overwrites) +
                       normalizeState(raw) — repairs any parsed/loaded blob (partial, old,
                       or corrupt) to a shape safe for computeCalc/period.js; used on initial
                       load, cloud pull, and JSON import so a bad blob can't white-screen it.
                       Tested: defaults.test.js.
    format.js          num (coerces numeric strings too), sumLines, fmt, fmtSigned, pct,
                       fmtDate, cyclePosition (returns { upcoming, daysUntilStart, startDate }
                       for a future periodStart instead of wrapping it). Tested: format.test.js.
    calc.js            computeCalc(state) + useCalc() + spendStatusKey(ratio, elapsedFraction)
                       — ALL derived math lives here. Vitest suite: calc.test.js — keep green.
    period.js          cycleDaysFor/advanceDaysFor, nextPeriodNumber, normalizeHistory,
                       monthlyActualsFromHistory, buildPeriodSnapshot, autoRollover (pure,
                       tested: period.test.js)
    hooks.js           useReducedMotion, useCountUp, useMediaQuery, useIsDesktop
                       (matchMedia "(min-width: 1024px)", synchronous init — no flash)
    supabase.js        lazy client (dynamic import, code-split) + auth helpers:
                       password login/signup/updatePassword, magic-link fallback
                       (shouldCreateUser: false), signOut/getUser/onAuthChange;
                       everything no-ops when env vars are absent
    storage.js         localStorage + cloud sync scoped to the signed-in user; newerOf/
                       localUpdatedAt for timestamp-aware sync; remembers last sign-in
                       email; clearLocal on sign-out. Tested: storage.test.js.
e2e/touch.spec.js      Playwright touch-event test (iPhone 13 profile)
supabase/schema.sql    budget_state(user_id uuid pk references auth.users, state jsonb, updated_at),
                       RLS scoped to auth.uid() — see "Sync model" below
public/                icons + favicon; vite-plugin-pwa generates the manifest/SW
```

### Data model (the whole app state, persisted as one JSON blob)
```
settings { name, pinEnabled, pin, darkMode, theme, themeFx, hasSeenWelcome }
goal                      // per-period $ savings goal
savingsRateGoal           // target share of income saved, decimal (0.2 = 20%)
payFrequency              // "biweekly" | "weekly" | "job"
periodStart               // ISO date the current cycle began; advanced by autoRollover
                          // or a manual early close (both by a full cycle from the OLD
                          // start — see the rollover bullet above, can be a future date)
monthlyPaychecks          // biweekly 2|3, weekly 4|5, job 1
income  [ {id,name,amount} ]
groups  { housing|food|transport|debt|savings|personal: { lines:[{id,name,amount}] } }
                          // debt lines also carry balance (owed $, for the payoff estimate)
period  { week1:{lineId:amt}, week2:{lineId:amt}, cogs:{materials,labor,shipping}, cogsOn,
          incomeOverrideOn, incomeOverride,        // one-off actual income this period
          locks:{week1:{lineId:true}, week2:{…}} } // per-week read-only line locks
monthlyActual { housing,food,transport,debt,savings,personal }  // legacy/unused: the
                       // Monthly "actual" column is now DERIVED from history that lands
                       // in the current month + the in-flight period (monthlyActualsFromHistory).
                       // Kept in state for backward compatibility with old imports/saves.
history [ {id, periodNumber, payDate (ISO), income, <6 group totals>, totalExpenses, netProfit} ]
```
Old, partial, or corrupt saves are repaired to this shape on load, cloud pull, and
JSON import via `normalizeState` (`defaults.js`) — never assume a field exists
without going through it first (e.g. don't read `state.groups[k].lines` from a raw
parsed blob). `normalizeAndRoll` (App.jsx) layers an immediate `autoRollover` on
top for cloud pulls/imports, so a period that ended while the data was elsewhere
still archives right away instead of waiting for the next visibility/hourly check.

## Sync model (live: real auth + per-user RLS)
A **live Supabase project is connected** (keys in `.env` locally and in Vercel env
vars). Primary sign-in is **email + password** (`signInWithPassword` /
`signUpWithPassword`, plus `updatePassword` so magic-link-era accounts can add
one); the **magic-link email is the "forgot password" fallback only** and does
NOT create accounts (`shouldCreateUser: false` — a typo must error, not spawn a
duplicate account). Rows in `budget_state` are keyed by `user_id` and scoped by
RLS to `auth.uid()` (see `schema.sql`); signing in with the same email on two
devices shares one budget. On `SIGNED_IN` the cloud copy is pulled and loaded
unconditionally (the account being switched to is authoritative, regardless of
timestamps) via `normalizeAndRoll`. Initial `loadState()` and the manual **"Sync
now"** button are last-write-wins by `_updatedAt` instead (`newerOf`/
`localUpdatedAt` in `storage.js`) — "Sync now" only *adopts* the cloud copy when
it's genuinely newer than this device's last save; otherwise it pushes local up,
so a stale cloud row can't clobber newer offline edits. Sign-out flushes to the
cloud first and only wipes local storage if that write is confirmed to have
landed (`cloudSaved`) — otherwise it asks before proceeding, since wiping would
destroy the only copy of unsynced changes. The last-used email is remembered per
device and pre-filled. Supabase's built-in mailer is rate-limited to a few
emails/hour — that's expected, not a bug.

## Design tokens
- Colors are CSS custom properties (`--bg`, `--primary`, `--coral`, `--card-shadow`,
  `--font-display`, etc., defined in `index.css`), and `theme.js`'s `C` object just
  points at them (`C.bg = "var(--bg)"`). This is what makes theming work everywhere
  without touching individual components — never hardcode a hex color in a component;
  add/use a CSS variable instead.
- **Classic theme** (default): bg `#EEF4EF`, surface `#FFFFFF`, ink `#143226`, primary
  `#18895A`, coral `#E2563B` (over budget), gold `#E8A33D`. Space Grotesk for
  display/numbers (tabular figures), Inter for body. Light/dark controlled by
  `settings.darkMode`, applied via `document.documentElement.dataset.theme`.
- **6 other themes** (`settings.theme`: 8bit/anime/medieval/cyberpunk/pirate/pixelkitty,
  picked in Settings) each swap the full palette + fonts + corner radius + card shadow —
  see the `[data-theme="..."]` blocks in `index.css`. **Always keep primary in the
  green family and coral in the red family across every theme** — that's the
  on-track/over-budget signal and must stay legible no matter the skin.
- Non-classic themes get a small reactive mascot on Home (`ThemeMascot.jsx`) whose
  mood follows `calc.ratio`, plus idle ambient CSS animation — both toggleable via
  `settings.themeFx` and auto-disabled under `prefers-reduced-motion`.
- Signature: the green hero "runway" gauge that drains toward coral as spending rises.
  Its background is `--hero-gradient` (classic/light keeps the signature green
  gradient; every dark/fun skin derives its own from `--surface`/`--primary` instead
  of being hardcoded classic-green) — modal/sheet backdrops use `--overlay`,
  themed the same way.
- Green = on track, coral = over. Keep it warm and personal.
- Styling is mostly inline styles + a few Tailwind utilities. Tailwind is fully
  configured here (unlike the prototype), so arbitrary values are fine if useful.

## Responsive layout (mobile + desktop)
Below 1024px the app renders its original single-column mobile shell, unchanged.
At/above 1024px (`useIsDesktop`, `hooks.js`), App.jsx renders a **DesktopShell**
instead: a left **Sidebar** (nav, save button, settings gear — carries the same
`data-tour` anchors so the guided Tour works on both) plus wide, multi-column
per-screen layouts (Home 2×2 dashboard; Budget/Track categories in two columns;
Monthly table beside the summary; Annual charts + milestones beside history).
Both shells share the same screen components, state, math, and theming — only
the chrome and each screen's arrangement differ; there's no separate mobile vs.
desktop state or logic.

## Conventions / guardrails
- Keep `calc.js` the only place math lives. Screens read from `useCalc`.
- Don't add a backend beyond Supabase without asking.
- **Never create a Supabase project or run paid infra without the user choosing the
  org and confirming cost.** Provide SQL/steps; let them run it.
- Make surgical changes; don't rewrite working screens to "improve" them.
- Quality floor: responsive to ~360px wide, visible focus, respects reduced motion.

## Backlog
Done: everything through Phase 3 — live Vercel deploy + live Supabase (password
auth + magic-link fallback, RLS), income auto-tracking with per-period override,
automatic pay-period rollover into history (with immediate rollover on cloud
pull/import), add/edit/delete history entries (kept sorted + renumbered),
pay-frequency support, debt payoff estimate, trend chart, per-week line locks,
committed-expenses math + time-aware spend pace, derived Monthly actuals,
data-repair via `normalizeState`, timestamp-aware sync + safer sign-out, a
distinct desktop/web layout (sidebar + multi-column, mobile untouched),
interactive tour + welcome sheet, 6 extra themes with reactive mascots, dark
mode, export/import (PIN stripped from exports), code-splitting (recharts +
supabase-js lazy-loaded), Vitest suites (calc/period/defaults/format/storage)
and a Playwright touch e2e.

Remaining / known limits:
1. Cross-device sync round-trip still needs a real-inbox smoke test by the user
   (assistant can't complete an email sign-in).
2. Supabase's built-in mailer allows only a few auth emails/hour — fine for
   personal use; custom SMTP only if it ever becomes a real problem.
3. Debt payoff ignores interest by design; optional APR field if requested.
4. App-store packaging (TWA/Capacitor) discussed, not wanted for now — it's a PWA.
