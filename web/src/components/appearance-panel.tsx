import { useTranslation } from "react-i18next";
import { useStore } from "@/lib/store";
import { useTheme, type ThemePreference } from "@/hooks/use-theme";
import { ThemeToggle } from "@/components/theme-toggle";
import { TourLauncher } from "@/components/tour-launcher";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  PALETTE_IDS,
  PALETTE_META,
  DEFAULT_CUSTOM,
  type PaletteId,
  type CustomPalette,
} from "@/lib/theme/palettes";
import { cn } from "@/lib/utils";

export function AppearancePanel() {
  const { t } = useTranslation();
  const { state, updateSettings } = useStore();
  const { setTheme } = useTheme();
  const appearance = state.settings.appearance ?? {};
  const paletteId: PaletteId = appearance.paletteId ?? "gold";
  const custom: CustomPalette = appearance.custom ?? DEFAULT_CUSTOM;

  function patchAppearance(patch: Partial<typeof appearance>) {
    updateSettings({ appearance: { ...appearance, ...patch } });
  }

  function setMode(mode: ThemePreference) {
    setTheme(mode);
    patchAppearance({ mode });
  }

  function setCustomField<K extends keyof CustomPalette>(key: K, value: CustomPalette[K]) {
    patchAppearance({ paletteId: "custom", custom: { ...custom, [key]: value } });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <ThemeToggle className="h-12 w-12" />
        <TourLauncher className="h-12 w-12" />
        <div className="flex gap-1 rounded-xl border border-border/60 p-1">
          {(["light", "dark", "system"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium capitalize",
                (appearance.mode ?? "dark") === m
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-sm">
          {t("settings.appearance.palette", { defaultValue: "Color palette" })}
        </Label>
        <p className="text-xs text-muted-foreground mt-0.5 mb-3">
          {t("settings.appearance.paletteHelp", {
            defaultValue: "Pick a preset, or mix your own colors. Saved with your backup.",
          })}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {PALETTE_IDS.map((id) => {
            const meta = PALETTE_META[id];
            const on = paletteId === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => patchAppearance({ paletteId: id })}
                className={cn(
                  "rounded-2xl border p-3 text-left active-press",
                  on ? "border-primary ring-1 ring-primary/40" : "border-border/60 hover:border-primary/30",
                )}
              >
                <span
                  className="mb-2 block h-7 w-full rounded-lg"
                  style={{ background: meta.swatch }}
                />
                <span className="block text-sm font-medium">{meta.label}</span>
                <span className="block text-[11px] text-muted-foreground">{meta.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium">
              {t("settings.appearance.custom", { defaultValue: "Custom colors" })}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("settings.appearance.customHelp", {
                defaultValue: "Foreground and borders are chosen automatically for contrast.",
              })}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant={paletteId === "custom" ? "secondary" : "outline"}
            onClick={() => patchAppearance({ paletteId: "custom", custom })}
          >
            {t("settings.appearance.useCustom", { defaultValue: "Use custom" })}
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["primary", t("settings.appearance.primary", { defaultValue: "Primary" })],
              ["accent", t("settings.appearance.accent", { defaultValue: "Accent" })],
              ["background", t("settings.appearance.background", { defaultValue: "Background" })],
              ["card", t("settings.appearance.card", { defaultValue: "Cards" })],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="space-y-1.5">
              <span className="text-xs text-muted-foreground">{label}</span>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  className="h-10 w-12 cursor-pointer p-1 rounded-xl"
                  value={custom[key]}
                  onChange={(e) => setCustomField(key, e.target.value)}
                  aria-label={label}
                />
                <Input
                  value={custom[key]}
                  onChange={(e) => setCustomField(key, e.target.value)}
                  className="h-10 rounded-xl font-mono text-xs"
                />
              </div>
            </label>
          ))}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => patchAppearance({ paletteId: "gold", custom: DEFAULT_CUSTOM })}
        >
          {t("settings.appearance.reset", { defaultValue: "Reset to Gold Luxury" })}
        </Button>
      </div>

      <div className="rounded-2xl border border-border/40 bg-card p-4">
        <div className="text-xs text-muted-foreground mb-2">
          {t("settings.appearance.preview", { defaultValue: "Preview" })}
        </div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Net worth</div>
            <div className="font-display text-2xl tracking-tight">128,400</div>
          </div>
          <Button size="sm">Add entry</Button>
        </div>
      </div>
    </div>
  );
}
