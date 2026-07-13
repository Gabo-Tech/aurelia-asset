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
