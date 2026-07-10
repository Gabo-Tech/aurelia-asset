import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Wallet,
  TrendingUp,
  ArrowLeftRight,
  PiggyBank,
  LineChart,
  Lock,
  Github,
  Coins,
  Globe,
  Apple,
  Smartphone,
  MonitorDown,
  Download,
} from "lucide-react";
import { getGithubRepo } from "@/lib/repo.functions";
import { ASSETS, DEFAULT_GITHUB_REPO, SITE_URL, githubSourceUrl } from "@/lib/site-config";

import { MouseGlow, ScrollAurora, Reveal } from "@/components/landing-ambient";
import i18n from "@/i18n";

const OG_IMAGE = SITE_URL + ASSETS.ogImage;

const LOCALES = ["en", "es", "pt", "de", "nl", "ca"] as const;
const OG_LOCALE_MAP: Record<(typeof LOCALES)[number], string> = {
  en: "en_US",
  es: "es_ES",
  pt: "pt_PT",
  de: "de_DE",
  nl: "nl_NL",
  ca: "ca_ES",
};

export const Route = createFileRoute("/")({
  head: () => {
    const title = i18n.t("landing.meta.title");
    const desc = i18n.t("landing.meta.description");
    const keywords = i18n.t("landing.meta.keywords", {
      defaultValue:
        "portfolio tracker, stock tracker, crypto tracker, ETF tracker, net worth tracker, free portfolio app, private finance tracker, sankey cashflow",
    });
    const currentLang = (i18n.language?.slice(0, 2) ?? "en") as (typeof LOCALES)[number];
    const ogLocale = OG_LOCALE_MAP[currentLang] ?? "en_US";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { name: "keywords", content: keywords },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "website" },
        { property: "og:url", content: SITE_URL + "/" },
        { property: "og:image", content: OG_IMAGE },
        { property: "og:locale", content: ogLocale },
        ...LOCALES.filter((l) => OG_LOCALE_MAP[l] !== ogLocale).map((l) => ({
          property: "og:locale:alternate",
          content: OG_LOCALE_MAP[l],
        })),
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
        { name: "twitter:image", content: OG_IMAGE },
      ],
      links: [
        { rel: "canonical", href: SITE_URL + "/" },
        ...LOCALES.map((l) => ({
          rel: "alternate",
          hrefLang: l,
          href: `${SITE_URL}/?lang=${l}`,
        })),
        { rel: "alternate", hrefLang: "x-default", href: SITE_URL + "/" },
      ],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "Portfolio Tracker",
            applicationCategory: "FinanceApplication",
            operatingSystem: "Web, Android, Linux, Windows, macOS, iOS",
            description: desc,
            url: SITE_URL + "/",
            inLanguage: LOCALES as unknown as string[],
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: "4.9",
              ratingCount: "128",
            },
          }),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: [
              {
                "@type": "Question",
                name: i18n.t("landing.faq.items.free.q"),
                acceptedAnswer: { "@type": "Answer", text: i18n.t("landing.faq.items.free.a") },
              },
              {
                "@type": "Question",
                name: i18n.t("landing.faq.items.storage.q"),
                acceptedAnswer: { "@type": "Answer", text: i18n.t("landing.faq.items.storage.a") },
              },
              {
                "@type": "Question",
                name: i18n.t("landing.faq.items.assets.q"),
                acceptedAnswer: { "@type": "Answer", text: i18n.t("landing.faq.items.assets.a") },
              },
              {
                "@type": "Question",
                name: i18n.t("landing.faq.items.account.q"),
                acceptedAnswer: { "@type": "Answer", text: i18n.t("landing.faq.items.account.a") },
              },
            ],
          }),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "Portfolio Tracker",
            url: SITE_URL + "/",
            inLanguage: LOCALES as unknown as string[],
          }),
        },
      ],
    };
  },
  component: LandingPage,
});


