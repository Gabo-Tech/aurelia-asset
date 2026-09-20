import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
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
  Package,
} from "lucide-react";
import { ASSETS, SITE_URL, githubRepoUrl, githubSourceUrl } from "@/lib/site-config";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { AppCard, AppCardContent, AppCardHeader } from "@/components/design";
import { MouseGlow, ScrollAurora, Reveal } from "@/components/landing-ambient";
import { cn } from "@/lib/utils";
import i18n from "@/i18n";
import { useLanguage } from "@/i18n/use-language";
import type { LanguageCode } from "@/i18n";

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
    const keywords = i18n.t("landing.meta.keywords");
    const currentLang = (i18n.language?.slice(0, 2) ?? "en") as (typeof LOCALES)[number];
    const ogLocale = OG_LOCALE_MAP[currentLang] ?? "en_US";
    const faqKeys = ["free", "storage", "assets", "account", "platforms", "license"] as const;
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
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:image:alt", content: title },
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
            name: "Aurelia",
            applicationCategory: "FinanceApplication",
            operatingSystem: "Web, Android, Linux",
            description: desc,
            url: SITE_URL + "/",
            inLanguage: LOCALES as unknown as string[],
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            license: "https://www.gnu.org/licenses/agpl-3.0.html",
            codeRepository: githubSourceUrl(),
          }),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqKeys.map((key) => ({
              "@type": "Question",
              name: i18n.t(`landing.faq.items.${key}.q`),
              acceptedAnswer: {
                "@type": "Answer",
                text: i18n.t(`landing.faq.items.${key}.a`),
              },
            })),
          }),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "Aurelia",
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
      <div className="relative z-10">
        <SiteHeader />
        <Hero />
        <Reveal>
          <SocialProof />
        </Reveal>
        <Reveal delay={60}>
          <Features />
        </Reveal>
        <Reveal delay={60}>
          <HowItWorks />
        </Reveal>
        <Reveal delay={60}>
          <Comparison />
        </Reveal>
        <Reveal delay={60}>
          <Downloads />
        </Reveal>
        <Reveal delay={60}>
          <FAQ />
        </Reveal>
        <Reveal delay={60}>
          <FinalCTA />
        </Reveal>
        <SiteFooter />
      </div>
    </div>
  );
}

