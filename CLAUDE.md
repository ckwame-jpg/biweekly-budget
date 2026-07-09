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
- **Phase 3 (this repo, in progress):** real Supabase Auth + per-user RLS is wired
  in code (magic-link email, `schema.sql` scoped by `auth.uid()`); no live Supabase
  project is connected yet — the user needs to create one and confirm cost first
  (see guardrail below). Remaining: deploy to Vercel. **This is where you are now.**

## How to run
```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # production build in dist/
npm run preview      # serve the build locally (test the PWA/service worker here)
```
Node 18+ required for the dev server. Supabase is **optional** — the app runs fully
on-device without it; sync turns on once `.env` is filled (see README).

## The product, in two inputs
The user only ever enters **(1) income** and **(2) spending**. Everything else is
**computed** — never ask the user to type a number the app can derive.

### Five screens (bottom nav)
1. **Home** — hero "Money Left Over this period" + spend gauge, quick stats, spending donut, savings-goal status.
2. **Budget** — the source of truth: edit every income & expense line per pay period.
3. **Track** — log Week 1 / Week 2 actuals; net-profit summary, goal, "Save this period to history".
4. **Monthly** — budget vs actual at ×2 (normal) or ×3 (bonus month) + the 50/30/20 bonus-paycheck split.
5. **Annual** — projection (×26), milestones, and the saved pay-period history.

## Math rules — IMPORTANT (`src/lib/calc.js` is the single source of truth)
- 26 pay periods/year; 2 of those months have 3 paychecks.
- **Every category total = the sum of its line items.** (This fixes an Excel bug
  where the Profit Calculator only counted rent for Housing instead of rent + all
  utilities + insurance. Do not reintroduce per-sheet hardcoded category totals.)
- Monthly = bi-weekly × 2; bonus month = bi-weekly × 3.
- Net Profit = Gross Profit − Total Expenses;  Gross Profit = Income − COGS.
- Money Left Over = Income − Total Expenses.
- Savings Rate = Savings ÷ Income.
- **In-period figures (net profit, money-left, savings) use "committed" expenses**
  = per category `max(logged actual, budget)`. Unspent budget is still coming this
  period (rent/bills), so logging a little can only reveal you're going OVER a
  category, never under. This replaced an `anyActual` cliff where one small logged
  actual collapsed expenses to just that amount and inflated net profit for the rest
  of the period. The Home pace gauge (spentSoFar ÷ budget, via `spendStatusKey`,
  which also weighs time elapsed) is a separate signal and still uses raw actuals.
- Annual projection = trailing average of saved history (by-the-job) else committed
  expenses × periods/year — never the in-flight period's raw partial actuals.
- Bonus paycheck = one bi-weekly income; suggested split 50% debt / 30% savings / 20% fun.

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
                       split into components/ only if it clearly helps)
  main.jsx             React entry
  index.css            Tailwind + Google fonts + all theme CSS variables (--bg, --primary,
                       --font-display, --card-shadow, etc.) + fx-* keyframes for mascots
  components/
    ThemeMascot.jsx    reactive per-theme mascot (happy/neutral/worried) + idle ambient fx;
                       purely decorative, gated by settings.themeFx and reduced-motion
  lib/
    theme.js           palette (C, values are var(--x) refs) + THEMES list + GROUP_KEYS/META
    defaults.js        DEFAULT_STATE (starter numbers = placeholders, user overwrites)
    format.js          num, sumLines, fmt, fmtSigned, pct, fmtDate, cyclePosition
    calc.js            computeCalc(state) + useCalc() — ALL derived math lives here.
                       Has a Vitest suite: calc.test.js (`npm test`) — keep it green.
    hooks.js           useReducedMotion, useCountUp
    supabase.js        lazy client + auth helpers (signInWithEmail/signOut/getUser/onAuthChange);
                       everything no-ops when env vars are absent
    storage.js         localStorage + cloud sync scoped to the signed-in user (last-write-wins)
supabase/schema.sql    budget_state(user_id uuid pk references auth.users, state jsonb, updated_at),
                       RLS scoped to auth.uid() — Phase 3, see "Sync model" below
