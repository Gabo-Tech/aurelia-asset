import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingPage } from "@/components/marketing-chrome";
import { githubSourceUrl } from "@/lib/site-config";
import {
  faqJsonLd,
  jsonLdScript,
  socialMeta,
  softwareApplicationJsonLd,
  webPageJsonLd,
} from "@/lib/seo";

const PATH = "/private-net-worth-tracker";
const TITLE = "Private net worth tracker with no signup — Aurelia";
const DESCRIPTION =
  "Aurelia is a free private net worth tracker with no account. Holdings, cashflow, and budgets stay encrypted on your device. Web, Linux, and Android.";

const FAQS = [
  {
    q: "Do I need to sign up?",
    a: "No. Open the web app and add a holding or a cashflow entry. Aurelia has no login, no email field, and no user account.",
  },
  {
    q: "Is there a paid plan?",
    a: "No. Every feature in the web app and the native builds is free. The software is licensed AGPL-3.0-or-later.",
  },
  {
    q: "Where do my numbers live?",
    a: "On the device. Holdings, cashflow, budgets, goals, loans, and an optional Finnhub key are stored in local storage and encrypted with AES-GCM. A copy leaves the device when you export a backup.",
  },
  {
    q: "Does it work without a network?",
    a: "The records you have already saved open on the device with no account. Live quotes and exchange rates need a network. Those requests send a symbol or a rate lookup, and they do not include your balances.",
  },
] as const;

export const Route = createFileRoute("/private-net-worth-tracker")({
  head: () => {
    const social = socialMeta({ title: TITLE, description: DESCRIPTION, path: PATH });
    return {
      meta: social.meta,
      links: social.links,
      scripts: [
        jsonLdScript(webPageJsonLd({ title: TITLE, description: DESCRIPTION, path: PATH })),
        jsonLdScript(softwareApplicationJsonLd(DESCRIPTION)),
        jsonLdScript(faqJsonLd(FAQS)),
      ],
    };
  },
  component: PrivateNetWorthTrackerPage,
});

function PrivateNetWorthTrackerPage() {
  return (
    <MarketingPage>
      <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="text-xs font-medium uppercase tracking-wider text-primary">Aurelia</p>
        <h1 className="font-display mt-3 text-4xl tracking-tight sm:text-5xl">
          Private net worth tracker with no signup
        </h1>
        <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
          Aurelia is a free private net worth tracker for stocks, ETFs, crypto, cash, and the rest
          of a household balance sheet. Open it in the browser, or install the Linux or Android
          build. There is no account form and no paid tier.
        </p>
        <p className="mt-4 text-sm leading-relaxed">
          <Link to="/" className="text-primary underline-offset-4 hover:underline">
            Back to the Aurelia home page
          </Link>
          <span className="mx-2 text-border">·</span>
          <Link
            to="/alternative-to-kubera-empower-ghostfolio"
            className="text-primary underline-offset-4 hover:underline"
          >
            Compared with Kubera, Empower, and Ghostfolio
          </Link>
        </p>

        <section className="mt-12">
          <h2 className="font-display text-2xl tracking-tight">Your records stay on the device</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Holdings, cashflow, budgets, savings goals, loans, and an optional Finnhub API key are
            written to local storage and encrypted with AES-GCM 256-bit. The encryption key is kept
            in IndexedDB for that browser origin. Aurelia does not operate analytics, advertising,
            or user accounts. A backup file is created when you choose Export.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            The same rules are written down in the{" "}
            <a
              href={`${githubSourceUrl()}/blob/main/PRIVACY.md`}
              className="text-foreground underline-offset-4 hover:underline"
              rel="noopener noreferrer"
              target="_blank"
            >
              project privacy policy
            </a>
            . Anyone with your unlocked device and browser profile can still read the data, because
            decryption happens in the app itself. The encryption protects stored values from casual
            inspection.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-2xl tracking-tight">
            Saved data opens offline. Live quotes need a network.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            The ledger you have already entered is on the device, so the tracker opens without an
            account when you are offline. Refreshing a price or an exchange rate contacts a public
            source: Finnhub, Yahoo Finance, Stooq, CoinGecko, Binance, or an FX API. That request
            sends the symbol or the rate endpoint. It does not send portfolio balances, cashflow
            lines, or notes.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            The web app loads fonts from Google, which receives your IP address and the page
            referrer. Browser voice input, if you turn it on, can use your operating system speech
            service.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-2xl tracking-tight">What you can record</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>Stocks, ETFs, crypto, precious metals, cash accounts, and custom holdings.</li>
            <li>Income, expenses, categories, credit cards, and a cashflow Sankey diagram.</li>
            <li>Budgets, savings goals, loan schedules, and a 24-month forecast.</li>
            <li>Balances shown in the ISO currency you pick.</li>
          </ul>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Aurelia does not connect to bank or brokerage logins. You enter positions and cashflow
            yourself, or you import a backup you exported earlier.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-2xl tracking-tight">Where it runs</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            The web app runs in a current browser. GitHub Releases ship a Linux AppImage, a .deb, a
            .rpm, and an Android APK. Windows, macOS, and iOS packages are marked coming soon in the
            download list. Native builds are unsigned and distributed from GitHub.
          </p>
        </section>

        <section className="mt-10" id="faq">
          <h2 className="font-display text-2xl tracking-tight">Questions</h2>
          <div className="mt-4 space-y-3">
            {FAQS.map((item) => (
              <details
                key={item.q}
                className="group rounded-2xl border border-border/40 bg-card/80 px-5 py-4"
                open
              >
                <summary className="cursor-pointer list-none text-sm font-medium">{item.q}</summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <div className="mt-12 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" className="min-h-12">
            <Link to="/dashboard">
              Open Aurelia <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="min-h-12">
            <Link to="/alternative-to-kubera-empower-ghostfolio">See the comparison</Link>
          </Button>
        </div>
      </article>
    </MarketingPage>
  );
}
