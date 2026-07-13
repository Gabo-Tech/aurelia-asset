/**
 * Client entry: hydrateRoot for normal SSR web, createRoot for Tauri's
 * synthetic shell (avoids React #418 hydration mismatch → error boundary).
 */
import { StrictMode, startTransition } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";

declare global {
  interface Window {
    __TSS_TAURI_SPA__?: boolean;
  }
}

const app = (
  <StrictMode>
    <StartClient />
  </StrictMode>
);

startTransition(() => {
  const isTauriSpa = typeof window !== "undefined" && !!window.__TSS_TAURI_SPA__;

  // #region agent log
  try {
    const el = document.getElementById("dbg-hud") ?? document.createElement("pre");
    if (!el.id) {
      el.id = "dbg-hud";
      el.setAttribute(
        "style",
        "position:fixed;z-index:99999;left:8px;right:8px;bottom:8px;max-height:40vh;overflow:auto;background:#111;color:#0f0;font:12px/1.3 monospace;padding:8px;border:1px solid #0f0;white-space:pre-wrap",
      );
      document.documentElement.appendChild(el);
    }
    el.textContent =
      (el.textContent ? el.textContent + "\n" : "") +
      `HE: client_entry isTauriSpa=${isTauriSpa} hasRoot=${!!document.getElementById("root")} mount=${isTauriSpa ? "createRoot" : "hydrateRoot"}`;
    fetch("http://127.0.0.1:7615/ingest/29d629d9-bd7a-4ba7-a113-f05338f279cd", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "8fec98" },
      body: JSON.stringify({
        sessionId: "8fec98",
        runId: "post-fix",
        hypothesisId: "E",
        location: "src/client.tsx",
        message: "client_entry_mount",
        data: {
          isTauriSpa,
          hasRoot: !!document.getElementById("root"),
          mount: isTauriSpa ? "createRoot" : "hydrateRoot",
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
  // #endregion

  if (isTauriSpa) {
    const mount = document.getElementById("root");
    if (!mount) {
      throw new Error("Missing #root element for Tauri SPA client mount");
    }
    createRoot(mount).render(app);
    return;
  }

  hydrateRoot(document, app);
});
