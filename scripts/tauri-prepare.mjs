/**
 * Post-build step for Tauri: generate index.html and copy static assets
 * needed when serving the TanStack Start client bundle without a server.
 */
import { copyFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, ".output");
const publicDir = join(outDir, "public");
const assetsDir = join(publicDir, "assets");

function findAsset(prefix) {
  const match = readdirSync(assetsDir).find((f) => f.startsWith(prefix));
  if (!match) throw new Error(`Missing built asset with prefix "${prefix}" in ${assetsDir}`);
  return `/assets/${match}`;
}

function copyLogo() {
  const icon = join(root, "src-tauri/icons/icon.png");
  copyFileSync(icon, join(publicDir, "logo.png"));
}

function fallbackIndexHtml() {
  const entry = findAsset("index-");
  const styles = findAsset("styles-");
  const driverCss = readdirSync(assetsDir).find(
    (f) => f.startsWith("driver-") && f.endsWith(".css"),
  );
  const themeScript = `(function(){try{var t=localStorage.getItem('ept_theme');if(t!=='light'&&t!=='dark'){t='dark';}var r=document.documentElement;r.classList.toggle('dark',t==='dark');r.style.colorScheme=t;var m=document.querySelector('meta[name="theme-color"]');if(m){m.setAttribute('content',t==='dark'?'#0B0B0C':'#FDFBF9');}}catch(e){document.documentElement.classList.add('dark');}})();`;

  return `<!DOCTYPE html>
<html lang="en" class="dark" style="color-scheme:dark">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Portfolio Tracker</title>
  <link rel="stylesheet" href="${styles}" />
  ${driverCss ? `<link rel="stylesheet" href="/assets/${driverCss}" />` : ""}
  <link rel="icon" type="image/png" href="/logo.png" />
  <script>${themeScript}</script>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="${entry}"></script>
</body>
</html>`;
}

async function main() {
  copyLogo();
  const html = fallbackIndexHtml();
  writeFileSync(join(publicDir, "index.html"), html, "utf8");
  console.log("[tauri-prepare] Wrote", join(publicDir, "index.html"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
