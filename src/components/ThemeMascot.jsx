// Reactive per-theme mascot + idle ambient effects. Purely decorative — gated by
// settings.themeFx and skipped entirely for prefers-reduced-motion or the
// "classic" theme, so it never affects the math or layout of a screen.
import { useState, useRef, useEffect } from "react";
import { C } from "../lib/theme.js";

/* ---------- 8-bit: pixel-grid face, drawn as an 8x8 rect matrix ---------- */
const PIXEL_GRIDS = {
  happy: [
    [0,0,0,0,0,0,0,0],
    [0,1,1,0,0,1,1,0],
    [0,1,1,0,0,1,1,0],
    [0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0],
    [0,1,0,0,0,0,1,0],
    [0,0,1,1,1,1,0,0],
    [0,0,0,0,0,0,0,0],
  ],
  neutral: [
    [0,0,0,0,0,0,0,0],
    [0,1,1,0,0,1,1,0],
    [0,1,1,0,0,1,1,0],
    [0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0],
    [0,0,1,1,1,1,0,0],
    [0,0,0,0,0,0,0,0],
  ],
  worried: [
    [0,0,0,0,0,0,1,0],
    [0,1,1,0,0,1,1,0],
    [0,1,1,0,0,1,1,0],
    [0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0],
    [0,0,1,1,1,1,0,0],
    [0,1,0,0,0,0,1,0],
    [0,0,0,0,0,0,0,0],
  ],
};

function PixelMascot({ mood }) {
  const grid = PIXEL_GRIDS[mood];
  const size = 8;
  const cells = [];
  grid.forEach((row, y) => row.forEach((v, x) => {
    if (v) cells.push(<rect key={x + "-" + y} x={x * size} y={y * size} width={size} height={size} />);
  }));
  return (
    <svg viewBox="0 0 64 64" width="56" height="56" className="fx-mascot-bob">
      <rect x="0" y="0" width="64" height="64" rx="6" fill={C.surfaceWarm} stroke={C.border} strokeWidth="2" />
      <g fill={mood === "worried" ? C.coral : C.primary}>{cells}</g>
    </svg>
  );
}

/* ---------- Lo-fi anime: chibi face ---------- */
function AnimeMascot({ mood }) {
  const eyes = {
    happy: <path d="M20 28 Q24 22 28 28 M36 28 Q40 22 44 28" stroke="#3A2F55" strokeWidth="2.5" fill="none" strokeLinecap="round" />,
    neutral: <g fill="#3A2F55"><circle cx="24" cy="27" r="2.6" /><circle cx="40" cy="27" r="2.6" /></g>,
    worried: <g><circle cx="24" cy="28" r="2.6" fill="#3A2F55" /><circle cx="40" cy="28" r="2.6" fill="#3A2F55" />
      <path d="M20 22 L27 24 M44 22 L37 24" stroke="#3A2F55" strokeWidth="2" strokeLinecap="round" />
      <path d="M22 33 Q23 38 21 40" stroke="#8FD9E8" strokeWidth="2" fill="none" strokeLinecap="round" /></g>,
  };
  const mouth = {
    happy: <path d="M27 37 Q32 42 37 37" stroke="#3A2F55" strokeWidth="2.2" fill="none" strokeLinecap="round" />,
    neutral: <circle cx="32" cy="38" r="1.8" fill="#3A2F55" />,
    worried: <path d="M27 40 Q32 35 37 40" stroke="#3A2F55" strokeWidth="2.2" fill="none" strokeLinecap="round" />,
  };
  return (
    <svg viewBox="0 0 64 64" width="56" height="56" className="fx-mascot-bob">
      <circle cx="32" cy="32" r="26" fill="#FFDCE6" />
      <path d="M8 26 Q10 4 32 6 Q54 4 56 26 Q40 16 32 18 Q24 16 8 26Z" fill="#3A2F55" />
      <circle cx="16" cy="34" r="4" fill="#FFB3C6" opacity="0.7" />
      <circle cx="48" cy="34" r="4" fill="#FFB3C6" opacity="0.7" />
      {eyes[mood]}
      {mouth[mood]}
    </svg>
  );
}

