import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { useTheme } from "@/hooks/use-theme";
import { applyCssTokens, resolveTokens } from "@/lib/theme/palettes";

/** Applies stored palette tokens after hydrate. Safe to mount once under StoreProvider. */
export function AppearanceSync() {
  const { state, hydrated } = useStore();
  const { resolved, preference, setTheme } = useTheme();

  useEffect(() => {
    if (!hydrated) return;
    const mode = state.settings.appearance?.mode;
    if (mode && mode !== preference) setTheme(mode);
    // hydrate once — later changes go through ThemeToggle / AppearancePanel
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    applyCssTokens(resolveTokens(state.settings.appearance, resolved));
  }, [hydrated, state.settings.appearance, resolved]);

  return null;
}
