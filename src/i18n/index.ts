import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
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

if (!i18n.isInitialized) {
  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: {
        en: { translation: en },
        es: { translation: es },
        pt: { translation: pt },
        nl: { translation: nl },
        de: { translation: de },
        "ca-valencia": { translation: ca },
        ca: { translation: ca },
      },
      fallbackLng: "en",
      supportedLngs: ["en", "es", "pt", "nl", "de", "ca-valencia", "ca"],
      nonExplicitSupportedLngs: true,
      interpolation: { escapeValue: false },
      detection: {
        order: ["localStorage", "navigator"],
        lookupLocalStorage: LANG_STORAGE_KEY,
        caches: ["localStorage"],
      },
      react: { useSuspense: false },
    });
}

export default i18n;
