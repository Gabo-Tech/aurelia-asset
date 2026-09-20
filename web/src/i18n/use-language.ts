import { useTranslation } from "react-i18next";
import i18n, { SUPPORTED_LANGUAGES, LANG_STORAGE_KEY, type LanguageCode } from "./index";

export function useLanguage() {
  const { i18n: i } = useTranslation();
  const current = (SUPPORTED_LANGUAGES.find((l) => l.code === i.language)?.code ??
    (i.language?.startsWith("ca") ? "ca-valencia" : "en")) as LanguageCode;

  function setLanguage(code: LanguageCode) {
    i18n.changeLanguage(code);
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, code);
    } catch {
      /* ignore */
    }
    if (typeof document !== "undefined") {
      document.documentElement.lang = code.startsWith("ca") ? "ca" : code.slice(0, 2);
    }
    // Keep ?lang= in sync on the landing page so hreflang URLs stay shareable.
    if (typeof window !== "undefined" && window.location.pathname === "/") {
      try {
        const url = new URL(window.location.href);
        const short = code.startsWith("ca") ? "ca" : code;
        url.searchParams.set("lang", short);
        window.history.replaceState({}, "", url.toString());
      } catch {
        /* ignore */
      }
    }
  }

  return { language: current, setLanguage, languages: SUPPORTED_LANGUAGES };
}
