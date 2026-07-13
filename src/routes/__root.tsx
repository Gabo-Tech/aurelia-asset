import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

import appCss from "../styles.css?url";
import { StoreProvider, FxProvider } from "@/lib/store";
import { AppShell } from "@/components/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { ASSETS, SITE_URL } from "@/lib/site-config";

function NotFoundComponent() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">{t("errors.notFoundTitle")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("errors.notFoundBody")}</p>
        <div className="mt-6">
          <Button asChild>
            <Link to="/">{t("errors.goHome")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error: _error, reset }: { error: Error; reset: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t("errors.loadFailedTitle")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("errors.loadFailedBody")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button
            onClick={() => {
              router.invalidate();
              reset();
            }}
          >
            {t("errors.tryAgain")}
          </Button>
          <Button variant="outline" asChild>
            <a href="/">{t("errors.goHome")}</a>
          </Button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { property: "og:site_name", content: "Portfolio Tracker" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#0B0B0C" },
      { name: "author", content: "GABO Solutions" },
      { name: "application-name", content: "Portfolio Tracker" },
      { name: "format-detection", content: "telephone=no" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: ASSETS.favicon, sizes: "any" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: ASSETS.favicon32 },
      { rel: "icon", type: "image/png", sizes: "64x64", href: ASSETS.favicon64 },
      { rel: "apple-touch-icon", sizes: "180x180", href: ASSETS.appleTouchIcon },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@400;500&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap",
      },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Portfolio Tracker",
          url: SITE_URL,
          logo: SITE_URL + ASSETS.logo,
          sameAs: ["https://solutions.gabo.rocks"],
        }),
      },
    ],
  }),
  // Document shell is only for true SSR/hydrateRoot. Tauri uses createRoot(#root).
  ...(typeof window === "undefined" ||
  !(window as Window & { __TSS_TAURI_SPA__?: boolean }).__TSS_TAURI_SPA__
    ? { shellComponent: RootShell }
    : {}),
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

const themeInitScript = `(function(){try{var p=localStorage.getItem('ept_theme');if(p!=='light'&&p!=='dark'&&p!=='system'){p='system';}var t=p==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p;var r=document.documentElement;r.classList.toggle('dark',t==='dark');r.style.colorScheme=t;var m=document.querySelector('meta[name="theme-color"]');if(m){m.setAttribute('content',t==='dark'?'#0A0A0B':'#FAF9F7');}}catch(e){document.documentElement.classList.add('dark');}})();`;

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark" style={{ colorScheme: "dark" }} suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Landing page is standalone (no app shell).
  const isLanding = pathname === "/";
  const isTauriSpa =
    typeof window !== "undefined" &&
    !!(window as Window & { __TSS_TAURI_SPA__?: boolean }).__TSS_TAURI_SPA__;

  return (
    <>
      {isTauriSpa ? (
        <>
          <HeadContent />
          <Scripts />
        </>
      ) : null}
      <QueryClientProvider client={queryClient}>
        <StoreProvider>
          <FxProvider>
            {isLanding ? (
              <Outlet />
            ) : (
              <AppShell>
                <Outlet />
              </AppShell>
            )}
            <Toaster position="top-right" richColors />
          </FxProvider>
        </StoreProvider>
      </QueryClientProvider>
    </>
  );
}
