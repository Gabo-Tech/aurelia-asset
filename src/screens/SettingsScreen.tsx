import React, { useState } from "react";
import {
  ScrollView,
  Text,
  StyleSheet,
  Switch,
  View,
  Alert,
  ActivityIndicator,
  TextInput,
  Platform,
} from "react-native";
import { useTranslation } from "react-i18next";
import {
  Screen,
  Header,
  Card,
  PrimaryButton,
  SecondaryButton,
  Chip,
  SectionHeader,
} from "@/components/ui";
import { useStore, usePrivacy } from "@/lib/store";
import {
  saveExportFile,
  readImportFile,
  pickModelFile,
  datedFilename,
  exportMethodDescription,
  rowsToCsv,
} from "@/lib/export";
import { buildBackupEnvelope, parseBackupJson, stringifyBackup } from "@/lib/backup";
import {
  MODEL_MANIFEST,
  downloadModel,
  cancelActiveDownload,
  clearInstalledModel,
  formatDownloadProgress,
  totalDownloadSizeLabel,
  type ModelDownloadProgress,
  type ModelKind,
} from "@/lib/ai/downloads";
import { bustCache } from "@/lib/finance/cache";
import { clearPriceHistoryCache } from "@/lib/finance";
import { CURRENCIES } from "@/lib/currency";
import { SUPPORTED_LANGUAGES } from "@/i18n";
import { colors, spacing } from "@/theme/colors";

const ALLOWED_CORS_PROXIES = [
  "https://corsproxy.io/?",
  "https://api.allorigins.win/raw?url=",
] as const;

const isWeb = Platform.OS === "web";

