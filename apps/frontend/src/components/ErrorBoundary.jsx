/**
 * Global error boundary - yakalanmamış React hatalarını yakalar.
 * Prod'da stack trace gösterilmez; sadece güvenli mesaj.
 */
import React from 'react';
import * as Sentry from '@sentry/react';

const isProd = import.meta.env?.PROD ?? false;

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Sentry'ye gönder (DSN yoksa sessizce atlanır)
    Sentry.captureException(error, { extra: errorInfo });

    if (!isProd) {
      console.error('[ErrorBoundary]', error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      const message = isProd
        ? 'Bir hata oluştu. Lütfen sayfayı yenileyin.'
        : this.state.error?.message || 'Bilinmeyen hata';

      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6" role="alert">
          <div className="max-w-md w-full text-center space-y-4">
            <h1 className="text-2xl font-semibold text-slate-800">Bir şeyler ters gitti</h1>
            <p className="text-slate-600">{message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Sayfayı yenile
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
