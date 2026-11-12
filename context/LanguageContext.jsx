import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { LANGUAGES } from "../shared/constants";
import { TRANSLATIONS } from "../i18n/translations";

/**
 * English/Hindi UI language with a localStorage preference.
 *
 * Components call `t("nav.home")`; a missing key falls back to English and then
 * to the key itself, so a partially translated dictionary never breaks a page.
 * Adding a language means adding one object to i18n/translations.js.
 */

const STORAGE_KEY = "nagarik.language";
const DEFAULT_LANGUAGE = "en";

const LanguageContext = createContext(null);

const readStored = () => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return LANGUAGES.some((language) => language.id === stored) ? stored : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
};

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(readStored);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = "ltr";
  }, [language]);

  const setLanguage = useCallback((next) => {
    if (!LANGUAGES.some((entry) => entry.id === next)) return;
    setLanguageState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* Storage can be unavailable in private mode; the session still works. */
    }
  }, []);

  const t = useCallback(
    (key, vars = {}) => {
      const dictionary = TRANSLATIONS[language] || {};
      let text = dictionary[key] ?? TRANSLATIONS.en[key] ?? key;

      for (const [name, value] of Object.entries(vars)) {
        text = text.split(`{${name}}`).join(String(value));
      }

      return text;
    },
    [language]
  );

  const value = useMemo(
    () => ({ language, setLanguage, t, languages: LANGUAGES }),
    [language, setLanguage, t]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error("useLanguage must be used inside <LanguageProvider>.");
  }

  return context;
}
