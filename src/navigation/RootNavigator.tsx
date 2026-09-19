import React, { useState } from "react";
import { Text, View, StyleSheet, Pressable } from "react-native";
import {
  createBottomTabNavigator,
  type BottomTabBarProps,
} from "@react-navigation/bottom-tabs";
import {
  NavigationContainer,
  DarkTheme,
  createNavigationContainerRef,
} from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Svg, { Circle, Path, Rect, Polyline } from "react-native-svg";
import { DashboardScreen } from "@/screens/DashboardScreen";
import { CashflowScreen } from "@/screens/CashflowScreen";
import { HoldingsScreen } from "@/screens/HoldingsScreen";
import { PerformanceScreen } from "@/screens/PerformanceScreen";
import { PlanningScreen } from "@/screens/PlanningScreen";
import { AssistantScreen } from "@/screens/AssistantScreen";
import { SettingsScreen } from "@/screens/SettingsScreen";
import { MoreSheet, type MoreDestination } from "@/components/MoreSheet";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
import { useAppStore } from "@/lib/store";
import { colors } from "@/theme/colors";
import { type as typography } from "@/theme/typography";

export type RootTabParamList = {
  Dashboard: undefined;
  Cashflow: undefined;
  Holdings: undefined;
  Performance: undefined;
  Planning: undefined;
  Assistant: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();
export const navigationRef = createNavigationContainerRef<RootTabParamList>();

const PRIMARY: (keyof RootTabParamList)[] = [
  "Dashboard",
  "Cashflow",
  "Holdings",
];

const SECONDARY: (keyof RootTabParamList)[] = [
  "Performance",
  "Planning",
  "Assistant",
  "Settings",
];

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    primary: colors.accent,
  },
};

function TabIcon({
  name,
  focused,
}: {
  name: keyof RootTabParamList | "More";
  focused: boolean;
}) {
  const c = focused ? colors.accent : colors.muted;
  const stroke = focused ? 2.2 : 1.6;
  const size = 22;
  switch (name) {
    case "Dashboard":
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path
            d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z"
            stroke={c}
            strokeWidth={stroke}
          />
        </Svg>
      );
    case "Cashflow":
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path
            d="M7 7h11M7 7l3-3M7 7l3 3M17 17H6M17 17l-3-3M17 17l-3 3"
            stroke={c}
            strokeWidth={stroke}
            strokeLinecap="round"
          />
        </Svg>
      );
    case "Holdings":
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Rect x="4" y="4" width="7" height="7" rx="1.5" stroke={c} strokeWidth={stroke} />
          <Rect x="13" y="4" width="7" height="7" rx="1.5" stroke={c} strokeWidth={stroke} />
          <Rect x="4" y="13" width="7" height="7" rx="1.5" stroke={c} strokeWidth={stroke} />
          <Rect x="13" y="13" width="7" height="7" rx="1.5" stroke={c} strokeWidth={stroke} />
        </Svg>
      );
    case "Performance":
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Polyline
            points="4,16 9,11 13,14 20,6"
            stroke={c}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path d="M20 6v4h-4" stroke={c} strokeWidth={stroke} strokeLinecap="round" />
        </Svg>
      );
    case "More":
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx="6" cy="12" r="1.6" fill={c} />
          <Circle cx="12" cy="12" r="1.6" fill={c} />
          <Circle cx="18" cy="12" r="1.6" fill={c} />
        </Svg>
      );
    default:
      return null;
  }
}

function shortLabel(
  t: (key: string, opts?: { defaultValue: string }) => string,
  name: keyof RootTabParamList,
): string {
  switch (name) {
    case "Dashboard":
      return t("nav.short.dashboard", { defaultValue: "Home" });
    case "Cashflow":
      return t("nav.short.cashflow", { defaultValue: "Cash" });
    case "Holdings":
      return t("nav.short.holdings", { defaultValue: "Holdings" });
    case "Performance":
      return t("nav.short.performance", { defaultValue: "Perf" });
    default:
      return name;
  }
}

