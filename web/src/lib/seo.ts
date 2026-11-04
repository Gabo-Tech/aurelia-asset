import { ASSETS, SITE_URL, githubSourceUrl } from "@/lib/site-config";

/** Absolute 1200×630 PNG used for Open Graph and Twitter cards. */
export const OG_IMAGE_URL = `${SITE_URL}${ASSETS.ogImage}`;
export const OG_IMAGE_WIDTH = "1200";
export const OG_IMAGE_HEIGHT = "630";

/** Tool screens. Crawlable so the noindex tag is seen, and omitted from the sitemap. */
export const APP_NOINDEX_PATHS = [
  "/dashboard",
  "/holdings",
  "/performance",
  "/cashflow",
  "/planning",
  "/assistant",
  "/settings",
  "/admin",
] as const;

export const MARKETING_PATHS = [
  "/",
  "/private-net-worth-tracker",
  "/alternative-to-kubera-empower-ghostfolio",
] as const;

export const NOINDEX_ROBOTS = { name: "robots", content: "noindex, nofollow" } as const;

export function absoluteUrl(path: string): string {
  if (path === "/" || path === "") return `${SITE_URL}/`;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${normalized}`;
}

export function isMarketingPath(pathname: string): boolean {
  const path =
    pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname || "/";
  return (MARKETING_PATHS as readonly string[]).includes(path);
}

export function isAppNoindexPath(pathname: string): boolean {
  const path =
    pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname || "/";
  if (path.startsWith("/api/")) return true;
  return (APP_NOINDEX_PATHS as readonly string[]).includes(path);
}

export function socialMeta(opts: { title: string; description: string; path: string }) {
  const url = absoluteUrl(opts.path);
  return {
    meta: [
      { title: opts.title },
      { name: "description", content: opts.description },
      { property: "og:title", content: opts.title },
      { property: "og:description", content: opts.description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: url },
      { property: "og:image", content: OG_IMAGE_URL },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:width", content: OG_IMAGE_WIDTH },
      { property: "og:image:height", content: OG_IMAGE_HEIGHT },
      { property: "og:image:alt", content: opts.title },
      { property: "og:locale", content: "en_US" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: opts.title },
      { name: "twitter:description", content: opts.description },
      { name: "twitter:image", content: OG_IMAGE_URL },
      { name: "twitter:image:alt", content: opts.title },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}

export function softwareApplicationJsonLd(description: string) {
  return {
    "@context": "https://schema.org",
    "@type": ["SoftwareApplication", "WebApplication"],
    "@id": `${SITE_URL}/#app`,
    name: "Aurelia",
    applicationCategory: "FinanceApplication",
    applicationSubCategory: "Net worth tracker",
    operatingSystem: "Web, Android, Linux",
    description,
    url: `${SITE_URL}/`,
    image: OG_IMAGE_URL,
    isAccessibleForFree: true,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    license: "https://www.gnu.org/licenses/agpl-3.0.html",
    codeRepository: githubSourceUrl(),
    featureList: [
      "Private net worth tracker with no signup",
      "On-device holdings, cashflow, budgets, and loans",
      "AES-GCM encryption for local data",
      "Free, with no paid tier",
    ],
    author: {
      "@type": "Person",
      name: "Gabriel Clemente",
      url: "https://gabo.is-a.dev",
    },
  };
}

export function webPageJsonLd(opts: { title: string; description: string; path: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: opts.title,
    description: opts.description,
    url: absoluteUrl(opts.path),
    inLanguage: "en",
    isPartOf: {
      "@type": "WebSite",
      name: "Aurelia",
      url: `${SITE_URL}/`,
    },
    about: { "@id": `${SITE_URL}/#app` },
  };
}

export function faqJsonLd(items: ReadonlyArray<{ q: string; a: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

export function jsonLdScript(data: unknown) {
  return {
    type: "application/ld+json",
    children: JSON.stringify(data),
  };
}
