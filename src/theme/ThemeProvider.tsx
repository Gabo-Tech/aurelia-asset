import React, { createContext, useContext, useMemo } from "react";
import { Appearance } from "react-native";
import { useAppStore } from "@/lib/store";
import { colors as fallback } from "./colors";
import { resolveNativeColors, type NativeColors } from "./palettes";

const ThemeColorsContext = createContext<NativeColors>(fallback);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const appearance = useAppStore((s) => s.state.settings.appearance);
  const colors = useMemo(() => {
    const pref = appearance?.mode ?? "dark";
    const system = Appearance.getColorScheme() === "light" ? "light" : "dark";
    const resolved = pref === "system" ? system : pref;
    return resolveNativeColors(appearance, resolved);
  }, [appearance]);
  return <ThemeColorsContext.Provider value={colors}>{children}</ThemeColorsContext.Provider>;
}

export function useColors(): NativeColors {
  return useContext(ThemeColorsContext);
}
