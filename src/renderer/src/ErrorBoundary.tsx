import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] Uncaught render error:', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <main className="desktop-shell">
          <section className="content-shell">
            <div className="content-frame card loading-frame">
              <header className="page-header">
                <div>
                  <p className="eyebrow">Renderer error</p>
                  <h2>Something went wrong</h2>
                  <p className="panel-copy">
                    The renderer encountered an unexpected error. You can try reloading the window.
                  </p>
                </div>
              </header>

              <section className="status-banner inline-status status-error">
                <span className="eyebrow">Error</span>
                <p>{this.state.error?.message ?? 'Unknown error'}</p>
              </section>

              <div className="form-actions" style={{ padding: '1rem' }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => window.location.reload()}
                >
                  Reload window
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => this.setState({ hasError: false, error: null })}
                >
                  Try again
                </button>
              </div>

              {this.state.error?.stack ? (
                <pre style={{ padding: '1rem', fontSize: '0.75rem', overflow: 'auto', maxHeight: '200px', opacity: 0.6 }}>
                  {this.state.error.stack}
                </pre>
              ) : null}
            </div>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
