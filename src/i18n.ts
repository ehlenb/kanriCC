import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import ja from "./locales/ja.json";

const stored = localStorage.getItem("kanri_lang");
const defaultLang = stored === "ja" ? "ja" : "en";

i18n
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, ja: { translation: ja } },
    lng: defaultLang,
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });

export function setLanguage(lang: "en" | "ja") {
  localStorage.setItem("kanri_lang", lang);
  void i18n.changeLanguage(lang);
}

export function getLanguage(): "en" | "ja" {
  return (i18n.language as "en" | "ja") || "en";
}

export default i18n;
