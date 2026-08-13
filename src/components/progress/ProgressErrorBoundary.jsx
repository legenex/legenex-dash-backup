import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

// Error boundary for the Progress Control Center.
//
// A render error inside a route used to unmount the whole tree and leave a black
// page with no explanation, which is indistinguishable from the app being down.
// This catches it, shows what actually broke, and keeps the rest of the shell
// usable so the other surfaces are still reachable.
//
// It reports rather than hides: the message and component stack are on screen,
// because a swallowed error is worse than a visible one.

export default class ProgressErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    // Keep it in the console too, so the stack is available with source maps.
    console.error('Progress Control Center render error:', error, info);
  }

  reset = () => this.setState({ error: null, info: null });

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-foreground">
              This surface failed to render
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              The rest of the Progress Control Center still works. Use the sidebar to move
              elsewhere, or reload after the fix ships.
            </p>

            <div className="mt-4 rounded-md border border-border bg-background p-3">
              <p className="font-mono text-[12px] text-foreground">
                {String(error?.message || error)}
              </p>
            </div>

            {info?.componentStack && (
              <details className="mt-3">
                <summary className="cursor-pointer text-[11px] text-muted-foreground">
                  Component stack
                </summary>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background p-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
                  {info.componentStack.trim()}
                </pre>
              </details>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={this.reset}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Try rendering again
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Reload the page
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
