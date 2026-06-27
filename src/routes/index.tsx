import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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

import i18n from "@/i18n";

const SITE_URL = "https://financetracker.putopulse.org";
const OG_IMAGE =
  "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/1d9991ee-e308-44b0-ad20-1eb489a2da74/id-preview-4950e4f3--c8e820b7-6ae8-4377-943a-0e5181cbbc73.lovable.app-1781927384080.png";

export const Route = createFileRoute("/")({
  head: () => {
    const title = i18n.t("landing.meta.title");
    const desc = i18n.t("landing.meta.description");
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { name: "keywords", content: "portfolio tracker, stock tracker, crypto tracker, ETF tracker, net worth tracker, free portfolio app, private finance tracker, sankey cashflow" },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "website" },
        { property: "og:url", content: SITE_URL + "/" },
        { property: "og:image", content: OG_IMAGE },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
        { name: "twitter:image", content: OG_IMAGE },
      ],
      links: [{ rel: "canonical", href: SITE_URL + "/" }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "Portfolio Tracker",
            applicationCategory: "FinanceApplication",
            operatingSystem: "Web",
            description: desc,
            url: SITE_URL + "/",
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: "4.9",
              ratingCount: "128",
            },
          }),
        },
      ],
    };
  },
  component: LandingPage,
});

function LandingPage() {
  const navigate = useNavigate();
  useEffect(() => {
    try {
      if (typeof window !== "undefined" && window.localStorage.getItem("ept_state_v1")) {
        navigate({ to: "/dashboard", replace: true });
      }
    } catch {}
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <Hero />
      <SocialProof />
      <Features />
      <HowItWorks />
      <Comparison />
      <Downloads />
      <FAQ />
      <FinalCTA />

      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  const { t } = useTranslation();
  return (
    <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-primary/15 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
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
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          {t("landing.hero.badge")}
        </div>
        <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
          {t("landing.hero.titleStart")}{" "}
          <span className="bg-gradient-to-br from-primary via-primary to-foreground bg-clip-text text-transparent">
            {t("landing.hero.titleHighlight")}
          </span>
          .
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
          {t("landing.hero.subtitle")}
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90"
          >
            {t("landing.hero.ctaPrimary")} <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="#features"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card/60 px-5 py-3 text-sm font-medium text-foreground hover:bg-card"
          >
            {t("landing.hero.ctaSecondary")}
          </a>
        </div>

        <div className="mx-auto mt-14 max-w-5xl">
          <div className="rounded-2xl border border-border/60 bg-card/40 p-2 shadow-2xl shadow-primary/5">
            <img
              src={OG_IMAGE}
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
                  <td className="px-4 py-3 text-center">{r.us ? "✓" : "—"}</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">{r.them ? "✓" : "—"}</td>
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

const RELEASES_BASE = "https://github.com/gabovega/portfolio-tracker/releases/latest/download";
const DOWNLOADS: Array<{
  key: "windows" | "mac" | "linuxDeb" | "linuxRpm" | "linuxAppImage" | "android" | "ios";
  icon: typeof MonitorDown;
  href: string | null;
}> = [
  { key: "windows", icon: MonitorDown, href: `${RELEASES_BASE}/PortfolioTracker-setup.exe` },
  { key: "mac", icon: Apple, href: `${RELEASES_BASE}/PortfolioTracker.dmg` },
  { key: "linuxAppImage", icon: Download, href: `${RELEASES_BASE}/PortfolioTracker.AppImage` },
  { key: "linuxDeb", icon: Download, href: `${RELEASES_BASE}/portfolio-tracker.deb` },
  { key: "linuxRpm", icon: Download, href: `${RELEASES_BASE}/portfolio-tracker.rpm` },
  { key: "android", icon: Smartphone, href: null },
  { key: "ios", icon: Apple, href: null },
];

function Downloads() {
  const { t } = useTranslation();
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
          {DOWNLOADS.map((d) => {
            const Icon = d.icon;
            const label = t(`landing.downloads.platforms.${d.key}`);
            const disabled = !d.href;
            const inner = (
              <>
                <Icon className="h-7 w-7 text-primary" />
                <div className="mt-3 text-sm font-semibold">{label}</div>
                {disabled && (
                  <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {t("landing.downloads.soon")}
                  </div>
                )}
              </>
            );
            const cls =
              "flex flex-col items-center justify-center rounded-2xl border border-border/60 bg-card/40 p-6 text-center transition-colors";
            return disabled ? (
              <div key={d.key} className={`${cls} opacity-60`} aria-disabled>
                {inner}
              </div>
            ) : (
              <a
                key={d.key}
                href={d.href!}
                rel="noopener"
                className={`${cls} hover:border-primary/60 hover:bg-card`}
              >
                {inner}
              </a>
            );
          })}
        </div>
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
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-primary/15 text-primary">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <span>{t("landing.footer.brand")} · © {new Date().getFullYear()}</span>
        </div>
        <div className="flex items-center gap-5">
          <Link to="/dashboard" className="hover:text-foreground">{t("landing.openApp")}</Link>
          <a href="#features" className="hover:text-foreground">{t("landing.nav.features")}</a>
          <a href="#faq" className="hover:text-foreground">{t("landing.nav.faq")}</a>
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
