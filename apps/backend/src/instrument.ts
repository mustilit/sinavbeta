/**
 * Sentry initialization — bu dosya main.ts'in en başında import edilmeli.
 * Sentry, diğer modüllerden önce başlatılmazsa instrumentation eksik kalır.
 *
 * DSN yoksa (geliştirici ortamı, CI) sessizce atlanır — gürültü olmaz.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Sentry = require('@sentry/node') as typeof import('@sentry/node');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { nodeProfilingIntegration } = require('@sentry/profiling-node') as typeof import('@sentry/profiling-node');

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    integrations: [nodeProfilingIntegration()],

    // Production'da %10 örnekleme — daha yüksek başlatma, ücret patlar
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,

    // PII temizleme: token, cookie gibi hassas header'ları at
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
        delete event.request.headers['set-cookie'];
      }
      return event;
    },
  });
}

export { Sentry };
