/**
 * Vercel builds the git root (React Native + web-app Vite), but the landing site
 * lives in web/. Nitro's vercel preset writes Build Output API files under
 * web/.vercel/output — hoist them to ./.vercel/output so Vercel can deploy.
 */
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const web = join(root, "web");

const build = spawnSync("npm", ["run", "build"], {
  cwd: web,
  stdio: "inherit",
  env: process.env,
});
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const src = join(web, ".vercel", "output");
const dest = join(root, ".vercel", "output");
if (!existsSync(src)) {
  console.error(
    "Missing web/.vercel/output after build. On Vercel, Nitro should emit the vercel preset automatically.",
  );
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log("Hoisted web/.vercel/output → .vercel/output");