/* ---------- Medieval: knight helm with glinting visor ---------- */
function MedievalMascot({ mood }) {
  const glint = {
    happy: <g fill="#F0E4C8"><path d="M22 30 Q25 27 28 30" stroke="#F0E4C8" strokeWidth="2" fill="none" strokeLinecap="round" /><path d="M36 30 Q39 27 42 30" stroke="#F0E4C8" strokeWidth="2" fill="none" strokeLinecap="round" /></g>,
    neutral: <g fill="#C9A24B"><circle cx="25" cy="30" r="2" /><circle cx="39" cy="30" r="2" /></g>,
    worried: <g fill="#B5442E"><circle cx="25" cy="30" r="2" /><circle cx="39" cy="30" r="2" /></g>,
  };
  const tilt = mood === "worried" ? "rotate(-4 32 32)" : "rotate(0)";
  return (
    <svg viewBox="0 0 64 64" width="56" height="56" className="fx-mascot-bob">
      <g transform={tilt}>
        <path d="M14 44 L14 26 Q14 10 32 10 Q50 10 50 26 L50 44 Q32 52 14 44Z" fill="#C9A24B" stroke="#6B5321" strokeWidth="1.5" />
        <rect x="16" y="24" width="32" height="12" rx="3" fill="#2F2013" />
        {glint[mood]}
        <path d="M28 8 L32 -2 L36 8Z" fill="#5F8F5A" />
      </g>
    </svg>
  );
}

/* ---------- Cyberpunk: robot head with a visor + LED mouth ---------- */
function CyberMascot({ mood }) {
  const visorColor = mood === "happy" ? "#39FF88" : mood === "worried" ? "#FF2E6E" : "#FFE14D";
  const litSegments = mood === "happy" ? 5 : mood === "worried" ? 1 : 3;
  return (
    <svg viewBox="0 0 64 64" width="56" height="56" className="fx-mascot-bob">
      <rect x="10" y="10" width="44" height="40" rx="10" fill="#0D0F1F" stroke={visorColor} strokeWidth="1.5" />
      <line x1="32" y1="10" x2="32" y2="2" stroke={visorColor} strokeWidth="2" />
      <circle cx="32" cy="2" r="2.5" fill={visorColor} />
      <rect x="16" y="20" width="32" height="8" rx="4" fill={visorColor} className="fx-eye-blink" style={{ transformBox: "fill-box" }} />
      <g fill={visorColor}>
        {Array.from({ length: 5 }).map((_, i) => (
          <rect key={i} x={16 + i * 7} y="38" width="4" height="5" opacity={i < litSegments ? 1 : 0.25} />
        ))}
      </g>
    </svg>
  );
}

/* ---------- Pirate: captain with an eyepatch ---------- */
function PirateMascot({ mood }) {
  const eye = {
    happy: <path d="M37 27 Q40 24 43 27" stroke="#2B1A10" strokeWidth="2" fill="none" strokeLinecap="round" />,
    neutral: <circle cx="40" cy="27" r="2.2" fill="#2B1A10" />,
    worried: <path d="M37 29 Q40 25 43 29" stroke="#2B1A10" strokeWidth="2" fill="none" strokeLinecap="round" />,
  };
  const mouth = {
    happy: <path d="M26 40 Q32 45 38 40" stroke="#2B1A10" strokeWidth="2.2" fill="none" strokeLinecap="round" />,
    neutral: <line x1="27" y1="40" x2="37" y2="40" stroke="#2B1A10" strokeWidth="2" strokeLinecap="round" />,
    worried: <path d="M26 43 Q32 38 38 43" stroke="#2B1A10" strokeWidth="2.2" fill="none" strokeLinecap="round" />,
  };
  return (
    <svg viewBox="0 0 64 64" width="56" height="56" className="fx-mascot-bob">
      <circle cx="32" cy="32" r="24" fill="#E8B88A" />
      <path d="M6 22 Q32 6 58 22 L58 14 Q32 -4 6 14Z" fill="#C1443A" />
      <circle cx="9" cy="18" r="3" fill="#2B1A10" />
      <ellipse cx="24" cy="27" rx="6" ry="5" fill="#1A1210" />
      <line x1="9" y1="18" x2="24" y2="24" stroke="#1A1210" strokeWidth="2" />
      {eye[mood]}
      <path d="M25 34 Q32 38 39 34" stroke="#2B1A10" strokeWidth="2" fill="none" strokeLinecap="round" />
      {mouth[mood]}
    </svg>
  );
}

/* ---------- Pixel Kitty: cat face recolored per mood — shared by the side-panel
   mascot (with a vine + tree behind it) and the interactive chart-center cat ---------- */
