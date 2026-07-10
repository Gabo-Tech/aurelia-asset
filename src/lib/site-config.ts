/** Public site URL for canonical links, OG tags, and SEO. Override via SITE_URL env. */
export const SITE_URL =
  (typeof process !== "undefined" && process.env.SITE_URL) ||
  "https://financetracker.putopulse.org";

/** Static asset paths served from /public. */
export const ASSETS = {
  logo: "/logo.png",
  hero: "/landing-hero.png",
  ogImage: "/og-image.png",
  favicon: "/favicon.ico",
} as const;

/** AGPL source disclosure — default OSS repo when GITHUB_REPO is unset. */
export const DEFAULT_GITHUB_REPO = "Gabo-Tech/aurelia-asset";

export function githubRepoUrl(repo: string = DEFAULT_GITHUB_REPO) {
  return `https://github.com/${repo}`;
}

export function githubSourceUrl(repo: string = DEFAULT_GITHUB_REPO) {
  return `${githubRepoUrl(repo)}`;
}
