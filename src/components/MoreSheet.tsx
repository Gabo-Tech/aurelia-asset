import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  ScrollView,
} from "react-native";
import { SafeAreaProvider, initialWindowMetrics, useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { colors, spacing, radii } from "@/theme/colors";
import { type as typography } from "@/theme/typography";
import type { RootTabParamList } from "@/navigation/RootNavigator";

export type MoreDestination = Extract<
  keyof RootTabParamList,
  "Planning" | "Assistant" | "Settings"
>;

type MoreRow = {
  id: MoreDestination | "tour";
  title: string;
  body: string;
};

function RowIcon({ id }: { id: MoreRow["id"] }) {
  const c = colors.accent;
  const size = 22;
  if (id === "Planning") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Rect x="5" y="4" width="14" height="17" rx="2" stroke={c} strokeWidth={1.8} />
        <Path d="M9 2v4M15 2v4M5 10h14" stroke={c} strokeWidth={1.8} strokeLinecap="round" />
      </Svg>
    );
  }
  if (id === "Assistant") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Circle cx="12" cy="12" r="8" stroke={c} strokeWidth={1.8} />
        <Circle cx="12" cy="12" r="3" fill={c} />
      </Svg>
    );
  }
  if (id === "tour") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Circle cx="12" cy="12" r="9" stroke={c} strokeWidth={1.8} />
        <Path
          d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.25c-.7.4-1.1.9-1.1 1.75V14"
          stroke={c}
          strokeWidth={1.8}
          strokeLinecap="round"
        />
        <Circle cx="12" cy="17" r="1" fill={c} />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852 1.01 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
        stroke={c}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Circle cx="12" cy="12" r="3" stroke={c} strokeWidth={1.8} />
    </Svg>
  );
}

export function MoreSheet({
  visible,
  onClose,
  assistantEnabled,
  activeRoute,
  onNavigate,
  onTakeTour,
}: {
  visible: boolean;
  onClose: () => void;
  assistantEnabled: boolean;
  activeRoute?: keyof RootTabParamList;
  onNavigate: (route: MoreDestination) => void;
  onTakeTour: () => void;
}) {
  const { t } = useTranslation();

  const rows: MoreRow[] = [
    {
      id: "Planning",
      title: t("nav.planning"),
      body: t("nav.moreDesc.planning"),
    },
    ...(assistantEnabled
      ? [
          {
            id: "Assistant" as const,
            title: t("nav.assistant"),
            body: t("nav.moreDesc.assistant"),
          },
        ]
      : []),
    {
      id: "Settings",
      title: t("nav.settings"),
      body: t("nav.moreDesc.settings"),
    },
    {
      id: "tour",
      title: t("nav.moreDesc.tourTitle"),
      body: t("nav.moreDesc.tourBody"),
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics ?? undefined}>
        <MoreSheetBody
          rows={rows}
          activeRoute={activeRoute}
          onClose={onClose}
          onNavigate={onNavigate}
          onTakeTour={onTakeTour}
        />
      </SafeAreaProvider>
    </Modal>
  );
}

function MoreSheetBody({
  rows,
  activeRoute,
  onClose,
  onNavigate,
  onTakeTour,
}: {
  rows: MoreRow[];
  activeRoute?: keyof RootTabParamList;
  onClose: () => void;
  onNavigate: (route: MoreDestination) => void;
  onTakeTour: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, spacing.md) + spacing.md;

  return (
    <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close">
      <Pressable
        style={[styles.sheet, { paddingBottom: bottomPad }]}
        onPress={(e) => e.stopPropagation()}
      >
        <View style={styles.handle} />
        <Text style={styles.heading}>{t("nav.more")}</Text>
        <ScrollView bounces={false}>
          {rows.map((row) => {
            const active = row.id !== "tour" && activeRoute === row.id;
            return (
              <Pressable
                key={row.id}
                onPress={() => {
                  onClose();
                  if (row.id === "tour") onTakeTour();
                  else onNavigate(row.id);
                }}
                style={[styles.row, active && styles.rowActive]}
                accessibilityRole="button"
              >
                <View style={styles.iconWrap}>
                  <RowIcon id={row.id} />
                </View>
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, active && styles.rowTitleActive]}>
                    {row.title}
                  </Text>
                  <Text style={styles.rowBody}>{row.body}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
    maxHeight: "72%",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  heading: {
    ...typography.headline,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    marginBottom: spacing.xs,
  },
  rowActive: {
    backgroundColor: colors.accentSoft,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { ...typography.bodyMedium, color: colors.text },
  rowTitleActive: { color: colors.accent },
  rowBody: { ...typography.caption, color: colors.muted, marginTop: 2 },
});
