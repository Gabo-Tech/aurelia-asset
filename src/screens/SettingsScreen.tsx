import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  ScrollView,
  Text,
  StyleSheet,
  Switch,
  View,
  Alert,
  TextInput,
  Platform,
  Pressable,
} from "react-native";
import { useTranslation } from "react-i18next";
import {
  Screen,
  ScreenStack,
  Header,
  Card,
  CardStack,
  CardCopy,
  CardTitle,
  CardHelperText,
  CardActions,
  PrimaryButton,
  SecondaryButton,
  DangerButton,
  Chip,
  SectionHeader,
  BusyOverlay,
  ProgressBar,
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
  downloadProgressRatio,
  totalDownloadSizeLabel,
  looksLikeSttDir,
  looksLikeTtsDir,
  describeSpeechModelDir,
  type ModelDownloadProgress,
  type ModelKind,
} from "@/lib/ai/downloads";
import { getAiCapabilities } from "@/lib/ai/provider";
import { aiConfigFromSettings } from "@/lib/ai/config";
import { bustCache } from "@/lib/finance/cache";
import { clearPriceHistoryCache } from "@/lib/finance";
import { CURRENCIES } from "@/lib/currency";
import { SUPPORTED_LANGUAGES } from "@/i18n";
import { rhythm, spacing } from "@/theme/colors";
import { useColors } from "@/theme/ThemeProvider";
import { PALETTE_CHIPS } from "@/theme/palettes";

const DEFAULT_CUSTOM = {
  primary: "#c5a880",
  accent: "#8fa98a",
  background: "#0a0a0b",
  card: "#141416",
} as const;

const ALLOWED_CORS_PROXIES = [
  "https://corsproxy.io/?",
  "https://api.allorigins.win/raw?url=",
] as const;

const isWeb = Platform.OS === "web";

