/**
 * On-device AI model downloader (replaces Tauri `download_model`).
 * Downloads into the app documents directory. Works on mobile + desktop.
 * STT/TTS archives are extracted via Sherpa's native extractTarBz2.
 */

import { Platform } from "react-native";
import ReactNativeBlobUtil from "react-native-blob-util";
import RNFS from "react-native-fs";
import { t } from "@/lib/i18n-t";

export type ModelKind = "llm" | "stt" | "tts";
export type ModelDownloadPhase = "downloading" | "downloaded" | "extracting" | "ready";

export interface ModelDownloadProgress {
  kind: ModelKind;
  received: number;
  total?: number;
  phase: ModelDownloadPhase;
}

export interface ModelManifestEntry {
  kind: ModelKind;
  labelKey: string;
  sizeLabel: string;
  settingsKey: "aiLlmModelPath" | "aiSttModelDir" | "aiTtsModelDir";
}

export const MODEL_MANIFEST: ModelManifestEntry[] = [
  {
    kind: "llm",
    labelKey: "settings.ai.llmModel",
    sizeLabel: "~1.1 GB",
    settingsKey: "aiLlmModelPath",
  },
  {
    kind: "stt",
    labelKey: "settings.ai.sttModel",
    sizeLabel: "~110 MB",
    settingsKey: "aiSttModelDir",
  },
  {
    kind: "tts",
    labelKey: "settings.ai.ttsModel",
    sizeLabel: "~60 MB",
    settingsKey: "aiTtsModelDir",
  },
];

type Manifest = {
  url: string;
  archive: boolean;
  filename: string;
};

function manifestFor(kind: ModelKind): Manifest {
  switch (kind) {
    case "llm":
      return {
        url: "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf",
        archive: false,
        filename: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
      };
    case "stt":
      return {
        url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-tiny.en.tar.bz2",
        archive: true,
        filename: "sherpa-onnx-whisper-tiny.en.tar.bz2",
      };
    case "tts":
      return {
        url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_US-lessac-medium.tar.bz2",
        archive: true,
        filename: "vits-piper-en_US-lessac-medium.tar.bz2",
      };
  }
}

function modelsRoot(): string {
  return `${RNFS.DocumentDirectoryPath}/models`;
}

async function ensureDir(path: string) {
  if (!(await RNFS.exists(path))) await RNFS.mkdir(path);
}

async function findGguf(dir: string): Promise<string | null> {
  if (!(await RNFS.exists(dir))) return null;
  const entries = await RNFS.readDir(dir);
  for (const e of entries) {
    if (e.isFile() && e.name.toLowerCase().endsWith(".gguf")) return e.path;
  }
  return null;
}

export async function looksLikeSttDir(dir: string): Promise<boolean> {
  if (!(await RNFS.exists(dir))) return false;
  const entries = await RNFS.readDir(dir);
  const names = entries.filter((e) => e.isFile()).map((e) => e.name.toLowerCase());
  const hasTokens = names.some((n) => n.includes("tokens") && n.endsWith(".txt"));
  if (!hasTokens) return false;
  // Whisper / transducer / sense-style ONNX present
  return (
    names.some((n) => n.endsWith(".onnx")) ||
    names.some((n) => n.includes("encoder")) ||
    names.some((n) => n.includes("decoder"))
  );
}

export async function looksLikeTtsDir(dir: string): Promise<boolean> {
  if (!(await RNFS.exists(dir))) return false;
  const entries = await RNFS.readDir(dir);
  const names = entries.map((e) => e.name.toLowerCase());
  return (
    names.some((n) => n.includes("tokens") && n.endsWith(".txt")) &&
    names.some((n) => n.endsWith(".onnx"))
  );
}

/** Find Piper/espeak phoneme data directory under a TTS model folder. */
export async function findEspeakDataDir(root: string): Promise<string | null> {
  async function walk(dir: string, depth: number): Promise<string | null> {
    if (depth > 8) return null;
    let entries;
    try {
      entries = await RNFS.readDir(dir);
    } catch {
      return null;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const n = e.name.toLowerCase();
      if (n === "espeak-ng-data" || n.includes("espeak-ng-data") || n === "espeak-ng") {
        return e.path;
      }
      if (n.includes("espeak")) {
        // Prefer leaf that looks like data pack (has phontab etc.)
        try {
          const kids = await RNFS.readDir(e.path);
          if (kids.some((k) => /phontab|phondata|lang/i.test(k.name))) return e.path;
        } catch {
          /* continue */
        }
      }
      const nested = await walk(e.path, depth + 1);
      if (nested) return nested;
    }
    return null;
  }
  return walk(root, 0);
}

