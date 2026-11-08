import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import PublicFooter from "../components/PublicFooter";
import PublicHeader from "../components/PublicHeader";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { PUBLIC_CONTACT, PUBLIC_SERVICES } from "../shared/publicInfo";
import "./landing.css";

const FEATURES = [
  {
    icon: "✍️",
    title: "Easy Complaint Registration",
    text: "A short, guided form with your ward, location and a photo where it helps.",
  },
  {
    icon: "📍",
    title: "Real-Time Status Tracking",
    text: "Follow every report from submission to inspection, action and resolution.",
  },
  {
    icon: "🔒",
    title: "Secure User Account",
    text: "Your complaint history stays private and tied to a verified resident account.",
  },
  {
    icon: "⚡",
    title: "Faster Department Response",
    text: "Reports reach the right ward team with the details they need to act.",
  },
  {
    icon: "🔎",
    title: "Transparent Complaint Process",
    text: "See who is handling the issue, how long it has taken and what changed.",
  },
  {
    icon: "📱",
    title: "Mobile Friendly",
    text: "Report from the street, the bus or home on any phone, tablet or computer.",
  },
];

const STEPS = [
  { title: "Register Account", text: "Create your resident account in a minute." },
  { title: "Login", text: "Sign in securely to your civic workspace." },
  { title: "Submit Complaint", text: "Choose a service, add the location and describe the issue." },
  { title: "Department Review", text: "The ward team receives and inspects the report." },
  { title: "Complaint Resolved", text: "Work is completed and the status is updated." },
  { title: "User Feedback", text: "Tell us how the response worked for your neighbourhood." },
];

const PREVIEW = [
  { title: "Street light repaired", meta: "Ward 35 · MP Nagar", status: "Resolved" },
  { title: "Garbage pickup missed", meta: "Ward 12 · Ashoka Garden", status: "In-Progress" },
  { title: "Drain blocked near market", meta: "Ward 18 · Shahpura", status: "Pending" },
];

