import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// Detecta automáticamente todos los archivos src/locales/<idioma>/<ventana>.json
type LocaleModules = Record<string, { default: Record<string, string> }>;

const modules = import.meta.glob("../locales/*/*.json", { eager: true }) as LocaleModules;

const resources: Record<string, Record<string, Record<string, string>>> = {};

for (const path in modules) {
  const match = path.match(/\.\.\/locales\/([^/]+)\/([^/]+)\.json$/);
  if (!match) continue;
  const [, lang, namespace] = match;
  resources[lang] ??= {};
  resources[lang][namespace] = modules[path].default;
}

i18n.use(initReactI18next).init({
  resources,
  lng: "es",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;