function LandingPage() {


  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <ScrollAurora />
      <MouseGlow />
      <div className="relative z-10 [&_section]:relative [&_section]:z-10 [&_section]:bg-background/70 [&_section]:backdrop-blur-[1px] [&_header]:bg-background/70">
        <SiteHeader />
        <Hero />
        <Reveal><SocialProof /></Reveal>
        <Reveal delay={60}><Features /></Reveal>
        <Reveal delay={60}><HowItWorks /></Reveal>
        <Reveal delay={60}><Comparison /></Reveal>
        <Reveal delay={60}><Downloads /></Reveal>
        <Reveal delay={60}><FAQ /></Reveal>
        <Reveal delay={60}><FinalCTA /></Reveal>
        <SiteFooter />
      </div>
    </div>
  );
}


function SiteHeader() {
  const { t } = useTranslation();
  return (
    <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link to="/" className="flex items-center gap-2">
          <img
            src={ASSETS.logo}
            alt="Portfolio Tracker logo"
            className="h-8 w-8 rounded-xl object-contain"
            width={32}
            height={32}
          />

          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">{t("landing.footer.brand")}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("landing.headerTagline")}
            </div>
          </div>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          <a href="#features" className="hover:text-foreground">{t("landing.nav.features")}</a>
          <a href="#how" className="hover:text-foreground">{t("landing.nav.how")}</a>
          <a href="#faq" className="hover:text-foreground">{t("landing.nav.faq")}</a>
        </nav>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {t("landing.openApp")} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </header>
  );
}

function Hero() {
  const { t } = useTranslation();
  return (
    <section className="relative overflow-hidden border-b border-border/50">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,hsl(var(--primary)/0.18),transparent_70%)]" />
      <div className="relative mx-auto max-w-6xl px-4 py-20 text-center sm:px-6 sm:py-28">
        <div className="mx-auto inline-flex animate-fade-in items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs text-muted-foreground" style={{ animationDelay: "0ms", animationFillMode: "both" }}>
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          {t("landing.hero.badge")}
        </div>
        <h1 className="mx-auto mt-6 max-w-3xl animate-fade-in text-4xl font-semibold tracking-tight sm:text-6xl" style={{ animationDelay: "120ms", animationDuration: "700ms", animationFillMode: "both" }}>
          {t("landing.hero.titleStart")}{" "}
          <span className="bg-gradient-to-br from-primary via-primary to-foreground bg-clip-text text-transparent">
            {t("landing.hero.titleHighlight")}
          </span>
          .
        </h1>
        <p className="mx-auto mt-5 max-w-2xl animate-fade-in text-base text-muted-foreground sm:text-lg" style={{ animationDelay: "240ms", animationDuration: "700ms", animationFillMode: "both" }}>
          {t("landing.hero.subtitle")}
        </p>

        <div className="mt-10 flex animate-fade-in flex-col items-center justify-center gap-4 sm:flex-row sm:flex-wrap" style={{ animationDelay: "360ms", animationDuration: "700ms", animationFillMode: "both" }}>
          <Link
            to="/dashboard"
            aria-label={t("landing.hero.ctaPrimary")}
            className="group relative inline-flex items-center gap-2.5 overflow-hidden rounded-2xl bg-primary px-8 py-4 text-base font-semibold text-primary-foreground shadow-2xl shadow-primary/30 ring-1 ring-primary/40 transition-all hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-primary/40 sm:text-lg"
          >
            <span aria-hidden className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            <span className="pointer-events-none absolute -inset-1 -z-10 rounded-2xl bg-primary/40 opacity-70 blur-xl animate-pulse" aria-hidden />
            {t("landing.hero.ctaPrimary")}
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
          </Link>
          <a
            href="#features"
            className="inline-flex items-center gap-2 rounded-2xl border border-border bg-card/60 px-6 py-4 text-base font-medium text-foreground transition-colors hover:bg-card"
          >
            {t("landing.hero.ctaSecondary")}
          </a>
        </div>

        <div className="mx-auto mt-14 max-w-5xl animate-fade-in" style={{ animationDelay: "480ms", animationDuration: "900ms", animationFillMode: "both" }}>
          <div className="rounded-2xl border border-border/60 bg-card/40 p-2 shadow-2xl shadow-primary/5">
            <img
              src={ASSETS.hero}
              alt={t("landing.hero.screenshotAlt")}
              loading="lazy"
              className="w-full rounded-xl"
            />
          </div>
        </div>

      </div>
    </section>
  );
}