function SiteHeader() {
  const { t } = useTranslation();
  const { language, setLanguage, languages } = useLanguage();
  return (
    <header className="sticky top-0 z-40 border-b border-border/50 glass">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <Link to="/" className="flex min-w-0 items-center gap-2">
          <img
            src={ASSETS.logo}
            alt={t("landing.logoAlt")}
            className="h-9 w-9 rounded-xl object-contain"
            width={36}
            height={36}
          />
          <div className="min-w-0 leading-tight">
            <div className="text-sm font-semibold tracking-tight">{t("landing.footer.brand")}</div>
            <div className="truncate text-xs text-muted-foreground">{t("landing.headerTagline")}</div>
          </div>
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground lg:flex">
          <a href="#features" className="hover:text-foreground">
            {t("landing.nav.features")}
          </a>
          <a href="#how" className="hover:text-foreground">
            {t("landing.nav.how")}
          </a>
          <a href="#downloads" className="hover:text-foreground">
            {t("landing.nav.downloads", { defaultValue: "Download" })}
          </a>
          <a href="#faq" className="hover:text-foreground">
            {t("landing.nav.faq")}
          </a>
        </nav>
        <div className="flex items-center gap-1">
          <label className="sr-only" htmlFor="landing-lang">
            Language
          </label>
          <select
            id="landing-lang"
            value={language}
            onChange={(e) => setLanguage(e.target.value as LanguageCode)}
            className="h-11 max-w-[7.5rem] rounded-xl border border-border/60 bg-transparent px-2 text-xs text-muted-foreground hover:text-foreground"
            aria-label="Language"
          >
            {languages.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
          <ThemeToggle className="h-11 w-11" />
          <Button asChild size="sm" className="min-h-11 px-4">
            <Link to="/dashboard">
              {t("landing.openApp")} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  const { t } = useTranslation();
  return (
    <section className="relative overflow-hidden border-b border-border/50">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_srgb,var(--primary)_18%,transparent),transparent_70%)]" />
      <div className="relative mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 sm:py-28">
        <div
          className="mx-auto inline-flex animate-fade-in items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs text-muted-foreground shadow-sm"
          style={{ animationDelay: "0ms", animationFillMode: "both" }}
        >
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          {t("landing.hero.badge")}
        </div>
        <h1
          className="font-display mx-auto mt-6 max-w-3xl animate-fade-in text-4xl tracking-tight sm:text-6xl"
          style={{ animationDelay: "120ms", animationDuration: "700ms", animationFillMode: "both" }}
        >
          {t("landing.hero.titleStart")}{" "}
          <span className="bg-gradient-to-br from-primary via-primary to-foreground bg-clip-text text-transparent">
            {t("landing.hero.titleHighlight")}
          </span>
          .
        </h1>
        <p
          className="mx-auto mt-5 max-w-2xl animate-fade-in text-base text-muted-foreground sm:text-lg"
          style={{ animationDelay: "240ms", animationDuration: "700ms", animationFillMode: "both" }}
        >
          {t("landing.hero.subtitle")}
        </p>

        <div
          className="mt-10 flex animate-fade-in flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap"
          style={{ animationDelay: "360ms", animationDuration: "700ms", animationFillMode: "both" }}
        >
          <Button asChild size="lg" className="min-h-12 px-6 text-base">
            <Link to="/dashboard" aria-label={t("landing.hero.ctaPrimary")}>
              {t("landing.hero.ctaPrimary")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="min-h-12 px-6 text-base">
            <a href="#downloads">{t("landing.hero.ctaDownload", { defaultValue: "Download the app" })}</a>
          </Button>
          <Button asChild size="lg" variant="ghost" className="min-h-12 px-6 text-base">
            <a href="#features">{t("landing.hero.ctaSecondary")}</a>
          </Button>
        </div>

        <div
          className="mx-auto mt-14 max-w-5xl animate-fade-in"
          style={{ animationDelay: "480ms", animationDuration: "900ms", animationFillMode: "both" }}
        >
          <AppCard elevated className="p-2">
            <img
              src={ASSETS.hero}
              alt={t("landing.hero.screenshotAlt")}
              loading="lazy"
              className="w-full rounded-xl"
            />
          </AppCard>
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
          <div
            key={it.label}
            className="flex items-center justify-center gap-2 text-sm text-muted-foreground"
          >
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
    {
      icon: Wallet,
      title: t("landing.features.items.assets.title"),
      body: t("landing.features.items.assets.body"),
    },
    {
      icon: LineChart,
      title: t("landing.features.items.performance.title"),
      body: t("landing.features.items.performance.body"),
    },
    {
      icon: ArrowLeftRight,
      title: t("landing.features.items.sankey.title"),
      body: t("landing.features.items.sankey.body"),
    },
    {
      icon: PiggyBank,
      title: t("landing.features.items.categories.title"),
      body: t("landing.features.items.categories.body"),
    },
    {
      icon: ShieldCheck,
      title: t("landing.features.items.private.title"),
      body: t("landing.features.items.private.body"),
    },
    {
      icon: Sparkles,
      title: t("landing.features.items.elegant.title"),
      body: t("landing.features.items.elegant.body"),
    },
  ];

  return (
    <section id="features" className="border-b border-border/50">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
            {t("landing.features.heading")}
          </h2>
          <p className="mt-3 text-muted-foreground">{t("landing.features.subheading")}</p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <AppCard key={f.title}>
              <AppCardHeader>
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-3 text-base font-semibold text-foreground">{f.title}</h3>
              </AppCardHeader>
              <AppCardContent>
                <p className="text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </AppCardContent>
            </AppCard>
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
          <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
            {t("landing.how.heading")}
          </h2>
        </div>
        <ol className="mt-12 grid gap-4 md:grid-cols-3">
          {steps.map((s) => (
            <li key={s.n}>
              <AppCard className="h-full">
                <AppCardHeader>
                  <div className="text-xs font-semibold tracking-widest text-primary">{s.n}</div>
                  <h3 className="text-lg font-semibold text-foreground">{s.title}</h3>
                </AppCardHeader>
                <AppCardContent>
                  <p className="text-sm text-muted-foreground">{s.body}</p>
                </AppCardContent>
              </AppCard>
            </li>
          ))}
        </ol>
        <div className="mt-10 text-center">
          <Button asChild>
            <Link to="/dashboard">
              {t("landing.how.cta")} <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
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
          <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
            {t("landing.comparison.heading")}
          </h2>
          <p className="mt-3 text-muted-foreground">{t("landing.comparison.subheading")}</p>
        </div>
        <AppCard className="mt-10 overflow-x-auto">
          <table className="w-full min-w-[320px] text-sm">
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
                  <td className="px-4 py-3 text-center text-muted-foreground">
                    {r.them ? "✓" : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </AppCard>
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
    { q: t("landing.faq.items.platforms.q"), a: t("landing.faq.items.platforms.a") },
    { q: t("landing.faq.items.license.q"), a: t("landing.faq.items.license.a") },
  ];
  return (
    <section id="faq" className="border-b border-border/50 bg-card/20">
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <div className="text-center">
          <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
            {t("landing.faq.heading")}
          </h2>
        </div>
        <div className="mt-10 space-y-3">
          {faqs.map((f) => (
            <details
              key={f.q}
              className="group rounded-2xl border border-border/40 bg-card/80 px-5 py-4"
            >
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium">
                {f.q}
                <span className="text-muted-foreground transition-transform group-open:rotate-45">
                  +
                </span>
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
  "windows" | "mac" | "linuxDeb" | "linuxRpm" | "linuxAppImage" | "android" | "ios";

const DOWNLOAD_PLATFORMS: Array<{
  key: PlatformKey;
  icon: typeof MonitorDown;
  /** Asset filename on GitHub Releases /latest/download and /downloads/. */
  releaseAsset?: string;
  comingSoon?: boolean;
}> = [
  {
    key: "linuxAppImage",
    icon: Download,
    releaseAsset: "Aurelia_0.1.2_amd64.AppImage",
  },
  {
    key: "linuxDeb",
    icon: Package,
    releaseAsset: "Aurelia_0.1.2_amd64.deb",
  },
  {
    key: "linuxRpm",
    icon: Package,
    releaseAsset: "Aurelia-0.1.2-1.x86_64.rpm",
  },
  {
    key: "android",
    icon: Smartphone,
    releaseAsset: "portfolio-tracker.apk",
  },
  { key: "windows", icon: MonitorDown, comingSoon: true },
  { key: "mac", icon: Apple, comingSoon: true },
  { key: "ios", icon: Apple, comingSoon: true },
];

function githubDownloadUrl(filename: string) {
  return `${githubRepoUrl()}/releases/latest/download/${encodeURIComponent(filename)}`;
}

function detectRecommended(): PlatformKey | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Win/i.test(ua)) return "windows";
  if (/Mac/i.test(ua)) return "mac";
  if (/Linux/i.test(ua)) {
    if (/Ubuntu|Debian|Mint/i.test(ua)) return "linuxDeb";
    if (/Fedora|Red Hat|SUSE/i.test(ua)) return "linuxRpm";
    return "linuxAppImage";
  }
  return null;
}

function Downloads() {
  const { t } = useTranslation();
  const [recommended, setRecommended] = useState<PlatformKey | null>(null);
  useEffect(() => {
    setRecommended(detectRecommended());
  }, []);

  const available = DOWNLOAD_PLATFORMS.filter((d) => !d.comingSoon);
  const soon = DOWNLOAD_PLATFORMS.filter((d) => d.comingSoon);

  return (
    <section id="downloads" className="border-b border-border/50">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
            {t("landing.downloads.heading")}
          </h2>
          <p className="mt-3 text-muted-foreground">{t("landing.downloads.subheading")}</p>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {available.map((d) => {
            const Icon = d.icon;
            const label = t(`landing.downloads.platforms.${d.key}`);
            const note = t(`landing.downloads.notes.${d.key}`, { defaultValue: "" });
            const href = d.releaseAsset ? githubDownloadUrl(d.releaseAsset) : githubSourceUrl();
            const isRecommended = recommended === d.key;
            return (
              <AppCard
                key={d.key}
                className={cn(
                  "flex flex-col sm:flex-row sm:items-center gap-4 p-5",
                  isRecommended && "border-primary/40 ring-1 ring-primary/20",
                )}
              >
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold">{label}</div>
                    {isRecommended ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                        {t("landing.downloads.recommended", { defaultValue: "For this device" })}
                      </span>
                    ) : null}
                  </div>
                  {note ? <p className="mt-1 text-xs text-muted-foreground">{note}</p> : null}
                </div>
                <Button asChild className="min-h-11 w-full sm:w-auto">
                  <a href={href} download={d.releaseAsset} rel="noopener noreferrer">
                    <Download className="h-4 w-4" />
                    {t("landing.downloads.action", { defaultValue: "Download" })}
                  </a>
                </Button>
              </AppCard>
            );
          })}
        </div>
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {soon.map((d) => {
            const Icon = d.icon;
            const label = t(`landing.downloads.platforms.${d.key}`);
            return (
              <div
                key={d.key}
                className="flex items-center gap-3 rounded-2xl border border-border/40 bg-card/40 px-4 py-3 opacity-70"
                aria-disabled="true"
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{label}</div>
                  <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {t("landing.downloads.comingSoon")}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          {t("landing.downloads.unsignedNotice")}
        </p>
        <div className="mt-8 text-center">
          <Button asChild variant="ghost">
            <Link to="/dashboard">
              <Globe className="h-4 w-4" />
              {t("landing.downloads.web")} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
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
        <h2 className="font-display text-3xl tracking-tight sm:text-5xl">
          {t("landing.cta.heading")}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">{t("landing.cta.subheading")}</p>
        <div className="mt-8">
          <Button asChild size="lg" className="min-h-12 px-6 text-base">
            <Link to="/dashboard">
              {t("landing.cta.button")} <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
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
            alt={t("landing.logoAlt")}
            className="h-7 w-7 rounded-lg object-contain"
            width={28}
            height={28}
          />

          <span>
            {t("landing.footer.brand")} · © {new Date().getFullYear()}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-5">
          <Link to="/dashboard" className="hover:text-foreground">
            {t("landing.openApp")}
          </Link>
          <a href="#downloads" className="hover:text-foreground">
            {t("landing.nav.downloads", { defaultValue: "Download" })}
          </a>
          <a href="#features" className="hover:text-foreground">
            {t("landing.nav.features")}
          </a>
          <a href="#faq" className="hover:text-foreground">
            {t("landing.nav.faq")}
          </a>
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
