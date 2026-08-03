import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ScrollView,
  Text,
  StyleSheet,
  TextInput,
  View,
  Pressable,
  ActivityIndicator,
  Switch,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Screen, Header, PrimaryButton, SecondaryButton, EmptyState } from "@/components/ui";
import { useStore, useMoney } from "@/lib/store";
import { runAssistant, getAiCapabilities } from "@/lib/ai/provider";
import { aiConfigFromSettings } from "@/lib/ai/config";
import { loadChatHistory, saveChatHistory, clearChatHistory } from "@/lib/ai/persistence";
import { proposalToCashflow } from "@/lib/ai/tools";
import {
  detectVoiceCapabilities,
  speak,
  stopSpeaking,
  VoiceListener,
  type VoiceCapabilities,
} from "@/lib/ai/voice";
import type { ChatMessage, EngineMessage } from "@/lib/ai/types";
import { colors, spacing } from "@/theme/colors";

export function AssistantScreen() {
  const { t, i18n } = useTranslation();
  const store = useStore();
  const { state, addCashflow, updateSettings } = store;
  const { toDisplay, currency } = useMoney();
  const [input, setInput] = useState("");
  const [partial, setPartial] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [caps, setCaps] = useState({ llm: false, stt: false, tts: false });
  const [voiceCaps, setVoiceCaps] = useState<VoiceCapabilities>({ stt: "none", tts: "none" });
  const listenerRef = useRef<VoiceListener | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const aiConfig = aiConfigFromSettings(state.settings);
  const ttsEnabled = state.settings.aiTtsEnabled !== false;

  useEffect(() => {
    void loadChatHistory().then(setMessages);
    void getAiCapabilities(aiConfig).then((c) => {
      setCaps(c);
      setVoiceCaps(detectVoiceCapabilities({ stt: c.stt, tts: c.tts }));
    });
  }, [state.settings.aiLlmModelPath, state.settings.aiSttModelDir, state.settings.aiTtsModelDir]);

  useEffect(() => {
    return () => {
      listenerRef.current?.cancel();
      void stopSpeaking(voiceCaps.tts);
    };
  }, [voiceCaps.tts]);

  const history: EngineMessage[] = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const maybeSpeak = useCallback(
    async (text: string) => {
      if (!ttsEnabled || voiceCaps.tts === "none") return;
      try {
        await speak(text, voiceCaps.tts, i18n.language, aiConfig.ttsDir);
      } catch {
        /* ignore playback errors */
      }
    },
    [ttsEnabled, voiceCaps.tts, i18n.language, aiConfig.ttsDir],
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
        );
        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: result.reply,
          id: String(Date.now() + 1),
          createdAt: Date.now(),
          pendingExpense: result.proposedExpense,
          toolTrace: result.toolTrace,
          error: result.error,
        };
        setMessages((m) => {
          const next = [...m, assistantMsg];
          void saveChatHistory(next);
          return next;
        });
        void maybeSpeak(result.reply);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
      } finally {
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
      listenerRef.current?.stop();
      return;
    }
    if (voiceCaps.stt === "none") {
      setPartial(
        t("assistant.sttUnavailable", {
          defaultValue: "Set an STT model folder in Settings to use voice input.",
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
        } else {
          setPartial(
            t("assistant.sttError", {
              defaultValue: "Couldn't capture audio. Check microphone permissions.",
            }) + (msg ? ` (${msg})` : ""),
          );
        }
      },
      onStart: () => setListening(true),
      onEnd: () => setListening(false),
    });
  }, [listening, voiceCaps, i18n.language, aiConfig.sttDir, sendText, t]);

  function confirmExpense(msg: ChatMessage) {
    if (!msg.pendingExpense) return;
    addCashflow(proposalToCashflow(msg.pendingExpense));
    setMessages((all) => {
      const next = all.map((m) =>
        m.id === msg.id ? { ...m, pendingExpense: undefined, content: m.content + " ✓" } : m,
      );
      void saveChatHistory(next);
      return next;
    });
  }

  function dismissExpense(msg: ChatMessage) {
    setMessages((all) => {
      const next = all.map((m) =>
        m.id === msg.id ? { ...m, pendingExpense: undefined } : m,
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
    <Screen>
      <Header
        title={t("nav.assistant", { defaultValue: "Assistant" })}
        subtitle={`LLM ${caps.llm ? "on" : "NLU"} · STT ${voiceCaps.stt} · TTS ${voiceCaps.tts}`}
      />
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
        <Text style={styles.banner}>
          {t("assistant.sttUnavailable", {
            defaultValue: "Voice input needs a Sherpa-ONNX STT model folder in Settings.",
          })}
        </Text>
      ) : voiceCaps.stt === "webspeech" ? (
        <Text style={styles.banner}>
          {t("assistant.sttWebspeech", {
            defaultValue: "Using browser Web Speech for voice (Linux / RN Web).",
          })}
        </Text>
      ) : null}
      <ScrollView ref={scrollRef} style={styles.chat}>
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
            <Text style={[styles.content, m.error && styles.errorText]}>{m.content}</Text>
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
            {m.pendingExpense ? (
              <View style={{ gap: 8, marginTop: 8 }}>
                <PrimaryButton
                  label={t("assistant.confirmAdd", { defaultValue: "Confirm expense" })}
                  onPress={() => confirmExpense(m)}
                />
                <SecondaryButton
                  label={t("assistant.cancel", { defaultValue: "Dismiss" })}
                  onPress={() => dismissExpense(m)}
                />
              </View>
            ) : null}
          </View>
        ))}
      </ScrollView>
      {partial ? <Text style={styles.partial}>{partial}</Text> : null}
      <View style={styles.composer}>
        <Pressable
          style={[styles.mic, listening && styles.micActive]}
          onPress={() => void toggleListen()}
          disabled={busy}
        >
          <Text style={[styles.micText, listening && styles.micTextOn]}>
            {listening
              ? t("assistant.stop", { defaultValue: "Stop" })
              : t("assistant.mic", { defaultValue: "Mic" })}
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
        <Pressable style={styles.send} onPress={send} disabled={busy || listening}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.sendText}>{t("assistant.sendBtn", { defaultValue: "Send" })}</Text>
          )}
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: { color: colors.text, fontSize: 12, fontWeight: "600" },
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
    marginBottom: 8,
  },
  ttsLabel: { color: colors.muted, fontSize: 13 },
  banner: {
    color: colors.muted,
    fontSize: 12,
    marginBottom: 8,
    lineHeight: 16,
  },
});
