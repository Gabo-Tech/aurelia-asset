import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppCard } from "@/components/design";
import { MarketingPage } from "@/components/marketing-chrome";
import {
  faqJsonLd,
  jsonLdScript,
  socialMeta,
  softwareApplicationJsonLd,
  webPageJsonLd,
} from "@/lib/seo";

const PATH = "/alternative-to-kubera-empower-ghostfolio";
const TITLE = "Alternative to Kubera, Empower, and Ghostfolio — Aurelia";
const DESCRIPTION =
  "Factual comparison of Aurelia with Kubera, the Empower Personal Dashboard, and Ghostfolio: price, accounts, where records live, and license. Checked 3 November 2026.";

const CHECKED = "3 November 2026";

const FAQS = [
  {
    q: "Is Aurelia a free alternative?",
    a: "Yes. Aurelia has no subscription and no account. You open the web app, or a Linux or Android build, and the records stay on that device.",
  },
  {
    q: "What price does Kubera publish?",
    a: "Kubera's help center, updated 26 October 2026, lists Essentials at $250 per year and Black at $2,500 per year. The Kubera net worth page describes a 14-day trial. Those pages do not list a free ongoing plan.",
  },
  {
    q: "Does the Empower Personal Dashboard require an account?",
    a: "Yes. Empower's net worth page is a sign-up form for the free dashboard, and the tools page says you provide an email and phone number to get started. Their link-accounts guide then imports institutions with the credentials for those sites.",
  },
  {
    q: "Is Ghostfolio open source?",
    a: "Yes. Ghostfolio is licensed AGPL-3.0. The README documents Docker self-hosting and creating a first admin user. The pricing page also lists a free Basic cloud plan, Premium at USD 48 per year, and Max at USD 149 per year.",
  },
] as const;

const SOURCES = [
  {
    href: "https://help.kubera.com/article/129-what-is-kubera-black",
    label: "Kubera help: Essentials $250/year and Black $2,500/year (updated 26 October 2026)",
  },
  {
    href: "https://www.kubera.com/net-worth-tracker",
    label: "Kubera net worth tracker: 14-day trial and manual tracking without bank connections",
  },
  {
    href: "https://www.kubera.com/legal",
    label: "Kubera terms: account definition and paid subscription",
  },
  {
    href: "https://www.empower.com/net-worth",
    label: "Empower net worth page: free dashboard and sign-up",
  },
  {
    href: "https://www.empower.com/tools",
    label: "Empower tools: email and phone number to get started",
  },
  {
    href: "https://www.empower.com/tools/link-accounts",
    label: "Empower: how linking asks for institution credentials",
  },
  {
    href: "https://github.com/ghostfolio/ghostfolio",
    label: "Ghostfolio README: AGPL wealth software, self-hosting, and the first admin user",
  },
  {
    href: "https://github.com/ghostfolio/ghostfolio/blob/main/LICENSE",
    label: "Ghostfolio license: GNU AGPL-3.0",
  },
  {
    href: "https://ghostfol.io/en/pricing",
    label:
      "Ghostfolio pricing: Basic free, Premium USD 48/year, Max USD 149/year, self-hosted free",
  },
] as const;

export const Route = createFileRoute("/alternative-to-kubera-empower-ghostfolio")({
  head: () => {
    const social = socialMeta({ title: TITLE, description: DESCRIPTION, path: PATH });
    return {
      meta: [
        ...social.meta,
        {
          name: "keywords",
          content:
            "Aurelia, Kubera alternative, Empower alternative, Ghostfolio alternative, private net worth tracker, no signup",
        },
      ],
      links: social.links,
      scripts: [
        jsonLdScript(webPageJsonLd({ title: TITLE, description: DESCRIPTION, path: PATH })),
        jsonLdScript(softwareApplicationJsonLd(DESCRIPTION)),
        jsonLdScript(faqJsonLd(FAQS)),
      ],
    };
  },
  component: AlternativesPage,
});

