import { colors as goldDark } from "./colors";

export type PaletteId = "gold" | "ivory" | "navy" | "forest" | "burgundy" | "slate" | "custom";

export type NativeColors = typeof goldDark;

const goldLight: NativeColors = {
  bg: "#faf9f7",
  surface: "#ffffff",
  surfaceAlt: "#f4f1ec",
  border: "#e8e6e2",
  text: "#1a1a1a",
  muted: "#71717a",
  accent: "#b7893a",
  accentSoft: "rgba(183, 137, 58, 0.16)",
  accentMuted: "rgba(183, 137, 58, 0.08)",
  onAccent: "#ffffff",
  danger: "#8c2e22",
  success: "#3d6b4f",
  warning: "#b7893a",
  income: "#3d6b4f",
  expense: "#8c2e22",
  glass: "rgba(255, 255, 255, 0.94)",
  heroGlow: "rgba(183, 137, 58, 0.12)",
};

function hexSoft(hex: string, a = 0.16) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return goldDark.accentSoft;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function pack(
  bg: string,
  surface: string,
  surfaceAlt: string,
  border: string,
  text: string,
  muted: string,
  accent: string,
  onAccent: string,
  danger: string,
  success: string,
): NativeColors {
  return {
    bg,
    surface,
    surfaceAlt,
    border,
    text,
    muted,
    accent,
    accentSoft: hexSoft(accent, 0.16),
    accentMuted: hexSoft(accent, 0.08),
    onAccent,
    danger,
    success,
    warning: accent,
    income: success,
    expense: danger,
    glass: bg.startsWith("#0") || bg.startsWith("#1") ? "rgba(20, 20, 22, 0.94)" : "rgba(255,255,255,0.94)",
    heroGlow: hexSoft(accent, 0.12),
  };
}

const PRESETS: Record<Exclude<PaletteId, "custom">, { light: NativeColors; dark: NativeColors }> = {
  gold: { light: goldLight, dark: goldDark },
  ivory: {
    light: pack("#f7f3eb", "#fffaf2", "#efe8dc", "#e4d9c8", "#2a241c", "#7a6f63", "#8c6a4a", "#fffaf2", "#8c2e22", "#5c6b58"),
    dark: pack("#161310", "#1f1b16", "#1f1b16", "#2a241c", "#e4e4e7", "#a1a1aa", "#c4a484", "#161310", "#b4534a", "#8fa98a"),
  },
  navy: {
    light: pack("#f4f6f8", "#ffffff", "#eef1f5", "#dce3ee", "#152033", "#5c6b7a", "#3e5871", "#f8fafc", "#8c2e22", "#3d6b4f"),
    dark: pack("#0c121c", "#141b28", "#141b28", "#1c2636", "#dce3ee", "#8fa1b8", "#c4b08a", "#0c121c", "#b4534a", "#8fa98a"),
  },
  forest: {
    light: pack("#f3f6f3", "#ffffff", "#e8eee8", "#d5ddd6", "#1c241e", "#5c6b5e", "#4a5e4e", "#f7faf7", "#8c2e22", "#3d6b4f"),
    dark: pack("#0c110e", "#151a16", "#151a16", "#222a24", "#e4e4e7", "#a1a1aa", "#8fa98a", "#0c110e", "#b4534a", "#8fa98a"),
  },
  burgundy: {
    light: pack("#faf6f5", "#ffffff", "#f3eaea", "#e8d9d9", "#2a181a", "#7a5c5e", "#8a3d45", "#fdf8f7", "#8c2e22", "#3d6b4f"),
    dark: pack("#140d0e", "#1c1415", "#1c1415", "#2a1c1e", "#e4e4e7", "#a1a1aa", "#d4a0a4", "#140d0e", "#b4534a", "#8fa98a"),
  },
  slate: {
    light: pack("#f5f6f8", "#ffffff", "#eceef1", "#dce0e6", "#1c1e22", "#6b7280", "#5c6570", "#f8f9fb", "#8c2e22", "#3d6b4f"),
    dark: pack("#0e1013", "#16181c", "#16181c", "#22252b", "#e4e4e7", "#a1a1aa", "#c5cad3", "#0e1013", "#b4534a", "#8fa98a"),
  },
};

export function resolveNativeColors(
  appearance:
    | {
        mode?: "light" | "dark" | "system";
        paletteId?: PaletteId;
        custom?: { primary: string; accent: string; background: string; card: string };
      }
    | undefined,
  resolvedMode: "light" | "dark",
): NativeColors {
  const id = appearance?.paletteId ?? "gold";
  if (id === "custom" && appearance?.custom) {
    const c = appearance.custom;
    const dark = resolvedMode === "dark";
    return pack(
      c.background,
      c.card,
      c.card,
      dark ? "#222226" : "#e8e6e2",
      dark ? "#e4e4e7" : "#1a1a1a",
      dark ? "#a1a1aa" : "#71717a",
      c.primary,
      dark ? "#0a0a0b" : "#ffffff",
      "#b4534a",
      c.accent || "#8fa98a",
    );
  }
  const preset = PRESETS[id === "custom" ? "gold" : id] ?? PRESETS.gold;
  return preset[resolvedMode];
}

export const PALETTE_CHIPS: { id: Exclude<PaletteId, "custom">; label: string; swatch: string }[] = [
  { id: "gold", label: "Gold", swatch: "#c5a880" },
  { id: "ivory", label: "Ivory", swatch: "#8c6a4a" },
  { id: "navy", label: "Navy", swatch: "#c4b08a" },
  { id: "forest", label: "Forest", swatch: "#6f8f78" },
  { id: "burgundy", label: "Burgundy", swatch: "#8a3d45" },
  { id: "slate", label: "Slate", swatch: "#8a93a0" },
];
