// Interactive spotlight tour: dims the screen, cuts a glowing highlight around
// the target element (via a giant box-shadow, not a real DOM mask), and points
// a short connector line + arrow at it from a tooltip card. Purely a guided
// walkthrough — it only ever calls the setScreen/setShowSettings props it's
// given, never touches budget data.
import { useState, useEffect } from "react";
import { C } from "../lib/theme.js";

export const TOUR_STEPS = [
  { screen: "home", target: "settings-gear", title: "Settings", text: "Tap the gear anytime for goals, themes, backups, and sync." },
  { screen: "home", target: "goal-fields", title: "Your goals", text: "Set a dollar savings goal and a savings-rate goal — both get tracked automatically.", openSettings: true },
  { screen: "home", target: "theme-picker", title: "Make it yours", text: "Pick light or dark, or a fully themed skin — each with its own colors, fonts, and a little reactive mascot.", openSettings: true },
  { screen: "home", target: "backup-section", title: "Backups", text: "Export a full backup anytime, or import one back in.", openSettings: true },
  { screen: "home", target: "sync-section", title: "Cloud sync", text: "Sign in with email to keep one budget in sync across every device you own.", openSettings: true },
  { screen: "home", target: "hero", title: "Money Left Over", text: "What's left after every bill and your savings goal — the number that matters most, front and center." },
  { screen: "home", target: "stats", title: "Quick stats", text: "Your income, total expenses, and savings rate for this period, at a glance." },
  { screen: "home", target: "quickactions", title: "Jump right in", text: "Log spending or edit your budget with one tap, right from Home." },
  { screen: "home", target: "donut", title: "Where it goes", text: "A breakdown of your planned spending by category — tap a slice for the exact number." },
  { screen: "home", target: "goalcard", title: "Goal tracking", text: "Your savings goal, net profit, and savings rate — all measured against your targets in one chart." },
  { screen: "budget", target: "income-section", title: "Budget: Income", text: "Add every paycheck or income source here. This is the only place you type in numbers — everything else is calculated for you." },
  { screen: "budget", target: "category-section", title: "Expense categories", text: "Expenses are grouped into six categories. Add, rename, or delete any line item freely." },
  { screen: "track", target: "track-income", title: "Track: log as you go", text: "Your income carries over from the Budget tab automatically — here you just log what you actually spend." },
  { screen: "track", target: "track-summary", title: "Live summary", text: "Net profit and savings rate update in real time as you log actuals." },
  { screen: "track", target: "save-period", title: "Save this period", text: "When the period ends, save it here — it's added to your Annual history and a fresh period begins." },
  { screen: "monthly", target: "paycheck-toggle", title: "Normal vs. bonus months", text: "Switch to a bonus month when you get an extra paycheck — the app splits it 50/30/20 for you automatically." },
  { screen: "monthly", target: "budget-vs-actual", title: "Budget vs. actual", text: "Your monthly plan compared to what actually happened, category by category." },
  { screen: "annual", target: "annual-chart", title: "Annual projection", text: "Your current numbers, projected out across the whole year." },
  { screen: "annual", target: "trends", title: "Your trend", text: "Once you've saved a couple of periods, see your net profit and savings rate move over time." },
  { screen: "annual", target: "milestones", title: "Milestones", text: "Handy markers — weeks to a cushion, years to a savings target, and more." },
  { screen: "annual", target: "history", title: "Pay period history", text: "Every saved period lives here. Edit a date, delete an entry, or manually add one from the past." },
];

