/** Obsidian + warm gold — aligned with web Dark Luxury tokens. */

export const colors = {
  bg: "#0a0a0b",
  surface: "#141416",
  surfaceAlt: "#1a1a1d",
  border: "#222226",
  text: "#e4e4e7",
  muted: "#a1a1aa",
  accent: "#c5a880",
  accentSoft: "rgba(197, 168, 128, 0.16)",
  accentMuted: "rgba(197, 168, 128, 0.08)",
  onAccent: "#0a0a0b",
  danger: "#b4534a",
  success: "#8fa98a",
  warning: "#c5a880",
  income: "#8fa98a",
  expense: "#b4534a",
  glass: "rgba(20, 20, 22, 0.94)",
  heroGlow: "rgba(197, 168, 128, 0.12)",
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 40 };

/**
 * Vertical rhythm shared with web `--stack-*` tokens.
 * tight: title → helper (6). card: inside a card (12). block: between screen blocks (16). section: between page sections (24).
 */
export const rhythm = {
  tight: 6,
  card: 12,
  block: spacing.md,
  section: spacing.lg,
};

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
};
