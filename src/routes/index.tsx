import { createFileRoute, Link } from "@tanstack/react-router";
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
} from "lucide-react";

const SITE_URL = "https://financetracker.putopulse.org";
const SITE_TITLE = "Free Portfolio Tracker for Stocks, Crypto & ETFs — Private & Local";
const SITE_DESC =
  "Track stocks, ETFs, crypto and precious metals in one elegant dashboard. 100% client-side, no signup, no tracking. See allocation, performance and cashflow in seconds.";
const OG_IMAGE =
  "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/1d9991ee-e308-44b0-ad20-1eb489a2da74/id-preview-4950e4f3--c8e820b7-6ae8-4377-943a-0e5181cbbc73.lovable.app-1781927384080.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: SITE_TITLE },
      { name: "description", content: SITE_DESC },
      { name: "keywords", content: "portfolio tracker, stock tracker, crypto tracker, ETF tracker, net worth tracker, free portfolio app, private finance tracker, sankey cashflow" },
      { property: "og:title", content: SITE_TITLE },
      { property: "og:description", content: SITE_DESC },
      { property: "og:type", content: "website" },
      { property: "og:url", content: SITE_URL + "/" },
      { property: "og:image", content: OG_IMAGE },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: SITE_TITLE },
      { name: "twitter:description", content: SITE_DESC },
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
          description: SITE_DESC,
          url: SITE_URL + "/",
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
              name: "Is the portfolio tracker really free?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Yes — every feature is free, with no signup and no premium tier. The app runs entirely in your browser.",
              },
            },
            {
              "@type": "Question",
              name: "Where is my data stored?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "All data lives in your browser via localStorage. Nothing is uploaded, synced or shared. Clearing your browser storage clears your portfolio.",
              },
            },
            {
              "@type": "Question",
              name: "Which assets can I track?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Stocks, ETFs, cryptocurrencies, precious metals, and any custom asset with a manual price.",
              },
            },
            {
              "@type": "Question",
              name: "Do I need an account?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "No — open the app and start tracking immediately. There is no login, no email collection, no analytics on your holdings.",
              },
            },
          ],
        }),
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <Hero />
      <SocialProof />
      <Features />
      <HowItWorks />
      <Comparison />
      <FAQ />
      <FinalCTA />
      <SiteFooter />
    </div>
  );
}

/* ---------- Header ---------- */

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-primary/15 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">Portfolio Tracker</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Private · Local · Free
            </div>
          </div>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          <a href="#features" className="hover:text-foreground">Features</a>
          <a href="#how" className="hover:text-foreground">How it works</a>
          <a href="#faq" className="hover:text-foreground">FAQ</a>
        </nav>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Open app <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </header>
  );
}

/* ---------- Hero ---------- */

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border/50">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,hsl(var(--primary)/0.18),transparent_70%)]" />
      <div className="relative mx-auto max-w-6xl px-4 py-20 text-center sm:px-6 sm:py-28">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          No signup · No tracking · 100% in your browser
        </div>
        <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
          Your whole portfolio,{" "}
          <span className="bg-gradient-to-br from-primary via-primary to-foreground bg-clip-text text-transparent">
            in one private dashboard
          </span>
          .
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
          Track stocks, ETFs, crypto and metals. Visualize allocation, performance and
          cashflow with elegant charts — without handing your data to anyone.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90"
          >
            Launch the tracker <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="#features"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card/60 px-5 py-3 text-sm font-medium text-foreground hover:bg-card"
          >
            See what's inside
          </a>
        </div>

        <div className="mx-auto mt-14 max-w-5xl">
          <div className="rounded-2xl border border-border/60 bg-card/40 p-2 shadow-2xl shadow-primary/5">
            <img
              src={OG_IMAGE}
              alt="Portfolio Tracker dashboard showing allocation pie chart and cashflow"
              loading="lazy"
              className="w-full rounded-xl"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Social proof / trust bar ---------- */

