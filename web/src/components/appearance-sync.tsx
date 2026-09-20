import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { useTheme } from "@/hooks/use-theme";
import { applyCssTokens, resolveTokens } from "@/lib/theme/palettes";

/** Applies stored palette tokens after hydrate. Mount once under ThemeProvider + StoreProvider. */
export function AppearanceSync() {
  const { state, hydrated } = useStore();
  const { resolved, preference, setTheme } = useTheme();
  const storeMode = state.settings.appearance?.mode;

  // Keep ept_theme aligned with store (hydrate + backup import / settings restore).
  useEffect(() => {
    if (!hydrated) return;
    if (storeMode && storeMode !== preference) setTheme(storeMode);
  }, [hydrated, storeMode, preference, setTheme]);

  useEffect(() => {
    if (!hydrated) return;
    applyCssTokens(resolveTokens(state.settings.appearance, resolved));
  }, [hydrated, state.settings.appearance, resolved]);

  return null;
}
