import { useState, useEffect, useRef } from "react";

// Reactive media-query match. Initializes synchronously from matchMedia so the
// first render is already correct (no mobile→desktop flash on load), then keeps
// updating live as the viewport crosses the query (resize, rotation).
export function useMediaQuery(query) {
  const read = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(read);
  useEffect(() => {
    const m = window.matchMedia(query);
    const h = () => setMatches(m.matches);
    h(); // resync in case the viewport changed between render and effect
    m.addEventListener?.("change", h);
    return () => m.removeEventListener?.("change", h);
  }, [query]);
  return matches;
}

// Desktop = wide viewport gets the sidebar + multi-column layout; below this the
// app keeps its mobile shell untouched. 1024px keeps phones and portrait tablets
// on the mobile layout (matches Tailwind's `lg` breakpoint).
export function useIsDesktop() {
  return useMediaQuery("(min-width: 1024px)");
}

export function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setR(m.matches);
    const h = () => setR(m.matches);
    m.addEventListener?.("change", h);
    return () => m.removeEventListener?.("change", h);
  }, []);
  return r;
}

export function useCountUp(value, reduced) {
  const [d, setD] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    if (reduced) { setD(value); prev.current = value; return; }
    const from = prev.current, to = value, start = performance.now(), dur = 650;
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setD(from + (to - from) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
      else prev.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);
  return d;
}
