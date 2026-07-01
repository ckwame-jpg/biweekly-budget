# Kickoff prompt for Claude Code

Open this folder in Claude Code (`cd biweekly-budget` then `claude`) and paste the
prompt below as your first message. It reads `CLAUDE.md` automatically, but this
sets direction.

---

You're picking up a personal bi-weekly budgeting PWA (Vite + React + Tailwind, with
optional Supabase sync). Read CLAUDE.md first — it has the product, the math rules,
the data model, the design tokens, the open decisions, and the backlog. Don't
restate it back to me; just confirm you've read it.

Then do this, in order, and pause for me where noted:

1. Run `npm install` and `npm run dev`. Open every screen (Home, Budget, Track,
   Monthly, Annual) and fix any runtime or console errors so it renders clean.
   Report what you changed.

2. Before touching any math, ask me the two OPEN DECISIONS from CLAUDE.md:
   (a) should savings stay inside expenses, and (b) should the goal tracker compare
   savings or net profit to my goal. Wait for my answers, then implement them in
   `src/lib/calc.js` only.

3. Show me a short plan for the rest of the backlog and let me pick what's next.

Rules: keep all math in `src/lib/calc.js`. Make surgical changes — don't rewrite
working screens. Don't add a backend beyond Supabase, and never create a Supabase
project or anything that costs money without me choosing the org and confirming.
Mobile-first; keep it warm and personal, green = on track, coral = over.

My situation: I'm breaking the paycheck-to-paycheck cycle and I'll mostly use this
on my phone. The starter dollar amounts are placeholders — I'll enter my real
numbers on the Budget screen.
