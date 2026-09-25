import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ScrollView,
  Text,
  StyleSheet,
  TextInput,
  View,
  Pressable,
  Switch,
} from "react-native";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import { useTranslation } from "react-i18next";
import { Screen, ScreenStack, Header, PrimaryButton, SecondaryButton, EmptyState, CardHelperText, chipLabelStyle, chipContainerStyle } from "@/components/ui";
import { useStore, useMoney } from "@/lib/store";
import { runAssistant, getAiCapabilities } from "@/lib/ai/provider";
import { aiConfigFromSettings } from "@/lib/ai/config";
import { warmLlm } from "@/platform/llm";
import { loadChatHistory, saveChatHistory, clearChatHistory } from "@/lib/ai/persistence";
import { applyProposedChange } from "@/lib/ai/tools";
import {
  detectVoiceCapabilities,
  speak,
  stopSpeaking,
  VoiceListener,
  type VoiceCapabilities,
} from "@/lib/ai/voice";
import type { ChatMessage, EngineMessage } from "@/lib/ai/types";
import { spacing } from "@/theme/colors";
import { useColors } from "@/theme/ThemeProvider";
import Markdown from "react-native-markdown-display";

function createMdStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    body: { color: colors.text, fontSize: 14, lineHeight: 20 },
    paragraph: { marginTop: 0, marginBottom: 6 },
    bullet_list: { marginBottom: 6 },
    ordered_list: { marginBottom: 6 },
    list_item: { marginBottom: 2 },
    strong: { color: colors.text, fontWeight: "700" },
    em: { color: colors.text },
    code_inline: {
      backgroundColor: colors.surfaceAlt,
      color: colors.accent,
      paddingHorizontal: 4,
      borderRadius: 4,
      fontSize: 13,
    },
    fence: {
      backgroundColor: colors.surfaceAlt,
      color: colors.text,
      padding: 8,
      borderRadius: 8,
      fontSize: 12,
    },
    link: { color: colors.accent },
    heading1: { color: colors.text, fontSize: 18, fontWeight: "700", marginBottom: 6 },
    heading2: { color: colors.text, fontSize: 16, fontWeight: "700", marginBottom: 4 },
    heading3: { color: colors.text, fontSize: 15, fontWeight: "700", marginBottom: 4 },
  });
}

