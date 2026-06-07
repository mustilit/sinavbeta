/**
 * Global error boundary - yakalanmamış React hatalarını yakalar.
 * Prod'da stack trace gösterilmez; sadece güvenli mesaj.
 *
 * i18n: class component olduğundan `withTranslation` HOC ile prop olarak `t` enjekte edilir.
 */
import React from 'react';
import * as Sentry from '@sentry/react';
import { withTranslation } from 'react-i18next';
import { isChunkLoadError, reloadOnceForChunkError } from '@/lib/chunkReload';

const isProd = import.meta.env?.PROD ?? false;

class ErrorBoundaryImpl extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Lazy-route chunk yükleme hatası (deploy sonrası eski hash / geçici ağ) →
    // tek-sefer otomatik reload ile kurtar. vite:preloadError yakalamazsa (veya
    // hata React.lazy üzerinden buraya düşerse) bu backstop devreye girer.
    if (isChunkLoadError(error) && reloadOnceForChunkError()) {
      return; // reload tetiklendi — gerisini raporlamaya gerek yok
    }

    // Sentry'ye gönder (DSN yoksa sessizce atlanır)
    Sentry.captureException(error, { extra: errorInfo });

    if (!isProd) {
      console.error('[ErrorBoundary]', error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      const { t } = this.props;
      const message = isProd
        ? t('common:errorBoundary.messageProd')
        : this.state.error?.message || t('common:errorBoundary.messageUnknown');

      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6" role="alert">
          <div className="max-w-md w-full text-center space-y-4">
            <h1 className="text-2xl font-semibold text-slate-800">{t('common:errorBoundary.title')}</h1>
            <p className="text-slate-600">{message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              {t('common:errorBoundary.reload')}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export const ErrorBoundary = withTranslation(['common'])(ErrorBoundaryImpl);
