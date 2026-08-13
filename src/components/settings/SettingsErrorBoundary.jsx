import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Isolates a single settings panel: if one panel throws while rendering, we
// show a readable fallback instead of blacking out the whole app. Keyed by the
// active tab in Settings.jsx so switching tabs always resets the boundary.
export default class SettingsErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Surface the real cause for diagnosis; the UI stays usable.
    console.error('Settings panel crashed:', error, info?.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-card border border-border rounded-[10px] p-8 flex flex-col items-center text-center gap-3">
          <div className="w-11 h-11 rounded-full bg-status-error flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 status-error" />
          </div>
          <div className="text-[14px] font-semibold text-foreground">This section couldn't load</div>
          <div className="text-[12px] text-muted-foreground max-w-md">
            {this.state.error?.message || 'Something went wrong while rendering this panel.'}
          </div>
          <Button size="sm" variant="outline" className="gap-1.5 mt-1" onClick={this.handleRetry}>
            <RefreshCw className="w-3.5 h-3.5" /> Try again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}