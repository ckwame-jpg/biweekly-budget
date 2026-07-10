# Bi-Weekly Budget

A personal budgeting PWA — plan a bi-weekly budget once, track Week 1 / Week 2
spending, and watch the one number that matters: **money left over this period.**
Runs as a website and installs to your phone's home screen. Optional cloud sync.

---

## 1. Run it locally

You need **Node.js 18+** ([nodejs.org](https://nodejs.org), LTS).

```bash
npm install
npm run dev
```

Open the printed URL (usually http://localhost:5173). It works immediately with
your data saved on the device — no account, no setup.

To test the installable/offline PWA behavior, build and preview:
```bash
npm run build
npm run preview
```

---

## 2. Continue building with Claude Code

Install Claude Code (native installer — no Node needed for Claude Code itself):

- **macOS / Linux / WSL:** `curl -fsSL https://claude.ai/install.sh | bash`
- **macOS (Homebrew):** `brew install --cask claude-code`
- **Windows (PowerShell):** `irm https://claude.ai/install.ps1 | iex`
- **Prefer npm?** `npm install -g @anthropic-ai/claude-code` (requires Node 18+; never use `sudo`)
- **Prefer a GUI?** The Claude desktop app runs Claude Code without a terminal.

Then, from this folder:
```bash
cd biweekly-budget
claude
```
Claude Code automatically reads **CLAUDE.md** for full project context. Paste the
kickoff prompt from **PROMPT.md** as your first message.

Docs: https://docs.claude.com/en/docs/claude-code/overview

---

## 3. Turn on cloud sync (optional)

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
   *(You pick the org and confirm any cost — do this yourself.)*
2. In the Supabase dashboard: **SQL Editor → New query**, paste the contents of
   `supabase/schema.sql`, and **Run**.
3. **Settings → API**: copy the Project URL and the `anon` public key.
4. Copy `.env.example` to `.env` and fill them in:
   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```
5. In the Supabase dashboard: **Authentication → URL Configuration**, set the Site URL
   (and add a Redirect URL) to wherever you're running the app, e.g. `http://localhost:5173`
   or your deployed Vercel URL, so the sign-in email link comes back to the right place.
6. Restart `npm run dev`. In the app: **gear → Cloud sync**, enter your email and a
   password, then tap **Create account** (first time) or **Log in**. Use the same
   email + password on every device to share one budget. (A one-time email link is
   available as a "forgot password" fallback for existing accounts — note Supabase's
   built-in mailer only sends a few auth emails per hour.)

> Rows are scoped to your signed-in user via Supabase Auth + row-level security
> (see `supabase/schema.sql`) — no sync code to type or leak, matching Phase 3 in `CLAUDE.md`.

---

## 4. Deploy to Vercel

1. Push this folder to a GitHub repo.
2. On [vercel.com](https://vercel.com): **New Project → import the repo.** The included
   `vercel.json` pins the Vite framework, build command, and SPA rewrites.
3. Add the two `VITE_SUPABASE_*` env vars in the Vercel project settings (if using sync).
4. Deploy. Open the URL on your phone → browser menu → **Add to Home Screen**.

---

## Project layout
See `CLAUDE.md` for the full map, the math rules, the data model, and the backlog.
The math lives entirely in `src/lib/calc.js`.