export default function Landing() {
  const { user, isAdmin } = useAuth();
  const [contactStatus, setContactStatus] = useState("");

  // A signed-in visitor never sees the public page again.
  if (user) return <Navigate to={isAdmin ? "/admin" : "/dashboard"} replace />;

  function sendMessage(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    const email = String(data.get("email") || "").trim();
    const message = String(data.get("message") || "").trim();

    if (!name || !email || !message) {
      setContactStatus("Please add your name, email address and a short message.");
      return;
    }

    setContactStatus(
      `Thanks, ${name}. This local demo does not send email directly — please also write to ${PUBLIC_CONTACT.email} for an official response.`
    );
    form.reset();
  }

  return (
    <div className="landing-page" id="top">
      <PublicHeader />

      <div className="landing-main">
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-hero-inner">
            <div className="landing-hero-copy">
              <div className="landing-hero-brand">
                <span className="brand-mark">N</span>
                <span>
                  BHOPAL NAGARIK
                  <small>CIVIC CONNECT • BHOPAL</small>
                </span>
              </div>

              <p className="landing-eyebrow landing-eyebrow-light">
                <span className="live-dot" /> A CLEANER, SAFER BHOPAL STARTS HERE
              </p>

              <h1 id="landing-title">
                A better city<br />starts with <em>one report.</em>
              </h1>

              <p className="landing-hero-lead">
                Bhopal Nagarik connects residents with the municipal teams that keep
                the city moving. Report a civic issue, follow the fix and help your
                ward get the attention it deserves.
              </p>

              <div className="landing-hero-actions">
                <Link className="lp-btn lp-btn-light" to="/login">
                  Login <span aria-hidden="true">↗</span>
                </Link>
                <Link className="lp-btn lp-btn-ghost-light" to="/register">
                  Register
                </Link>
              </div>

              <div className="landing-hero-points">
                <span>8 civic services</span>
                <span>One reference number</span>
                <span>Live status updates</span>
              </div>
            </div>

            <aside className="landing-preview" aria-label="Example civic updates">
              <div className="preview-head">
                <span><span className="live-dot" /> Live civic desk</span>
                <small>Example updates</small>
              </div>

              <div className="preview-list">
                {PREVIEW.map((item) => (
                  <div className="preview-row" key={item.title}>
                    <div>
                      <b>{item.title}</b>
                      <small>{item.meta}</small>
                    </div>
                    <StatusBadge status={item.status} />
                  </div>
                ))}
              </div>

              <div className="preview-foot">
                <b>8</b>
                <span>service categories, one shared civic platform</span>
              </div>
            </aside>
          </div>
        </section>

        <section className="landing-section" id="about" aria-labelledby="about-title">
          <div className="landing-container">
            <div className="landing-section-head">
              <div>
                <p className="landing-eyebrow">ABOUT BHOPAL NAGARIK</p>
                <h2 id="about-title">Your city, <em>clearly connected.</em></h2>
              </div>
              <p className="landing-section-intro">
                A simple digital window between residents and the departments that
                maintain Bhopal’s roads, water, waste and public spaces.
              </p>
            </div>

            <div className="about-grid">
              <div className="about-copy">
                <p>
                  <b>What is Bhopal Nagarik?</b> It is a civic complaint portal for
                  residents of Bhopal. Instead of chasing different offices, you can
                  report an issue in one place and keep the whole conversation in one
                  account.
                </p>
                <p>
                  <b>Why was it created?</b> Civic problems often get lost between
                  phone calls, paper registers and visits to the office. The portal
                  gives every report a reference number and routes it to the ward team
                  responsible for that service.
                </p>
                <p>
                  <b>How does it help?</b> Add a location and photo, track the status,
                  receive updates when something changes and build a clear record of
                  what your neighbourhood needs.
                </p>
              </div>

              <div className="about-panel">
                <div className="about-metric">
                  <b>08</b>
                  <span>Civic service categories in one place</span>
                </div>
                <div className="about-metric">
                  <b>01</b>
                  <span>Reference number from report to resolution</span>
                </div>
                <div className="about-metric">
                  <b>24×7</b>
                  <span>Access to submit and track a complaint</span>
                </div>
                <p className="about-note">
                  Built around the existing ward system, so the right local team sees
                  the issue first.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-section" id="services" aria-labelledby="services-title">
          <div className="landing-container">
            <div className="landing-section-head">
              <div>
                <p className="landing-eyebrow">SERVICES</p>
                <h2 id="services-title">What can you <em>report?</em></h2>
              </div>
              <p className="landing-section-intro">
                Choose the category that fits best. The portal routes your report to
                the municipal team responsible for that service.
              </p>
            </div>

            <div className="service-grid">
              {PUBLIC_SERVICES.map((service) => (
                <article className="service-card" key={service.title}>
                  <span className="service-icon" aria-hidden="true">{service.icon}</span>
                  <h3>{service.title}</h3>
                  <p>{service.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-section" aria-labelledby="features-title">
          <div className="landing-container">
            <div className="landing-section-head">
              <div>
                <p className="landing-eyebrow">WHY CHOOSE BHOPAL NAGARIK</p>
                <h2 id="features-title">Designed for <em>real civic life.</em></h2>
              </div>
              <p className="landing-section-intro">
                Simple for residents, useful for ward teams and transparent from the
                first report to the final update.
              </p>
            </div>

            <div className="feature-grid">
              {FEATURES.map((feature) => (
                <article className="feature-card" key={feature.title}>
                  <span className="feature-icon" aria-hidden="true">{feature.icon}</span>
                  <h3>{feature.title}</h3>
                  <p>{feature.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-section" aria-labelledby="process-title">
          <div className="landing-container">
            <div className="landing-section-head">
              <div>
                <p className="landing-eyebrow">HOW IT WORKS</p>
                <h2 id="process-title">From report to <em>resolution.</em></h2>
              </div>
              <p className="landing-section-intro">
                Six clear steps, one continuous record. You always know where your
                complaint stands.
              </p>
            </div>

            <ol className="process-grid">
              {STEPS.map((step, index) => (
                <li className="process-step" key={step.title}>
                  <span className="process-num">{String(index + 1).padStart(2, "0")}</span>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="landing-section" id="contact" aria-labelledby="contact-title">
          <div className="landing-container">
            <div className="landing-section-head">
              <div>
                <p className="landing-eyebrow">CONTACT</p>
                <h2 id="contact-title">We are here to <em>help.</em></h2>
              </div>
              <p className="landing-section-intro">
                Questions about a report or the portal? Reach the civic desk or send
                us a message below.
              </p>
            </div>

            <div className="contact-grid">
              <div className="contact-details">
                <div className="contact-item">
                  <span aria-hidden="true">✉</span>
                  <div>
                    <b>Email</b>
                    <a href={`mailto:${PUBLIC_CONTACT.email}`}>{PUBLIC_CONTACT.email}</a>
                  </div>
                </div>

                <div className="contact-item">
                  <span aria-hidden="true">☎</span>
                  <div>
                    <b>Phone</b>
                    <a href={`tel:${PUBLIC_CONTACT.phone.replace(/\s+/g, "")}`}>{PUBLIC_CONTACT.phone}</a>
                  </div>
                </div>

                <div className="contact-item">
                  <span aria-hidden="true">⌖</span>
                  <div>
                    <b>Office address</b>
                    <p>{PUBLIC_CONTACT.address}</p>
                  </div>
                </div>

                <div className="contact-item">
                  <span aria-hidden="true">◷</span>
                  <div>
                    <b>Office hours</b>
                    <p>{PUBLIC_CONTACT.hours}</p>
                  </div>
                </div>

                <div
                  className="landing-map"
                  role="img"
                  aria-label="Map placeholder showing the Bhopal Municipal Corporation office on Mata Mandir Road"
                >
                  <span className="map-pin" aria-hidden="true">⌖</span>
                  <div className="map-label">
                    <b>Bhopal Municipal Corporation</b>
                    <small>Mata Mandir Road, Bhopal</small>
                  </div>
                </div>
              </div>

              <form className="contact-form" onSubmit={sendMessage} noValidate>
                <div className="contact-row">
                  <label className="contact-field">Your name
                    <input name="name" type="text" autoComplete="name" placeholder="Asha Verma" required />
                  </label>
                  <label className="contact-field">Email address
                    <input name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
                  </label>
                </div>

                <label className="contact-field">Subject
                  <input name="subject" type="text" placeholder="Question about my complaint" />
                </label>

                <label className="contact-field">Message
                  <textarea
                    name="message"
                    rows="5"
                    placeholder="Tell us how we can help."
                    required
                  />
                </label>

                {contactStatus && <p className="contact-message" role="status">{contactStatus}</p>}

                <button className="lp-btn lp-btn-dark contact-submit" type="submit">
                  Send message <span aria-hidden="true">↗</span>
                </button>
                <p className="contact-note">
                  For a tracked response, include your complaint reference number.
                </p>
              </form>
            </div>
          </div>
        </section>
      </div>

      <PublicFooter />
    </div>
  );
}
