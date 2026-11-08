import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PUBLIC_CONTACT, PUBLIC_SERVICES } from "../shared/publicInfo";

const LEGAL = {
  privacy: {
    title: "Privacy Policy",
    paragraphs: [
      "Bhopal Nagarik collects only the details needed to register and resolve civic complaints: your name, contact details, ward and the information you submit with a report.",
      "Complaint details are shared with the relevant municipal department and ward representatives so the issue can be reviewed and fixed. Your password is never stored or displayed in plain text.",
      "For questions about your data, write to " + PUBLIC_CONTACT.email + ".",
    ],
  },
  terms: {
    title: "Terms & Conditions",
    paragraphs: [
      "Use Bhopal Nagarik to report genuine civic issues. False, abusive or duplicate reports may be closed without action.",
      "A complaint reference number helps you track progress, but resolution times depend on the department, site inspection and the work required.",
      "By creating an account you agree to keep your contact details current and to use the portal respectfully.",
    ],
  },
  faq: {
    title: "Frequently Asked Questions",
    paragraphs: [
      "How do I report an issue? Create an account, sign in, choose Register Complaint and add the location, category, description and a photo where possible.",
      "How do I track my complaint? Open My Complaints or Complaint Status from your dashboard. Every report keeps the same reference number from submission to resolution.",
      "Can I report without an account? No. A secure account lets the ward team contact you and keeps your complaint history in one place.",
      "What if my issue is an emergency? For immediate danger, call the city helpline or local emergency services instead of waiting for a portal update.",
    ],
  },
};

const SOCIALS = [
  {
    label: "Facebook",
    href: "https://www.facebook.com/",
    path: "M14 9h3V6h-3c-2.21 0-4 1.79-4 4v2H7v3h3v7h3v-7h3l1-3h-4v-2c0-.55.45-1 1-1z",
  },
  {
    label: "Instagram",
    href: "https://www.instagram.com/",
    path: "M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H7zm5 3a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm5.6-3.4a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z",
  },
  {
    label: "X",
    href: "https://x.com/",
    path: "M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.65l-5.21-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64z",
  },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/",
    path: "M4.98 3.5A2.5 2.5 0 1 1 0 3.5a2.5 2.5 0 0 1 4.98 0zM.5 8h4.9v13.5H.5V8zm7.6 0h4.7v1.85h.07c.65-1.23 2.25-2.53 4.63-2.53 4.95 0 5.86 3.26 5.86 7.5v6.68h-4.9v-5.92c0-1.41-.03-3.22-1.96-3.22-1.96 0-2.26 1.53-2.26 3.12v6.02H8.1V8z",
  },
  {
    label: "YouTube",
    href: "https://www.youtube.com/",
    path: "M23 12s0-3.2-.4-4.7c-.2-.9-.9-1.6-1.8-1.8C19.2 5 12 5 12 5s-7.2 0-8.8.5c-.9.2-1.6.9-1.8 1.8C1 8.8 1 12 1 12s0 3.2.4 4.7c.2.9.9 1.6 1.8 1.8C4.8 19 12 19 12 19s7.2 0 8.8-.5c.9-.2 1.6-.9 1.8-1.8.4-1.5.4-4.7.4-4.7zM10 15.5v-7l6 3.5-6 3.5z",
  },
];

const scrollTo = (id) => (event) => {
  event.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
};

const scrollTop = (event) => {
  event.preventDefault();
  window.scrollTo({ top: 0, behavior: "smooth" });
};

export default function PublicFooter() {
  const [topic, setTopic] = useState("");

  // Close the legal dialog with Escape and restore focus behaviour naturally.
  useEffect(() => {
    if (!topic) return undefined;
    const close = (event) => {
      if (event.key === "Escape") setTopic("");
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [topic]);

  return (
    <footer className="landing-footer">
      <div className="landing-footer-inner">
        <div className="footer-grid">
          <div>
            <a className="footer-brand" href="#top" onClick={scrollTop} aria-label="Bhopal Nagarik home">
              <span className="brand-mark">N</span>
              <span>
                BHOPAL NAGARIK
                <small>CIVIC CONNECT • BHOPAL</small>
              </span>
            </a>
            <p className="footer-about">
              A single, transparent window between the residents of Bhopal and the
              departments that keep the city running. Report an issue, follow the
              fix and help your neighbourhood get the attention it deserves.
            </p>
            <div className="social-row" aria-label="Social media">
              {SOCIALS.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={social.label}
                  title={social.label}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                    <path d={social.path} fill="currentColor" />
                  </svg>
                </a>
              ))}
            </div>
          </div>

          <div className="footer-col">
            <h3>Quick Links</h3>
            <a href="#top" onClick={scrollTop}>Home</a>
            <a href="#about" onClick={scrollTo("about")}>About</a>
            <a href="#services" onClick={scrollTo("services")}>Services</a>
            <a href="#contact" onClick={scrollTo("contact")}>Contact</a>
            <Link to="/login">Resident Login</Link>
            <Link to="/register">Create Account</Link>
            <Link to="/admin/login">Administrator Login</Link>
          </div>

          <div className="footer-col">
            <h3>Services</h3>
            {PUBLIC_SERVICES.map((service) => (
              <a key={service.title} href="#services" onClick={scrollTo("services")}>
                {service.title}
              </a>
            ))}
          </div>

          <div className="footer-col footer-contact">
            <h3>Contact</h3>
            <p>
              <a href={`mailto:${PUBLIC_CONTACT.email}`}>{PUBLIC_CONTACT.email}</a>
            </p>
            <p>
              <a href={`tel:${PUBLIC_CONTACT.phone.replace(/\s+/g, "")}`}>{PUBLIC_CONTACT.phone}</a>
            </p>
            <p>{PUBLIC_CONTACT.address}</p>
            <p>{PUBLIC_CONTACT.hours}</p>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© 2026 Bhopal Nagarik. All rights reserved.</span>
          <div className="footer-legal">
            <button type="button" onClick={() => setTopic("privacy")}>Privacy Policy</button>
            <button type="button" onClick={() => setTopic("terms")}>Terms &amp; Conditions</button>
            <button type="button" onClick={() => setTopic("faq")}>FAQ</button>
          </div>
          <span>Powered by Bhopal Nagarik</span>
        </div>
      </div>

      {topic && (
        <div
          className="legal-overlay"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setTopic("");
          }}
        >
          <div className="legal-modal" role="dialog" aria-modal="true" aria-labelledby="legal-title">
            <button
              type="button"
              className="legal-close"
              onClick={() => setTopic("")}
              aria-label="Close"
            >
              ×
            </button>
            <p className="landing-eyebrow">BHOPAL NAGARIK</p>
            <h2 id="legal-title">{LEGAL[topic].title}</h2>
            {LEGAL[topic].paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </div>
      )}
    </footer>
  );
}
