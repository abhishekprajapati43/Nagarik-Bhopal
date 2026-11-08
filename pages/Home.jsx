import { Link } from "react-router-dom";

const steps = [
  {
    n: "01",
    title: "Spot an issue",
    text: "See a broken streetlight, overflowing bin or damaged road? Let us know.",
  },
  {
    n: "02",
    title: "Share the details",
    text: "Tell us where it is and add a photo so the right team can find it.",
  },
  {
    n: "03",
    title: "Track the fix",
    text: "Your report gets a reference number you can use to follow its progress.",
  },
];

/**
 * Home now shows the guide that used to live in its own "How it works"
 * section. The layout, cards and call-to-action are unchanged; only the old
 * hero and category blocks were removed.
 */
export default function Home() {
  return (
    <section className="how-section home-how-section" aria-labelledby="home-title">
      <h1 className="sr-only" id="home-title">How Nagarik Bhopal works</h1>

      <div className="section-heading">
        <div>
          <p className="eyebrow eyebrow-dark">SMALL ACTION. REAL CHANGE.</p>
          <h2>
            It’s easy to<br />
            <em>make a difference.</em>
          </h2>
        </div>
        <p className="section-intro">
          A few details are all it takes to get an issue in front of the people who can fix it.
        </p>
      </div>

      <div className="steps-grid">
        {steps.map((step) => (
          <article className="step-card" key={step.n}>
            <span className="step-num">{step.n}</span>
            <span className="step-arrow">↗</span>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </article>
        ))}
      </div>

      <div className="bottom-cta">
        <div>
          <span className="eyebrow">READY WHEN YOU ARE</span>
          <h3>
            Let’s make your street<br />
            a little better.
          </h3>
        </div>
        <Link className="button button-dark" to="/report">
          Start a report <span>↗</span>
        </Link>
      </div>
    </section>
  );
}
