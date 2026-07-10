import { invoke } from "@tauri-apps/api/core";

export type ExportSaveMethod = "native" | "download" | "share" | "clipboard" | "cancelled";

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** RFC 4180 CSV field escaping */
export function escapeCsvField(value: unknown): string {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(escapeCsvField).join(",")).join("\r\n");
}

export function datedFilename(stem: string, ext: string): string {
  return `${stem}-${new Date().toISOString().slice(0, 10)}.${ext}`;
}

async function saveViaTauri(
  filename: string,
  opts: { text?: string; bytes?: Uint8Array },
): Promise<ExportSaveMethod> {
  if (opts.bytes) {
    let binary = "";
    for (let i = 0; i < opts.bytes.length; i++) binary += String.fromCharCode(opts.bytes[i]!);
    const bytes_base64 = btoa(binary);
    await invoke<string>("save_export_file", { req: { filename, bytes_base64 } });
    return "native";
  }
  if (opts.text != null) {
    await invoke<string>("save_export_file", { req: { filename, contents: opts.text } });
    return "native";
  }
  throw new Error("No export content provided");
}

/** Browser fallback: Web Share → anchor download → clipboard (text only). */
export async function saveOrShare(
  blob: Blob,
  filename: string,
  textContent?: string,
): Promise<ExportSaveMethod> {
  try {
    const nav =
      typeof navigator !== "undefined"
        ? (navigator as Navigator & { canShare?: (d: ShareData) => boolean })
        : undefined;
    if (nav && typeof File !== "undefined" && nav.canShare) {
      const file = new File([blob], filename, { type: blob.type });
      const data: ShareData & { files?: File[] } = { files: [file], title: filename };
      if (nav.canShare(data)) {
        await nav.share(data);
        return "share";
      }
    }
  } catch {
    // fall through
  }

  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const supportsDownload = "download" in a;
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    if (supportsDownload) return "download";
  } catch {
    // fall through
  }

  if (textContent && typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(textContent);
    return "clipboard";
  }
  throw new Error("No available way to save the file on this device");
}

export async function saveExportFile(
  filename: string,
  opts: { text?: string; blob?: Blob; bytes?: Uint8Array },
): Promise<ExportSaveMethod> {
  if (isTauri()) {
    try {
      if (opts.bytes) return await saveViaTauri(filename, { bytes: opts.bytes });
      if (opts.text != null) return await saveViaTauri(filename, { text: opts.text });
      if (opts.blob) {
        const bytes = new Uint8Array(await opts.blob.arrayBuffer());
        return await saveViaTauri(filename, { bytes });
      }
      throw new Error("No export content provided");
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      if (msg.includes("cancelled")) return "cancelled";
      throw e;
    }
  }

  const text = opts.text ?? (opts.blob ? await opts.blob.text() : undefined);
  const blob =
    opts.blob ??
    (opts.text != null
      ? new Blob([opts.text], { type: "text/plain;charset=utf-8" })
      : opts.bytes
        ? new Blob([opts.bytes])
        : undefined);
  if (!blob) throw new Error("No export content provided");
  return saveOrShare(blob, filename, text);
}

/** Serialize large JSON off the main thread when available. */
export function stringifyExportJson(data: unknown): Promise<string> {
  if (typeof Worker === "undefined") {
    return Promise.resolve(JSON.stringify(data, null, 2));
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./export-json.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (ev: MessageEvent<{ ok: true; json: string } | { ok: false; error: string }>) => {
      worker.terminate();
      if (ev.data.ok) resolve(ev.data.json);
      else reject(new Error(ev.data.error));
    };
    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };
    worker.postMessage(data);
  });
}

export function redactStateForExport<T extends { settings?: { finnhubKey?: string } }>(state: T): T {
  if (!state.settings?.finnhubKey) return state;
  return {
    ...state,
    settings: { ...state.settings, finnhubKey: undefined },
  };
}

export function exportMethodDescription(
  method: ExportSaveMethod,
  filename: string,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  switch (method) {
    case "native":
      return t("settings.data.exportedNative", { defaultValue: `Saved ${filename}`, filename });
    case "share":
      return t("settings.data.exportedShare", { defaultValue: `Shared ${filename}`, filename });
    case "clipboard":
      return t("settings.data.exportedClipboard", {
        defaultValue: "Copied to clipboard (download unavailable on this device)",
      });
    case "cancelled":
      return t("settings.data.exportCancelled", { defaultValue: "Export cancelled" });
    default:
      return t("settings.data.exportedFile", { defaultValue: `Saved ${filename}`, filename });
  }
}
