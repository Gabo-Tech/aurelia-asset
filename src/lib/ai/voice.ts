/**
 * On-device speech: Speech-to-Text (STT) and Text-to-Speech (TTS).
 *
 * Two backends behind one interface:
 *  - Native (Tauri): Sherpa-ONNX for STT/TTS via Rust commands. Captures mic
 *    audio with MediaRecorder, sends PCM/WebM to `stt_transcribe`, and plays TTS
 *    produced by `tts_speak`. Preferred on desktop/mobile builds.
 *  - Web fallback: the browser's Web Speech API (SpeechRecognition +
 *    speechSynthesis). Used on the web build and wherever native isn't ready.
 *
 * All processing stays on the device; nothing is sent to a server.
 */

import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@/lib/export";
import { t } from "@/lib/i18n-t";

export type SttBackend = "native" | "webspeech" | "none";
export type TtsBackend = "native" | "webspeech" | "none";

export interface VoiceCapabilities {
  stt: SttBackend;
  tts: TtsBackend;
}

// The Web Speech API is not in the standard lib DOM types across all targets,
// so we declare the minimal shapes we rely on.
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
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

function getSpeechRecognitionCtor(): (new () => AnySpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as SpeechCapableWindow;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/** Detect which speech backends are available. `nativeCaps` comes from the AI
 *  status command so we don't probe Rust twice. */
export function detectVoiceCapabilities(nativeCaps: {
  stt: boolean;
  tts: boolean;
}): VoiceCapabilities {
  const native = isTauri();
  const hasWebSpeech = !!getSpeechRecognitionCtor();
  const hasWebSynth = typeof window !== "undefined" && "speechSynthesis" in window;
  return {
    stt: native && nativeCaps.stt ? "native" : hasWebSpeech ? "webspeech" : "none",
    tts: native && nativeCaps.tts ? "native" : hasWebSynth ? "webspeech" : "none",
  };
}

export interface ListenHandlers {
  onPartial?: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
}

/**
 * Controls a single microphone session. Auto-stops on silence when the backend
 * supports it (Web Speech API does; the native recorder uses a silence timer).
 */
export class VoiceListener {
  private recognition: AnySpeechRecognition | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private silenceTimer: number | null = null;
  private stopped = false;

  constructor(
    private backend: SttBackend,
    private locale: string,
    /** Folder with the Sherpa-ONNX STT model (native backend only). */
    private sttModelDir?: string,
  ) {}

  async start(handlers: ListenHandlers): Promise<void> {
    this.stopped = false;
    if (this.backend === "webspeech") return this.startWebSpeech(handlers);
    if (this.backend === "native") return this.startNative(handlers);
    handlers.onError(t("assistant.voiceUnavailable"));
  }

  private startWebSpeech(handlers: ListenHandlers) {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return handlers.onError(t("assistant.backend.voice.recognitionUnavailable"));
    const rec = new Ctor();
    rec.lang = this.locale || "en-US";
    rec.continuous = false; // auto-stops on silence
    rec.interimResults = true;
    let finalText = "";
    rec.onstart = () => handlers.onStart?.();
    rec.onresult = (e: SpeechRecognitionEventLike) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interim += res[0].transcript;
      }
      if (interim) handlers.onPartial?.(interim);
    };
    rec.onerror = (e: SpeechRecognitionErrorEventLike) =>
      handlers.onError(e?.error ? String(e.error) : t("assistant.backend.voice.recognitionError"));
    rec.onend = () => {
      handlers.onEnd?.();
      const text = finalText.trim();
      if (text) handlers.onFinal(text);
      else if (!this.stopped) handlers.onError("no-speech");
    };
    this.recognition = rec;
    rec.start();
  }

  private async startNative(handlers: ListenHandlers) {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(this.stream);
      this.chunks = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data);
      };
      rec.onstart = () => handlers.onStart?.();
      rec.onstop = async () => {
        this.teardownStream();
        handlers.onEnd?.();
        try {
          const blob = new Blob(this.chunks, { type: "audio/webm" });
          // Decode + resample to 16 kHz mono PCM here so Rust never touches
          // audio codecs (Sherpa-ONNX consumes raw f32 samples).
          const { base64, sampleRate } = await blobToPcm16kBase64(blob);
          const text = await invoke<string>("stt_transcribe", {
            req: {
              pcm_base64: base64,
              sample_rate: sampleRate,
              model_dir: this.sttModelDir,
            },
          });
          const clean = (text || "").trim();
          if (clean) handlers.onFinal(clean);
          else handlers.onError("no-speech");
        } catch (err) {
          handlers.onError(err instanceof Error ? err.message : t("assistant.backend.voice.transcriptionFailed"));
        }
      };
      this.mediaRecorder = rec;
      rec.start();
      this.armSilenceDetection();
    } catch {
      handlers.onError(t("assistant.backend.voice.micDenied"));
    }
  }

  /** Rough silence auto-stop for the native recorder using an analyser node. */
  private armSilenceDetection() {
    if (!this.stream) return;
    try {
      const w = window as unknown as SpeechCapableWindow;
      const AC = w.AudioContext || w.webkitAudioContext;
      if (!AC) return;
      const audioCtx: AudioContext = new AC();
      const source = audioCtx.createMediaStreamSource(this.stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const SILENCE = 6; // amplitude threshold above baseline
      const HANG_MS = 1500; // stop after this much continuous silence
      let lastVoice = Date.now();
      const tick = () => {
        if (this.stopped || !this.mediaRecorder) return;
        analyser.getByteFrequencyData(data);
        const level = data.reduce((s, v) => s + Math.abs(v - 128), 0) / data.length;
        if (level > SILENCE) lastVoice = Date.now();
        if (Date.now() - lastVoice > HANG_MS) {
          void audioCtx.close();
          this.stop();
          return;
        }
        this.silenceTimer = requestAnimationFrame(tick) as unknown as number;
      };
      this.silenceTimer = requestAnimationFrame(tick) as unknown as number;
    } catch {
      // Silence detection is best-effort; manual stop still works.
    }
  }

  /** Stop listening. Triggers final transcription for the native backend. */
  stop() {
    this.stopped = true;
    if (this.silenceTimer != null) {
      cancelAnimationFrame(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // Already stopped.
      }
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      try {
        this.mediaRecorder.stop();
      } catch {
        // Already stopped.
      }
    }
  }

  /** Abort without emitting a final result. */
  cancel() {
    this.stopped = true;
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {
        // Already aborted.
      }
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      try {
        this.mediaRecorder.stop();
      } catch {
        // Already stopped.
      }
    }
    this.teardownStream();
  }

  private teardownStream() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToFloat32(b64: string): Float32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4));
}

