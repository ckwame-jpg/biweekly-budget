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
- **Phase 5 (in progress):** prep for a *public* launch. Decided direction: launch
  as a **free public web/PWA at a real domain first** (native app-store packaging via
  Capacitor is DEFERRED until demand is validated — do NOT scaffold it yet), keep the
  app free, and measure appetite for a future paid **"Plus"** tier with a lightweight
  in-app interest button (see "Public-launch scaffolding" below). Monetization model
  chosen: freemium subscription later (free on-device core; Plus = cloud sync +
  premium themes), NOT ads and NOT selling data. See the Backlog for open manual steps.

## How to run
```bash
npm install
npm run dev          # http://localhost:5173
npm test             # Vitest: calc/period/defaults/format/storage .test.js — keep green
npx playwright test  # touch-event e2e (iPhone profile; auto-starts the dev server itself)
npm run build        # production build in dist/
npm run preview      # serve the build locally (test the PWA/service worker here)
```
Node 18+ required for the dev server. Supabase is **optional** — the app runs fully
on-device without it; sync turns on once `.env` is filled (see README).

**CI** (`.github/workflows/ci.yml`): on every push to `master`/`main` and every PR,
GitHub Actions runs `npm ci` → vitest → build → the Playwright touch e2e (WebKit).
It needs no secrets (the app builds/tests fully without Supabase env). This guards
the branch Vercel deploys, so a broken commit from either developer is caught before
it ships. Playwright's `webServer` config boots the dev server in CI automatically.

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
                       signInWithPassword/signUpWithPassword/updatePassword,
                       sendPasswordReset + isRecoveryLink/getUrlAuthError/
                       completeUrlSession/clearUrlAuthParams (see "Sync model" —
                       reset-link detection reads the URL directly, not an auth
                       event), signOut/getUser/onAuthChange; everything no-ops
                       when env vars are absent
    storage.js         localStorage + cloud sync scoped to the signed-in user; loadLocal()
                       is the synchronous first-paint read (no network/Supabase import) —
                       loadState() (local+cloud reconciled) is kept for callers that want
                       one awaited result; newerOf/localUpdatedAt for timestamp-aware sync;
                       remembers last sign-in email; clearLocal on sign-out. Tested:
                       storage.test.js.
e2e/touch.spec.js      Playwright touch-event test (iPhone 13 profile)
supabase/schema.sql    budget_state(user_id uuid pk references auth.users, state jsonb, updated_at)
                       + plus_interest(id, email, source, created_at) — RLS scoped to
                       auth.uid() for budget_state; plus_interest is INSERT-only (see
                       "Public-launch scaffolding")
supabase/functions/delete-account/index.ts
                       Deno Edge Function: deletes the CALLER's own auth user (id taken
                       from their JWT, never the body) with the service role key, which
                       can't live in the browser. Deployed live (verify_jwt on). Backs
                       the in-app "Delete my account" button (App Store 5.1.1(v)).
public/                icons + favicon; vite-plugin-pwa generates the manifest/SW.
                       Also public/privacy.html + public/terms.html — standalone static
                       legal pages served at /privacy.html and /terms.html (Vercel serves
                       real files before the SPA rewrite). Both still contain a
                       REPLACE_WITH_SUPPORT_EMAIL placeholder — swap in a real support
                       address before public launch.
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
vars). **Email + password is the only sign-in method** (`signInWithPassword` /
`signUpWithPassword`, plus `updatePassword` for changing it while signed in) —
deliberately kept simple; there is no magic-link or emailed-code sign-in
fallback (tried and removed — see Backlog). Rows in `budget_state` are keyed by
`user_id` and scoped by RLS to `auth.uid()` (see `schema.sql`); signing in with
the same email + password on two devices shares one budget.

**Forgotten password**: `sendPasswordReset(email)` emails a reset link via
Supabase's `resetPasswordForEmail`, `redirectTo: window.location.origin`.
Unlike the removed sign-in code/link, a reset link is fine to open in a
browser tab even outside the installed app — the user sets a new password
there and then just logs into the installed app normally afterward; no
session needs to transfer between browser and app.

