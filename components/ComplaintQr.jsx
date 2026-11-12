import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useLanguage } from "../context/LanguageContext";

/**
 * QR code for a complaint link.
 *
 * The image is rendered on the device with the `qrcode` package, so it also
 * works in the offline build. Scanning the code opens the exact complaint page
 * (the hash route included).
 */
export default function ComplaintQr({ value, filename = "complaint-qr", size = 168 }) {
  const { t } = useLanguage();
  const [dataUrl, setDataUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    if (!value) {
      setDataUrl("");
      return undefined;
    }

    QRCode.toDataURL(value, {
      width: size * 2,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#16332a", light: "#ffffff" },
    })
      .then((url) => {
        if (cancelled) return;
        setDataUrl(url);
        setError("");
      })
      .catch(() => {
        if (cancelled) return;
        setDataUrl("");
        setError("The QR code could not be generated on this device.");
      });

    return () => {
      cancelled = true;
    };
  }, [value, size]);

  return (
    <figure className="qr-card">
      <figcaption>{t("share.qr")}</figcaption>

      {dataUrl ? (
        <img src={dataUrl} alt={t("share.qrHint")} width={size} height={size} />
      ) : (
        <div className="qr-placeholder" aria-hidden="true">
          {error ? "!" : "…"}
        </div>
      )}

      <small>{error || t("share.qrHint")}</small>

      {dataUrl && (
        <a className="small-button" href={dataUrl} download={`${filename}.png`}>
          {t("share.download")}
        </a>
      )}
    </figure>
  );
}
