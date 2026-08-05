import React, { useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { saveExportFile } from "@/lib/export";
import { colors, radii, spacing } from "@/theme/colors";
import { type as typography } from "@/theme/typography";

type Props = {
  children: React.ReactNode;
  filename?: string;
  title?: string;
};

/** Browser chart frame - text-note export fallback. */
export function ChartFrame({ children, filename = "chart", title }: Props) {
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
        {title ? <Text style={styles.title}>{title}</Text> : <View />}
        <Pressable onPress={() => void capture()} disabled={busy} hitSlop={8}>
          {busy ? (
            <ActivityIndicator color={colors.accent} size="small" />
          ) : (
            <Text style={styles.action}>Export</Text>
          )}
        </Pressable>
      </View>
      <View ref={ref} style={styles.chart} collapsable={false}>
        {children}
      </View>
      {msg ? <Text style={styles.msg}>{msg}</Text> : null}
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
  title: { ...typography.headline, fontSize: 15, color: colors.text },
  action: { ...typography.caption, color: colors.accent, fontWeight: "600" },
  chart: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    overflow: "hidden",
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  msg: { ...typography.caption, color: colors.muted, marginTop: 4 },
});
