import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

// Props for the error boundary.
interface Props {
  children: ReactNode;
}

// Whether a render has already thrown.
interface State {
  error: Error | null;
}


// Catches render errors and shows a recovery screen instead of a blank page.
class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  // Flips the boundary into its error state.
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  // Logs the error and its component stack.
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled UI error:', error, errorInfo.componentStack);
  }

  // Reloads the page to start over.
  private handleReload = () => {
    window.location.href = '/';
  };

  // Shows the fallback screen, or the children when nothing has thrown.
  render() {
    const { error } = this.state;

    if (!error) return this.props.children;

    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-state-danger-soft mb-8">
            <AlertTriangle className="text-state-danger" size={28} strokeWidth={2} />
          </div>

          <h1 className="text-3xl font-black uppercase tracking-tight mb-4">
            Something broke
          </h1>
          <p className="text-sm font-medium text-gray-500 mb-8 leading-relaxed">
            An unexpected error stopped this page from rendering. Going back to
            the homepage usually clears it.
          </p>

          {import.meta.env.DEV && (
            <pre className="text-left text-[11px] font-mono bg-[#F5F5F7] rounded-xl p-4 mb-8 overflow-x-auto text-state-danger">
              {error.message}
            </pre>
          )}

          <button
            onClick={this.handleReload}
            className="w-full bg-black text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-gray-800 transition-all flex items-center justify-center space-x-2"
          >
            <RotateCcw size={16} />
            <span>Back to homepage</span>
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
