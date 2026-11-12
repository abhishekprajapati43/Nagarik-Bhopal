import { useState } from "react";
import { useLanguage } from "../context/LanguageContext";

/**
 * Complaint sharing: WhatsApp, Facebook, X and a plain copy-link action.
 *
 * The URL is the current page (HashRouter route included), so the recipient
 * lands on the same complaint instead of the app root.
 */
export default function ShareMenu({ url, title = "", onMessage }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);

  const text = title ? `${title} — ${url}` : url;

  const open = (target) => {
    window.open(target, "_blank", "noopener,noreferrer");
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      onMessage?.(t("share.linkCopied"));
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      onMessage?.(t("share.manual"));
    }
  };

  return (
    <div className="share-menu" aria-label={t("share.title")}>
      <span className="share-title">{t("share.title")}</span>

      <button
        type="button"
        className="share-chip share-whatsapp"
        onClick={() => open(`https://wa.me/?text=${encodeURIComponent(text)}`)}
      >
        WhatsApp
      </button>

      <button
        type="button"
        className="share-chip share-facebook"
        onClick={() => open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`)}
      >
        Facebook
      </button>

      <button
        type="button"
        className="share-chip share-x"
        onClick={() =>
          open(
            `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(
              title
            )}`
          )
        }
      >
        X
      </button>

      <button type="button" className="share-chip share-copy" onClick={copy}>
        {copied ? t("common.copied") : t("share.copy")}
      </button>
    </div>
  );
}
