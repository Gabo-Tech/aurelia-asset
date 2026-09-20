import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Appearance, type ColorSchemeName } from "react-native";
import { useAppStore } from "@/lib/store";
import { colors as fallback } from "./colors";
import { resolveNativeColors, type NativeColors } from "./palettes";

const ThemeColorsContext = createContext<NativeColors>(fallback);
const ResolvedModeContext = createContext<"light" | "dark">("dark");

function schemeToMode(scheme: ColorSchemeName): "light" | "dark" {
  return scheme === "light" ? "light" : "dark";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const appearance = useAppStore((s) => s.state.settings.appearance);
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(() =>
    Appearance.getColorScheme() ?? "dark",
  );

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme ?? "dark");
    });
    return () => sub.remove();
  }, []);

  const resolvedMode = useMemo(() => {
    const pref = appearance?.mode ?? "dark";
    if (pref === "system") return schemeToMode(systemScheme);
    return pref;
  }, [appearance?.mode, systemScheme]);

  const colors = useMemo(
    () => resolveNativeColors(appearance, resolvedMode),
    [appearance, resolvedMode],
  );

  return (
    <ResolvedModeContext.Provider value={resolvedMode}>
      <ThemeColorsContext.Provider value={colors}>{children}</ThemeColorsContext.Provider>
    </ResolvedModeContext.Provider>
  );
}

export function useColors(): NativeColors {
  return useContext(ThemeColorsContext);
}

export function useResolvedMode(): "light" | "dark" {
  return useContext(ResolvedModeContext);
}
