import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  /** Page name for the heading and message, e.g. "facts". */
  what: string;
  children: ReactNode;
  /** Swappable for tests; defaults to a full page reload. */
  onReload?: () => void;
};

type State = { failed: boolean };

/**
 * Catches a lazy-loaded view whose chunk failed to load (typically an open tab
 * asking for a hashed file that a redeploy removed; the SPA fallback answers
 * with index.html and the dynamic import rejects). Without it the rejection
 * escapes Suspense and React unmounts the whole app. A reload fetches the
 * current index.html and its chunk names.
 */
export class LoadErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Couldn't load ${this.props.what}`, error, info.componentStack);
  }

  render() {
    if (!this.state.failed) {
      return this.props.children;
    }
    const reload = this.props.onReload ?? (() => window.location.reload());
    return (
      <section className="page" role="alert">
        <p className="eyebrow">Error</p>
        <h2>{`Couldn't load ${this.props.what}`}</h2>
        <p>The site may have been updated since this page was opened. Reloading usually fixes it.</p>
        <button type="button" className="secondaryButton" onClick={reload}>
          Reload
        </button>
      </section>
    );
  }
}
