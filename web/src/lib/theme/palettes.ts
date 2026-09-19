/** Curated palettes + custom accent engine. Tokens map 1:1 to CSS variables in styles.css. */

export type PaletteId = "gold" | "ivory" | "navy" | "forest" | "burgundy" | "slate" | "custom";

export type AppearanceSettings = {
  mode?: "light" | "dark" | "system";
  paletteId?: PaletteId;
  custom?: CustomPalette;
};

export type CustomPalette = {
  primary: string;
  accent: string;
  background: string;
  card: string;
  chart?: [string, string, string, string, string];
};

export type CssTokens = Record<string, string>;

export const PALETTE_IDS: Exclude<PaletteId, "custom">[] = [
  "gold",
  "ivory",
  "navy",
  "forest",
  "burgundy",
  "slate",
];

export const PALETTE_META: Record<
  Exclude<PaletteId, "custom">,
  { label: string; description: string; swatch: string }
> = {
  gold: { label: "Gold Luxury", description: "Charcoal and warm gold", swatch: "#c5a880" },
  ivory: { label: "Ivory", description: "Cream paper and espresso", swatch: "#8c6a4a" },
  navy: { label: "Midnight Navy", description: "Deep navy and champagne", swatch: "#c4b08a" },
  forest: { label: "Forest", description: "Ink and sage", swatch: "#6f8f78" },
  burgundy: { label: "Burgundy", description: "Wine and cream", swatch: "#8a3d45" },
  slate: { label: "Slate", description: "Cool gray and silver", swatch: "#8a93a0" },
};

const GOLD_LIGHT: CssTokens = {
  background: "#faf9f7",
  foreground: "#1a1a1a",
  card: "#ffffff",
  "card-foreground": "#1a1a1a",
  popover: "#ffffff",
  "popover-foreground": "#1a1a1a",
  primary: "#b7893a",
  "primary-foreground": "#ffffff",
  secondary: "#f4f1ec",
  "secondary-foreground": "#1a1a1a",
  muted: "#f4f1ec",
  "muted-foreground": "#71717a",
  accent: "#4a5243",
  "accent-foreground": "#fdfbf9",
  destructive: "#8c2e22",
  "destructive-foreground": "#fdfbf9",
  success: "#3d6b4f",
  "success-foreground": "#fdfbf9",
  warning: "#b7893a",
  "warning-foreground": "#1a1a1a",
  info: "#3e5871",
  "info-foreground": "#fdfbf9",
  border: "#e8e6e2",
  input: "#e8e6e2",
  ring: "#b7893a",
  "chart-1": "#4a5243",
  "chart-2": "#b7893a",
  "chart-3": "#8c6a4a",
  "chart-4": "#3e5871",
  "chart-5": "#8c2e22",
  sidebar: "#ffffff",
  "sidebar-foreground": "#1a1a1a",
  "sidebar-primary": "#b7893a",
  "sidebar-primary-foreground": "#ffffff",
  "sidebar-accent": "#f4f1ec",
  "sidebar-accent-foreground": "#1a1a1a",
  "sidebar-border": "#e8e6e2",
  "sidebar-ring": "#b7893a",
  glass: "rgba(255, 255, 255, 0.94)",
  "theme-color": "#faf9f7",
};

const GOLD_DARK: CssTokens = {
  background: "#0a0a0b",
  foreground: "#e4e4e7",
  card: "#141416",
  "card-foreground": "#e4e4e7",
  popover: "#141416",
  "popover-foreground": "#e4e4e7",
  primary: "#c5a880",
  "primary-foreground": "#0a0a0b",
  secondary: "#1a1a1d",
  "secondary-foreground": "#e4e4e7",
  muted: "#1a1a1d",
  "muted-foreground": "#a1a1aa",
  accent: "#f3f3f3",
  "accent-foreground": "#0a0a0b",
  destructive: "#b4534a",
  "destructive-foreground": "#f3f3f3",
  success: "#8fa98a",
  "success-foreground": "#0a0a0b",
  warning: "#c5a880",
  "warning-foreground": "#0a0a0b",
  info: "#8fa1b8",
  "info-foreground": "#0a0a0b",
  border: "#222226",
  input: "#222226",
  ring: "#c5a880",
  "chart-1": "#c5a880",
  "chart-2": "#8fa98a",
  "chart-3": "#8fa1b8",
  "chart-4": "#b48a6b",
  "chart-5": "#b4534a",
  sidebar: "#0a0a0b",
  "sidebar-foreground": "#e4e4e7",
  "sidebar-primary": "#c5a880",
  "sidebar-primary-foreground": "#0a0a0b",
  "sidebar-accent": "#1a1a1d",
  "sidebar-accent-foreground": "#e4e4e7",
  "sidebar-border": "#222226",
  "sidebar-ring": "#c5a880",
  glass: "rgba(20, 20, 22, 0.94)",
  "theme-color": "#0a0a0b",
};

function fromGold(
  light: Partial<CssTokens>,
  dark: Partial<CssTokens>,
): { light: CssTokens; dark: CssTokens } {
  return { light: { ...GOLD_LIGHT, ...light } as CssTokens, dark: { ...GOLD_DARK, ...dark } as CssTokens };
}

