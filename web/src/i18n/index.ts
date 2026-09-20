import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en";
import es from "./locales/es";
import pt from "./locales/pt";
import nl from "./locales/nl";
import de from "./locales/de";
import ca from "./locales/ca";

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "pt", label: "Português" },
  { code: "nl", label: "Nederlands" },
  { code: "de", label: "Deutsch" },
  { code: "ca-valencia", label: "Valencià" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

export const LANG_STORAGE_KEY = "ept_lang";

const SUPPORTED_CODES = ["en", "es", "pt", "nl", "de", "ca-valencia", "ca"];

/** Map URL ?lang= values (hreflang) to i18n codes. */
export function resolveLangParam(raw: string | null | undefined): LanguageCode | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === "ca" || v === "ca-valencia" || v.startsWith("ca")) return "ca-valencia";
  if (v === "en" || v.startsWith("en")) return "en";
  if (v === "es" || v.startsWith("es")) return "es";
  if (v === "pt" || v.startsWith("pt")) return "pt";
  if (v === "nl" || v.startsWith("nl")) return "nl";
  if (v === "de" || v.startsWith("de")) return "de";
  return null;
}

function applyDocumentLang(code: string) {
  if (typeof document === "undefined") return;
  const short = code.startsWith("ca") ? "ca" : code.slice(0, 2);
  document.documentElement.lang = short;
}

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      pt: { translation: pt },
      nl: { translation: nl },
      de: { translation: de },
      "ca-valencia": { translation: ca },
      ca: { translation: ca },
    },
    // Always boot in English so SSR HTML matches the first client render.
    // We swap to the user's preferred language right after hydration.
    lng: "en",
    fallbackLng: "en",
    supportedLngs: SUPPORTED_CODES,
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });

  if (typeof window !== "undefined") {
    setTimeout(() => {
      try {
        const params = new URLSearchParams(window.location.search);
        const fromUrl = resolveLangParam(params.get("lang"));
        const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
        const navLang = window.navigator.language;
        const pick =
          fromUrl ||
          (stored && SUPPORTED_CODES.find((c) => stored.startsWith(c))) ||
          (navLang && SUPPORTED_CODES.find((c) => navLang.startsWith(c))) ||
          "en";
        const code = (pick === "ca" ? "ca-valencia" : pick) as string;
        if (code && code !== i18n.language) {
          i18n.changeLanguage(code);
        }
        applyDocumentLang(code);
        if (fromUrl) {
          try {
            window.localStorage.setItem(LANG_STORAGE_KEY, code);
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* ignore */
      }
    }, 0);

    i18n.on("languageChanged", (lng) => {
      applyDocumentLang(lng);
    });
  }
}

export default i18n;