Detecting the redirect does NOT rely on catching Supabase's `PASSWORD_RECOVERY`
auth event as the primary signal — that event can fire (the client detects the
URL as soon as `createClient()` runs) *before* this app's listener even
attaches, since attaching it is behind an async dynamic import of the whole
SDK; relying on it silently missed real reset links. Instead, `passwordRecovery`
state is initialized synchronously on first render straight from the URL
(`isRecoveryLink()` in supabase.js, checking for `type=recovery` in the hash or
query — no client, no race), which is what actually decides whether
`PasswordRecoveryScreen` shows (same render-priority tier as `PinLock`). The
`PASSWORD_RECOVERY` event listener is kept only as a redundant backup.
`completeUrlSession()` handles the PKCE variant (`?code=...` must be explicitly
exchanged; the implicit flow's hash tokens are auto-consumed by the client).
An expired/already-used link comes back as `#error=...` instead of a valid
token — `getUrlAuthError()` catches that and `PasswordRecoveryScreen` shows a
plain explanation + a way back in, rather than a form that can only fail.
`finishPasswordReset` sets the new password, strips the token from the URL bar
(`clearUrlAuthParams`), and pulls the account's cloud budget. Requires this
app's origin(s) — localhost for dev, the Vercel URL for prod — to be
allow-listed as Redirect URLs in the Supabase dashboard (Authentication → URL
Configuration), or the link won't come back to the right place at all.

**First paint never waits on the cloud**: the initial-load effect reads
`loadLocal()` synchronously (no network, no Supabase import) and renders
immediately, then reconciles the cloud in the background — adopting it (via
`normalizeAndRoll`, so an already-ended period archives right away) only if it's
newer than this device's last save (`localUpdatedAt`). On `SIGNED_IN` the cloud
copy is pulled and loaded unconditionally instead (the account being switched to
*is* authoritative, regardless of timestamps). The manual **"Sync now"** button
uses the same newer-wins check as the background reconcile (`newerOf`/
`localUpdatedAt` in `storage.js`) — it only *adopts* the cloud copy when it's
genuinely newer; otherwise it pushes local up, so a stale cloud row can't
clobber newer offline edits. Sign-out flushes to the cloud first and only wipes
local storage if that write is confirmed to have landed (`cloudSaved`) —
otherwise it asks before proceeding, since wiping would destroy the only copy
of unsynced changes. The last-used email is remembered per device and
pre-filled. Supabase's built-in mailer is rate-limited to a few emails/hour —
that's expected, not a bug.

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

## Public-launch scaffolding (Phase 5)
Direction chosen with the user: **free public web/PWA launch at a real domain
first**; validate demand before any paid tier or native app-store packaging.
- **Account deletion** — `deleteAccount()` (supabase.js) → the `delete-account`
  Edge Function (deployed live). Surfaced as "Delete my account permanently" in
  the signed-in Cloud-sync section of `SettingsSheet`. Required by Apple 5.1.1(v)
  for any app with in-app sign-up; also just correct for a public app.
- **Legal pages** — `public/privacy.html` + `public/terms.html`, linked from the
  Settings footer and required by both stores / for public use. Honest about what's
  collected (email + budget numbers), Supabase/Vercel as processors, no ads/tracking,
  no data sale. **Contains a REPLACE_WITH_SUPPORT_EMAIL placeholder — must be filled.**
- **"Plus — coming soon"** — `PlusInterestCard` in `SettingsSheet` + `recordPlusInterest()`
  (supabase.js) → the `plus_interest` INSERT-only table. A DEMAND SIGNAL, not a
  purchase or a real paywall: one tap (+ optional email) records interest, deduped
  per-device via a localStorage flag. Soft-fails silently (never blocks the user) and
  no-ops without cloud config. This is deliberately the *only* monetization surface
  for now — no billing/RevenueCat yet; add that only once demand shows up.
- **Share meta** — Open Graph / Twitter tags in `index.html` for link previews.

Open MANUAL steps before public launch (assistant can't do these):
- Apply the `plus_interest` table to prod (SQL is in `schema.sql`; run it in the
  Supabase SQL editor, or approve the migration). Until then the Plus button just
  soft-fails.
- Fill REPLACE_WITH_SUPPORT_EMAIL in both legal pages with a real support address
  (user leaning toward a dedicated Gmail or a custom-domain address — TBD).
- Register a real domain + point it at Vercel; add it to Supabase Redirect URLs.
- Custom SMTP (Resend) + raised email rate limit in the Supabase dashboard (in
  progress) so reset/confirmation emails deliver reliably at public volume.

## Backlog
Done: everything through Phase 3 — live Vercel deploy + live Supabase (email +
password auth only, RLS), income auto-tracking with per-period override,
automatic pay-period rollover into history (with immediate rollover on cloud
pull/import), add/edit/delete history entries (kept sorted + renumbered),
pay-frequency support, debt payoff estimate, trend chart, per-week line locks,
committed-expenses math + time-aware spend pace, derived Monthly actuals,
data-repair via `normalizeState`, instant first paint from local storage with
background cloud reconciliation, timestamp-aware sync + safer sign-out, an
emailed password-reset link (safe to open in a browser even for the installed
PWA — see Sync model), a distinct desktop/web layout (sidebar + multi-column,
mobile untouched), interactive tour + welcome sheet, 6 extra themes with
reactive mascots, dark mode, export/import (PIN stripped from exports),
code-splitting (recharts + supabase-js lazy-loaded), Vitest suites
(calc/period/defaults/format/storage) and a Playwright touch e2e.

Tried and removed: a magic-link email sign-in, then an emailed 6-digit-code
variant (Supabase's built-in mailer caps at a few emails/hour, which kept
causing "couldn't send" friction; a mistyped/missing template variable also
meant codes sometimes didn't appear in the email at all). Decided to keep auth
to email + password only rather than carry that fallback complexity — simpler
to reason about and to support. Don't silently re-add a passwordless fallback;
if reconsidered, it needs its own reliable email path (custom SMTP) first.

Remaining / known limits:
1. Cross-device sync and the password-reset link both still need a real-inbox
   smoke test by the user (assistant can verify the send/UI flow and confirm
   the request reaches Supabase cleanly, but can't click an emailed link).
2. The password-reset redirect requires this app's origin(s) to be allow-listed
   in Supabase (Authentication → URL Configuration → Redirect URLs) — if reset
   links land on an error page instead of `PasswordRecoveryScreen`, check that
   first.
3. Debt payoff ignores interest by design; optional APR field if requested.
4. App-store packaging (Capacitor) is DEFERRED — decided to launch as a free public
   web/PWA at a real domain first and validate demand before wrapping natively. When
   revisited: Capacitor (not bare TWA) for a real native shell; iOS build needs a Mac
   (or cloud-Mac/CI) since the owner is on Windows, plus the $99/yr Apple + $25 Google
   accounts. See "Public-launch scaffolding" above.
5. Going public multiplies infra cost/scrutiny: Supabase free tier won't hold public
   traffic (paid plan + email + egress), stores take 15–30%, and the soft client-side
   PIN is NOT real security — harden auth expectations before a true multi-tenant push.