export function AssistantScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const mdStyles = useMemo(() => createMdStyles(colors), [colors]);
  const { t, i18n } = useTranslation();
  const store = useStore();
  const { state, addCashflow, updateSettings } = store;
  const { toDisplay, currency } = useMoney();
  const [input, setInput] = useState("");
  const [partial, setPartial] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingModel, setLoadingModel] = useState(false);
  const [listening, setListening] = useState(false);
  const [caps, setCaps] = useState({
    llm: false,
    stt: false,
    tts: false,
    speechReason: undefined as string | undefined,
    sttDetail: undefined as string | undefined,
    ttsDetail: undefined as string | undefined,
  });
  const [voiceCaps, setVoiceCaps] = useState<VoiceCapabilities>({ stt: "none", tts: "none" });
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const listenerRef = useRef<VoiceListener | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const runAbortRef = useRef<AbortController | null>(null);
  const { keyboardHeight: keyboardPad } = useKeyboardInset();

  const aiConfig = aiConfigFromSettings(state.settings);
  const ttsEnabled = state.settings.aiTtsEnabled !== false;

  useEffect(() => {
    void loadChatHistory().then(setMessages);
    void getAiCapabilities(aiConfig).then((c) => {
      setCaps({
        llm: c.llm,
        stt: c.stt,
        tts: c.tts,
        speechReason: c.speechReason,
        sttDetail: c.sttDetail,
        ttsDetail: c.ttsDetail,
      });
      setVoiceCaps(detectVoiceCapabilities({ stt: c.stt, tts: c.tts }));
      setVoiceError(null);
    });
  }, [state.settings.aiLlmModelPath, state.settings.aiSttModelDir, state.settings.aiTtsModelDir]);

  useEffect(() => {
    if (!aiConfig.llmPath) {
      setLoadingModel(false);
      return;
    }
    let cancelled = false;
    setLoadingModel(true);
    void warmLlm(aiConfig)
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoadingModel(false);
      });
    return () => {
      cancelled = true;
    };
  }, [aiConfig.llmPath]);

  useEffect(() => {
    return () => {
      listenerRef.current?.cancel();
      void stopSpeaking(voiceCaps.tts);
    };
  }, [voiceCaps.tts]);

  const history: EngineMessage[] = useMemo(
    () =>
      messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
        .slice(-10),
    [messages],
  );

  const maybeSpeak = useCallback(
    async (text: string) => {
      if (!ttsEnabled || voiceCaps.tts === "none") return;
      try {
        await speak(text, voiceCaps.tts, i18n.language, aiConfig.ttsDir);
        setVoiceError(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setVoiceError(
          t("assistant.ttsError", {
            defaultValue: "TTS failed. Re-download TTS in Settings if espeak-ng-data is missing.",
          }) + (msg ? ` (${msg})` : ""),
        );
      }
    },
    [ttsEnabled, voiceCaps.tts, i18n.language, aiConfig.ttsDir, t],
  );

  const sendText = useCallback(
    async (textRaw: string) => {
      const text = textRaw.trim();
      if (!text || busy) return;
      setInput("");
      setPartial("");
      const userMsg: ChatMessage = {
        role: "user",
        content: text,
        id: String(Date.now()),
        createdAt: Date.now(),
      };
      setMessages((m) => [...m, userMsg]);
      setBusy(true);
      try {
        if (aiConfig.llmPath) {
          await warmLlm(aiConfig);
        }
        runAbortRef.current = new AbortController();
        const result = await runAssistant(
          text,
          {
            state,
            toDisplay,
            currency,
            locale: i18n.language,
            adviceDisclaimerSeen: !!state.settings.aiAdviceDisclaimerSeen,
            markAdviceDisclaimerSeen: () => updateSettings({ aiAdviceDisclaimerSeen: true }),
          },
          history,
          aiConfig,
          runAbortRef.current.signal,
        );
        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: result.reply,
          id: String(Date.now() + 1),
          createdAt: Date.now(),
          pendingChange: result.proposedChange,
          toolTrace: result.toolTrace,
          error: result.error,
        };
        setMessages((m) => {
          const next = [...m, assistantMsg];
          void saveChatHistory(next);
          return next;
        });
        if (result.degradedReason) {
          setVoiceError(`Local model unavailable (${result.degradedReason}); using built-in mode.`);
        }
        void maybeSpeak(result.reply);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
      } finally {
        runAbortRef.current = null;
        setBusy(false);
      }
    },
    [
      busy,
      state,
      toDisplay,
      currency,
      i18n.language,
      history,
      aiConfig,
      updateSettings,
      maybeSpeak,
    ],
  );

  const send = useCallback(() => void sendText(input), [sendText, input]);

  const toggleListen = useCallback(async () => {
    if (listening) {
      setListening(false);
      setPartial(t("assistant.transcribing", { defaultValue: "Transcribing…" }));
      listenerRef.current?.stop();
      return;
    }
    if (voiceCaps.stt === "none") {
      setPartial(
        caps.sttDetail ||
          caps.speechReason ||
          t("assistant.sttUnavailable", {
            defaultValue: "Download STT in Settings to use voice input.",
          }),
      );
      return;
    }
    void stopSpeaking(voiceCaps.tts);
    const listener = new VoiceListener(voiceCaps.stt, i18n.language, aiConfig.sttDir);
    listenerRef.current = listener;
    setListening(true);
    setPartial("Listening…");
    await listener.start({
      onPartial: (p) => setPartial(p),
      onFinal: (text) => {
        setListening(false);
        setPartial("");
        void sendText(text);
      },
      onError: (msg) => {
        setListening(false);
        if (msg === "no-speech") {
          setPartial(
            t("assistant.noSpeech", {
              defaultValue: "No speech detected. Tap the mic and try again.",
            }),
          );
        } else if (msg === "session-timeout") {
          setPartial(
            t("assistant.sessionTimeout", {
              defaultValue: "Voice input timed out. Tap the mic and try again.",
            }),
          );
          setVoiceError(
            t("assistant.sessionTimeout", {
              defaultValue: "Voice input timed out. Tap the mic and try again.",
            }),
          );
        } else {
          const detail = msg || caps.sttDetail || "";
          setPartial(
            t("assistant.sttError", {
              defaultValue: "Couldn't capture audio. Check microphone permissions.",
            }) + (detail ? ` (${detail})` : ""),
          );
          if (msg && !msg.includes("permission")) {
            setVoiceError(detail || msg);
          }
        }
      },
      onStart: () => setListening(true),
      onEnd: () => setListening(false),
    });
  }, [listening, voiceCaps, i18n.language, aiConfig.sttDir, sendText, t, caps.sttDetail, caps.speechReason]);

  function confirmChange(msg: ChatMessage) {
    if (!msg.pendingChange) return;
    applyProposedChange(msg.pendingChange, {
      addCashflow,
      updateCashflow: store.updateCashflow,
      removeCashflow: store.removeCashflow,
      addBudgetPlan: store.addBudgetPlan,
      addBudgetItem: store.addBudgetItem,
      updateBudgetItem: store.updateBudgetItem,
      addGoal: store.addGoal,
      updateGoal: store.updateGoal,
      addLoan: store.addLoan,
      addHolding: store.addHolding,
      updateHolding: store.updateHolding,
      addCategory: store.addCategory,
    });
    setMessages((all) => {
      const next = all.map((m) =>
        m.id === msg.id ? { ...m, pendingChange: undefined, content: m.content + " ✓" } : m,
      );
      void saveChatHistory(next);
      return next;
    });
  }

  function dismissChange(msg: ChatMessage) {
    setMessages((all) => {
      const next = all.map((m) =>
        m.id === msg.id ? { ...m, pendingChange: undefined } : m,
      );
      void saveChatHistory(next);
      return next;
    });
  }

  async function clearChat() {
    await clearChatHistory();
    setMessages([]);
  }

  const chips = [
    t("assistant.chipSpend", { defaultValue: "I spent 12 on food" }),
    t("assistant.chipBalance", { defaultValue: "What's my net worth?" }),
    t("assistant.chipBudget", { defaultValue: "How am I doing on spending?" }),
  ];

  return (
    <Screen avoidKeyboard={false}>
      <Header
        title={t("nav.assistant", { defaultValue: "Assistant" })}
        subtitle={t("assistant.subtitle")}
      />
      <ScreenStack style={styles.flex}>
      <View style={styles.ttsRow}>
        <Text style={styles.ttsLabel}>
          {t("assistant.speakReplies", { defaultValue: "Speak replies (TTS)" })}
        </Text>
        <Switch
          value={ttsEnabled}
          onValueChange={(v) => updateSettings({ aiTtsEnabled: v })}
          disabled={voiceCaps.tts === "none"}
        />
      </View>
      {messages.length > 0 ? (
        <SecondaryButton
          label={t("assistant.clear", { defaultValue: "Clear chat" })}
          onPress={() => void clearChat()}
        />
      ) : null}
      {voiceCaps.stt === "none" ? (
        <CardHelperText>
          {caps.speechReason ||
            caps.sttDetail ||
            t("assistant.sttUnavailable", {
              defaultValue: "Download STT in Settings to use voice input.",
            })}
        </CardHelperText>
      ) : voiceCaps.stt === "webspeech" ? (
        <CardHelperText>
          {t("assistant.sttWebspeech", {
            defaultValue: "Using browser Web Speech for voice (Linux / RN Web).",
          })}
        </CardHelperText>
      ) : null}
      {voiceCaps.tts === "none" && ttsEnabled ? (
        <CardHelperText>
          {caps.ttsDetail ||
            t("assistant.ttsUnavailable", {
              defaultValue: "Download TTS in Settings to speak replies.",
            })}
        </CardHelperText>
      ) : null}
      {voiceError ? <CardHelperText style={{ color: colors.danger }}>{voiceError}</CardHelperText> : null}
      <ScrollView
        ref={scrollRef}
        style={styles.chat}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
      >
        {messages.length === 0 ? (
          <EmptyState
            title={t("assistant.emptyTitle", { defaultValue: "Ask anything about your finances" })}
            body={t("assistant.emptyBody", {
              defaultValue: "Log expenses in plain language, or ask about cashflow and holdings.",
            })}
          />
        ) : null}
        {messages.length === 0 ? (
          <View style={styles.chips}>
            {chips.map((c) => (
              <Pressable key={c} style={styles.chip} onPress={() => void sendText(c)} disabled={busy}>
                <Text style={styles.chipText}>{c}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {messages.map((m) => (
          <View
            key={m.id}
            style={[
              styles.bubble,
              m.role === "user" ? styles.bubbleUser : styles.bubbleAssistant,
            ]}
          >
            {m.role === "assistant" && !m.error ? (
              <Markdown style={mdStyles}>{m.content}</Markdown>
            ) : (
              <Text style={[styles.content, m.error && styles.errorText]}>{m.content}</Text>
            )}
            {m.error ? (
              <SecondaryButton
                label={t("assistant.retry", { defaultValue: "Retry" })}
                onPress={() => {
                  const prev = [...messages];
                  const idx = prev.findIndex((x) => x.id === m.id);
                  const user = idx > 0 ? prev[idx - 1] : null;
                  if (user?.role === "user") {
                    setMessages((all) => all.filter((x) => x.id !== m.id));
                    void sendText(user.content);
                  }
                }}
              />
            ) : null}
            {m.pendingChange ? (
              <View style={{ gap: 8, marginTop: 8 }}>
                {m.pendingChange.preview.slice(0, 6).map((row) => (
                  <Text key={`${m.id}-${row.label}-${row.after}`} style={styles.previewRow}>
                    {row.label}: {row.before ? `${row.before} -> ` : ""}
                    {row.after}
                  </Text>
                ))}
                <PrimaryButton
                  label={t("assistant.confirmAdd", { defaultValue: "Confirm change" })}
                  onPress={() => confirmChange(m)}
                />
                <SecondaryButton
                  label={t("assistant.cancel", { defaultValue: "Dismiss" })}
                  onPress={() => dismissChange(m)}
                />
              </View>
            ) : null}
          </View>
        ))}
      </ScrollView>
      {partial ? <Text style={styles.partial}>{partial}</Text> : null}
      <View style={[styles.composer, keyboardPad > 0 && { marginBottom: keyboardPad }]}>
        <Pressable
          style={[styles.mic, listening && styles.micActive]}
          onPress={() => void toggleListen()}
          disabled={busy}
        >
          <Text style={[styles.micText, listening && styles.micTextOn]}>
            {listening
              ? t("assistant.stop", { defaultValue: "Stop" })
              : t("assistant.mic", { defaultValue: "Voice" })}
          </Text>
        </Pressable>
        <TextInput
          style={styles.input}
          placeholder={t("assistant.placeholder", { defaultValue: "Ask or log an expense…" })}
          placeholderTextColor={colors.muted}
          value={input}
          onChangeText={setInput}
          editable={!busy && !listening}
        />
        <Pressable
          style={styles.send}
          onPress={busy ? () => runAbortRef.current?.abort() : send}
          disabled={listening}
        >
          {busy ? (
            <Text style={styles.sendText}>{t("assistant.stop", { defaultValue: "Stop" })}</Text>
          ) : (
            <Text style={styles.sendText}>{t("assistant.sendBtn", { defaultValue: "Send" })}</Text>
          )}
        </Pressable>
      </View>
      </ScreenStack>
    </Screen>
  );
}

function createStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
  flex: { flex: 1 },
  chat: { flex: 1 },
  bubble: {
    maxWidth: "88%",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    marginBottom: 10,
  },
  bubbleUser: {
    alignSelf: "flex-end",
    backgroundColor: colors.accentSoft,
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderBottomLeftRadius: 4,
  },
  content: { color: colors.text, fontSize: 15, lineHeight: 22 },
  errorText: { color: colors.danger },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    ...chipContainerStyle,
    borderRadius: 16,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipText: { ...chipLabelStyle, color: colors.text },
  composer: { flexDirection: "row", gap: 8, paddingTop: spacing.sm, alignItems: "center" },
  input: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  send: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: 16,
    justifyContent: "center",
    minHeight: 44,
  },
  sendText: { color: colors.onAccent, fontWeight: "600" },
  previewRow: { color: colors.muted, fontSize: 12, lineHeight: 16 },
  mic: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  micActive: { backgroundColor: colors.danger },
  micText: { fontSize: 11, fontWeight: "700", color: colors.onAccent },
  micTextOn: { color: "#fff" },
  partial: { color: colors.accent, fontSize: 12, marginTop: 4 },
  ttsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  ttsLabel: { color: colors.muted, fontSize: 13 },
});
}
