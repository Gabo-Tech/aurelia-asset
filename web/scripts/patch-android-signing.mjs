/**
 * Inject release signingConfigs into the generated Android app/build.gradle.kts.
 * Idempotent — safe to run after every `cargo tauri android init`.
 *
 * Expects src-tauri/gen/android/keystore.properties with:
 *   password=...
 *   keyAlias=...
 *   storeFile=...
 *
 * @see https://v2.tauri.app/distribute/sign/android/
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const gradlePath = join(root, "src-tauri/gen/android/app/build.gradle.kts");

if (!existsSync(gradlePath)) {
  console.warn(`[patch-android-signing] Skipping: ${gradlePath} not found`);
  process.exit(0);
}

const SIGNING_CONFIGS = `
    signingConfigs {
        create("release") {
            val keystorePropertiesFile = rootProject.file("keystore.properties")
            val keystoreProperties = Properties()
            if (keystorePropertiesFile.exists()) {
                keystoreProperties.load(FileInputStream(keystorePropertiesFile))
            }
            keyAlias = keystoreProperties["keyAlias"] as String
            keyPassword = keystoreProperties["password"] as String
            storeFile = file(keystoreProperties["storeFile"] as String)
            storePassword = keystoreProperties["password"] as String
        }
    }
`;

const SIGNING_LINE = '            signingConfig = signingConfigs.getByName("release")';

let kts = readFileSync(gradlePath, "utf8");
let changed = false;

if (!kts.includes("import java.io.FileInputStream")) {
  if (kts.startsWith("import ")) {
    kts = kts.replace(/^(import [^\n]+\n)/, `$1import java.io.FileInputStream\n`);
  } else {
    kts = `import java.io.FileInputStream\n${kts}`;
  }
  changed = true;
}

if (!kts.includes("import java.util.Properties")) {
  if (kts.includes("import java.io.FileInputStream")) {
    kts = kts.replace(
      "import java.io.FileInputStream\n",
      "import java.io.FileInputStream\nimport java.util.Properties\n",
    );
  } else if (kts.startsWith("import ")) {
    kts = kts.replace(/^(import [^\n]+\n)/, `$1import java.util.Properties\n`);
  } else {
    kts = `import java.util.Properties\n${kts}`;
  }
  changed = true;
}

if (!kts.includes('signingConfigs.getByName("release")')) {
  if (!kts.includes("signingConfigs {")) {
    kts = kts.replace(/(\s+)(buildTypes \{)/, `$1${SIGNING_CONFIGS.trim()}\n$1$2`);
    changed = true;
  }

  if (!kts.includes(SIGNING_LINE.trim())) {
    kts = kts.replace(/(getByName\("release"\) \{)/, `$1\n${SIGNING_LINE}`);
    changed = true;
  }
}

if (changed) {
  writeFileSync(gradlePath, kts, "utf8");
  console.log("[patch-android-signing] Updated", gradlePath);
} else {
  console.log("[patch-android-signing] Already up to date");
}
