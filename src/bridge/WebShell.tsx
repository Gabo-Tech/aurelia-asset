/**
 * Full-screen WebView shell that hosts the old website SPA and bridges
 * Tauri IPC commands to React Native native modules.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  NativeModules,
  Platform,
  StyleSheet,
  Text,
  View,
  PermissionsAndroid,
} from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { TAURI_SHIM_JS } from "@/bridge/tauriShim";
import { dispatchCommand } from "@/bridge/commands";
import { useColors } from "@/theme/ThemeProvider";

// RN 0.86 + react-native-webview typings currently resolve props to `never`.
const RNWebView = WebView as unknown as React.ComponentType<Record<string, unknown>>;

const SERVER_PORT = 8765;

type LocalWebServerNative = {
  start: (port: number) => Promise<string>;
  stop: () => Promise<void>;
};

const LocalWebServer = NativeModules.LocalWebServer as LocalWebServerNative | undefined;

async function requestMicPermission() {
  if (Platform.OS !== "android") return;
  try {
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
      title: "Microphone",
      message: "Aurelia needs the microphone for voice input.",
      buttonPositive: "OK",
    });
  } catch {
    /* ignore */
  }
}

export function WebShell() {
  const colors = useColors();
  const webRef = useRef<{ injectJavaScript: (js: string) => void } | null>(null);
  const [origin, setOrigin] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);

  const emit = useCallback((event: string, payload: unknown) => {
    const js = `window.__FT_BRIDGE_EMIT__ && window.__FT_BRIDGE_EMIT__(${JSON.stringify(
      event,
    )}, ${JSON.stringify(payload)}); true;`;
    webRef.current?.injectJavaScript(js);
  }, []);

  const resolveInvoke = useCallback((id: string, ok: boolean, result?: unknown, err?: string) => {
    const payload = ok ? { ok: true, result } : { ok: false, error: err || "error" };
    const js = `window.__FT_BRIDGE_RESOLVE__ && window.__FT_BRIDGE_RESOLVE__(${JSON.stringify(
      id,
    )}, ${JSON.stringify(payload)}); true;`;
    webRef.current?.injectJavaScript(js);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (!LocalWebServer) {
          throw new Error("LocalWebServer native module is not linked");
        }
        await requestMicPermission();
        const url = await LocalWebServer.start(SERVER_PORT);
        if (cancelled) {
          await LocalWebServer.stop();
          return;
        }
        setOrigin(url.replace(/\/$/, ""));
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();

    return () => {
      cancelled = true;
      void LocalWebServer?.stop();
    };
  }, []);

  const onMessage = useCallback(
    (ev: WebViewMessageEvent) => {
      let msg: { type?: string; id?: string; cmd?: string; args?: Record<string, unknown> };
      try {
        msg = JSON.parse(ev.nativeEvent.data);
      } catch {
        return;
      }
      if (msg.type !== "invoke" || !msg.id || !msg.cmd) return;
      const { id, cmd, args = {} } = msg;
      void (async () => {
        try {
          const result = await dispatchCommand(cmd, args, emit);
          resolveInvoke(id, true, result);
        } catch (e) {
          resolveInvoke(id, false, undefined, e instanceof Error ? e.message : String(e));
        }
      })();
    },
    [emit, resolveInvoke],
  );

  const injectedBefore = useMemo(() => TAURI_SHIM_JS, []);

  if (booting) {
    return (
      <View style={[styles.boot, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[styles.bootText, { color: colors.muted }]}>Starting Aurelia…</Text>
      </View>
    );
  }

  if (error || !origin) {
    return (
      <View style={[styles.boot, { backgroundColor: colors.bg }]}>
        <Text style={[styles.errorTitle, { color: colors.text }]}>Could not start the app</Text>
        <Text style={[styles.errorBody, { color: colors.muted }]}>
          {error || "Unknown error"}
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <RNWebView
        ref={webRef}
        source={{ uri: `${origin}/` }}
        style={[styles.webview, { backgroundColor: colors.bg }]}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        allowUniversalAccessFromFileURLs
        mixedContentMode="always"
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        mediaCapturePermissionGrantType="grant"
        setSupportMultipleWindows={false}
        injectedJavaScriptBeforeContentLoaded={injectedBefore}
        onMessage={onMessage}
        geolocationEnabled={false}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  webview: { flex: 1 },
  boot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  bootText: { fontSize: 14 },
  errorTitle: { fontSize: 16, fontWeight: "600", textAlign: "center" },
  errorBody: { fontSize: 13, textAlign: "center" },
});