public/                icons + favicon; vite-plugin-pwa generates the manifest/SW
```

### Data model (the whole app state, persisted as one JSON blob)
```
settings { name, pinEnabled, pin, darkMode, theme, themeFx }
goal                      // bi-weekly $ savings goal
savingsRateGoal           // target share of income saved, decimal (0.2 = 20%)
periodStart               // ISO date the current 14-day cycle began; advances +14d on save
monthlyPaychecks          // 2 | 3
income  [ {id,name,amount} ]
groups  { housing|food|transport|debt|savings|personal: { lines:[{id,name,amount}] } }
period  { week1:{lineId:amt}, week2:{lineId:amt}, cogs:{materials,labor,shipping}, cogsOn }
monthlyActual { housing,food,transport,debt,savings,personal }  // legacy/unused: the
                       // Monthly "actual" column is now DERIVED from history that lands
                       // in the current month + the in-flight period (monthlyActualsFromHistory)
history [ {id, periodNumber, payDate (ISO), income, <6 group totals>, totalExpenses, netProfit} ]
```

## Sync model (Phase 3: real auth + per-user RLS)
Sign-in is a Supabase Auth magic-link email (no password) — `supabase.js` exposes
`signInWithEmail`/`signOut`/`getUser`/`onAuthChange`. Rows in `budget_state` are
keyed by `user_id` and scoped by RLS to `auth.uid()` (see `schema.sql`); signing in
with the same email on two devices is what shares one budget between them.
`storage.js` reads local first, then the signed-in user's cloud row, and keeps
whichever `_updatedAt` is newer. Still last-write-wins (fine for one person's own
devices) — no multi-user sharing on a single account yet. **No live Supabase
project is connected in this repo** — the auth UI in Settings only appears once
the user fills in `.env` themselves (see guardrail below and README §3).

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
- **5 other themes** (`settings.theme`: 8bit/anime/medieval/cyberpunk/pirate, picked
  in Settings) each swap the full palette + fonts + corner radius + card shadow —
  see the `[data-theme="..."]` blocks in `index.css`. **Always keep primary in the
  green family and coral in the red family across every theme** — that's the
  on-track/over-budget signal and must stay legible no matter the skin.
- Non-classic themes get a small reactive mascot on Home (`ThemeMascot.jsx`) whose
  mood follows `calc.ratio`, plus idle ambient CSS animation — both toggleable via
  `settings.themeFx` and auto-disabled under `prefers-reduced-motion`.
- Signature: the green hero "runway" gauge that drains toward coral as spending rises.
- Green = on track, coral = over. Keep it warm and personal.
- Styling is mostly inline styles + a few Tailwind utilities. Tailwind is fully
  configured here (unlike the prototype), so arbitrary values are fine if useful.

## Conventions / guardrails
- Keep `calc.js` the only place math lives. Screens read from `useCalc`.
- Don't add a backend beyond Supabase without asking.
- **Never create a Supabase project or run paid infra without the user choosing the
  org and confirming cost.** Provide SQL/steps; let them run it.
- Make surgical changes; don't rewrite working screens to "improve" them.
- Quality floor: responsive to ~360px wide, visible focus, respects reduced motion.

## Backlog
Done: initial console-error pass, both open decisions, Annual edit/delete + real pay
dates, per-period cycle indicator, `computeCalc` tests (Vitest), export/import
(JSON + CSV), real Supabase Auth + RLS in code, dark mode, 5 extra visual themes
(8-bit/anime/medieval/cyberpunk/pirate) with reactive mascots, a savings-rate goal.

Remaining:
1. Deploy to Vercel; verify install-to-home-screen and offline load. Needs the
   user's GitHub/Vercel accounts — prepare/confirm, don't execute unilaterally.
2. If the user creates a real Supabase project: walk them through README §3, then
   smoke-test sign-in + sync end to end (currently only unit-testable via code review,
   since no live project is connected).
3. Consider code-splitting if the ~590KB bundle warning from `vite build` starts to
   matter (recharts + supabase-js are the bulk of it) — not urgent for a personal PWA.
