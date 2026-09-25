import React, { useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import ViewShot from "react-native-view-shot";
import ReactNativeBlobUtil from "react-native-blob-util";
import { saveExportFile } from "@/lib/export";
import { spacing, radii } from "@/theme/colors";
import { useColors } from "@/theme/ThemeProvider";
import { type as typography } from "@/theme/typography";

type Props = {
  children: React.ReactNode;
  filename?: string;
  title?: string;
};

export function ChartFrame({ children, filename = "chart", title }: Props) {
  const colors = useColors();
  const ref = useRef<ViewShot>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function capture() {
    if (!ref.current?.capture) return;
    setBusy(true);
    setMsg(null);
    try {
      const uri = await ref.current.capture();
      const b64 = await ReactNativeBlobUtil.fs.readFile(
        uri.replace("file://", ""),
        "base64",
      );
      const raw = ReactNativeBlobUtil.base64.decode(b64);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      const outName = `${filename}-${new Date().toISOString().slice(0, 10)}.png`;
      const method = await saveExportFile(outName, { bytes });
      if (method !== "cancelled") setMsg("Saved");
    } catch {
      setMsg("Couldn't capture");
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
        <Pressable onPress={capture} disabled={busy} hitSlop={8}>
          {busy ? (
            <ActivityIndicator color={colors.accent} size="small" />
          ) : (
            <Text style={[styles.action, { color: colors.accent }]}>Export</Text>
          )}
        </Pressable>
      </View>
      {msg ? <Text style={[styles.msg, { color: colors.muted }]}>{msg}</Text> : null}
      <ViewShot ref={ref} options={{ format: "png", quality: 1, result: "tmpfile" }}>
        <View
          style={[
            styles.chart,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          {children}
        </View>
      </ViewShot>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {},
  toolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
    paddingHorizontal: 2,
  },
  title: { ...typography.headline, fontSize: 15 },
  action: { ...typography.caption, fontWeight: "600" },
  msg: { ...typography.caption, marginBottom: 6 },
  chart: {
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
