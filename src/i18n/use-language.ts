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
    } catch {}
  }

  return { language: current, setLanguage, languages: SUPPORTED_LANGUAGES };
}