export const TAB_BAR_CONTENT_HEIGHT = 52;

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [moreOpen, setMoreOpen] = useState(false);
  const assistantEnabled = useAppStore((s) => s.state.settings.aiAssistantEnabled !== false);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const bottomPad = Math.max(insets.bottom, 8);
  const focusedName = state.routes[state.index]?.name as keyof RootTabParamList;
  const moreActive = SECONDARY.includes(focusedName);

  return (
    <>
      <View
        style={[
          styles.tabBar,
          { paddingBottom: bottomPad, height: TAB_BAR_CONTENT_HEIGHT + bottomPad },
        ]}
      >
        {PRIMARY.map((name) => {
          const route = state.routes.find((r) => r.name === name);
          if (!route) return null;
          const focused = focusedName === name;
          return (
            <Pressable
              key={name}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              onPress={() => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(name);
                }
              }}
              style={styles.tabItem}
            >
              <View style={styles.iconWrap}>
                <TabIcon name={name} focused={focused} />
              </View>
              <Text style={[styles.tabLabel, focused && styles.tabLabelOn]} numberOfLines={1}>
                {shortLabel(t, name)}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityState={moreActive ? { selected: true } : {}}
          onPress={() => setMoreOpen(true)}
          style={styles.tabItem}
        >
          <View style={styles.iconWrap}>
            <TabIcon name="More" focused={moreActive || moreOpen} />
          </View>
          <Text
            style={[styles.tabLabel, (moreActive || moreOpen) && styles.tabLabelOn]}
            numberOfLines={1}
          >
            {t("nav.more", { defaultValue: "More" })}
          </Text>
        </Pressable>
      </View>
      <MoreSheet
        visible={moreOpen}
        onClose={() => setMoreOpen(false)}
        assistantEnabled={assistantEnabled}
        activeRoute={focusedName}
        onNavigate={(route: MoreDestination) => {
          navigation.navigate(route);
        }}
        onTakeTour={() => {
          updateSettings({ onboardingSeen: false });
        }}
      />
    </>
  );
}

export function RootNavigator() {
  const assistantEnabled = useAppStore((s) => s.state.settings.aiAssistantEnabled !== false);

  return (
    <>
      <NavigationContainer
        ref={navigationRef}
        theme={navTheme}
        linking={{
          prefixes: [
            typeof window !== "undefined" && window.location?.origin
              ? window.location.origin
              : "",
          ],
          config: {
            screens: {
              Dashboard: "",
              Cashflow: "Cashflow",
              Holdings: "Holdings",
              Performance: "Performance",
              Planning: "Planning",
              Assistant: "Assistant",
              Settings: "Settings",
            },
          },
        }}
      >
        <Tab.Navigator
          tabBar={(props) => <CustomTabBar {...props} />}
          screenOptions={{
            headerShown: false,
            tabBarHideOnKeyboard: true,
          }}
        >
          <Tab.Screen name="Dashboard" component={DashboardScreen} />
          <Tab.Screen name="Cashflow" component={CashflowScreen} />
          <Tab.Screen name="Holdings" component={HoldingsScreen} />
          <Tab.Screen name="Performance" component={PerformanceScreen} />
          <Tab.Screen name="Planning" component={PlanningScreen} />
          {assistantEnabled ? (
            <Tab.Screen name="Assistant" component={AssistantScreen} />
          ) : null}
          <Tab.Screen name="Settings" component={SettingsScreen} />
        </Tab.Navigator>
      </NavigationContainer>
      <OnboardingChecklist
        onGoCashflow={() => {
          if (navigationRef.isReady()) navigationRef.navigate("Cashflow");
        }}
        onGoHoldings={() => {
          if (navigationRef.isReady()) navigationRef.navigate("Holdings");
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 2,
  },
  iconWrap: { alignItems: "center", justifyContent: "center", height: 24 },
  tabLabel: { ...typography.tab, color: colors.muted, marginBottom: 2, fontWeight: "500" },
  tabLabelOn: { color: colors.accent, fontWeight: "700" },
});
