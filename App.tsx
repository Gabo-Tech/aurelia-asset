import React, { useEffect } from "react";
import { ActivityIndicator, StatusBar, StyleSheet, View, Text, Pressable } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import "@/i18n";
import { RootNavigator, TAB_BAR_CONTENT_HEIGHT } from "@/navigation/RootNavigator";
import { useHydrateStore, useAppStore } from "@/lib/store";
import { hydrateQuoteCache } from "@/lib/finance/cache";
import { ThemeProvider, useColors } from "@/theme/ThemeProvider";
import { colors } from "@/theme/colors";

function ThemedChrome({
  ready,
  banner,
  dismiss,
}: {
  ready: boolean;
  banner: string | null;
  dismiss: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bannerBottom = TAB_BAR_CONTENT_HEIGHT + Math.max(insets.bottom, 8) + 12;
  return (
    <>
      <StatusBar
        barStyle={colors.bg.startsWith("#f") || colors.bg.startsWith("#e") ? "dark-content" : "light-content"}
        backgroundColor={colors.bg}
      />
      {ready ? (
        <>
          <RootNavigator />
          {banner ? (
            <View
              style={[
                styles.errorBanner,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.danger,
                  bottom: bannerBottom,
                },
              ]}
            >
              <Text style={[styles.errorText, { color: colors.text }]}>{banner}</Text>
              <Pressable onPress={dismiss}>
                <Text style={[styles.errorDismiss, { color: colors.accent }]}>Dismiss</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      ) : (
        <View style={[styles.boot, { backgroundColor: colors.bg }]}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      )}
    </>
  );
}

export default function App() {
  const ready = useHydrateStore();
  const hydrateError = useAppStore((s) => s.hydrateError);
  const persistError = useAppStore((s) => s.persistError);
  const clearHydrateError = useAppStore((s) => s.clearHydrateError);
  const clearPersistError = useAppStore((s) => s.clearPersistError);

  useEffect(() => {
    if (ready) void hydrateQuoteCache();
  }, [ready]);

  const banner = hydrateError || persistError;
  const dismiss = hydrateError ? clearHydrateError : clearPersistError;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ThemedChrome ready={ready} banner={banner} dismiss={dismiss} />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  boot: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  errorBanner: {
    position: "absolute",
    left: 12,
    right: 12,
    backgroundColor: colors.surface,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  errorText: { color: colors.text, fontSize: 13, lineHeight: 18 },
  errorDismiss: { color: colors.accent, fontWeight: "700", fontSize: 13 },
});