/** Human-readable status for Settings after download/pick. */
export async function describeSpeechModelDir(
  kind: "stt" | "tts",
  dir: string | undefined,
): Promise<{ ok: boolean; label: string }> {
  if (!dir?.trim()) return { ok: false, label: "not set — tap Download below" };
  if (kind === "stt") {
    if (await looksLikeSttDir(dir)) return { ok: true, label: `Ready · ${dir}` };
    return { ok: false, label: `Incomplete folder · ${dir}` };
  }
  if (!(await looksLikeTtsDir(dir))) {
    return { ok: false, label: `Incomplete folder · ${dir}` };
  }
  if (!(await findEspeakDataDir(dir))) {
    return { ok: false, label: `Missing espeak-ng-data — re-download TTS · ${dir}` };
  }
  return { ok: true, label: `Ready · ${dir}` };
}

async function resolveExisting(kind: ModelKind): Promise<string | null> {
  const root = modelsRoot();
  const dir = `${root}/${kind}`;
  if (kind === "llm") return findGguf(dir);
  if (kind === "stt") {
    if (await looksLikeSttDir(dir)) return dir;
    if (!(await RNFS.exists(dir))) return null;
    for (const e of await RNFS.readDir(dir)) {
      if (e.isDirectory() && (await looksLikeSttDir(e.path))) return e.path;
    }
  }
  if (kind === "tts") {
    if (await looksLikeTtsDir(dir)) return dir;
    if (!(await RNFS.exists(dir))) return null;
    for (const e of await RNFS.readDir(dir)) {
      if (e.isDirectory() && (await looksLikeTtsDir(e.path))) return e.path;
    }
  }
  return null;
}

/** Recursively remove a file or directory (RNFS.unlink fails on non-empty dirs). */
async function rmrf(path: string): Promise<void> {
  if (!(await RNFS.exists(path))) return;
  const stat = await RNFS.stat(path);
  if (stat.isDirectory()) {
    const kids = await RNFS.readDir(path);
    for (const k of kids) {
      await rmrf(k.path);
    }
  }
  await RNFS.unlink(path);
}

/** If extract produced a single nested folder, hoist its contents to destDir. */
async function flattenSingleNestedDir(destDir: string): Promise<void> {
  const entries = await RNFS.readDir(destDir);
  const dirs = entries.filter((e) => e.isDirectory());
  const files = entries.filter((e) => e.isFile());
  if (files.length === 0 && dirs.length === 1) {
    const nested = dirs[0]!;
    for (const e of await RNFS.readDir(nested.path)) {
      await RNFS.moveFile(e.path, `${destDir}/${e.name}`);
    }
    await rmrf(nested.path);
  }
}

/**
 * Extract a tar.bz2 via Sherpa's native Apache Commons / iOS extractor.
 * Runs off the JS thread — avoids the previous JS stream hang at "100%".
 */
