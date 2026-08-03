import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  type ViewStyle,
  type StyleProp,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, radii } from "@/theme/colors";
import { type as typography } from "@/theme/typography";

export function Screen({
  children,
  scroll = false,
}: {
  children: React.ReactNode;
  scroll?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const pad = {
    paddingTop: Math.max(insets.top, spacing.sm),
    paddingLeft: Math.max(insets.left, spacing.md),
    paddingRight: Math.max(insets.right, spacing.md),
  };
  if (scroll) {
    return (
      <View style={styles.screenRoot}>
        <View style={styles.glow} pointerEvents="none" />
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.screenPad, pad, { paddingBottom: spacing.xl }]}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </View>
    );
  }
  return (
    <View style={[styles.screenRoot, styles.screenPad, pad]}>
      <View style={styles.glow} pointerEvents="none" />
      {children}
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

export function BrandMark({ subtitle }: { subtitle?: string }) {
  return (
    <View style={styles.header}>
      <Text style={styles.brand}>Aurelia</Text>
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

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
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
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        pressed && styles.pressed,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  disabled,
  destructive,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.secondary,
        destructive && styles.secondaryDestructive,
        pressed && styles.pressed,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Text
        style={[styles.secondaryText, destructive && styles.secondaryDestructiveText]}
      >
        {label}
      </Text>
    </Pressable>
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
  metricLabel: { ...typography.label, color: colors.muted, textTransform: "none", letterSpacing: 0 },
  metricValue: { ...typography.metric, color: colors.text, marginTop: 2 },
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
  buttonDisabled: { opacity: 0.45 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
  buttonText: {
    ...typography.bodyMedium,
    color: colors.onAccent,
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
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginRight: 8,
    marginBottom: 8,
  },
  chipActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  chipText: { ...typography.caption, color: colors.text, fontWeight: "600" },
  chipTextActive: { color: colors.accent },
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
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: radii.sm,
  },
  segmentItemOn: { backgroundColor: colors.accentSoft },
  segmentText: { ...typography.caption, color: colors.muted, fontWeight: "600" },
  segmentTextOn: { color: colors.accent },
  hairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
});