const CAT_PALETTE = {
  happy: { base: "#FFFFFF", patch: "#FF8FC2" },     // pink & white
  neutral: { base: "#FBF3E6", patch: "#8B5A2B" },   // white & brown
  worried: { base: "#E8D2A6", patch: "#6B4423" },   // tabby
};

function CatFace({ mood }) {
  const palette = CAT_PALETTE[mood];
  const eyes = {
    happy: <path d="M22 30 Q25 27 28 30 M36 30 Q39 27 42 30" stroke="#2B1A22" strokeWidth="2" fill="none" strokeLinecap="round" />,
    neutral: <g fill="#2B1A22"><ellipse cx="24" cy="30" rx="2.2" ry="3" /><ellipse cx="42" cy="30" rx="2.2" ry="3" /></g>,
    worried: <g><ellipse cx="24" cy="31" rx="2" ry="2.6" fill="#2B1A22" /><ellipse cx="42" cy="31" rx="2" ry="2.6" fill="#2B1A22" />
      <path d="M20 26 L26 28 M46 26 L40 28" stroke="#2B1A22" strokeWidth="1.6" strokeLinecap="round" /></g>,
  }[mood];
  const isTabby = mood === "worried";
  return (
    <>
      {/* ears */}
      <path d="M14 16 L20 3 L27 18Z" fill={palette.patch} stroke="#2B1A22" strokeWidth="1" />
      <path d="M37 18 L44 3 L50 16Z" fill={palette.patch} stroke="#2B1A22" strokeWidth="1" />
      <path d="M17 15 L20 8 L24 16Z" fill="#FFC2DE" />
      <path d="M40 16 L44 8 L47 15Z" fill="#FFC2DE" />

      {/* head */}
      <ellipse cx="32" cy="35" rx="20" ry="18" fill={palette.base} stroke="#2B1A22" strokeWidth="1.5" />
      {isTabby ? (
        <g stroke={palette.patch} strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.85">
          <path d="M20 22 Q24 28 20 34" />
          <path d="M28 20 Q31 28 28 36" />
          <path d="M44 22 Q40 28 44 34" />
        </g>
      ) : (
        <ellipse cx="45" cy="32" rx="9" ry="12" fill={palette.patch} opacity="0.9" />
      )}

      {eyes}
      <path d="M30 38 L34 38 L32 41Z" fill="#FF8FC2" />
      <path d="M28 41 Q30 44 32 41 Q34 44 36 41" stroke="#2B1A22" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <g stroke="#2B1A22" strokeWidth="1" opacity="0.5">
        <path d="M11 34 L21 33 M11 38 L21 37 M11 42 L21 40" />
        <path d="M53 34 L43 33 M53 38 L43 37 M53 42 L43 40" />
      </g>
    </>
  );
}

function CatMascot({ mood }) {
  return (
    <svg viewBox="0 0 64 64" width="56" height="56" className="fx-mascot-bob">
      {/* tree + vine, tucked behind the cat */}
      <g opacity="0.6">
        <rect x="3" y="47" width="4" height="13" fill="#5A3A22" />
        <circle cx="5" cy="43" r="7" fill="#3B6B4A" />
        <circle cx="1" cy="46" r="5" fill="#345C40" />
        <circle cx="9" cy="46" r="5" fill="#3B6B4A" />
        <path d="M2 2 Q10 8 6 16 Q2 24 8 30" stroke="#4C8C5A" strokeWidth="2" fill="none" strokeLinecap="round" />
        <ellipse cx="7" cy="10" rx="3" ry="1.6" fill="#5FAE6E" transform="rotate(30 7 10)" />
        <ellipse cx="4" cy="20" rx="3" ry="1.6" fill="#5FAE6E" transform="rotate(-20 4 20)" />
      </g>
      <CatFace mood={mood} />
    </svg>
  );
}

// A tappable cat for the middle of a donut chart's hollow center. Purely playful —
// taps just cycle a little speech bubble, nothing here touches app state/math.
const TAP_REACTIONS = ["Mrrp?", "Purrr~", "Nya!", ":3", "≽^•⩊•^≼"];