export function SettingsScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t, i18n } = useTranslation();
  const { state, updateSettings, importState, reset } = useStore();
  const { privacy, toggle } = usePrivacy();
  const [busy, setBusy] = useState(false);
  const [busyTitle, setBusyTitle] = useState("Working…");
  const [busySubtitle, setBusySubtitle] = useState<string | undefined>();
  const [dlProgress, setDlProgress] = useState<ModelDownloadProgress | null>(null);
  const [dlStepLabel, setDlStepLabel] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<ModelKind | "all" | null>(null);
  const [finnhub, setFinnhub] = useState(state.settings.finnhubKey ?? "");
  const [displayName, setDisplayName] = useState(state.settings.displayName ?? "");
  const [pasteValue, setPasteValue] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [sttStatus, setSttStatus] = useState("…");
  const [ttsStatus, setTtsStatus] = useState("…");
  const [sherpaNote, setSherpaNote] = useState<string | null>(null);
  const [llmNote, setLlmNote] = useState<string | null>(null);
  /** Bumped on cancel so late download progress callbacks are ignored. */
  const downloadGenRef = useRef(0);

  function isDownloadCancelledMsg(msg: string): boolean {
    return /cancel/i.test(msg);
  }

  function clearDownloadUi() {
    setDownloading(null);
    setDlProgress(null);
    setDlStepLabel(null);
  }

  function cancelDownload() {
    downloadGenRef.current += 1;
    cancelActiveDownload();
    clearDownloadUi();
  }

  function applyDownloadProgress(gen: number, p: ModelDownloadProgress) {
    if (gen !== downloadGenRef.current) return;
    setDlProgress(p);
  }

  async function refreshVoiceStatus() {
    if (isWeb) return;
    const [stt, tts, caps] = await Promise.all([
      describeSpeechModelDir("stt", state.settings.aiSttModelDir),
      describeSpeechModelDir("tts", state.settings.aiTtsModelDir),
      getAiCapabilities(aiConfigFromSettings(state.settings)),
    ]);
    setSttStatus(stt.label);
    setTtsStatus(tts.label);
    setSherpaNote(caps.speechReason && !caps.stt && !caps.tts ? caps.speechReason : null);
    setLlmNote(caps.llmDetail || null);
  }

  useEffect(() => {
    void refreshVoiceStatus();
  }, [state.settings.aiSttModelDir, state.settings.aiTtsModelDir]);

  async function applyBackupText(text: string) {
    const parsed = parseBackupJson(text);
    await importState(parsed.state);
    if (parsed.language && SUPPORTED_LANGUAGES.some((l) => l.code === parsed.language)) {
      await i18n.changeLanguage(parsed.language);
    }
  }

  async function onExport() {
    setBusyTitle("Exporting backup…");
    setBusySubtitle("Building encrypted-compatible JSON");
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
      setBusySubtitle(undefined);
    }
  }

  async function onExportCsv() {
    setBusyTitle("Exporting CSV…");
    setBusySubtitle(undefined);
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
    setBusyTitle("Importing backup…");
    setBusySubtitle("Reading file and saving locally");
    setBusy(true);
    try {
      const text = await readImportFile();
      if (!text) return;
      setBusySubtitle("Decrypting write queue. Keep the app open.");
      await applyBackupText(text);
      Alert.alert("Import", t("settings.data.imported", { defaultValue: "Backup restored" }));
    } catch (e) {
      Alert.alert("Import failed", (e as Error).message);
    } finally {
      setBusy(false);
      setBusySubtitle(undefined);
    }
  }

  async function onPasteImport() {
    if (!pasteValue.trim()) {
      Alert.alert("Import", "Paste a backup JSON first");
      return;
    }
    setBusyTitle("Importing backup…");
    setBusySubtitle("Saving locally. Keep the app open.");
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
      setBusySubtitle(undefined);
    }
  }

  async function pickLlm() {
    const path = await pickModelFile();
    if (path) updateSettings({ aiLlmModelPath: path, aiModelSetup: "done" });
  }

  async function pickStt() {
    const path = await pickModelFile();
    if (!path) return;
    const dir = path.replace(/\/[^/]+$/, "");
    if (!(await looksLikeSttDir(dir))) {
      Alert.alert(
        "Invalid STT folder",
        "Prefer Download STT. A picked file only works if its parent folder already contains tokens.txt and the ONNX models.",
      );
      return;
    }
    updateSettings({ aiSttModelDir: dir, aiModelSetup: "done" });
    Alert.alert("STT ready", dir);
  }

  async function pickTts() {
    const path = await pickModelFile();
    if (!path) return;
    const dir = path.replace(/\/[^/]+$/, "");
    if (!(await looksLikeTtsDir(dir))) {
      Alert.alert(
        "Invalid TTS folder",
        "Prefer Download TTS. Parent folder needs tokens.txt, model.onnx, and espeak-ng-data.",
      );
      return;
    }
    updateSettings({ aiTtsModelDir: dir, aiModelSetup: "done" });
    Alert.alert("TTS path set", dir);
  }

  async function onDownload(kind: ModelKind) {
    const gen = ++downloadGenRef.current;
    setDownloading(kind);
    setDlStepLabel(null);
    setDlProgress({ kind, received: 0, phase: "downloading" });
    try {
      const path = await downloadModel(kind, (p: ModelDownloadProgress) => {
        applyDownloadProgress(gen, p);
      }, i18n.language);
      if (gen !== downloadGenRef.current) return;
      const entry = MODEL_MANIFEST.find((m) => m.kind === kind)!;
      updateSettings({ [entry.settingsKey]: path, aiModelSetup: "done" });
      if (kind === "stt" || kind === "tts") {
        const status = await describeSpeechModelDir(kind, path);
        Alert.alert(status.ok ? "Downloaded" : "Downloaded with issues", status.label);
      } else {
        Alert.alert("Downloaded", `${kind.toUpperCase()} ready`);
      }
      void refreshVoiceStatus();
    } catch (e) {
      if (gen !== downloadGenRef.current) return;
      const msg = (e as Error).message;
      if (!isDownloadCancelledMsg(msg)) Alert.alert("Download failed", msg);
    } finally {
      if (gen === downloadGenRef.current) clearDownloadUi();
    }
  }

  async function onDownloadAll() {
    const gen = ++downloadGenRef.current;
    setDownloading("all");
    const kinds = MODEL_MANIFEST.map((m) => m.kind);
    try {
      for (let i = 0; i < kinds.length; i++) {
        if (gen !== downloadGenRef.current) return;
        const kind = kinds[i]!;
        setDlStepLabel(`${kind.toUpperCase()} ${i + 1}/${kinds.length}`);
        setDlProgress({ kind, received: 0, phase: "downloading" });
        const path = await downloadModel(kind, (p) => applyDownloadProgress(gen, p), i18n.language);
        if (gen !== downloadGenRef.current) return;
        const entry = MODEL_MANIFEST.find((m) => m.kind === kind)!;
        updateSettings({ [entry.settingsKey]: path, aiModelSetup: "done" });
      }
      if (gen !== downloadGenRef.current) return;
      Alert.alert("Downloaded", `All models ready (${totalDownloadSizeLabel()})`);
      void refreshVoiceStatus();
    } catch (e) {
      if (gen !== downloadGenRef.current) return;
      const msg = (e as Error).message;
      if (!isDownloadCancelledMsg(msg)) Alert.alert("Download failed", msg);
    } finally {
      if (gen === downloadGenRef.current) clearDownloadUi();
    }
  }

  async function onDownloadSpeechOnly() {
    const gen = ++downloadGenRef.current;
    setDownloading("all");
    const kinds = ["stt", "tts"] as const;
    try {
      for (let i = 0; i < kinds.length; i++) {
        if (gen !== downloadGenRef.current) return;
        const kind = kinds[i]!;
        setDlStepLabel(`${kind.toUpperCase()} ${i + 1}/${kinds.length}`);
        setDlProgress({ kind, received: 0, phase: "downloading" });
        const path = await downloadModel(kind, (p) => applyDownloadProgress(gen, p), i18n.language);
        if (gen !== downloadGenRef.current) return;
        const entry = MODEL_MANIFEST.find((m) => m.kind === kind)!;
        updateSettings({ [entry.settingsKey]: path, aiModelSetup: "done" });
      }
      if (gen !== downloadGenRef.current) return;
      Alert.alert("Downloaded", "STT + TTS ready (~170 MB)");
      void refreshVoiceStatus();
    } catch (e) {
      if (gen !== downloadGenRef.current) return;
      const msg = (e as Error).message;
      if (!isDownloadCancelledMsg(msg)) Alert.alert("Download failed", msg);
    } finally {
      if (gen === downloadGenRef.current) clearDownloadUi();
    }
  }

  const overlayVisible = busy || !!downloading;
  const overlayTitle = busy
    ? busyTitle
    : dlStepLabel
      ? `Downloading ${dlStepLabel}`
      : downloading
        ? `Downloading ${String(downloading).toUpperCase()}…`
        : "Working…";
  const overlaySubtitle = busy
    ? busySubtitle
    : dlProgress
      ? formatDownloadProgress(dlProgress)
      : "Keep the app open until this finishes";
  const overlayProgress = busy ? undefined : downloadProgressRatio(dlProgress);

  return (
    <Screen avoidKeyboard={false}>
      <BusyOverlay
        visible={overlayVisible}
        title={overlayTitle}
        subtitle={overlaySubtitle}
        progress={overlayProgress}
        onCancel={downloading ? cancelDownload : undefined}
        cancelLabel="Cancel download"
      />
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
      >
        <Header title={t("nav.settings")} subtitle={t("settings.subtitle")} />
        <ScreenStack>

        <Card>
          <CardStack>
          <CardCopy>
            <CardTitle>Look & feel</CardTitle>
            <CardHelperText>Light or dark, and a color palette saved with your backup.</CardHelperText>
          </CardCopy>
          <View style={styles.wrap}>
            {(["light", "dark", "system"] as const).map((m) => {
              const on = (state.settings.appearance?.mode ?? "dark") === m;
              return (
                <Chip
                  key={m}
                  label={m}
                  active={on}
                  onPress={() =>
                    updateSettings({
                      appearance: { ...state.settings.appearance, mode: m },
                    })
                  }
                />
              );
            })}
          </View>
          <View style={styles.wrap}>
            {PALETTE_CHIPS.map((p) => {
              const on = (state.settings.appearance?.paletteId ?? "gold") === p.id;
              return (
                <Pressable
                  key={p.id}
                  onPress={() =>
                    updateSettings({
                      appearance: { ...state.settings.appearance, paletteId: p.id },
                    })
                  }
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: p.swatch,
                    borderWidth: on ? 2 : 1,
                    borderColor: on ? colors.accent : colors.border,
                  }}
                  accessibilityLabel={p.label}
                />
              );
            })}
            <Pressable
              onPress={() => {
                const custom = state.settings.appearance?.custom ?? { ...DEFAULT_CUSTOM };
                updateSettings({
                  appearance: {
                    ...state.settings.appearance,
                    paletteId: "custom",
                    custom,
                  },
                });
              }}
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor:
                  (state.settings.appearance?.custom ?? DEFAULT_CUSTOM).primary,
                borderWidth: state.settings.appearance?.paletteId === "custom" ? 2 : 1,
                borderColor:
                  state.settings.appearance?.paletteId === "custom"
                    ? colors.accent
                    : colors.border,
                alignItems: "center",
                justifyContent: "center",
              }}
              accessibilityLabel="Custom"
            >
              <Text style={{ color: colors.onAccent, fontSize: 10, fontWeight: "700" }}>
                Cust
              </Text>
            </Pressable>
          </View>
          {state.settings.appearance?.paletteId === "custom" ? (
            <View style={{ gap: rhythm.card }}>
              <CardHelperText>
                Custom colors — borders and text adapt automatically.
              </CardHelperText>
              {(
                [
                  ["primary", "Primary"],
                  ["accent", "Accent"],
                  ["background", "Background"],
                  ["card", "Cards"],
                ] as const
              ).map(([key, label]) => {
                const custom = state.settings.appearance?.custom ?? DEFAULT_CUSTOM;
                const value = custom[key] ?? DEFAULT_CUSTOM[key];
                return (
                  <View key={key}>
                    <CardHelperText>{label}</CardHelperText>
                    <TextInput
                      style={styles.input}
                      value={value}
                      onChangeText={(hex) =>
                        updateSettings({
                          appearance: {
                            ...state.settings.appearance,
                            paletteId: "custom",
                            custom: { ...custom, [key]: hex },
                          },
                        })
                      }
                      placeholder={DEFAULT_CUSTOM[key]}
                      placeholderTextColor={colors.muted}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                );
              })}
            </View>
          ) : null}
          </CardStack>
        </Card>

        <Card>
          <CardStack>
            <CardCopy>
              <CardTitle>{t("settings.about.title")}</CardTitle>
              <CardHelperText>{t("settings.about.body")}</CardHelperText>
            </CardCopy>
            <CardActions>
              <SecondaryButton
                fullWidth
                label={t("nav.moreDesc.tourTitle")}
                onPress={() => updateSettings({ onboardingSeen: false })}
              />
            </CardActions>
          </CardStack>
        </Card>

        <Card>
          <CardStack>
          <CardCopy>
            <CardTitle>Profile</CardTitle>
            <CardHelperText>Name for the dashboard greeting</CardHelperText>
          </CardCopy>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="e.g. Gabriel"
            placeholderTextColor={colors.muted}
            autoCapitalize="words"
            autoCorrect={false}
          />
          <CardActions>
          <PrimaryButton
            fullWidth
            label="Save name"
            onPress={() => {
              const trimmed = displayName.trim();
              updateSettings({ displayName: trimmed || undefined });
              setDisplayName(trimmed);
              Alert.alert("Profile", trimmed ? `Greeting will say Hi ${trimmed}` : "Name cleared");
            }}
          />
          </CardActions>
          </CardStack>
        </Card>

        <Card>
          <CardStack>
          <CardTitle>Privacy</CardTitle>
          <View style={styles.row}>
            <Text style={styles.label}>Privacy mode</Text>
            <Switch value={privacy} onValueChange={toggle} />
          </View>
          <CardHelperText>{t("settings.api.privacyModeHelp")}</CardHelperText>
          </CardStack>
        </Card>

        <Card>
          <CardStack>
          <CardTitle>{t("settings.api.title", { defaultValue: "Market data" })}</CardTitle>
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
              <CardHelperText>
                {t("settings.api.corsProxyUrl", { defaultValue: "CORS proxy URL" })}
              </CardHelperText>
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
          <CardHelperText>Finnhub API key (optional)</CardHelperText>
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
          <CardActions>
          <PrimaryButton
            fullWidth
            label="Save Finnhub key"
            onPress={() =>
              updateSettings({ finnhubKey: finnhub.trim() || undefined })
            }
          />
          <PrimaryButton
            fullWidth
            label="Clear price cache"
            onPress={() => {
              bustCache("");
              clearPriceHistoryCache();
              Alert.alert("Cache", "Price cache cleared");
            }}
          />
          </CardActions>
          </CardStack>
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
          <CardStack>
          <CardTitle>Local AI models</CardTitle>
          {!isWeb && state.settings.aiModelSetup === "pending" ? (
            <View style={styles.setupBanner}>
              <CardHelperText>
                Optional: download on-device LLM + speech models (~1.2 GB). For mic and speak
                replies, download STT + TTS (~170 MB). NLU works without models.
              </CardHelperText>
              <PrimaryButton
                fullWidth
                label="Download STT + TTS (~170 MB)"
                onPress={() => void onDownloadSpeechOnly()}
                disabled={!!downloading}
              />
              <PrimaryButton
                fullWidth
                label={`Download all (${totalDownloadSizeLabel()})`}
                onPress={() => void onDownloadAll()}
                disabled={!!downloading}
              />
              <SecondaryButton
                fullWidth
                label="Skip for now"
                onPress={() => updateSettings({ aiModelSetup: "declined" })}
              />
            </View>
          ) : null}
          {isWeb ? (
            <CardHelperText>
              On Linux (RN Web), the assistant uses on-device NLU only. Download LLM/STT/TTS on
              Android, iOS, Windows, or macOS.
            </CardHelperText>
          ) : (
            <>
              {!state.settings.aiSttModelDir || !state.settings.aiTtsModelDir ? (
                <CardHelperText>
                  Download STT + TTS (~170 MB) to enable mic and speak replies on this device.
                </CardHelperText>
              ) : null}
              {sherpaNote ? (
                <CardHelperText style={{ color: colors.danger }}>{sherpaNote}</CardHelperText>
              ) : null}
              <CardHelperText>LLM: {state.settings.aiLlmModelPath || "not set"}</CardHelperText>
              {llmNote ? <CardHelperText>LLM runtime: {llmNote}</CardHelperText> : null}
              <CardHelperText>STT: {sttStatus}</CardHelperText>
              <CardHelperText>TTS: {ttsStatus}</CardHelperText>
              {!i18n.language.startsWith("en") &&
              ((state.settings.aiSttModelDir || "").includes(".en") ||
                (state.settings.aiTtsModelDir || "").includes("en_US")) ? (
                <CardHelperText style={{ color: colors.danger }}>
                  Installed speech models are English-only but UI language is {i18n.language}.
                </CardHelperText>
              ) : null}
              {dlProgress ? (
                <View style={styles.progressBox}>
                  <ProgressBar progress={downloadProgressRatio(dlProgress)} />
                  {dlStepLabel ? <Text style={styles.progressText}>{dlStepLabel}</Text> : null}
                  <Text style={styles.progressText}>{formatDownloadProgress(dlProgress)}</Text>
                </View>
              ) : null}
              {downloading ? (
                <SecondaryButton
                  fullWidth
                  label="Cancel download"
                  destructive
                  onPress={cancelDownload}
                />
              ) : null}
              <CardActions>
              <PrimaryButton
                fullWidth
                label={
                  downloading === "all"
                    ? "Downloading…"
                    : "Download STT + TTS (~170 MB)"
                }
                onPress={() => void onDownloadSpeechOnly()}
                disabled={!!downloading}
              />
              <PrimaryButton
                fullWidth
                label={
                  downloading === "all"
                    ? "Downloading…"
                    : `Download all (${totalDownloadSizeLabel()})`
                }
                onPress={onDownloadAll}
                disabled={!!downloading}
              />
              {MODEL_MANIFEST.map((m) => (
                <View key={m.kind} style={styles.modelActions}>
                  <PrimaryButton
                    fullWidth
                    compact
                    label={
                      downloading === m.kind
                        ? `Downloading ${m.kind}…`
                        : `Download ${m.kind.toUpperCase()} (${m.sizeLabel})`
                    }
                    onPress={() => void onDownload(m.kind)}
                    disabled={!!downloading}
                  />
                  <SecondaryButton
                    fullWidth
                    compact
                    label={`Clear ${m.kind.toUpperCase()} path`}
                    onPress={() => {
                      void clearInstalledModel(m.kind).catch(() => undefined);
                      updateSettings({ [m.settingsKey]: undefined });
                    }}
                  />
                </View>
              ))}
              </CardActions>
              <CardHelperText>
                Prefer Download for STT/TTS (full folders). Pick is for advanced setups only.
              </CardHelperText>
              <CardActions>
              <PrimaryButton fullWidth label="Pick LLM (GGUF)" onPress={pickLlm} />
              <SecondaryButton fullWidth label="Pick STT folder via file…" onPress={pickStt} />
              <SecondaryButton fullWidth label="Pick TTS folder via file…" onPress={pickTts} />
              </CardActions>
            </>
          )}
          <View style={styles.row}>
            <Text style={styles.label}>Assistant enabled</Text>
            <Switch
              value={state.settings.aiAssistantEnabled !== false}
              onValueChange={(v) => updateSettings({ aiAssistantEnabled: v })}
            />
          </View>
          </CardStack>
        </Card>

        <Card>
          <CardStack>
          <CardCopy>
            <CardTitle>Data</CardTitle>
            <CardHelperText>
              JSON backups use the web-compatible envelope so browser exports restore correctly.
            </CardHelperText>
          </CardCopy>
          <CardActions>
          <PrimaryButton
            fullWidth
            label={busy ? "Working…" : "Export JSON backup"}
            onPress={onExport}
            disabled={busy || !!downloading}
          />
          <PrimaryButton
            fullWidth
            label="Export cashflow CSV"
            onPress={onExportCsv}
            disabled={busy || !!downloading}
          />
          <PrimaryButton
            fullWidth
            label={busy ? "Working…" : "Import JSON backup"}
            onPress={onImport}
            disabled={busy || !!downloading}
          />
          <PrimaryButton
            fullWidth
            label={showPaste ? "Hide paste import" : "Paste JSON backup"}
            onPress={() => setShowPaste((v) => !v)}
            disabled={busy || !!downloading}
          />
          </CardActions>
          {showPaste ? (
            <View style={{ gap: rhythm.card }}>
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
                disabled={busy || !!downloading}
              />
            </View>
          ) : null}
          <DangerButton
            fullWidth
            label="Reset all data"
            onPress={() =>
              Alert.alert("Reset?", "This clears local finance data.", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Reset",
                  style: "destructive",
                  onPress: () => {
                    setBusyTitle("Resetting…");
                    setBusySubtitle("Clearing and saving empty state");
                    setBusy(true);
                    void reset()
                      .then(() => Alert.alert("Reset", "Local data cleared"))
                      .catch((e) => Alert.alert("Reset failed", (e as Error).message))
                      .finally(() => {
                        setBusy(false);
                        setBusySubtitle(undefined);
                      });
                  },
                },
              ])
            }
            disabled={busy || !!downloading}
          />
          </CardStack>
        </Card>
        </ScreenStack>
      </ScrollView>
    </Screen>
  );
}

function createStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  label: { color: colors.text, flex: 1, paddingRight: 12 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  modelActions: { gap: spacing.sm },
  progressBox: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: rhythm.tight,
  },
  progressText: { color: colors.accent, fontSize: 12 },
  setupBanner: {
    gap: rhythm.card,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
  },
  paste: { minHeight: 140, textAlignVertical: "top", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 11 },
});
}
