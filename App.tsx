import React, { useEffect } from "react";
import { ActivityIndicator, StatusBar, StyleSheet, View, Text, Pressable } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "@/i18n";
import { RootNavigator } from "@/navigation/RootNavigator";
import { useHydrateStore, useAppStore } from "@/lib/store";
import { hydrateQuoteCache } from "@/lib/finance/cache";
import { colors } from "@/theme/colors";

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
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
        {ready ? (
          <>
            <RootNavigator />
            {banner ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{banner}</Text>
                <Pressable onPress={dismiss}>
                  <Text style={styles.errorDismiss}>Dismiss</Text>
                </Pressable>
              </View>
            ) : null}
          </>
        ) : (
          <View style={styles.boot}>
            <ActivityIndicator color={colors.accent} size="large" />
          </View>
        )}
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
    bottom: 88,
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