async function extractTarBz2Native(archivePath: string, destDir: string): Promise<void> {
  let sherpa: typeof import("@siteed/sherpa-onnx.rn");
  try {
    sherpa = await import("@siteed/sherpa-onnx.rn");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Sherpa extract unavailable: ${msg}`);
  }

  const result = await sherpa.default.extractTarBz2({
    sourcePath: archivePath,
    targetDir: destDir,
  });
  if (!result.success) {
    throw new Error(result.message || "extract failed");
  }
  await flattenSingleNestedDir(destDir);
}

/** Reject HTML 404 bodies and other non-bz2 downloads before native extract. */
async function assertValidTarBz2(archivePath: string, httpStatus?: number): Promise<void> {
  if (httpStatus != null && (httpStatus < 200 || httpStatus >= 300)) {
    throw new Error(
      `Download failed (HTTP ${httpStatus}). Check network and retry.`,
    );
  }
  if (!(await RNFS.exists(archivePath))) {
    throw new Error("Download failed (file missing). Check network and retry.");
  }
  const stat = await RNFS.stat(archivePath);
  const size = Number(stat.size) || 0;
  if (size < 1024 * 1024) {
    throw new Error(
      "Download failed (not a valid model archive). Check network and retry.",
    );
  }
  // BZip2 magic: "BZh"
  const head = await RNFS.read(archivePath, 3, 0, "ascii");
  if (head !== "BZh") {
    throw new Error(
      "Download failed (not a valid model archive). Check network and retry.",
    );
  }
}

export function isNativeDesktop(): boolean {
  return Platform.OS === "macos" || Platform.OS === "windows";
}

let activeDownload: { cancel: () => void } | null = null;
/** Best-effort cancel flag for in-flight native extract (no native cancel API). */
let activeExtractAbort: AbortController | null = null;
/** Bumped on cancel so a late extract cleanup cannot wipe a newer install. */
let installGeneration = 0;

/** Cancel the in-flight model download and/or mark extract as cancelled. */
export function cancelActiveDownload(): void {
  installGeneration += 1;
  try {
    activeDownload?.cancel();
  } catch {
    /* ignore */
  }
  activeDownload = null;
  try {
    activeExtractAbort?.abort();
  } catch {
    /* ignore */
  }
}

/** Remove downloaded files for a kind (does not clear settings paths). */
export async function clearInstalledModel(kind: ModelKind): Promise<void> {
  const root = modelsRoot();
  const destDir = `${root}/${kind}`;
  const tmpDir = `${root}/.tmp`;
  await rmrf(destDir);
  await rmrf(tmpDir);
}

export async function downloadModel(
  kind: ModelKind,
  onProgress?: (progress: ModelDownloadProgress) => void,
): Promise<string> {
  const gen = ++installGeneration;
  const stillActive = () => gen === installGeneration;

  const existing = await resolveExisting(kind);
  if (existing) {
    onProgress?.({ kind, received: 0, phase: "ready" });
    return existing;
  }

  const m = manifestFor(kind);
  const root = modelsRoot();
  const destDir = `${root}/${kind}`;
  const tmpDir = `${root}/.tmp`;
  await ensureDir(root);
  await ensureDir(destDir);
  await ensureDir(tmpDir);
  const tmpFile = `${tmpDir}/${m.filename}`;

  if (await RNFS.exists(tmpFile)) await RNFS.unlink(tmpFile);

  onProgress?.({ kind, received: 0, phase: "downloading" });

  const task = ReactNativeBlobUtil.config({
    path: tmpFile,
    fileCache: true,
    timeout: 60 * 60 * 1000,
  }).fetch("GET", m.url);
  activeDownload = task as unknown as { cancel: () => void };

  let httpStatus: number | undefined;
  try {
    const res = await task.progress({ interval: 400 }, (received, total) => {
      if (!stillActive()) return;
      onProgress?.({
        kind,
        received: Number(received) || 0,
        total: Number(total) > 0 ? Number(total) : undefined,
        phase: "downloading",
      });
    });
    httpStatus = res?.info?.()?.status;
  } catch (e) {
    activeDownload = null;
    try {
      if (await RNFS.exists(tmpFile)) await RNFS.unlink(tmpFile);
    } catch {
      /* ignore */
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (/cancel/i.test(msg) || !stillActive()) throw new Error("Download cancelled");
    throw e;
  }
  activeDownload = null;
  if (!stillActive()) throw new Error("Download cancelled");

  onProgress?.({ kind, received: 0, phase: "downloaded" });

  if (m.archive) {
    // Indeterminate extract progress — native extract has no byte callback.
    onProgress?.({ kind, received: 0, phase: "extracting" });
    const ac = new AbortController();
    activeExtractAbort = ac;
    try {
      if (ac.signal.aborted || !stillActive()) throw new Error("Extraction cancelled");
      await assertValidTarBz2(tmpFile, httpStatus);
      await rmrf(destDir);
      await ensureDir(destDir);
      await extractTarBz2Native(tmpFile, destDir);
      if (ac.signal.aborted || !stillActive()) throw new Error("Extraction cancelled");
      if (await RNFS.exists(tmpFile)) await RNFS.unlink(tmpFile);
    } catch (e) {
      // Drop corrupt archive so the next retry does not reuse junk.
      try {
        if (await RNFS.exists(tmpFile)) await RNFS.unlink(tmpFile);
      } catch {
        /* ignore */
      }
      // Only wipe dest if this install is still the active one (avoid racing a retry).
      if (stillActive()) {
        try {
          await rmrf(destDir);
        } catch {
          /* ignore */
        }
      }
      const msg = e instanceof Error ? e.message : String(e);
      if (/cancel/i.test(msg) || !stillActive()) throw new Error("Download cancelled");
      if (/not a valid model archive|HTTP \d+/i.test(msg)) throw e;
      throw new Error(`Downloaded archive but extraction failed: ${msg}`);
    } finally {
      if (activeExtractAbort === ac) activeExtractAbort = null;
    }
  } else {
    if (!stillActive()) throw new Error("Download cancelled");
    const finalPath = `${destDir}/${m.filename}`;
    if (await RNFS.exists(finalPath)) await RNFS.unlink(finalPath);
    await RNFS.moveFile(tmpFile, finalPath);
  }

  if (!stillActive()) throw new Error("Download cancelled");

  try {
    await rmrf(tmpDir);
  } catch {
    /* ignore */
  }

  const resolved = await resolveExisting(kind);
  if (!resolved) throw new Error(`${kind} model installed but path could not be resolved`);
  if (!stillActive()) throw new Error("Download cancelled");
  onProgress?.({ kind, received: 0, phase: "ready" });
  return resolved;
}

export async function downloadAllModels(
  kinds: ModelKind[],
  onProgress?: (kind: ModelKind, progress: ModelDownloadProgress) => void,
): Promise<Record<ModelKind, string>> {
  const out = {} as Record<ModelKind, string>;
  for (const kind of kinds) {
    out[kind] = await downloadModel(kind, (p) => onProgress?.(kind, p));
  }
  return out;
}

export function modelLabel(kind: ModelKind): string {
  const entry = MODEL_MANIFEST.find((m) => m.kind === kind);
  if (!entry) return kind;
  return t(entry.labelKey, { defaultValue: kind.toUpperCase() });
}

export function formatDownloadProgress(progress: ModelDownloadProgress): string {
  const label = progress.kind.toUpperCase();
  const { received, total, phase } = progress;
  if (phase === "extracting") {
    return t("settings.ai.downloadExtracting", {
      kind: label,
      defaultValue: `Extracting ${label}…`,
    });
  }
  if (phase === "downloaded") {
    return t("settings.ai.downloadDownloaded", {
      kind: label,
      defaultValue: `${label} downloaded — preparing…`,
    });
  }
  if (phase === "ready") {
    return t("settings.ai.downloadReady", { kind: label, defaultValue: `${label} ready` });
  }
  const recvMb = (received / (1024 * 1024)).toFixed(1);
  if (total && total > 0) {
    const pct = Math.min(100, Math.round((received / total) * 100));
    const totalMb = (total / (1024 * 1024)).toFixed(0);
    return t("settings.ai.downloadProgressDetail", {
      kind: label,
      pct,
      recvMb,
      totalMb,
      defaultValue: `Downloading ${label} · ${pct}% · ${recvMb} / ${totalMb} MB`,
    });
  }
  return t("settings.ai.downloadProgressUnknown", {
    kind: label,
    mb: recvMb,
    defaultValue: `Downloading ${label} · ${recvMb} MB`,
  });
}

export function downloadProgressRatio(progress: ModelDownloadProgress | null | undefined): number | undefined {
  if (!progress) return undefined;
  if (progress.phase === "ready") return 1;
  // downloaded / extracting: indeterminate (native extract has no byte progress)
  if (progress.phase === "downloaded" || progress.phase === "extracting") return undefined;
  if (progress.total && progress.total > 0) {
    return Math.min(1, progress.received / progress.total);
  }
  return undefined;
}

export function totalDownloadSizeLabel(): string {
  return "~1.2 GB";
}
