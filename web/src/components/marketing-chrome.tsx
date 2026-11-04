import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowRight, Github } from "lucide-react";
import { ASSETS, githubSourceUrl } from "@/lib/site-config";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { useLanguage } from "@/i18n/use-language";
import type { LanguageCode } from "@/i18n";

const SISTER_TOOLS = [
  { href: "https://miningcalculator.gabo.rocks/", label: "Mining Profit Lab" },
  { href: "https://threadly.putopulse.org/", label: "Threadly" },
  { href: "https://gabo-tech.github.io/grok-voice-android/", label: "Grok Voice" },
] as const;

export function MarketingHeader() {
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
            <div className="truncate text-xs text-muted-foreground">
              {t("landing.headerTagline")}
            </div>
          </div>
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground lg:flex">
          <a href="/#features" className="hover:text-foreground">
            {t("landing.nav.features")}
          </a>
          <a href="/#how" className="hover:text-foreground">
            {t("landing.nav.how")}
          </a>
          <a href="/#downloads" className="hover:text-foreground">
            {t("landing.nav.downloads", { defaultValue: "Download" })}
          </a>
          <a href="/#faq" className="hover:text-foreground">
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

export function MarketingFooter() {
  const { t } = useTranslation();
  return (
    <footer className="border-t border-border/50 bg-background">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
          <nav
            aria-label="Footer"
            className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground"
          >
            <Link to="/dashboard" className="hover:text-foreground">
              {t("landing.openApp")}
            </Link>
            <a href="/#downloads" className="hover:text-foreground">
              {t("landing.nav.downloads", { defaultValue: "Download" })}
            </a>
            <a href="/#features" className="hover:text-foreground">
              {t("landing.nav.features")}
            </a>
            <a href="/#faq" className="hover:text-foreground">
              {t("landing.nav.faq")}
            </a>
            <Link to="/private-net-worth-tracker" className="hover:text-foreground">
              {t("landing.footer.guide", { defaultValue: "Private net worth tracker" })}
            </Link>
            <Link to="/alternative-to-kubera-empower-ghostfolio" className="hover:text-foreground">
              {t("landing.footer.compare", { defaultValue: "Kubera, Empower and Ghostfolio" })}
            </Link>
            <a
              href={githubSourceUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <Github className="h-3.5 w-3.5" />
              {t("landing.footer.sourceCode")}
            </a>
          </nav>
        </div>
        <div className="mt-8 space-y-2 border-t border-border/40 pt-6 text-sm text-muted-foreground">
          <p>
            {t("landing.footer.madeBy")}{" "}
            <a
              href="https://gabo.is-a.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline"
            >
              Gabriel Clemente
            </a>
          </p>
          <p>
            <span className="mr-2">
              {t("landing.footer.sisterTools", { defaultValue: "Sister tools" })}:
            </span>
            {SISTER_TOOLS.map((tool, index) => (
              <span key={tool.href}>
                {index > 0 ? <span className="mx-1.5 text-border">·</span> : null}
                <a
                  href={tool.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline-offset-4 hover:text-foreground hover:underline"
                >
                  {tool.label}
                </a>
              </span>
            ))}
          </p>
        </div>
      </div>
    </footer>
  );
}

export function MarketingPage({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <MarketingHeader />
      <main>{children}</main>
      <MarketingFooter />
    </div>
  );
}
