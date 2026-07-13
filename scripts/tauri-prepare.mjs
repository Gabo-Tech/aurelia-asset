/**
 * Post-build step for Tauri: generate index.html and copy static assets
 * needed when serving the TanStack Start client bundle without a server.
 *
 * Critical: TanStack Start's hydrate() requires window.$_TSR bootstrap data
 * (normally injected by SSR). Without it the app throws "Invariant failed"
 * and shows a blank/error screen in the Android/desktop WebView.
 *
 * Match ids are `route.id + interpolatedPath` (e.g. root → `__root__/`).
 * SPA shell dehydrates only the root match and sets lastMatchId to that id.
 */
import { copyFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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

function copyBrandAssets() {
  const icons = join(root, "src-tauri/icons");
  const publicRoot = join(root, "public");
  // Prefer committed public/ assets when present; fall back to Tauri icon set.
  const copies = [
    ["icon.png", "logo.png"],
    ["icon.ico", "favicon.ico"],
    ["32x32.png", "favicon-32x32.png"],
    ["64x64.png", "favicon-64x64.png"],
  ];
  for (const [srcName, destName] of copies) {
    const fromPublic = join(publicRoot, destName);
    const fromIcons = join(icons, srcName);
    try {
      copyFileSync(fromPublic, join(publicDir, destName));
    } catch {
      copyFileSync(fromIcons, join(publicDir, destName));
    }
  }
  for (const name of ["apple-touch-icon.png", "icon-192.png", "icon-512.png"]) {
    try {
      copyFileSync(join(publicRoot, name), join(publicDir, name));
    } catch {
      /* optional */
    }
  }
}

/** Minimal SPA-shell bootstrap so hydrate() enters SPA mode instead of throwing. */
function tsrBootstrapScript() {
  // Root match id = `__root__` + interpolatedPath `/` → `__root__/`
  return `(function(){window.__TSS_TAURI_SPA__=true;if(window.$_TSR)return;var n=function(){};window.$_TSR={buffer:[],initialized:false,h:n,e:n,c:n,p:function(f){try{f()}catch(e){}},router:{manifest:undefined,dehydratedData:undefined,matches:[{i:'__root__/',s:'success',u:Date.now(),ssr:true}],lastMatchId:'__root__/'}};})();`;
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
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
  <script>${themeScript}</script>
  <script>${tsrBootstrapScript()}</script>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="${entry}"></script>
</body>
</html>`;
}

async function main() {
  copyBrandAssets();
  // Release installers in public/downloads must not ship inside the desktop bundle.
  rmSync(join(publicDir, "downloads"), { recursive: true, force: true });
  const html = fallbackIndexHtml();
  writeFileSync(join(publicDir, "index.html"), html, "utf8");
  console.log("[tauri-prepare] Wrote", join(publicDir, "index.html"), "(with $_TSR SPA bootstrap)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