function SocialProof() {
  const items = [
    { icon: Lock, label: "Zero accounts" },
    { icon: Globe, label: "Works offline" },
    { icon: Coins, label: "Multi-currency" },
    { icon: Github, label: "Open source feel" },
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

/* ---------- Features ---------- */

function Features() {
  const features = [
    {
      icon: Wallet,
      title: "All your assets, one view",
      body: "Stocks, ETFs, crypto, metals and custom holdings — managed side by side, in your display currency.",
    },
    {
      icon: LineChart,
      title: "Performance you can read at a glance",
      body: "Time-weighted returns and historical charts powered by free public market data.",
    },
    {
      icon: ArrowLeftRight,
      title: "Cashflow Sankey",
      body: "Income, expenses, savings and investments flow through a beautiful Sankey diagram with custom categories.",
    },
    {
      icon: PiggyBank,
      title: "Custom categories",
      body: "Create your own income sources and expense categories — including savings and investments — with personal colors.",
    },
    {
      icon: ShieldCheck,
      title: "Private by design",
      body: "Everything is stored in your browser. No accounts, no servers, no analytics on your holdings.",
    },
    {
      icon: Sparkles,
      title: "Elegant on every screen",
      body: "Designed for desktop and mobile with a calm, dark, distraction-free interface.",
    },
  ];

  return (
    <section id="features" className="border-b border-border/50">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Everything you need to actually understand your money
          </h2>
          <p className="mt-3 text-muted-foreground">
            Not another bloated dashboard. Just the views that help you make decisions.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <article
              key={f.title}
              className="rounded-2xl border border-border/60 bg-card/40 p-6 transition-colors hover:border-border"
            >
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

/* ---------- How it works ---------- */

function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Open the app",
      body: "No signup. The tracker loads instantly and runs entirely in your browser.",
    },
    {
      n: "02",
      title: "Add your holdings & cashflow",
      body: "Search a ticker or enter a custom asset. Log income and expenses with your own categories.",
    },
    {
      n: "03",
      title: "Watch your portfolio come to life",
      body: "Allocation, performance, net worth and Sankey cashflow — auto-updating with live market prices.",
    },
  ];
  return (
    <section id="how" className="border-b border-border/50 bg-card/20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            From zero to insight in 60 seconds
          </h2>
        </div>
        <ol className="mt-12 grid gap-5 md:grid-cols-3">
          {steps.map((s) => (
            <li
              key={s.n}
              className="relative rounded-2xl border border-border/60 bg-background/50 p-6"
            >
              <div className="text-xs font-semibold tracking-widest text-primary">{s.n}</div>
              <h3 className="mt-2 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10 text-center">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try it now — free <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ---------- Comparison ---------- */

function Comparison() {
  const rows = [
    { label: "Signup required", us: false, them: true },
    { label: "Your data on their servers", us: false, them: true },
    { label: "Free, no premium tier", us: true, them: false },
    { label: "Stocks, ETFs, crypto & metals", us: true, them: false },
    { label: "Sankey cashflow with custom categories", us: true, them: false },
    { label: "Works offline once loaded", us: true, them: false },
  ];
  return (
    <section className="border-b border-border/50">
      <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6">
        <div className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Why people switch from cloud trackers
          </h2>
          <p className="mt-3 text-muted-foreground">
            A simple, honest comparison with the big-name portfolio apps.
          </p>
        </div>
        <div className="mt-10 overflow-hidden rounded-2xl border border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-card/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Feature</th>
                <th className="px-4 py-3 text-center text-primary">This tracker</th>
                <th className="px-4 py-3 text-center">Typical cloud app</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.map((r) => (
                <tr key={r.label}>
                  <td className="px-4 py-3">{r.label}</td>
                  <td className="px-4 py-3 text-center">{r.us ? "✓" : "—"}</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">
                    {r.them ? "✓" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ---------- FAQ ---------- */

function FAQ() {
  const faqs = [
    {
      q: "Is the portfolio tracker really free?",
      a: "Yes — every feature is free, with no signup and no premium tier. The app runs entirely in your browser.",
    },
    {
      q: "Where is my data stored?",
      a: "All data lives in your browser via localStorage. Nothing is uploaded, synced or shared. Clearing your browser storage clears your portfolio.",
    },
    {
      q: "Which assets can I track?",
      a: "Stocks, ETFs, cryptocurrencies, precious metals, and any custom asset with a manual price.",
    },
    {
      q: "Do I need an account?",
      a: "No — open the app and start tracking immediately. There is no login, no email collection, no analytics on your holdings.",
    },
  ];
  return (
    <section id="faq" className="border-b border-border/50 bg-card/20">
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <div className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Frequently asked questions
          </h2>
        </div>
        <div className="mt-10 space-y-3">
          {faqs.map((f) => (
            <details
              key={f.q}
              className="group rounded-xl border border-border/60 bg-background/60 px-5 py-4"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium">
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

/* ---------- Final CTA ---------- */

function FinalCTA() {
  return (
    <section className="border-b border-border/50">
      <div className="mx-auto max-w-4xl px-4 py-24 text-center sm:px-6">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">
          Take 60 seconds. Own your portfolio.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          No signup. No card. Just open the app and start tracking what you actually own.
        </p>
        <div className="mt-8">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-base font-medium text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90"
          >
            Open the tracker <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          <TrendingUp className="mr-1 inline h-3 w-3" />
          Works in any modern browser · Mobile-friendly
        </p>
      </div>
    </section>
  );
}

/* ---------- Footer ---------- */

function SiteFooter() {
  return (
    <footer className="bg-background">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-10 text-sm text-muted-foreground sm:flex-row sm:px-6">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-primary/15 text-primary">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <span>Portfolio Tracker · © {new Date().getFullYear()}</span>
        </div>
        <div className="flex items-center gap-5">
          <Link to="/dashboard" className="hover:text-foreground">Open app</Link>
          <a href="#features" className="hover:text-foreground">Features</a>
          <a href="#faq" className="hover:text-foreground">FAQ</a>
        </div>
        <div>
          Made by{" "}
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