export function TourOverlay({ screen, setScreen, showSettings, setShowSettings, onFinish }) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState(null);
  const [thankYou, setThankYou] = useState(false);
  const total = TOUR_STEPS.length;
  const current = TOUR_STEPS[step];

  // keep the app on whatever screen/settings-open state this step needs
  useEffect(() => {
    if (!current) return;
    if (screen !== current.screen) setScreen(current.screen);
    const wantSettings = !!current.openSettings;
    if (wantSettings !== showSettings) setShowSettings(wantSettings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // measure (and keep measuring) the current target's position
  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    const measure = () => {
      const el = document.querySelector(`[data-tour="${current.target}"]`);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        if (!cancelled) setRect(el.getBoundingClientRect());
      } else if (!cancelled) {
        setRect(null);
      }
    };
    const t = setTimeout(measure, 320); // let screen/settings switch render first
    const onScrollOrResize = () => {
      const el = document.querySelector(`[data-tour="${current.target}"]`);
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      cancelled = true;
      clearTimeout(t);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [step]);

  const next = () => { setRect(null); if (step < total - 1) setStep((s) => s + 1); else setThankYou(true); };
  const back = () => { setRect(null); if (step > 0) setStep((s) => s - 1); };
  const leave = () => { setShowSettings(false); onFinish(); };

  if (thankYou) {
    return (
      <div className="fixed inset-0 flex items-center justify-center p-6" style={{ background: "rgba(10,15,12,0.8)", zIndex: 100 }}>
        <div className="rounded-3xl p-6 text-center" style={{ background: C.surface, maxWidth: 380 }}>
          <div style={{ fontSize: 40 }}>🎉</div>
          <div className="ff-display" style={{ color: C.ink, fontSize: 22, fontWeight: 700, marginTop: 8 }}>Thank you for downloading!</div>
          <div className="ff-body mt-2" style={{ color: C.inkSoft, fontSize: 14, lineHeight: 1.5 }}>
            That's everything the app can do. Now let's put it to work — head to Budget and enter your real numbers whenever you're ready.
          </div>
          <button onClick={leave} className="w-full mt-5 rounded-2xl py-3" style={{ background: C.primary, color: "#fff", fontWeight: 600, fontSize: 15 }}>
            <span className="ff-body">Start budgeting</span>
          </button>
        </div>
      </div>
    );
  }

  const viewportH = typeof window !== "undefined" ? window.innerHeight : 800;
  const placeBelow = rect ? rect.bottom + 170 < viewportH : true;

  return (
    <>
      {/* blocks interaction with the app underneath while touring */}
      <div className="fixed inset-0" style={{ zIndex: 95 }} />

      {/* spotlight cutout (or a plain dim if the target isn't on screen yet) */}
      {rect ? (
        <div style={{
          position: "fixed", top: rect.top - 6, left: rect.left - 6,
          width: rect.width + 12, height: rect.height + 12,
          borderRadius: 14, border: `2px solid ${C.primary}`,
          boxShadow: `0 0 0 9999px rgba(10,15,12,0.72), 0 0 18px ${C.primary}`,
          pointerEvents: "none", zIndex: 96, transition: "all 0.35s ease",
        }} />
      ) : (
        <div className="fixed inset-0" style={{ background: "rgba(10,15,12,0.72)", zIndex: 96 }} />
      )}

      {/* connector line + arrowhead */}
      {rect && (
        <div style={{
          position: "fixed", left: rect.left + rect.width / 2 - 1,
          top: placeBelow ? rect.bottom + 6 : rect.top - 16,
          width: 2, height: 10, background: C.primary, zIndex: 97, pointerEvents: "none",
        }}>
          <div style={{
            position: "absolute", left: -4, top: placeBelow ? 10 : -6,
            width: 0, height: 0,
            borderLeft: "5px solid transparent", borderRight: "5px solid transparent",
            borderTop: placeBelow ? `6px solid ${C.primary}` : "none",
            borderBottom: placeBelow ? "none" : `6px solid ${C.primary}`,
          }} />
        </div>
      )}

      {/* tooltip card */}
      <div style={{
        position: "fixed", left: "50%", transform: "translateX(-50%)",
        top: rect ? (placeBelow ? rect.bottom + 16 : undefined) : "50%",
        bottom: rect && !placeBelow ? (viewportH - rect.top + 16) : undefined,
        marginTop: !rect ? -80 : undefined,
        width: "calc(100% - 32px)", maxWidth: 400, zIndex: 98,
      }}>
        <div className="rounded-2xl p-4" style={{ background: C.surface, border: `1px solid ${C.border}`, boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }}>
          <div className="flex items-center justify-between mb-1">
            <span className="ff-body" style={{ color: C.muted, fontSize: 11 }}>{step + 1} of {total}</span>
            <button onClick={leave} className="ff-body" style={{ color: C.muted, fontSize: 12 }}>Skip tour</button>
          </div>
          <div className="ff-display" style={{ color: C.ink, fontSize: 16, fontWeight: 700 }}>{current.title}</div>
          <div className="ff-body mt-1" style={{ color: C.inkSoft, fontSize: 13, lineHeight: 1.45 }}>{current.text}</div>
          <div className="flex gap-2 mt-3">
            {step > 0 && (
              <button onClick={back} className="flex-1 rounded-xl py-2" style={{ background: C.bg, color: C.ink, border: `1px solid ${C.border}` }}>
                <span className="ff-body" style={{ fontWeight: 600, fontSize: 13 }}>Back</span>
              </button>
            )}
            <button onClick={next} className="flex-1 rounded-xl py-2" style={{ background: C.primary, color: "#fff" }}>
              <span className="ff-body" style={{ fontWeight: 600, fontSize: 13 }}>{step === total - 1 ? "Finish" : "Next"}</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