export function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const { state, updateSettings, importState, reset } = useStore();
  const { privacy, toggle } = usePrivacy();
  const [busy, setBusy] = useState(false);
  const [dlProgress, setDlProgress] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<ModelKind | "all" | null>(null);
  const [finnhub, setFinnhub] = useState(state.settings.finnhubKey ?? "");
  const [pasteValue, setPasteValue] = useState("");
  const [showPaste, setShowPaste] = useState(false);

  async function applyBackupText(text: string) {
    const parsed = parseBackupJson(text);
    importState(parsed.state);
    if (parsed.language && SUPPORTED_LANGUAGES.some((l) => l.code === parsed.language)) {
      await i18n.changeLanguage(parsed.language);
    }
  }

  async function onExport() {
    setBusy(true);
    try {
      const envelope = buildBackupEnvelope(state, { language: i18n.language?.slice(0, 2) });
      const filename = datedFilename("aurelia-backup", "json");
      const method = await saveExportFile(filename, { text: stringifyBackup(envelope) });
      Alert.alert("Export", exportMethodDescription(method, filename, t));
    } catch (e) {
      Alert.alert("Export failed", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onExportCsv() {
    setBusy(true);
    try {
      const rows: unknown[][] = [
        ["kind", "source", "category", "amount", "currency", "date", "description"],
        ...state.cashflows.map((c) => [
          c.kind,
          c.source,
          c.category,
          c.amount,
          c.currency || "",
          c.date,
          c.description || "",
        ]),
      ];
      const filename = datedFilename("aurelia-cashflow", "csv");
      const method = await saveExportFile(filename, { text: rowsToCsv(rows) });
      Alert.alert("Export", exportMethodDescription(method, filename, t));
    } catch (e) {
      Alert.alert("Export failed", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onImport() {
    setBusy(true);
    try {
      const text = await readImportFile();
      if (!text) return;
      await applyBackupText(text);
      Alert.alert("Import", t("settings.data.imported", { defaultValue: "Backup restored" }));
    } catch (e) {
      Alert.alert("Import failed", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onPasteImport() {
    if (!pasteValue.trim()) {
      Alert.alert("Import", "Paste a backup JSON first");
      return;
    }
    setBusy(true);
    try {
      await applyBackupText(pasteValue);
      setPasteValue("");
      setShowPaste(false);
      Alert.alert("Import", t("settings.data.imported", { defaultValue: "Backup restored" }));
    } catch (e) {
      Alert.alert("Import failed", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function pickLlm() {
    const path = await pickModelFile();
    if (path) updateSettings({ aiLlmModelPath: path, aiModelSetup: "done" });
  }

  async function pickStt() {
    const path = await pickModelFile();
    if (path) updateSettings({ aiSttModelDir: path.replace(/\/[^/]+$/, ""), aiModelSetup: "done" });
  }

  async function pickTts() {
    const path = await pickModelFile();
    if (path) updateSettings({ aiTtsModelDir: path.replace(/\/[^/]+$/, ""), aiModelSetup: "done" });
  }

  async function onDownload(kind: ModelKind) {
    setDownloading(kind);
    setDlProgress("Starting…");
    try {
      const path = await downloadModel(kind, (p: ModelDownloadProgress) => {
        setDlProgress(`${kind.toUpperCase()}: ${formatDownloadProgress(p)}`);
      });
      const entry = MODEL_MANIFEST.find((m) => m.kind === kind)!;
      updateSettings({ [entry.settingsKey]: path, aiModelSetup: "done" });
      Alert.alert("Downloaded", `${kind.toUpperCase()} ready`);
    } catch (e) {
      Alert.alert("Download failed", (e as Error).message);
    } finally {
      setDownloading(null);
      setDlProgress(null);
    }
  }

  async function onDownloadAll() {
    setDownloading("all");
    try {
      for (const entry of MODEL_MANIFEST) {
        setDlProgress(`${entry.kind.toUpperCase()}…`);
        const path = await downloadModel(entry.kind, (p) => {
          setDlProgress(`${entry.kind.toUpperCase()}: ${formatDownloadProgress(p)}`);
        });
        updateSettings({ [entry.settingsKey]: path, aiModelSetup: "done" });
      }
      Alert.alert("Downloaded", `All models ready (${totalDownloadSizeLabel()})`);
    } catch (e) {
      Alert.alert("Download failed", (e as Error).message);
    } finally {
      setDownloading(null);
      setDlProgress(null);
    }
  }

  return (
    <Screen>
      <ScrollView>
        <Header title={t("nav.settings", { defaultValue: "Settings" })} />

        <Card>
          <Text style={styles.section}>Privacy</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Privacy mode</Text>
            <Switch value={privacy} onValueChange={toggle} />
          </View>
        </Card>

        <Card>
          <Text style={styles.section}>{t("settings.api.title", { defaultValue: "Market data" })}</Text>
          <View style={styles.row}>
            <Text style={styles.label}>
              {isWeb ? "CORS proxy (browser)" : "Allow market data (online)"}
            </Text>
            <Switch
              value={!!state.settings.useCorsProxy}
              onValueChange={(v) => updateSettings({ useCorsProxy: v })}
            />
          </View>
          {isWeb && state.settings.useCorsProxy ? (
            <>
              <Text style={styles.meta}>
                {t("settings.api.corsProxyUrl", { defaultValue: "CORS proxy URL" })}
              </Text>
              <View style={styles.wrap}>
                {ALLOWED_CORS_PROXIES.map((url) => (
                  <Chip
                    key={url}
                    label={url.replace(/^https:\/\//, "").slice(0, 28)}
                    active={(state.settings.corsProxy || ALLOWED_CORS_PROXIES[0]) === url}
                    onPress={() => updateSettings({ corsProxy: url })}
                  />
                ))}
              </View>
            </>
          ) : null}
          <Text style={styles.meta}>Finnhub API key (optional)</Text>
          <TextInput
            style={styles.input}
            value={finnhub}
            onChangeText={setFinnhub}
            placeholder="finnhub key"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <PrimaryButton
            label="Save Finnhub key"
            onPress={() =>
              updateSettings({ finnhubKey: finnhub.trim() || undefined })
            }
          />
          <View style={{ height: 8 }} />
          <PrimaryButton
            label="Clear price cache"
            onPress={() => {
              bustCache("");
              clearPriceHistoryCache();
              Alert.alert("Cache", "Price cache cleared");
            }}
          />
        </Card>

        <SectionHeader title="Display currency" />
        <View style={styles.wrap}>
          {CURRENCIES.slice(0, 12).map((c) => (
            <Chip
              key={c.code}
              label={c.code}
              active={(state.settings.displayCurrency || "USD").toUpperCase() === c.code}
              onPress={() => updateSettings({ displayCurrency: c.code })}
            />
          ))}
        </View>

        <SectionHeader title="Language" />
        <View style={styles.wrap}>
          {SUPPORTED_LANGUAGES.map((l) => (
            <Chip
              key={l.code}
              label={l.label}
              active={i18n.language.startsWith(l.code)}
              onPress={() => {
                void i18n.changeLanguage(l.code);
              }}
            />
          ))}
        </View>

        <Card>
          <Text style={styles.section}>Local AI models</Text>
          {!isWeb && state.settings.aiModelSetup === "pending" ? (
            <View style={styles.setupBanner}>
              <Text style={styles.meta}>
                Optional: download on-device LLM + speech models (~1.2 GB). You can also pick files
                later or use NLU without models.
              </Text>
              <PrimaryButton
                label={`Download all (${totalDownloadSizeLabel()})`}
                onPress={() => void onDownloadAll()}
                disabled={!!downloading}
              />
              <View style={{ height: 8 }} />
              <SecondaryButton
                label="Skip for now"
                onPress={() => updateSettings({ aiModelSetup: "declined" })}
              />
            </View>
          ) : null}
          {isWeb ? (
            <Text style={styles.meta}>
              On Linux (RN Web), the assistant uses on-device NLU only. Download LLM/STT/TTS on
              Android, iOS, Windows, or macOS.
            </Text>
          ) : (
            <>
              <Text style={styles.meta}>LLM: {state.settings.aiLlmModelPath || "not set"}</Text>
              <Text style={styles.meta}>STT dir: {state.settings.aiSttModelDir || "not set"}</Text>
              <Text style={styles.meta}>TTS dir: {state.settings.aiTtsModelDir || "not set"}</Text>
              {dlProgress ? (
                <View style={styles.progressBox}>
                  <ActivityIndicator color={colors.accent} />
                  <Text style={styles.progressText}>{dlProgress}</Text>
                </View>
              ) : null}
              <View style={{ height: 8 }} />
              {downloading ? (
                <>
                  <SecondaryButton
                    label="Cancel download"
                    destructive
                    onPress={() => {
                      cancelActiveDownload();
                      setDownloading(null);
                      setDlProgress(null);
                    }}
                  />
                  <View style={{ height: 8 }} />
                </>
              ) : null}
              <PrimaryButton
                label={
                  downloading === "all"
                    ? "Downloading…"
                    : `Download all (${totalDownloadSizeLabel()})`
                }
                onPress={onDownloadAll}
                disabled={!!downloading}
              />
              <View style={{ height: 8 }} />
              {MODEL_MANIFEST.map((m) => (
                <View key={m.kind} style={{ marginBottom: 8 }}>
                  <PrimaryButton
                    label={
                      downloading === m.kind
                        ? `Downloading ${m.kind}…`
                        : `Download ${m.kind.toUpperCase()} (${m.sizeLabel})`
                    }
                    onPress={() => void onDownload(m.kind)}
                    disabled={!!downloading}
                  />
                  <View style={{ height: 6 }} />
                  <SecondaryButton
                    label={`Clear ${m.kind.toUpperCase()} path`}
                    onPress={() => {
                      void clearInstalledModel(m.kind).catch(() => undefined);
                      updateSettings({ [m.settingsKey]: undefined });
                    }}
                  />
                </View>
              ))}
              <PrimaryButton label="Pick LLM (GGUF)" onPress={pickLlm} />
              <View style={{ height: 8 }} />
              <PrimaryButton label="Pick STT model file" onPress={pickStt} />
              <View style={{ height: 8 }} />
              <PrimaryButton label="Pick TTS model file" onPress={pickTts} />
            </>
          )}
          <View style={styles.row}>
            <Text style={styles.label}>Assistant enabled</Text>
            <Switch
              value={state.settings.aiAssistantEnabled !== false}
              onValueChange={(v) => updateSettings({ aiAssistantEnabled: v })}
            />
          </View>
        </Card>

        <Card>
          <Text style={styles.section}>Data</Text>
          <Text style={styles.meta}>
            JSON backups use the web-compatible envelope so browser exports restore correctly.
          </Text>
          <PrimaryButton
            label={busy ? "…" : "Export JSON backup"}
            onPress={onExport}
            disabled={busy}
          />
          <View style={{ height: 8 }} />
          <PrimaryButton label="Export cashflow CSV" onPress={onExportCsv} disabled={busy} />
          <View style={{ height: 8 }} />
          <PrimaryButton label="Import JSON backup" onPress={onImport} disabled={busy} />
          <View style={{ height: 8 }} />
          <PrimaryButton
            label={showPaste ? "Hide paste import" : "Paste JSON backup"}
            onPress={() => setShowPaste((v) => !v)}
          />
          {showPaste ? (
            <View style={{ marginTop: 8 }}>
              <TextInput
                style={[styles.input, styles.paste]}
                value={pasteValue}
                onChangeText={setPasteValue}
                placeholder='{ "version": 1, "state": { ... } }'
                placeholderTextColor={colors.muted}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
              />
              <PrimaryButton
                label="Restore from paste"
                onPress={() => void onPasteImport()}
                disabled={busy}
              />
            </View>
          ) : null}
          <View style={{ height: 8 }} />
          <PrimaryButton
            label="Reset all data"
            onPress={() =>
              Alert.alert("Reset?", "This clears local finance data.", [
                { text: "Cancel", style: "cancel" },
                { text: "Reset", style: "destructive", onPress: () => reset() },
              ])
            }
          />
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { color: colors.text, fontWeight: "700", marginBottom: spacing.sm },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: 8,
  },
  label: { color: colors.text, flex: 1, paddingRight: 12 },
  meta: { color: colors.muted, fontSize: 12, marginBottom: 4 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  progressBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  progressText: { color: colors.accent, fontSize: 12, flex: 1 },
  setupBanner: {
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  paste: { minHeight: 140, textAlignVertical: "top", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 11 },
});
