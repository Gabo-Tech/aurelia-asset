/**
 * On-device voice I/O for React Native.
 * STT: live mic PCM → Sherpa ASR.
 * TTS: Sherpa TTS with native playback when configured.
 */

import { Platform, PermissionsAndroid } from "react-native";
import LiveAudioStream from "react-native-live-audio-stream";
import { check, request, PERMISSIONS, RESULTS } from "react-native-permissions";
import RNFS from "react-native-fs";
import { t } from "@/lib/i18n-t";
import { getSpeechReady, stopSpeech, synthesizeSpeech, transcribePcm } from "@/platform/speech";

export type SttBackend = "native" | "webspeech" | "none";
export type TtsBackend = "native" | "webspeech" | "none";

const STOP_TIMEOUT_MS = 2500;
const SESSION_WATCHDOG_MS = 25000;

export interface VoiceCapabilities {
  stt: SttBackend;
  tts: TtsBackend;
}

export function detectVoiceCapabilities(nativeCaps: {
  stt: boolean;
  tts: boolean;
}): VoiceCapabilities {
  return {
    stt: nativeCaps.stt ? "native" : "none",
    tts: nativeCaps.tts ? "native" : "none",
  };
}

export async function probeVoiceCapabilities(cfg: {
  sttDir?: string;
  ttsDir?: string;
}): Promise<VoiceCapabilities> {
  const ready = await getSpeechReady(cfg);
  return detectVoiceCapabilities(ready);
}

async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS === "android") {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  }
  if (Platform.OS === "ios") {
    const status = await check(PERMISSIONS.IOS.MICROPHONE);
    if (status === RESULTS.GRANTED) return true;
    const next = await request(PERMISSIONS.IOS.MICROPHONE);
    return next === RESULTS.GRANTED;
  }
  return true;
}

/** Convert base64 little-endian int16 PCM chunks to Float32Array [-1, 1]. */
export function int16Base64ChunksToFloat32(chunks: string[]): Float32Array {
  const parts: Uint8Array[] = [];
  let total = 0;
  for (const b64 of chunks) {
    const bin = globalThis.atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    parts.push(bytes);
    total += bytes.length;
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    merged.set(p, offset);
    offset += p.length;
  }
  const view = new DataView(merged.buffer, merged.byteOffset, merged.byteLength);
  const samples = new Float32Array(Math.floor(merged.byteLength / 2));
  for (let i = 0; i < samples.length; i++) {
    samples[i] = view.getInt16(i * 2, true) / 32768;
  }
  return samples;
}

export interface ListenHandlers {
  onPartial?: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
}

/**
 * Microphone session → Sherpa offline ASR.
 * Auto-stops after ~1.6s of low energy, or on stop().
 */
export class VoiceListener {
  private chunks: string[] = [];
  private stopped = false;
  private finishing = false;
  private ended = false;
  private timedOut = false;
  private silenceTimer: ReturnType<typeof setInterval> | null = null;
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private lastVoiceAt = 0;
  private subscription: { remove: () => void } | null = null;
  private handlers: ListenHandlers | null = null;
  private sampleRate = 16000;

  constructor(
    private backend: SttBackend,
    private locale: string,
    private sttModelDir?: string,
  ) {}

  private clearTimers() {
    if (this.silenceTimer) {
      clearInterval(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  private emitEndOnce() {
    if (this.ended) return;
    this.ended = true;
    this.handlers?.onEnd?.();
  }

  private async stopStreamWithTimeout(): Promise<void> {
    await Promise.race([
      LiveAudioStream.stop().catch(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, STOP_TIMEOUT_MS)),
    ]);
  }

  async start(handlers: ListenHandlers): Promise<void> {
    this.stopped = false;
    this.finishing = false;
    this.ended = false;
    this.timedOut = false;
    this.chunks = [];
    this.handlers = handlers;
    if (this.backend !== "native" || !this.sttModelDir) {
      handlers.onError(t("assistant.voiceUnavailable", { defaultValue: "Voice input unavailable" }));
      return;
    }
    const ok = await ensureMicPermission();
    if (!ok) {
      handlers.onError(t("assistant.backend.voice.micDenied", { defaultValue: "Microphone denied" }));
      return;
    }

    const wavFile = `${RNFS.CachesDirectoryPath}/aurelia-stt.wav`;
    try {
      LiveAudioStream.init({
        sampleRate: this.sampleRate,
        channels: 1,
        bitsPerSample: 16,
        audioSource: 6,
        wavFile,
        bufferSize: 4096,
      });
      this.subscription = LiveAudioStream.on("data", (data: string) => {
        if (this.stopped) return;
        this.chunks.push(data);
        try {
          const samples = int16Base64ChunksToFloat32([data]);
          let energy = 0;
          for (let i = 0; i < samples.length; i++) energy += Math.abs(samples[i]!);
          energy /= Math.max(1, samples.length);
          if (energy > 0.02) this.lastVoiceAt = Date.now();
        } catch {
          /* ignore */
        }
      }) as unknown as { remove: () => void };
      this.lastVoiceAt = Date.now();
      LiveAudioStream.start();
      handlers.onStart?.();
      this.silenceTimer = setInterval(() => {
        if (this.stopped) return;
        if (Date.now() - this.lastVoiceAt > 1600 && this.chunks.length > 0) {
          void this.finish();
        }
      }, 200);
      this.watchdogTimer = setTimeout(() => {
        if (this.stopped || this.finishing) return;
        this.timedOut = true;
        handlers.onError("session-timeout");
        void this.finish();
      }, SESSION_WATCHDOG_MS);
    } catch (err) {
      handlers.onError(err instanceof Error ? err.message : String(err));
    }
  }

  private async finish() {
    if (this.finishing || this.stopped) return;
    this.finishing = true;
    this.stopped = true;
    const handlers = this.handlers;
    this.clearTimers();
    this.subscription?.remove();
    this.subscription = null;
    this.emitEndOnce();
    await this.stopStreamWithTimeout();
    if (!handlers || this.timedOut) return;
    try {
      const samples = int16Base64ChunksToFloat32(this.chunks);
      this.chunks = [];
      if (samples.length < this.sampleRate * 0.25) {
        handlers.onError("no-speech");
        return;
      }
      const text = await transcribePcm(samples, this.sampleRate, this.sttModelDir!, this.locale);
      if (text) handlers.onFinal(text);
      else handlers.onError("no-speech");
    } catch (err) {
      handlers.onError(
        err instanceof Error
          ? err.message
          : t("assistant.backend.voice.transcriptionFailed", {
              defaultValue: "Transcription failed",
            }),
      );
    }
  }

  stop() {
    void this.finish();
  }

  cancel() {
    this.stopped = true;
    this.finishing = true;
    this.clearTimers();
    this.subscription?.remove();
    this.subscription = null;
    this.chunks = [];
    this.emitEndOnce();
    void this.stopStreamWithTimeout();
    this.handlers = null;
  }
}

export async function speak(
  text: string,
  backend: TtsBackend,
  locale: string,
  ttsModelDir?: string,
): Promise<void> {
  const clean = text.replace(/[•*_#`>]/g, "").trim();
  if (!clean || backend !== "native" || !ttsModelDir) return;
  const res = await synthesizeSpeech(clean, ttsModelDir, locale);
  if (!res.played) throw new Error("tts-playback-failed");
}

export async function stopSpeaking(_backend: TtsBackend) {
  await stopSpeech();
}
