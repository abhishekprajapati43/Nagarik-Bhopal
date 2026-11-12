import { useLanguage } from "../context/LanguageContext";

/**
 * Compact English/हिन्दी toggle. Rendered in the site header and in the three
 * console top bars, so the choice follows the user across the app.
 */
export default function LanguageSwitcher({ compact = false }) {
  const { language, setLanguage, languages, t } = useLanguage();

  return (
    <label className={compact ? "lang-switch lang-switch-compact" : "lang-switch"}>
      <span className="lang-switch-label">{t("nav.language")}</span>
      <select
        value={language}
        onChange={(event) => setLanguage(event.target.value)}
        aria-label={t("nav.language")}
      >
        {languages.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.label}
          </option>
        ))}
      </select>
    </label>
  );
}