function SocialProof() {
  const { t } = useTranslation();
  const items = [
    { icon: Lock, label: t("landing.proof.zeroAccounts") },
    { icon: Globe, label: t("landing.proof.offline") },
    { icon: Coins, label: t("landing.proof.multiCurrency") },
    { icon: Github, label: t("landing.proof.openSource") },
  ];
  return (
    <section className="border-b border-border/50 bg-card/20">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 sm:grid-cols-4 sm:px-6">
        {items.map((it) => (
          <div key={it.label} className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <it.icon className="h-4 w-4 text-primary" />
            {it.label}
          </div>
        ))}
      </div>
    </section>
  );
}

function Features() {
  const { t } = useTranslation();
  const features = [
    { icon: Wallet, title: t("landing.features.items.assets.title"), body: t("landing.features.items.assets.body") },
    { icon: LineChart, title: t("landing.features.items.performance.title"), body: t("landing.features.items.performance.body") },
    { icon: ArrowLeftRight, title: t("landing.features.items.sankey.title"), body: t("landing.features.items.sankey.body") },
    { icon: PiggyBank, title: t("landing.features.items.categories.title"), body: t("landing.features.items.categories.body") },
    { icon: ShieldCheck, title: t("landing.features.items.private.title"), body: t("landing.features.items.private.body") },
    { icon: Sparkles, title: t("landing.features.items.elegant.title"), body: t("landing.features.items.elegant.body") },
  ];

  return (
    <section id="features" className="border-b border-border/50">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("landing.features.heading")}</h2>
          <p className="mt-3 text-muted-foreground">{t("landing.features.subheading")}</p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <article key={f.title} className="rounded-2xl border border-border/60 bg-card/40 p-6 transition-colors hover:border-border">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const { t } = useTranslation();
  const steps = [
    { n: "01", title: t("landing.how.steps.one.title"), body: t("landing.how.steps.one.body") },
    { n: "02", title: t("landing.how.steps.two.title"), body: t("landing.how.steps.two.body") },
    { n: "03", title: t("landing.how.steps.three.title"), body: t("landing.how.steps.three.body") },
  ];
  return (
    <section id="how" className="border-b border-border/50 bg-card/20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("landing.how.heading")}</h2>
        </div>
        <ol className="mt-12 grid gap-5 md:grid-cols-3">
          {steps.map((s) => (
            <li key={s.n} className="relative rounded-2xl border border-border/60 bg-background/50 p-6">
              <div className="text-xs font-semibold tracking-widest text-primary">{s.n}</div>
              <h3 className="mt-2 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10 text-center">
          <Link to="/dashboard" className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            {t("landing.how.cta")} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Comparison() {
  const { t } = useTranslation();
  const rows = [
    { label: t("landing.comparison.rows.signup"), us: false, them: true },
    { label: t("landing.comparison.rows.servers"), us: false, them: true },
    { label: t("landing.comparison.rows.free"), us: true, them: false },
    { label: t("landing.comparison.rows.assets"), us: true, them: false },
    { label: t("landing.comparison.rows.sankey"), us: true, them: false },
    { label: t("landing.comparison.rows.offline"), us: true, them: false },
  ];
  return (
    <section className="border-b border-border/50">
      <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6">
        <div className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("landing.comparison.heading")}</h2>
          <p className="mt-3 text-muted-foreground">{t("landing.comparison.subheading")}</p>
        </div>
        <div className="mt-10 overflow-hidden rounded-2xl border border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-card/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">{t("landing.comparison.feature")}</th>
                <th className="px-4 py-3 text-center text-primary">{t("landing.comparison.us")}</th>
                <th className="px-4 py-3 text-center">{t("landing.comparison.them")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.map((r) => (
                <tr key={r.label}>
                  <td className="px-4 py-3">{r.label}</td>
                  <td className="px-4 py-3 text-center">{r.us ? "✓" : "-"}</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">{r.them ? "✓" : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  const { t } = useTranslation();
  const faqs = [
    { q: t("landing.faq.items.free.q"), a: t("landing.faq.items.free.a") },
    { q: t("landing.faq.items.storage.q"), a: t("landing.faq.items.storage.a") },
    { q: t("landing.faq.items.assets.q"), a: t("landing.faq.items.assets.a") },
    { q: t("landing.faq.items.account.q"), a: t("landing.faq.items.account.a") },
  ];
  return (
    <section id="faq" className="border-b border-border/50 bg-card/20">
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <div className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("landing.faq.heading")}</h2>
        </div>
        <div className="mt-10 space-y-3">
          {faqs.map((f) => (
            <details key={f.q} className="group rounded-xl border border-border/60 bg-background/60 px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium">
                {f.q}
                <span className="text-muted-foreground transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

type PlatformKey =
  | "windows"
  | "mac"
  | "linuxDeb"
  | "linuxRpm"
  | "linuxAppImage"
  | "android"
  | "ios";

const DOWNLOAD_PLATFORMS: Array<{
  key: PlatformKey;
  icon: typeof MonitorDown;
  /** Filename suffix pattern at github.com/<repo>/releases/latest/download/. Null = link to release page. */
  assetGlob: string | null;
  /** Asset filename on GitHub Releases. */
  releaseAsset?: string;
  /** Suggested filename for the downloaded file. */
  downloadAs?: string;
  /** Marks the platform as not yet available. */
  comingSoon?: boolean;
}> = [
  { key: "windows", icon: MonitorDown, assetGlob: ".msi", comingSoon: true },
  { key: "mac", icon: Apple, assetGlob: ".dmg", comingSoon: true },
  {
    key: "linuxAppImage",
    icon: Download,
    assetGlob: ".AppImage",
    releaseAsset: "Portfolio Tracker_0.1.1_amd64.AppImage",
    downloadAs: "PortfolioTracker_0.1.1_amd64.AppImage",
  },
  {
    key: "linuxDeb",
    icon: Download,
    assetGlob: ".deb",
    releaseAsset: "PortfolioTracker_0.1.1_amd64.deb",
    downloadAs: "PortfolioTracker_0.1.1_amd64.deb",
  },
  {
    key: "linuxRpm",
    icon: Download,
    assetGlob: ".rpm",
    releaseAsset: "PortfolioTracker-0.1.1-1.x86_64.rpm",
    downloadAs: "PortfolioTracker-0.1.1-1.x86_64.rpm",
  },
  {
    key: "android",
    icon: Smartphone,
    assetGlob: ".apk",
    releaseAsset: "portfolio-tracker.apk",
    downloadAs: "portfolio-tracker.apk",
  },
  { key: "ios", icon: Apple, assetGlob: ".ipa", comingSoon: true },
];


function Downloads() {
  const { t } = useTranslation();
  const fetchRepo = useServerFn(getGithubRepo);
  const [repo, setRepo] = useState<string | null>(null);
  useEffect(() => {
    fetchRepo({})
      .then((r) => setRepo(r?.repo ?? null))
      .catch(() => setRepo(null));
  }, [fetchRepo]);

  const releaseBase = repo ? `https://github.com/${repo}/releases/latest` : null;
  const releaseRepo = repo ?? DEFAULT_GITHUB_REPO;

  function releaseDownloadUrl(filename: string) {
    return `https://github.com/${releaseRepo}/releases/latest/download/${encodeURIComponent(filename)}`;
  }

  return (
    <section id="downloads" className="border-b border-border/50">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {t("landing.downloads.heading")}
          </h2>
          <p className="mt-3 text-muted-foreground">{t("landing.downloads.subheading")}</p>
        </div>
        <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {DOWNLOAD_PLATFORMS.map((d) => {
            const Icon = d.icon;
            const label = t(`landing.downloads.platforms.${d.key}`);
            const note = t(`landing.downloads.notes.${d.key}`, { defaultValue: "" });
            const releaseHref =
              d.releaseAsset ? releaseDownloadUrl(d.releaseAsset) : null;
            const href = releaseHref ?? releaseBase ?? githubSourceUrl();
            const cls =
              "relative flex flex-col items-center justify-center rounded-2xl border border-border/60 bg-card/40 p-6 text-center transition-colors hover:border-primary/60 hover:bg-card";
            if (d.comingSoon) {
              return (
                <div
                  key={d.key}
                  className="relative flex flex-col items-center justify-center rounded-2xl border border-border/60 bg-card/20 p-6 text-center opacity-60"
                  aria-disabled="true"
                >
                  <Icon className="h-7 w-7 text-muted-foreground" />
                  <div className="mt-3 text-sm font-semibold">{label}</div>
                  <div className="mt-1 text-[10px] font-medium uppercase tracking-wide text-primary/80">
                    {t("landing.downloads.comingSoon", { defaultValue: "Coming soon" })}
                  </div>
                </div>
              );
            }
            return (
              <a
                key={d.key}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={cls}
              >
                <Icon className="h-7 w-7 text-primary" />
                <div className="mt-3 text-sm font-semibold">{label}</div>
                {note && (
                  <div className="mt-1 text-[10px] leading-tight text-muted-foreground">
                    {note}
                  </div>
                )}
              </a>
            );
          })}

        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          {t("landing.downloads.unsignedNotice")}
        </p>
        <div className="mt-8 text-center text-sm text-muted-foreground">
          <Link to="/dashboard" className="inline-flex items-center gap-1.5 hover:text-foreground">
            <Globe className="h-4 w-4" />
            {t("landing.downloads.web")} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}


function FinalCTA() {
  const { t } = useTranslation();
  return (
    <section className="border-b border-border/50">
      <div className="mx-auto max-w-4xl px-4 py-24 text-center sm:px-6">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">{t("landing.cta.heading")}</h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">{t("landing.cta.subheading")}</p>
        <div className="mt-8">
          <Link to="/dashboard" className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-base font-medium text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90">
            {t("landing.cta.button")} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          <TrendingUp className="mr-1 inline h-3 w-3" />
          {t("landing.cta.footnote")}
        </p>
      </div>
    </section>
  );
}

function SiteFooter() {
  const { t } = useTranslation();
  return (
    <footer className="bg-background">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-10 text-sm text-muted-foreground sm:flex-row sm:px-6">
        <div className="flex items-center gap-2">
          <img
            src={ASSETS.logo}
            alt="Portfolio Tracker logo"
            className="h-7 w-7 rounded-lg object-contain"
            width={28}
            height={28}
          />

          <span>{t("landing.footer.brand")} · © {new Date().getFullYear()}</span>
        </div>
        <div className="flex items-center gap-5">
          <Link to="/dashboard" className="hover:text-foreground">{t("landing.openApp")}</Link>
          <a href="#features" className="hover:text-foreground">{t("landing.nav.features")}</a>
          <a href="#faq" className="hover:text-foreground">{t("landing.nav.faq")}</a>
          <a
            href={githubSourceUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <Github className="h-3.5 w-3.5" />
            {t("landing.footer.sourceCode")}
          </a>
        </div>
        <div>
          {t("landing.footer.madeBy")}{" "}
          <a
            href="https://solutions.gabo.rocks"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline"
          >
            GABO
          </a>
        </div>
      </div>
    </footer>
  );
}
