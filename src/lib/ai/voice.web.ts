/**
 * RN Web voice — browser Web Speech API (STT + TTS). No Sherpa/llama on Linux web.
 */

import { t } from "@/lib/i18n-t";

export type SttBackend = "native" | "webspeech" | "none";
export type TtsBackend = "native" | "webspeech" | "none";

export interface VoiceCapabilities {
  stt: SttBackend;
  tts: TtsBackend;
}

interface SpeechResultAlternative {
  transcript: string;
}
interface SpeechResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechResultAlternative;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { readonly length: number; [index: number]: SpeechResult };
}
interface SpeechRecognitionErrorEventLike {
  error?: string;
}
type AnySpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

interface SpeechCapableWindow {
  SpeechRecognition?: new () => AnySpeechRecognition;
  webkitSpeechRecognition?: new () => AnySpeechRecognition;
}

function getSpeechRecognitionCtor(): (new () => AnySpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as SpeechCapableWindow;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function detectVoiceCapabilities(_nativeCaps: {
  stt: boolean;
  tts: boolean;
}): VoiceCapabilities {
  const hasWebSpeech = !!getSpeechRecognitionCtor();
  const hasWebSynth = typeof window !== "undefined" && "speechSynthesis" in window;
  return {
    stt: hasWebSpeech ? "webspeech" : "none",
    tts: hasWebSynth ? "webspeech" : "none",
  };
}

export async function probeVoiceCapabilities(_cfg: {
  sttDir?: string;
  ttsDir?: string;
}): Promise<VoiceCapabilities> {
  return detectVoiceCapabilities({ stt: false, tts: false });
}

export function int16Base64ChunksToFloat32(_chunks: string[]): Float32Array {
  return new Float32Array(0);
}

export interface ListenHandlers {
  onPartial?: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
}

export class VoiceListener {
  private recognition: AnySpeechRecognition | null = null;
  private stopped = false;

  constructor(
    private backend: SttBackend,
    private locale: string,
    _sttModelDir?: string,
  ) {}

  async start(handlers: ListenHandlers): Promise<void> {
    this.stopped = false;
    if (this.backend !== "webspeech") {
      handlers.onError(
        t("assistant.voiceUnavailable", { defaultValue: "Voice input unavailable" }),
      );
      return;
    }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      handlers.onError(
        t("assistant.backend.voice.recognitionUnavailable", {
          defaultValue: "Speech recognition unavailable",
        }),
      );
      return;
    }
    const rec = new Ctor();
    rec.lang = this.locale || "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    let finalText = "";
    rec.onstart = () => handlers.onStart?.();
    rec.onresult = (e: SpeechRecognitionEventLike) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]!;
        if (res.isFinal) finalText += res[0]!.transcript;
        else interim += res[0]!.transcript;
      }
      if (interim) handlers.onPartial?.(interim);
    };
    rec.onerror = (e: SpeechRecognitionErrorEventLike) =>
      handlers.onError(
        e?.error
          ? String(e.error)
          : t("assistant.backend.voice.recognitionError", {
              defaultValue: "Recognition error",
            }),
      );
    rec.onend = () => {
      handlers.onEnd?.();
      const text = finalText.trim();
      if (text) handlers.onFinal(text);
      else if (!this.stopped) handlers.onError("no-speech");
    };
    this.recognition = rec;
    rec.start();
  }

  stop() {
    this.stopped = true;
    try {
      this.recognition?.stop();
    } catch {
      /* ignore */
    }
  }

  cancel() {
    this.stopped = true;
    try {
      this.recognition?.abort();
    } catch {
      /* ignore */
    }
    this.recognition = null;
  }
}

export async function speak(
  text: string,
  backend: TtsBackend,
  locale: string,
  _ttsModelDir?: string,
): Promise<void> {
  const clean = text.replace(/[•*_#`>]/g, "").trim();
  if (!clean || backend === "none") return;
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  return new Promise<void>((resolve) => {
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(clean);
      u.lang = locale || "en-US";
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
    } catch {
      resolve();
    }
  });
}

export async function stopSpeaking(_backend: TtsBackend) {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}