export function ChartCat({ mood, enabled }) {
  const [tapCount, setTapCount] = useState(0);
  const [bubble, setBubble] = useState(null);
  const timeoutRef = useRef(null);

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  if (!enabled) return null;

  const handleTap = () => {
    setTapCount((c) => c + 1);
    setBubble(TAP_REACTIONS[Math.floor(Math.random() * TAP_REACTIONS.length)]);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setBubble(null), 1200);
  };

  return (
    <button onClick={handleTap} aria-label="Pet the cat"
      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}>
      {bubble && <div className="fx-tap-bubble" style={{ position: "absolute", top: -22, left: "50%" }}>{bubble}</div>}
      <svg key={tapCount} viewBox="0 0 64 64" width="60" height="60" className={"fx-chart-cat" + (tapCount > 0 ? " fx-poke" : "")}>
        <CatFace mood={mood} />
      </svg>
    </button>
  );
}

const MASCOTS = { "8bit": PixelMascot, anime: AnimeMascot, medieval: MedievalMascot, cyberpunk: CyberMascot, pirate: PirateMascot, pixelkitty: CatMascot };

/* ---------- ambient idle decoration behind each mascot ---------- */
function AmbientFx({ theme }) {
  if (theme === "8bit") {
    return [0, 1, 2].map((i) => (
      <div key={i} className="fx-decor fx-pixel" style={{ left: 8 + i * 16 + "px", bottom: 4, background: C.gold, animationDelay: i * 0.7 + "s" }} />
    ));
  }
  if (theme === "anime") {
    return [0, 1, 2].map((i) => (
      <div key={i} className="fx-decor fx-sparkle" style={{ left: 4 + i * 18 + "px", bottom: 0, width: 5, height: 5, background: C.primaryBright, animationDelay: i * 0.9 + "s" }} />
    ));
  }
  if (theme === "medieval") {
    return <div className="fx-decor fx-torch-glow" style={{ left: "50%", top: "50%", width: 60, height: 60, marginLeft: -30, marginTop: -30, background: C.gold, opacity: 0.35 }} />;
  }
  if (theme === "cyberpunk") {
    return <div className="fx-decor fx-scan-bar" style={{ left: 0, right: 0, top: 0, height: 10, background: `linear-gradient(180deg, transparent, ${C.primary}55, transparent)` }} />;
  }
  if (theme === "pirate") {
    return [0, 1, 2].map((i) => (
      <div key={i} className="fx-decor fx-bubble" style={{ left: 10 + i * 16 + "px", bottom: 0, width: 6, height: 6, background: C.primaryBright, opacity: 0.5, animationDelay: i * 1.1 + "s" }} />
    ));
  }
  if (theme === "pixelkitty") {
    // hollow (outline-only) pixel hearts, plus tiny cat-head silhouettes, drifting up
    const hearts = [0, 1, 2, 3, 4].map((i) => (
      <svg key={"h" + i} viewBox="0 0 10 10" className="fx-decor fx-heart" width={i % 2 ? 8 : 11} height={i % 2 ? 8 : 11}
        style={{ left: 2 + i * 13 + "px", bottom: 0, animationDelay: i * 0.6 + "s" }}>
        <path d="M5 9 L1 5 A2 2 0 0 1 5 2 A2 2 0 0 1 9 5 Z" fill="none" stroke={C.border} strokeWidth="1.2" />
      </svg>
    ));
    const catColors = [C.primary, "#8B5A2B", "#FF8FC2"];
    const cats = [0, 1, 2].map((i) => (
      <svg key={"c" + i} viewBox="0 0 12 12" className="fx-decor fx-heart" width="10" height="10"
        style={{ right: 4 + i * 16 + "px", bottom: 0, animationDelay: 0.4 + i * 0.7 + "s" }}>
        <path d="M2 4 L3.5 1 L5 4Z" fill={catColors[i]} />
        <path d="M7 4 L8.5 1 L10 4Z" fill={catColors[i]} />
        <circle cx="6" cy="6.5" r="4" fill={catColors[i]} />
      </svg>
    ));
    return [...hearts, ...cats];
  }
  return null;
}

// mood: "happy" | "neutral" | "worried"
export function ThemeMascotPanel({ theme, mood, enabled }) {
  if (!enabled || !theme || theme === "classic") return null;
  const Mascot = MASCOTS[theme];
  if (!Mascot) return null;
  return (
    <div className="fx-panel flex items-center justify-center" style={{ width: 72, height: 72, flexShrink: 0 }}>
      <AmbientFx theme={theme} />
      <Mascot mood={mood} />
    </div>
  );
}
