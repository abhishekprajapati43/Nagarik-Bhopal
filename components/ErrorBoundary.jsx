import { Component } from "react";

/**
 * Last line of defence: a render error shows a friendly card instead of a
 * blank page, and the user can recover without clearing their browser data.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Unexpected UI error", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="container">
        <h1>Something went wrong</h1>
        <p className="page-intro">
          The page hit an unexpected error. Your reports are safe — reload to continue.
        </p>
        <button type="button" onClick={() => window.location.reload()}>
          Reload the app
        </button>
      </div>
    );
  }
}
