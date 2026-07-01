// Design tokens. Values point at CSS custom properties (defined in index.css
// for both light and dark) so every inline style that uses C.xxx automatically
// follows the active theme.
export const C = {
  bg: "var(--bg)",
  surface: "var(--surface)",
  ink: "var(--ink)",
  inkSoft: "var(--ink-soft)",
  primary: "var(--primary)",
  primaryBright: "var(--primary-bright)",
  coral: "var(--coral)",
  gold: "var(--gold)",
  muted: "var(--muted)",
  border: "var(--border)",
  surfaceWarm: "var(--surface-warm)",
  surfaceDanger: "var(--surface-danger)",
};

// Fun visual themes (colors, fonts, and accent shapes — see index.css).
// "classic" defers to the light/dark toggle; the rest are fixed, self-contained looks.
export const THEMES = [
  { id: "classic", label: "Classic" },
  { id: "8bit", label: "8-Bit" },
  { id: "anime", label: "Lo-fi Anime" },
  { id: "medieval", label: "Medieval" },
  { id: "cyberpunk", label: "Cyberpunk" },
  { id: "pirate", label: "Pirate" },
  { id: "pixelkitty", label: "Pixel Kitty" },
];

// The six expense groups, in display order.
export const GROUP_KEYS = ["housing", "food", "transport", "debt", "savings", "personal"];

export const GROUP_META = {
  housing:   { label: "Housing",        color: "#2D6A4F" },
  food:      { label: "Food",           color: "#E8A33D" },
  transport: { label: "Transportation", color: "#3D9BB5" },
  debt:      { label: "Debt",           color: "#E2563B" },
  savings:   { label: "Savings",        color: "#6FB98F" },
  personal:  { label: "Personal",       color: "#A879C9" },
};