export const PRESETS: Record<Exclude<PaletteId, "custom">, { light: CssTokens; dark: CssTokens }> = {
  gold: { light: GOLD_LIGHT, dark: GOLD_DARK },
  ivory: fromGold(
    {
      background: "#f7f3eb",
      foreground: "#2a241c",
      card: "#fffaf2",
      "card-foreground": "#2a241c",
      primary: "#8c6a4a",
      "primary-foreground": "#fffaf2",
      accent: "#5c4a38",
      "accent-foreground": "#fffaf2",
      muted: "#efe8dc",
      secondary: "#efe8dc",
      border: "#e4d9c8",
      input: "#e4d9c8",
      ring: "#8c6a4a",
      "chart-1": "#8c6a4a",
      "chart-2": "#5c6b58",
      "chart-3": "#3e5871",
      "chart-4": "#a67c52",
      "chart-5": "#8c2e22",
      "theme-color": "#f7f3eb",
      sidebar: "#fffaf2",
      "sidebar-primary": "#8c6a4a",
      "sidebar-ring": "#8c6a4a",
      "sidebar-border": "#e4d9c8",
      "sidebar-accent": "#efe8dc",
    },
    {
      background: "#161310",
      card: "#1f1b16",
      popover: "#1f1b16",
      primary: "#c4a484",
      "primary-foreground": "#161310",
      accent: "#efe8dc",
      ring: "#c4a484",
      border: "#2a241c",
      input: "#2a241c",
      muted: "#1f1b16",
      secondary: "#1f1b16",
      "chart-1": "#c4a484",
      "chart-2": "#8fa98a",
      "chart-3": "#8fa1b8",
      "theme-color": "#161310",
      sidebar: "#161310",
      "sidebar-primary": "#c4a484",
    },
  ),
  navy: fromGold(
    {
      background: "#f4f6f8",
      foreground: "#152033",
      card: "#ffffff",
      primary: "#3e5871",
      "primary-foreground": "#f8fafc",
      accent: "#c4b08a",
      "accent-foreground": "#152033",
      ring: "#3e5871",
      "chart-1": "#3e5871",
      "chart-2": "#c4b08a",
      "chart-3": "#6b8f9a",
      "chart-4": "#8c6a4a",
      "chart-5": "#8c2e22",
      "theme-color": "#f4f6f8",
      "sidebar-primary": "#3e5871",
      "sidebar-ring": "#3e5871",
    },
    {
      background: "#0c121c",
      card: "#141b28",
      popover: "#141b28",
      foreground: "#dce3ee",
      primary: "#c4b08a",
      "primary-foreground": "#0c121c",
      accent: "#8fa1b8",
      ring: "#c4b08a",
      border: "#1c2636",
      input: "#1c2636",
      muted: "#141b28",
      secondary: "#141b28",
      "chart-1": "#c4b08a",
      "chart-2": "#8fa1b8",
      "chart-3": "#8fa98a",
      "theme-color": "#0c121c",
      sidebar: "#0c121c",
      "sidebar-primary": "#c4b08a",
    },
  ),
  forest: fromGold(
    {
      background: "#f3f6f3",
      foreground: "#1c241e",
      card: "#ffffff",
      primary: "#4a5e4e",
      "primary-foreground": "#f7faf7",
      accent: "#8c6a4a",
      ring: "#4a5e4e",
      "chart-1": "#4a5e4e",
      "chart-2": "#b7893a",
      "chart-3": "#3e5871",
      "theme-color": "#f3f6f3",
      "sidebar-primary": "#4a5e4e",
    },
    {
      background: "#0c110e",
      card: "#151a16",
      popover: "#151a16",
      primary: "#8fa98a",
      "primary-foreground": "#0c110e",
      accent: "#c5a880",
      ring: "#8fa98a",
      border: "#222a24",
      input: "#222a24",
      muted: "#151a16",
      "theme-color": "#0c110e",
      sidebar: "#0c110e",
      "sidebar-primary": "#8fa98a",
    },
  ),
  burgundy: fromGold(
    {
      background: "#faf6f5",
      foreground: "#2a181a",
      card: "#ffffff",
      primary: "#8a3d45",
      "primary-foreground": "#fdf8f7",
      accent: "#c5a880",
      "accent-foreground": "#2a181a",
      ring: "#8a3d45",
      "chart-1": "#8a3d45",
      "chart-2": "#c5a880",
      "chart-3": "#3e5871",
      "theme-color": "#faf6f5",
      "sidebar-primary": "#8a3d45",
    },
    {
      background: "#140d0e",
      card: "#1c1415",
      popover: "#1c1415",
      primary: "#d4a0a4",
      "primary-foreground": "#140d0e",
      accent: "#c5a880",
      ring: "#d4a0a4",
      border: "#2a1c1e",
      input: "#2a1c1e",
      muted: "#1c1415",
      "theme-color": "#140d0e",
      sidebar: "#140d0e",
      "sidebar-primary": "#d4a0a4",
    },
  ),
  slate: fromGold(
    {
      background: "#f5f6f8",
      foreground: "#1c1e22",
      card: "#ffffff",
      primary: "#5c6570",
      "primary-foreground": "#f8f9fb",
      accent: "#8a93a0",
      ring: "#5c6570",
      "chart-1": "#5c6570",
      "chart-2": "#b7893a",
      "chart-3": "#3e5871",
      "theme-color": "#f5f6f8",
      "sidebar-primary": "#5c6570",
    },
    {
      background: "#0e1013",
      card: "#16181c",
      popover: "#16181c",
      primary: "#c5cad3",
      "primary-foreground": "#0e1013",
      accent: "#8a93a0",
      ring: "#c5cad3",
      border: "#22252b",
      input: "#22252b",
      muted: "#16181c",
      "theme-color": "#0e1013",
      sidebar: "#0e1013",
      "sidebar-primary": "#c5cad3",
    },
  ),
};

