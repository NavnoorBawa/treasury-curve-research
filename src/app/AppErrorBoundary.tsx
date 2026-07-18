import { Component, type ErrorInfo, type ReactNode } from "react";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Dashboard render failure", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="app-shell app-shell--error">
          <section className="notice notice--fatal" role="alert">
            <strong>Dashboard view failed to render.</strong>
            <span>Refresh the page to reload the latest Treasury data and chart components.</span>
            <button className="text-button" type="button" onClick={() => window.location.reload()}>
              Reload dashboard
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
