import React, { useEffect } from "react";
import { ActivityIndicator, StatusBar, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "@/i18n";
import { RootNavigator } from "@/navigation/RootNavigator";
import { useHydrateStore } from "@/lib/store";
import { hydrateQuoteCache } from "@/lib/finance/cache";
import { colors } from "@/theme/colors";

export default function App() {
  const ready = useHydrateStore();

  useEffect(() => {
    if (ready) void hydrateQuoteCache();
  }, [ready]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
        {ready ? (
          <RootNavigator />
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
});
