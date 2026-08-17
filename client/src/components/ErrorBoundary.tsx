import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time crashes. Without one, a single thrown error unmounts the
 * whole React tree and the user is left staring at a white page with no way
 * back. Must be a class — there is no hook equivalent for componentDidCatch.
 */
class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled UI error:', error, errorInfo.componentStack);
  }

  private handleReload = () => {
    window.location.href = '/';
  };

  render() {
    const { error } = this.state;

    if (!error) return this.props.children;

    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-red-50 mb-8">
            <AlertTriangle className="text-red-500" size={28} strokeWidth={2} />
          </div>

          <h1 className="text-3xl font-black uppercase tracking-tight mb-4">
            Something broke
          </h1>
          <p className="text-sm font-medium text-gray-500 mb-8 leading-relaxed">
            An unexpected error stopped this page from rendering. Going back to
            the homepage usually clears it.
          </p>

          {/* The message helps in development; in a build it is usually minified. */}
          {import.meta.env.DEV && (
            <pre className="text-left text-[11px] font-mono bg-[#F5F5F7] rounded-xl p-4 mb-8 overflow-x-auto text-red-600">
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
