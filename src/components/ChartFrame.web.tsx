import React, { useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { saveExportFile } from "@/lib/export";
import { radii, spacing } from "@/theme/colors";
import { useColors } from "@/theme/ThemeProvider";
import { type as typography } from "@/theme/typography";

type Props = {
  children: React.ReactNode;
  filename?: string;
  title?: string;
};

/** Browser chart frame - text-note export fallback. */
export function ChartFrame({ children, filename = "chart", title }: Props) {
  const colors = useColors();
  const ref = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function capture() {
    setBusy(true);
    setMsg(null);
    try {
      const note = `Chart capture is limited on web. Filename hint: ${filename}`;
      await saveExportFile(`${filename}-${new Date().toISOString().slice(0, 10)}.txt`, {
        text: note,
      });
      setMsg("Saved as text note");
    } catch {
      setMsg("Couldn't capture on web");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.toolbar}>
        {title ? (
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        ) : (
          <View />
        )}
        <Pressable onPress={() => void capture()} disabled={busy} hitSlop={8}>
          {busy ? (
            <ActivityIndicator color={colors.accent} size="small" />
          ) : (
            <Text style={[styles.action, { color: colors.accent }]}>Export</Text>
          )}
        </Pressable>
      </View>
      <View
        ref={ref}
        style={[
          styles.chart,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
        collapsable={false}
      >
        {children}
      </View>
      {msg ? <Text style={[styles.msg, { color: colors.muted }]}>{msg}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginVertical: spacing.sm },
  toolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  title: { ...typography.headline, fontSize: 15 },
  action: { ...typography.caption, fontWeight: "600" },
  chart: {
    borderRadius: radii.lg,
    overflow: "hidden",
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  msg: { ...typography.caption, marginTop: 4 },
});
