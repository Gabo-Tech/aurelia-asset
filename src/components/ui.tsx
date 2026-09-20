import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  useWindowDimensions,
  type ViewStyle,
  type StyleProp,
  type TextStyle,
} from "react-native";
import {
  SafeAreaProvider,
  initialWindowMetrics,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { spacing, radii } from "@/theme/colors";
import { useColors } from "@/theme/ThemeProvider";
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
  const colors = useColors();
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
      <View style={[styles.screenRoot, { backgroundColor: colors.bg }]}>
        <View style={[styles.glow, { backgroundColor: colors.heroGlow }]} pointerEvents="none" />
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
    <View style={[styles.screenRoot, { backgroundColor: colors.bg }]}>
      <View style={[styles.glow, { backgroundColor: colors.heroGlow }]} pointerEvents="none" />
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
  const colors = useColors();
  return (
    <View style={styles.header}>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

export function BrandMark({ title, subtitle }: { title: string; subtitle?: string }) {
  const colors = useColors();
  return (
    <View style={styles.header}>
      <Text style={[styles.brand, { color: colors.accent }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text>
      ) : null}
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
  const colors = useColors();
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={[styles.sectionAction, { color: colors.accent }]}>{actionLabel}</Text>
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
  const colors = useColors();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: elevated ? colors.surfaceAlt : colors.surface,
          borderColor: elevated ? "transparent" : colors.border,
        },
        style,
      ]}
    >
      {children}
    </View>
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
  const colors = useColors();
  return (
    <View style={[styles.metric, compact && styles.metricCompact]}>
      <Text style={[styles.metricLabel, { color: colors.muted }]}>{label}</Text>
      <Text
        style={[
          styles.metricValue,
          { color: colors.text },
          compact && styles.metricValueCompact,
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

/** Horizontal equal-width metrics; wraps to 2×2 on very narrow phones. */
export function MetricRow({
  items,
}: {
  items: { label: string; value: string; color?: string }[];
}) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const wrap = width < 360 && items.length > 2;
  return (
    <View style={[styles.metricRow, wrap && styles.metricRowWrap]}>
      {items.map((it) => (
        <View
          key={it.label}
          style={[styles.metricRowItem, wrap && styles.metricRowItemHalf]}
        >
          <Text style={[styles.metricLabel, { color: colors.muted }]}>{it.label}</Text>
          <Text
            style={[
              styles.metricValueCompact,
              { color: it.color ?? colors.text },
            ]}
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
  const colors = useColors();
  return (
    <View
      style={[
        styles.hero,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.heroLabel, { color: colors.accent }]}>{label}</Text>
      <Text style={[styles.heroValue, { color: colors.text }]}>{value}</Text>
      {hint ? <Text style={[styles.heroHint, { color: colors.muted }]}>{hint}</Text> : null}
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
  const colors = useColors();
  return (
    <View style={styles.emptyBox}>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text>
      {body ? <Text style={[styles.emptyBody, { color: colors.muted }]}>{body}</Text> : null}
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
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colors.accent },
        compact && styles.buttonCompact,
        pressed && styles.pressed,
        disabled && styles.buttonDisabled,
        style,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          { color: colors.onAccent },
          compact && styles.buttonTextCompact,
        ]}
        numberOfLines={1}
      >
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
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.secondary,
        { borderColor: destructive ? colors.danger : colors.border },
        compact && styles.buttonCompact,
        pressed && styles.pressed,
        disabled && styles.buttonDisabled,
        style,
      ]}
    >
      <Text
        style={[
          styles.secondaryText,
          { color: destructive ? colors.danger : colors.text },
          compact && styles.buttonTextCompact,
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
  const colors = useColors();
  return <Text style={[styles.fieldLabel, { color: colors.muted }]}>{children}</Text>;
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
  const colors = useColors();
  return (
    <View style={styles.field}>
      <FieldLabel>{label}</FieldLabel>
      {children}
      {hint ? <Text style={[styles.fieldHint, { color: colors.muted }]}>{hint}</Text> : null}
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
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          borderColor: color ?? colors.border,
          backgroundColor: active ? colors.accentSoft : colors.surface,
        },
        active && !color ? { borderColor: colors.accent } : null,
        color && active ? { borderColor: color } : null,
      ]}
    >
      <Text
        style={[
          styles.chipText,
          { color: active ? colors.accent : colors.text },
        ]}
      >
        {label}
      </Text>
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
  const colors = useColors();
  return (
    <View
      style={[
        styles.segment,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            onPress={() => onChange(o.id)}
            style={[
              styles.segmentItem,
              on && { backgroundColor: colors.accentSoft },
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                { color: on ? colors.accent : colors.muted },
              ]}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Hairline() {
  const colors = useColors();
  return <View style={[styles.hairline, { backgroundColor: colors.border }]} />;
}

/** Shared label style for pills/chips so text sits vertically centered (esp. Android). Layout only. */
export const chipLabelStyle: TextStyle = {
  fontFamily: typography.caption.fontFamily,
  fontSize: 12,
  fontWeight: "600",
  lineHeight: 16,
  textAlign: "center",
  ...(Platform.OS === "android"
    ? { includeFontPadding: false, textAlignVertical: "center" }
    : null),
};

/** Shared container style for compact filter/action chips. Layout only. */
export const chipContainerStyle: ViewStyle = {
  paddingHorizontal: 12,
  minHeight: 44,
  borderRadius: radii.pill,
  borderWidth: StyleSheet.hairlineWidth,
  justifyContent: "center",
  alignItems: "center",
};

/** Determinate (0–1) or empty track when progress is undefined. */
export function ProgressBar({ progress }: { progress?: number }) {
  const colors = useColors();
  const pct =
    progress == null || !Number.isFinite(progress)
      ? undefined
      : Math.max(0, Math.min(1, progress));
  return (
    <View
      style={[styles.progressTrack, { backgroundColor: colors.surfaceAlt }]}
      accessibilityRole="progressbar"
    >
      <View
        style={[
          styles.progressFill,
          { backgroundColor: colors.accent },
          pct == null ? styles.progressIndeterminate : { width: `${Math.round(pct * 100)}%` },
        ]}
      />
    </View>
  );
}

/** Bottom sheet for add/edit forms — keeps inputs on the item instead of the page footer. */
export function FormSheet({
  visible,
  title,
  onClose,
  children,
  footer,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  // Modal hosts its own root — re-provide metrics so insets aren't 0 inside.
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <SafeAreaProvider initialMetrics={initialWindowMetrics ?? undefined}>
        <FormSheetBody title={title} onClose={onClose} footer={footer}>
          {children}
        </FormSheetBody>
      </SafeAreaProvider>
    </Modal>
  );
}

function FormSheetBody({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { height: windowHeight } = useWindowDimensions();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = Keyboard.addListener(showEvt, (e) => {
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
    });
    const onHide = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  // Extra gap above the home indicator so actions stay tappable.
  const footerPadBottom =
    keyboardHeight > 0
      ? spacing.md
      : Math.max(insets.bottom, spacing.md) + spacing.md;

  // Bound the scroller with a real pixel height. flex:1 inside maxHeight-only
  // parents collapses to 0 on RN (header+footer visible, form gone).
  const chromeReserve = 140 + footerPadBottom;
  const bodyMaxHeight = Math.max(
    160,
    Math.min(
      windowHeight * 0.6,
      windowHeight * 0.92 - chromeReserve - keyboardHeight,
    ),
  );

  return (
    <View style={styles.sheetRoot}>
      <Pressable style={styles.sheetScrim} onPress={onClose} accessibilityLabel="Close" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={[
          styles.sheetCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.sheetHandleWrap} accessible={false}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
        </View>
        <View style={styles.sheetHeader}>
          <Text style={[styles.sheetTitle, { color: colors.text }]} numberOfLines={1}>
            {title}
          </Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
            <Text style={[styles.sheetClose, { color: colors.accent }]}>Close</Text>
          </Pressable>
        </View>
        <ScrollView
          style={[styles.sheetBody, { maxHeight: bodyMaxHeight }]}
          contentContainerStyle={styles.sheetBodyContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {children}
        </ScrollView>
        {footer ? (
          <View
            style={[
              styles.sheetFooter,
              { paddingBottom: footerPadBottom, borderTopColor: colors.border },
            ]}
          >
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
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
  const colors = useColors();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.busyRoot}>
        <View
          style={[
            styles.busyCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={[styles.busyTitle, { color: colors.text }]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.busySubtitle, { color: colors.muted }]}>{subtitle}</Text>
          ) : null}
          <ProgressBar progress={progress} />
          {onCancel ? (
            <Pressable onPress={onCancel} style={styles.busyCancel} hitSlop={8}>
              <Text style={[styles.busyCancelText, { color: colors.danger }]}>{cancelLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screenRoot: { flex: 1 },
  screenPad: { paddingBottom: spacing.md },
  glow: {
    position: "absolute",
    top: -80,
    right: -40,
    width: 280,
    height: 280,
    borderRadius: 140,
    opacity: 0.9,
  },
  header: { marginBottom: spacing.lg },
  brand: { ...typography.display },
  title: { ...typography.title },
  subtitle: { ...typography.caption, marginTop: 6 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  sectionTitle: { ...typography.headline, fontSize: 16 },
  sectionAction: { ...typography.caption, fontWeight: "600" },
  card: {
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.sm,
  },
  metric: { marginBottom: spacing.sm },
  metricCompact: { marginBottom: 0, flex: 1 },
  metricLabel: { ...typography.label, textTransform: "none", letterSpacing: 0 },
  metricValue: { ...typography.metric, marginTop: 2 },
  metricValueCompact: {
    ...typography.bodyMedium,
    marginTop: 2,
    fontSize: 14,
  },
  metricRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  metricRowWrap: {
    flexWrap: "wrap",
  },
  metricRowItem: { flex: 1, minWidth: 0 },
  metricRowItemHalf: { flexBasis: "46%", flexGrow: 1, flexShrink: 1 },
  hero: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
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
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    gap: spacing.sm,
    alignItems: "center",
  },
  busyTitle: {
    ...typography.headline,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  busySubtitle: {
    ...typography.caption,
    textAlign: "center",
  },
  busyCancel: {
    marginTop: spacing.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
  },
  busyCancelText: {
    ...typography.bodyMedium,
    textAlign: "center",
  },
  progressTrack: {
    width: "100%",
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    marginTop: spacing.sm,
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  progressIndeterminate: {
    width: "35%",
  },
  heroLabel: { ...typography.label },
  heroValue: { ...typography.heroValue, marginTop: spacing.xs },
  heroHint: { ...typography.caption, marginTop: spacing.sm },
  emptyBox: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  emptyTitle: { ...typography.headline },
  emptyBody: { ...typography.caption, marginTop: 8, lineHeight: 20 },
  button: {
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
  },
  secondaryText: { ...typography.bodyMedium },
  chip: {
    ...chipContainerStyle,
    marginRight: 8,
    marginBottom: 8,
  },
  chipText: {
    ...chipLabelStyle,
  },
  field: { marginBottom: spacing.sm },
  fieldLabel: {
    ...typography.label,
    textTransform: "none",
    letterSpacing: 0,
    marginBottom: 6,
  },
  fieldHint: {
    ...typography.caption,
    marginTop: 6,
    lineHeight: 18,
  },
  segment: {
    flexDirection: "row",
    borderRadius: radii.md,
    padding: 3,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.sm,
  },
  segmentItem: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 4,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: radii.sm,
  },
  segmentText: {
    ...chipLabelStyle,
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.sm,
  },
  sheetRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheetScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheetCard: {
    maxHeight: "92%",
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    overflow: "hidden",
  },
  sheetHandleWrap: { alignItems: "center", paddingTop: 10, paddingBottom: 4 },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  sheetTitle: { ...typography.headline, flex: 1, marginRight: spacing.sm },
  sheetClose: { ...typography.caption, fontWeight: "600" },
  /** Height comes from inline maxHeight — never flex:1 (collapses in maxHeight-only cards). */
  sheetBody: { flexGrow: 0, flexShrink: 1 },
  sheetBodyContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    flexGrow: 0,
  },
  sheetFooter: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    alignItems: "stretch",
  },
});
