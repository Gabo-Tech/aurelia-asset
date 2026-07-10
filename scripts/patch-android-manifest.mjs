/**
 * Inject microphone permissions into the generated Android manifest.
 * Idempotent — safe to run after every `cargo tauri android init`.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(root, "src-tauri/gen/android/app/src/main/AndroidManifest.xml");

if (!existsSync(manifestPath)) {
  console.warn(`[patch-android-manifest] Skipping: ${manifestPath} not found`);
  process.exit(0);
}

const INJECTIONS = [
  '    <uses-permission android:name="android.permission.RECORD_AUDIO" />',
  '    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />',
  '    <uses-feature android:name="android.hardware.microphone" android:required="false" />',
];

let xml = readFileSync(manifestPath, "utf8");
let changed = false;

for (const line of INJECTIONS) {
  const name = line.match(/android:name="([^"]+)"/)?.[1];
  if (!name || xml.includes(name)) continue;
  xml = xml.replace(
    /(<uses-permission android:name="android.permission.INTERNET" \/>)/,
    `$1\n${line}`,
  );
  changed = true;
}

if (changed) {
  writeFileSync(manifestPath, xml, "utf8");
  console.log("[patch-android-manifest] Updated", manifestPath);
} else {
  console.log("[patch-android-manifest] Already up to date");
}