/** Decode a recorded audio blob and resample it to 16 kHz mono PCM (f32),
 *  returned as base64 of little-endian bytes. */
async function blobToPcm16kBase64(blob: Blob): Promise<{ base64: string; sampleRate: number }> {
  const target = 16000;
  const w = window as unknown as SpeechCapableWindow;
  const AC = w.AudioContext || w.webkitAudioContext;
  if (!AC) throw new Error("AudioContext unavailable");
  const arrayBuf = await blob.arrayBuffer();
  const decodeCtx = new AC();
  const decoded = await decodeCtx.decodeAudioData(arrayBuf);
  void decodeCtx.close();

  // Mix down to mono.
  const chs = decoded.numberOfChannels;
  const mono = new Float32Array(decoded.length);
  for (let c = 0; c < chs; c++) {
    const data = decoded.getChannelData(c);
    for (let i = 0; i < data.length; i++) mono[i] += data[i] / chs;
  }

  // Resample to 16 kHz using an offline context.
  const frames = Math.max(1, Math.ceil((mono.length / decoded.sampleRate) * target));
  const offline = new OfflineAudioContext(1, frames, target);
  const buffer = offline.createBuffer(1, mono.length, decoded.sampleRate);
  buffer.copyToChannel(mono, 0);
  const src = offline.createBufferSource();
  src.buffer = buffer;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  const out = rendered.getChannelData(0);
  return {
    base64: bytesToBase64(new Uint8Array(out.buffer, out.byteOffset, out.byteLength)),
    sampleRate: target,
  };
}

// ===== Text-to-Speech =====

interface NativeTtsResult {
  sampleRate: number;
  samplesBase64: string;
}

let activeAudioCtx: AudioContext | null = null;
let activeSource: AudioBufferSourceNode | null = null;

/** Play raw PCM (f32) samples returned by native TTS via the Web Audio API. */
async function playPcm(sampleRate: number, samples: Float32Array): Promise<void> {
  const w = window as unknown as SpeechCapableWindow;
  const AC = w.AudioContext || w.webkitAudioContext;
  if (!AC || samples.length === 0) return;
  const ctx = new AC();
  activeAudioCtx = ctx;
  const buffer = ctx.createBuffer(1, samples.length, sampleRate);
  // Copy into a fresh ArrayBuffer-backed view to satisfy copyToChannel typing.
  buffer.copyToChannel(new Float32Array(samples), 0);
  const src = ctx.createBufferSource();
  activeSource = src;
  src.buffer = buffer;
  src.connect(ctx.destination);
  await new Promise<void>((resolve) => {
    src.onended = () => resolve();
    src.start();
  });
  activeSource = null;
  activeAudioCtx = null;
  void ctx.close();
}

/** Speak text on-device. Resolves when playback finishes (or immediately if TTS
 *  is unavailable). */
export async function speak(
  text: string,
  backend: TtsBackend,
  locale: string,
  ttsModelDir?: string,
): Promise<void> {
  const clean = text.replace(/[•*_#`>]/g, "").trim();
  if (!clean) return;
  if (backend === "native") {
    try {
      const res = await invoke<NativeTtsResult>("tts_speak", {
        req: { text: clean, model_dir: ttsModelDir },
      });
      await playPcm(res.sampleRate, base64ToFloat32(res.samplesBase64));
      return;
    } catch {
      // Fall through to the browser synth if native TTS is unavailable.
    }
  }
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

/** Stop any ongoing speech. */
export function stopSpeaking(backend: TtsBackend) {
  if (backend === "native") {
    void invoke("tts_stop").catch(() => {});
  }
  if (activeSource) {
    try {
      activeSource.stop();
    } catch {
      // Already stopped.
    }
    activeSource = null;
  }
  if (activeAudioCtx) {
    void activeAudioCtx.close();
    activeAudioCtx = null;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}