function AlternativesPage() {
  return (
    <MarketingPage>
      <article className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="text-xs font-medium uppercase tracking-wider text-primary">Comparison</p>
        <h1 className="font-display mt-3 text-4xl tracking-tight sm:text-5xl">
          An alternative to Kubera, Empower, and Ghostfolio
        </h1>
        <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
          Aurelia, Kubera, the Empower Personal Dashboard, and Ghostfolio can each show what you
          own. Their public pages describe different accounts, prices, and places where the records
          live. This page only uses those pages. Checked {CHECKED}. Published prices change, so use
          the source links for the current figures.
        </p>
        <p className="mt-4 text-sm">
          <Link to="/" className="text-primary underline-offset-4 hover:underline">
            Aurelia home
          </Link>
          <span className="mx-2 text-border">·</span>
          <Link
            to="/private-net-worth-tracker"
            className="text-primary underline-offset-4 hover:underline"
          >
            Private net worth tracker with no signup
          </Link>
        </p>

        <section className="mt-12">
          <h2 className="font-display text-2xl tracking-tight">Side by side</h2>
          <AppCard className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-card/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Documented point
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium text-primary">
                    Aurelia
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Kubera
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Empower Personal Dashboard
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Ghostfolio
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 align-top">
                <tr>
                  <th scope="row" className="px-4 py-3 font-medium">
                    Account
                  </th>
                  <td className="px-4 py-3 text-muted-foreground">None. Open the app.</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Hosted service. Terms define a user account.
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Sign-up with email and phone number.
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Create a user. The first self-hosted user is the admin. Cloud plans use accounts
                    too.
                  </td>
                </tr>
                <tr>
                  <th scope="row" className="px-4 py-3 font-medium">
                    Published price
                  </th>
                  <td className="px-4 py-3 text-muted-foreground">$0. No paid tier.</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Essentials $250/year. Black $2,500/year. 14-day trial on the net worth page.
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    The net worth page calls the dashboard free.
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Cloud Basic free. Premium USD 48/year. Max USD 149/year. Self-hosted software
                    free; you pay for your own server.
                  </td>
                </tr>
                <tr>
                  <th scope="row" className="px-4 py-3 font-medium">
                    Where records live
                  </th>
                  <td className="px-4 py-3 text-muted-foreground">
                    On your device, AES-GCM encrypted local storage.
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">Kubera&apos;s hosted service.</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Empower&apos;s hosted dashboard.
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Your server when you self-host, or Ghostfolio&apos;s cloud on a managed plan.
                  </td>
                </tr>
                <tr>
                  <th scope="row" className="px-4 py-3 font-medium">
                    How positions get in
                  </th>
                  <td className="px-4 py-3 text-muted-foreground">
                    You enter them, or import a backup you exported. No bank login linking.
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Optional connections. Their net worth page says you can track entirely by hand.
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Published setup links institutions with the username and password for those
                    sites.
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Transactions you record. The README covers stocks, ETFs, and cryptocurrencies.
                  </td>
                </tr>
                <tr>
                  <th scope="row" className="px-4 py-3 font-medium">
                    License
                  </th>
                  <td className="px-4 py-3 text-muted-foreground">AGPL-3.0-or-later.</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Commercial hosted product. The cited pages do not publish a source license.
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Commercial hosted product. The cited pages do not publish a source license.
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">AGPL-3.0.</td>
                </tr>
                <tr>
                  <th scope="row" className="px-4 py-3 font-medium">
                    Spending and budgets
                  </th>
                  <td className="px-4 py-3 text-muted-foreground">
                    Cashflow, categories, budgets, goals, and loans are in the app.
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    The cited Kubera pages describe a net worth balance sheet. They do not document
                    a household budget tool.
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    The tools page documents budgeting and cash flow alongside net worth.
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    The README feature list is investment transactions and portfolio performance.
                  </td>
                </tr>
              </tbody>
            </table>
          </AppCard>
        </section>

        <section className="mt-12 space-y-8 text-sm leading-relaxed text-muted-foreground">
          <div>
            <h2 className="font-display text-2xl tracking-tight text-foreground">Aurelia</h2>
            <p className="mt-3">
              Aurelia is the app in this project: a private net worth tracker with no signup. Data
              stays on the device under AES-GCM, the license is AGPL-3.0-or-later, and there is no
              paid upgrade. Live market quotes need a network. The portfolio file is not part of
              those requests. Details are on the{" "}
              <Link
                to="/private-net-worth-tracker"
                className="text-foreground underline-offset-4 hover:underline"
              >
                private net worth tracker
              </Link>{" "}
              page and in the privacy policy linked from there.
            </p>
          </div>
          <div>
            <h2 className="font-display text-2xl tracking-tight text-foreground">Kubera</h2>
            <p className="mt-3">
              Kubera sells a hosted net worth balance sheet. The help article updated on 26 October
              2026 lists Essentials at $250 per year, with every feature except the Black additions,
              and Black at $2,500 per year for ownership tags, nested portfolios, and multi-entity
              wealth. The net worth page says a fourteen-day trial includes the product, and that
              you can run the books by hand without connecting a bank. The terms describe an account
              and say that some of the service is available only with a paid subscription.
            </p>
          </div>
          <div>
            <h2 className="font-display text-2xl tracking-tight text-foreground">
              Empower Personal Dashboard
            </h2>
            <p className="mt-3">
              Empower&apos;s net worth page offers a free dashboard behind a sign-up form. The tools
              page says you answer a few questions and provide an email and phone number to start.
              The link-accounts guide then has you find a financial institution and enter the
              credentials you use on that institution&apos;s site so the dashboard can import
              supported accounts. The same tools page documents budgeting, cash flow, retirement
              planning, and net worth in that dashboard.
            </p>
          </div>
          <div>
            <h2 className="font-display text-2xl tracking-tight text-foreground">Ghostfolio</h2>
            <p className="mt-3">
              Ghostfolio is open source wealth management software under the GNU AGPL-3.0. The
              README describes tracking stocks, ETFs, and cryptocurrencies, and it documents a
              Docker self-host. After you open the local site, you create a user via Get Started,
              and that first user is the admin. The pricing page lists managed Basic as free,
              Premium at USD 48 per year, and Max at USD 149 per year, plus a self-hosted open
              source plan you update yourself. Premium is also how Ghostfolio funds hosting and
              professional market data.
            </p>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="font-display text-2xl tracking-tight">How to read this</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>
              Aurelia fits when you want a free tracker, no account, and the ledger on your own
              device.
            </li>
            <li>
              Kubera fits when you want their hosted balance sheet and a published paid plan, with
              the option to type balances yourself.
            </li>
            <li>
              The Empower Personal Dashboard fits when you want the free hosted tools they document,
              starting with an account and institution linking.
            </li>
            <li>
              Ghostfolio fits when you want AGPL investment software on a server you run, or their
              managed cloud at the price on their pricing page.
            </li>
          </ul>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Read this as a comparison of documented product shape: account, price, storage, and
            license. Accuracy, support, and investment results are outside this page.
          </p>
        </section>

        <section className="mt-12" id="faq">
          <h2 className="font-display text-2xl tracking-tight">Questions</h2>
          <div className="mt-4 space-y-3">
            {FAQS.map((item) => (
              <details
                key={item.q}
                className="rounded-2xl border border-border/40 bg-card/80 px-5 py-4"
                open
              >
                <summary className="cursor-pointer list-none text-sm font-medium">{item.q}</summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="font-display text-2xl tracking-tight">Sources checked {CHECKED}</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
            {SOURCES.map((source) => (
              <li key={source.href}>
                <a
                  href={source.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground underline-offset-4 hover:underline"
                >
                  {source.label}
                </a>
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-12">
          <Button asChild size="lg" className="min-h-12">
            <Link to="/dashboard">
              Open Aurelia <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </article>
    </MarketingPage>
  );
}
