import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  type ViewStyle,
  type StyleProp,
  type TextStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, radii } from "@/theme/colors";
import { type as typography } from "@/theme/typography";

export function Screen({
  children,
  scroll = false,
  avoidKeyboard = true,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  /** Wrap in KeyboardAvoidingView (disable for screens that pin a composer with IME insets). */
  avoidKeyboard?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const pad = {
    paddingTop: Math.max(insets.top, spacing.sm),
    paddingLeft: Math.max(insets.left, spacing.md),
    paddingRight: Math.max(insets.right, spacing.md),
  };
  const kavProps = {
    style: styles.flex as ViewStyle,
    behavior: "padding" as const,
    keyboardVerticalOffset: Platform.OS === "ios" ? insets.top : 0,
  };

  const scrollBody = (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.screenPad, pad, { paddingBottom: spacing.xl }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets
    >
      {children}
    </ScrollView>
  );

  if (scroll) {
    return (
      <View style={styles.screenRoot}>
        <View style={styles.glow} pointerEvents="none" />
        {avoidKeyboard ? (
          <KeyboardAvoidingView {...kavProps}>{scrollBody}</KeyboardAvoidingView>
        ) : (
          scrollBody
        )}
      </View>
    );
  }

  const staticBody = (
    <View style={[styles.flex, styles.screenPad, pad]}>
      {children}
    </View>
  );

  return (
    <View style={styles.screenRoot}>
      <View style={styles.glow} pointerEvents="none" />
      {avoidKeyboard ? (
        <KeyboardAvoidingView {...kavProps} style={[styles.flex, styles.screenPad, pad]}>
          {children}
        </KeyboardAvoidingView>
      ) : (
        staticBody
      )}
    </View>
  );
}

export function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function BrandMark({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.header}>
      <Text style={styles.brand}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.sectionAction}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Card({
  children,
  style,
  elevated,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  elevated?: boolean;
}) {
  return (
    <View style={[styles.card, elevated && styles.cardElevated, style]}>{children}</View>
  );
}

export function Metric({
  label,
  value,
  compact,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <View style={[styles.metric, compact && styles.metricCompact]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, compact && styles.metricValueCompact]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/** Horizontal equal-width metrics to avoid empty right half of cards. */
export function MetricRow({
  items,
}: {
  items: { label: string; value: string; color?: string }[];
}) {
  return (
    <View style={styles.metricRow}>
      {items.map((it) => (
        <View key={it.label} style={styles.metricRowItem}>
          <Text style={styles.metricLabel}>{it.label}</Text>
          <Text
            style={[styles.metricValueCompact, it.color ? { color: it.color } : null]}
            numberOfLines={2}
          >
            {it.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function HeroMetric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <View style={styles.hero}>
      <Text style={styles.heroLabel}>{label}</Text>
      <Text style={styles.heroValue}>{value}</Text>
      {hint ? <Text style={styles.heroHint}>{hint}</Text> : null}
    </View>
  );
}

export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.emptyBox}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={styles.emptyBody}>{body}</Text> : null}
      {actionLabel && onAction ? (
        <View style={{ marginTop: spacing.md }}>
          <PrimaryButton label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  compact,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        pressed && styles.pressed,
        disabled && styles.buttonDisabled,
        style,
      ]}
    >
      <Text style={[styles.buttonText, compact && styles.buttonTextCompact]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  disabled,
  destructive,
  compact,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.secondary,
        compact && styles.buttonCompact,
        destructive && styles.secondaryDestructive,
        pressed && styles.pressed,
        disabled && styles.buttonDisabled,
        style,
      ]}
    >
      <Text
        style={[
          styles.secondaryText,
          compact && styles.buttonTextCompact,
          destructive && styles.secondaryDestructiveText,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Destructive action styled as secondary/danger (not gold primary). */
export function DangerButton({
  label,
  onPress,
  disabled,
  compact,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <SecondaryButton
      label={label}
      onPress={onPress}
      disabled={disabled}
      compact={compact}
      style={style}
      destructive
    />
  );
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <FieldLabel>{label}</FieldLabel>
      {children}
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
  color,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  color?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        color ? { borderColor: color } : null,
        active && styles.chipActive,
      ]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <View style={styles.segment}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            onPress={() => onChange(o.id)}
            style={[styles.segmentItem, on && styles.segmentItemOn]}
          >
            <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Hairline() {
  return <View style={styles.hairline} />;
}

/** Shared label style for pills/chips so text sits vertically centered (esp. Android). */
export const chipLabelStyle: TextStyle = {
  fontFamily: typography.caption.fontFamily,
  fontSize: 12,
  fontWeight: "600",
  lineHeight: 16,
  color: colors.text,
  textAlign: "center",
  ...(Platform.OS === "android"
    ? { includeFontPadding: false, textAlignVertical: "center" }
    : null),
};

/** Shared container style for compact filter/action chips. */
export const chipContainerStyle: ViewStyle = {
  paddingHorizontal: 12,
  minHeight: 32,
  borderRadius: radii.pill,
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: colors.border,
  backgroundColor: colors.surface,
  justifyContent: "center",
  alignItems: "center",
};

/** Determinate (0–1) or empty track when progress is undefined. */
export function ProgressBar({ progress }: { progress?: number }) {
  const pct =
    progress == null || !Number.isFinite(progress)
      ? undefined
      : Math.max(0, Math.min(1, progress));
  return (
    <View style={styles.progressTrack} accessibilityRole="progressbar">
      <View
        style={[
          styles.progressFill,
          pct == null ? styles.progressIndeterminate : { width: `${Math.round(pct * 100)}%` },
        ]}
      />
    </View>
  );
}

/** Full-screen blocking overlay for import/export/downloads. */
export function BusyOverlay({
  visible,
  title,
  subtitle,
  progress,
  onCancel,
  cancelLabel = "Cancel",
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  /** 0–1 when known; omit for indeterminate. */
  progress?: number;
  onCancel?: () => void;
  cancelLabel?: string;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.busyRoot}>
        <View style={styles.busyCard}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.busyTitle}>{title}</Text>
          {subtitle ? <Text style={styles.busySubtitle}>{subtitle}</Text> : null}
          <ProgressBar progress={progress} />
          {onCancel ? (
            <Pressable onPress={onCancel} style={styles.busyCancel} hitSlop={8}>
              <Text style={styles.busyCancelText}>{cancelLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screenRoot: { flex: 1, backgroundColor: colors.bg },
  screenPad: { paddingBottom: spacing.md },
  glow: {
    position: "absolute",
    top: -80,
    right: -40,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: colors.heroGlow,
    opacity: 0.9,
  },
  header: { marginBottom: spacing.lg },
  brand: { ...typography.display, color: colors.accent },
  title: { ...typography.title, color: colors.text },
  subtitle: { ...typography.caption, color: colors.muted, marginTop: 6 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  sectionTitle: { ...typography.headline, color: colors.text, fontSize: 16 },
  sectionAction: { ...typography.caption, color: colors.accent, fontWeight: "600" },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  cardElevated: {
    borderColor: "transparent",
    backgroundColor: colors.surfaceAlt,
  },
  metric: { marginBottom: spacing.sm },
  metricCompact: { marginBottom: 0, flex: 1 },
  metricLabel: { ...typography.label, color: colors.muted, textTransform: "none", letterSpacing: 0 },
  metricValue: { ...typography.metric, color: colors.text, marginTop: 2 },
  metricValueCompact: {
    ...typography.bodyMedium,
    color: colors.text,
    marginTop: 2,
    fontSize: 14,
  },
  metricRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  metricRowItem: { flex: 1, minWidth: 0 },
  hero: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: "hidden",
  },
  busyRoot: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  busyCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
    alignItems: "center",
  },
  busyTitle: {
    ...typography.headline,
    color: colors.text,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  busySubtitle: {
    ...typography.caption,
    color: colors.muted,
    textAlign: "center",
  },
  busyCancel: {
    marginTop: spacing.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
  },
  busyCancelText: {
    ...typography.bodyMedium,
    color: colors.danger,
    textAlign: "center",
  },
  progressTrack: {
    width: "100%",
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceAlt,
    overflow: "hidden",
    marginTop: spacing.sm,
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  progressIndeterminate: {
    width: "35%",
  },
  heroLabel: { ...typography.label, color: colors.accent },
  heroValue: { ...typography.heroValue, color: colors.text, marginTop: spacing.xs },
  heroHint: { ...typography.caption, color: colors.muted, marginTop: spacing.sm },
  emptyBox: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  emptyTitle: { ...typography.headline, color: colors.text },
  emptyBody: { ...typography.caption, color: colors.muted, marginTop: 8, lineHeight: 20 },
  button: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    alignItems: "center",
  },
  buttonCompact: {
    paddingVertical: 9,
    paddingHorizontal: spacing.sm,
  },
  buttonDisabled: { opacity: 0.45 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
  buttonText: {
    ...typography.bodyMedium,
    color: colors.onAccent,
  },
  buttonTextCompact: {
    fontSize: 13,
  },
  secondary: {
    backgroundColor: "transparent",
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  secondaryDestructive: { borderColor: colors.danger },
  secondaryText: { ...typography.bodyMedium, color: colors.text },
  secondaryDestructiveText: { color: colors.danger },
  chip: {
    ...chipContainerStyle,
    marginRight: 8,
    marginBottom: 8,
  },
  chipActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  chipText: {
    ...chipLabelStyle,
  },
  chipTextActive: { color: colors.accent },
  field: { marginBottom: spacing.sm },
  fieldLabel: {
    ...typography.label,
    color: colors.muted,
    textTransform: "none",
    letterSpacing: 0,
    marginBottom: 6,
  },
  fieldHint: {
    ...typography.caption,
    color: colors.muted,
    marginTop: 6,
    lineHeight: 18,
  },
  segment: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  segmentItem: {
    flex: 1,
    minHeight: 36,
    paddingHorizontal: 4,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: radii.sm,
  },
  segmentItemOn: { backgroundColor: colors.accentSoft },
  segmentText: {
    ...chipLabelStyle,
    color: colors.muted,
  },
  segmentTextOn: { color: colors.accent },
  hairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
});