function clamp(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.replace("#", "").trim();
  if (h.length === 3) {
    const r = parseInt(h[0] + h[0], 16);
    const g = parseInt(h[1] + h[1], 16);
    const b = parseInt(h[2] + h[2], 16);
    if ([r, g, b].some((n) => Number.isNaN(n))) return null;
    return [r, g, b];
  }
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return [r, g, b];
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((n) => clamp(n).toString(16).padStart(2, "0")).join("")}`;
}

function luminance(r: number, g: number, b: number) {
  const a = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * a[0]! + 0.7152 * a[1]! + 0.0722 * a[2]!;
}

function onColor(hex: string, light = "#fdfbf9", dark = "#0a0a0b") {
  const rgb = hexToRgb(hex);
  if (!rgb) return dark;
  return luminance(...rgb) > 0.45 ? dark : light;
}

function mix(a: string, b: string, t: number) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  if (!A || !B) return a;
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}

function isDarkHex(hex: string) {
  const rgb = hexToRgb(hex);
  return rgb ? luminance(...rgb) < 0.35 : true;
}

export function deriveCustomTokens(custom: CustomPalette, mode: "light" | "dark"): CssTokens {
  const base = mode === "dark" ? GOLD_DARK : GOLD_LIGHT;
  const bg = custom.background || base.background;
  const card = custom.card || base.card;
  const primary = custom.primary || base.primary;
  const accent = custom.accent || base.accent;
  const darkBg = isDarkHex(bg);
  const fg = darkBg ? "#e4e4e7" : "#1a1a1a";
  const mutedFg = darkBg ? "#a1a1aa" : "#71717a";
  const border = mix(bg, fg, darkBg ? 0.12 : 0.1);
  const muted = mix(bg, fg, darkBg ? 0.08 : 0.06);
  const charts = custom.chart ?? [
    primary,
    accent,
    mix(primary, accent, 0.4),
    mix(accent, fg, 0.35),
    mix(primary, "#8c2e22", 0.5),
  ];
  return {
    ...base,
    background: bg,
    foreground: fg,
    card,
    "card-foreground": fg,
    popover: card,
    "popover-foreground": fg,
    primary,
    "primary-foreground": onColor(primary),
    secondary: muted,
    "secondary-foreground": fg,
    muted,
    "muted-foreground": mutedFg,
    accent,
    "accent-foreground": onColor(accent),
    border,
    input: border,
    ring: primary,
    "chart-1": charts[0],
    "chart-2": charts[1],
    "chart-3": charts[2],
    "chart-4": charts[3],
    "chart-5": charts[4],
    sidebar: bg,
    "sidebar-foreground": fg,
    "sidebar-primary": primary,
    "sidebar-primary-foreground": onColor(primary),
    "sidebar-accent": muted,
    "sidebar-accent-foreground": fg,
    "sidebar-border": border,
    "sidebar-ring": primary,
    glass: darkBg ? "rgba(20, 20, 22, 0.94)" : "rgba(255, 255, 255, 0.94)",
    "theme-color": bg,
  };
}

export function resolveTokens(
  appearance: AppearanceSettings | undefined,
  mode: "light" | "dark",
): CssTokens {
  const id = appearance?.paletteId ?? "gold";
  if (id === "custom" && appearance?.custom) {
    return deriveCustomTokens(appearance.custom, mode);
  }
  const preset = PRESETS[id === "custom" ? "gold" : id] ?? PRESETS.gold;
  return preset[mode];
}

const TOKEN_KEYS = Object.keys(GOLD_DARK);

export function applyCssTokens(tokens: CssTokens | null) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!tokens) {
    for (const k of TOKEN_KEYS) root.style.removeProperty(`--${k}`);
    return;
  }
  for (const [k, v] of Object.entries(tokens)) {
    root.style.setProperty(`--${k}`, v);
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && tokens["theme-color"]) meta.setAttribute("content", tokens["theme-color"]);
}

export const DEFAULT_CUSTOM: CustomPalette = {
  primary: "#c5a880",
  accent: "#8fa98a",
  background: "#0a0a0b",
  card: "#141416",
};
