/**
 * On-device AI model downloader (replaces Tauri `download_model`).
 * Downloads into the app documents directory. Works on mobile + desktop.
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
    sizeLabel: "~75 MB",
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
        url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-tiny.en-2024-04-30.tar.bz2",
        archive: true,
        filename: "sherpa-onnx-whisper-tiny.en-2024-04-30.tar.bz2",
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

async function looksLikeSttDir(dir: string): Promise<boolean> {
  if (!(await RNFS.exists(dir))) return false;
  const entries = await RNFS.readDir(dir);
  return entries.some((e) => e.isFile() && e.name.toLowerCase().includes("tokens") && e.name.endsWith(".txt"));
}

async function looksLikeTtsDir(dir: string): Promise<boolean> {
  if (!(await RNFS.exists(dir))) return false;
  const entries = await RNFS.readDir(dir);
  const names = entries.map((e) => e.name.toLowerCase());
  return names.some((n) => n.includes("tokens") && n.endsWith(".txt")) && names.some((n) => n.endsWith(".onnx"));
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

async function extractTarBz2(archivePath: string, destDir: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const bzip2 = require("unbzip2-stream");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const tar = require("tar-stream");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Readable } = require("readable-stream");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Buffer: Buf } = require("buffer");

  const base64 = await RNFS.readFile(archivePath, "base64");
  const bytes = Buf.from(base64, "base64");

  await new Promise<void>((resolve, reject) => {
    const extract = tar.extract();
    extract.on(
      "entry",
      (header: { name: string; type: string }, stream: { on: Function }, next: () => void) => {
        const chunks: InstanceType<typeof Buf>[] = [];
        stream.on("data", (c: InstanceType<typeof Buf>) => chunks.push(c));
        stream.on("error", reject);
        stream.on("end", () => {
          void (async () => {
            try {
              if (header.type === "file") {
                const outPath = `${destDir}/${header.name}`;
                const parent = outPath.replace(/\/[^/]+$/, "");
                const parts = parent.replace(destDir, "").split("/").filter(Boolean);
                let cur = destDir;
                for (const p of parts) {
                  cur = `${cur}/${p}`;
                  if (!(await RNFS.exists(cur))) await RNFS.mkdir(cur);
                }
                const buf = Buf.concat(chunks);
                await RNFS.writeFile(outPath, buf.toString("base64"), "base64");
              }
              next();
            } catch (e) {
              reject(e);
            }
          })();
        });
      },
    );
    extract.on("finish", () => resolve());
    extract.on("error", reject);

    const readable = new Readable({
      read() {
        /* noop */
      },
    });
    readable.push(bytes);
    readable.push(null);
    readable.pipe(bzip2()).pipe(extract);
  });

  const entries = await RNFS.readDir(destDir);
  const dirs = entries.filter((e) => e.isDirectory());
  const files = entries.filter((e) => e.isFile());
  if (files.length === 0 && dirs.length === 1) {
    const nested = dirs[0]!;
    for (const e of await RNFS.readDir(nested.path)) {
      await RNFS.moveFile(e.path, `${destDir}/${e.name}`);
    }
    await RNFS.unlink(nested.path);
  }
}

export function isNativeDesktop(): boolean {
  return Platform.OS === "macos" || Platform.OS === "windows";
}

let activeDownload: { cancel: () => void } | null = null;

/** Cancel the in-flight model download, if any. */
export function cancelActiveDownload(): void {
  try {
    activeDownload?.cancel();
  } catch {
    /* ignore */
  }
  activeDownload = null;
}

/** Remove downloaded files for a kind (does not clear settings paths). */
export async function clearInstalledModel(kind: ModelKind): Promise<void> {
  const root = modelsRoot();
  const destDir = `${root}/${kind}`;
  const tmpDir = `${root}/.tmp`;
  if (await RNFS.exists(destDir)) await RNFS.unlink(destDir);
  if (await RNFS.exists(tmpDir)) {
    try {
      await RNFS.unlink(tmpDir);
    } catch {
      /* ignore */
    }
  }
}

export async function downloadModel(
  kind: ModelKind,
  onProgress?: (progress: ModelDownloadProgress) => void,
): Promise<string> {
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

  try {
    await task.progress({ interval: 400 }, (received, total) => {
      onProgress?.({
        kind,
        received: Number(received) || 0,
        total: Number(total) > 0 ? Number(total) : undefined,
        phase: "downloading",
      });
    });
  } catch (e) {
    activeDownload = null;
    const msg = e instanceof Error ? e.message : String(e);
    if (/cancel/i.test(msg)) throw new Error("Download cancelled");
    throw e;
  }
  activeDownload = null;

  onProgress?.({ kind, received: 0, phase: "downloaded" });

  if (m.archive) {
    onProgress?.({ kind, received: 0, phase: "extracting" });
    try {
      await extractTarBz2(tmpFile, destDir);
      await RNFS.unlink(tmpFile);
    } catch (e) {
      throw new Error(
        `Downloaded archive but extraction failed: ${e instanceof Error ? e.message : String(e)}. Archive at ${tmpFile}`,
      );
    }
  } else {
    const finalPath = `${destDir}/${m.filename}`;
    if (await RNFS.exists(finalPath)) await RNFS.unlink(finalPath);
    await RNFS.moveFile(tmpFile, finalPath);
  }

  try {
    await RNFS.unlink(tmpDir);
  } catch {
    /* ignore */
  }

  const resolved = await resolveExisting(kind);
  if (!resolved) throw new Error(`${kind} model installed but path could not be resolved`);
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
  const { received, total, phase } = progress;
  if (phase === "extracting") return t("settings.ai.downloadExtracting", { defaultValue: "Extracting…" });
  if (phase === "ready") return t("settings.ai.downloadReady", { defaultValue: "Ready" });
  if (total && total > 0) {
    const pct = Math.min(100, Math.round((received / total) * 100));
    return t("settings.ai.downloadProgress", { pct, defaultValue: `${pct}%` });
  }
  const mb = (received / (1024 * 1024)).toFixed(1);
  return t("settings.ai.downloadProgressUnknown", { mb, defaultValue: `${mb} MB` });
}

export function totalDownloadSizeLabel(): string {
  return "~1.2 GB";
}
