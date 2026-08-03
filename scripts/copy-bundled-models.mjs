#!/usr/bin/env node
/**
 * Copies bundled GGUF / notes into the app documents hint path for local AI.
 * Models stay on-device; nothing is uploaded.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "models", "qwen2.5-1.5b-instruct-q4_k_m.gguf");
const destDir = join(root, "android", "app", "src", "main", "assets", "models");

if (!existsSync(src)) {
  console.warn("[setup:models] No GGUF found at", src, "— download manually into models/");
  process.exit(0);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(src, join(destDir, "qwen2.5-1.5b-instruct-q4_k_m.gguf"));
console.log("[setup:models] Copied GGUF into android assets/models/");
console.log("Pick the model from Settings → Local AI after install, or place under app documents.");
