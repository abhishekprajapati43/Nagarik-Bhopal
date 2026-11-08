import { Link } from "react-router-dom";

const scrollTo = (id) => (event) => {
  event.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
};

const scrollTop = (event) => {
  event.preventDefault();
  window.scrollTo({ top: 0, behavior: "smooth" });
};

/** Public navigation shown only on the signed-out landing page. */
export default function PublicHeader() {
  return (
    <header className="landing-header">
      <div className="landing-header-inner">
        <a className="landing-brand" href="#top" onClick={scrollTop} aria-label="Bhopal Nagarik home">
          <span className="brand-mark">N</span>
          <span>
            BHOPAL NAGARIK
            <small>CIVIC CONNECT • BHOPAL</small>
          </span>
        </a>

        <nav className="landing-nav" aria-label="Public navigation">
          <a href="#top" onClick={scrollTop}>Home</a>
          <a href="#about" onClick={scrollTo("about")}>About</a>
          <a href="#services" onClick={scrollTo("services")}>Services</a>
          <a href="#contact" onClick={scrollTo("contact")}>Contact</a>
        </nav>

        <div className="landing-auth">
          <Link className="landing-login" to="/login">Login</Link>
          <Link className="landing-register" to="/register">
            Register <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
