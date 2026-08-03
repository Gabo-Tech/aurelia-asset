import React from "react";
import { Text, View, StyleSheet } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Svg, { Circle, Path, Rect, Polyline } from "react-native-svg";
import { DashboardScreen } from "@/screens/DashboardScreen";
import { CashflowScreen } from "@/screens/CashflowScreen";
import { HoldingsScreen } from "@/screens/HoldingsScreen";
import { PerformanceScreen } from "@/screens/PerformanceScreen";
import { PlanningScreen } from "@/screens/PlanningScreen";
import { AssistantScreen } from "@/screens/AssistantScreen";
import { SettingsScreen } from "@/screens/SettingsScreen";
import { useAppStore } from "@/lib/store";
import { colors, radii } from "@/theme/colors";
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
  name: keyof RootTabParamList;
  focused: boolean;
}) {
  const c = focused ? colors.accent : colors.muted;
  const stroke = 1.6;
  const size = 22;
  switch (name) {
    case "Dashboard":
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z" stroke={c} strokeWidth={stroke} />
        </Svg>
      );
    case "Cashflow":
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M7 7h11M7 7l3-3M7 7l3 3M17 17H6M17 17l-3-3M17 17l-3 3" stroke={c} strokeWidth={stroke} strokeLinecap="round" />
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
          <Polyline points="4,16 9,11 13,14 20,6" stroke={c} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M20 6v4h-4" stroke={c} strokeWidth={stroke} strokeLinecap="round" />
        </Svg>
      );
    case "Planning":
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Rect x="5" y="4" width="14" height="17" rx="2" stroke={c} strokeWidth={stroke} />
          <Path d="M9 2v4M15 2v4M5 10h14" stroke={c} strokeWidth={stroke} strokeLinecap="round" />
        </Svg>
      );
    case "Assistant":
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="12" r="8" stroke={c} strokeWidth={stroke} />
          <Circle cx="12" cy="12" r="3" fill={c} />
        </Svg>
      );
    case "Settings":
    default:
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="12" r="3" stroke={c} strokeWidth={stroke} />
          <Path
            d="M12 3v2M12 19v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3 12h2M19 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
            stroke={c}
            strokeWidth={stroke}
            strokeLinecap="round"
          />
        </Svg>
      );
  }
}

function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text style={[styles.tabLabel, focused && styles.tabLabelOn]} numberOfLines={1}>
      {label}
    </Text>
  );
}

export function RootNavigator() {
  const { t } = useTranslation();
  const assistantEnabled = useAppStore((s) => s.state.settings.aiAssistantEnabled !== false);

  return (
    <NavigationContainer theme={navTheme}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarItemStyle: styles.tabItem,
          tabBarIcon: ({ focused }) => (
            <View style={styles.iconWrap}>
              <TabIcon name={route.name as keyof RootTabParamList} focused={focused} />
              {focused ? <View style={styles.dot} /> : null}
            </View>
          ),
        })}
      >
        <Tab.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{
            tabBarLabel: ({ focused }) => (
              <TabLabel label={t("nav.dashboard", { defaultValue: "Home" })} focused={focused} />
            ),
          }}
        />
        <Tab.Screen
          name="Cashflow"
          component={CashflowScreen}
          options={{
            tabBarLabel: ({ focused }) => (
              <TabLabel label={t("nav.cashflow", { defaultValue: "Cash" })} focused={focused} />
            ),
          }}
        />
        <Tab.Screen
          name="Holdings"
          component={HoldingsScreen}
          options={{
            tabBarLabel: ({ focused }) => (
              <TabLabel label={t("nav.holdings", { defaultValue: "Holdings" })} focused={focused} />
            ),
          }}
        />
        <Tab.Screen
          name="Performance"
          component={PerformanceScreen}
          options={{
            tabBarLabel: ({ focused }) => (
              <TabLabel label={t("nav.perf", { defaultValue: "Perf" })} focused={focused} />
            ),
          }}
        />
        <Tab.Screen
          name="Planning"
          component={PlanningScreen}
          options={{
            tabBarLabel: ({ focused }) => (
              <TabLabel label={t("nav.planning", { defaultValue: "Plan" })} focused={focused} />
            ),
          }}
        />
        {assistantEnabled ? (
          <Tab.Screen
            name="Assistant"
            component={AssistantScreen}
            options={{
              tabBarLabel: ({ focused }) => (
                <TabLabel label={t("nav.assistant", { defaultValue: "AI" })} focused={focused} />
              ),
            }}
          />
        ) : null}
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            tabBarLabel: ({ focused }) => (
              <TabLabel label={t("nav.settings", { defaultValue: "Settings" })} focused={focused} />
            ),
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    height: 64,
    paddingTop: 6,
    paddingBottom: 8,
  },
  tabItem: { paddingTop: 2 },
  iconWrap: { alignItems: "center", justifyContent: "center", height: 26 },
  dot: {
    width: 4,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    marginTop: 3,
  },
  tabLabel: { ...typography.tab, color: colors.muted, marginBottom: 2 },
  tabLabelOn: { color: colors.accent },
});
