#!/usr/bin/env node
/**
 * Copies the static SPA build (web/.output/public) into Android assets so the
 * React Native WebView shell can extract + serve it over localhost.
 *
 * Prefer: npm --prefix web run build:tauri  &&  node scripts/copy-web-assets.mjs
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "web", ".output", "public");
const dest = join(root, "android", "app", "src", "main", "assets", "web");
const stampPath = join(dest, ".build-stamp");

if (!existsSync(join(src, "index.html"))) {
  console.error(
    "[copy-web-assets] Missing web/.output/public/index.html.\n" +
      "  Run: npm --prefix web run build:tauri",
  );
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
writeFileSync(stampPath, new Date().toISOString(), "utf8");
console.log("[copy-web-assets] Copied", src, "→", dest);
