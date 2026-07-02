/**
 * Backend error contract parser.
 * Backend format: { error: { code, message, details }, path, timestamp }
 * @see apps/backend/src/nest/filters/http-exception.filter.ts
 *
 * i18n: Hata mesajları common:apiErrors namespace'inden çözülür.
 * React dışından kullanıldığı için doğrudan `i18n.t()` çağrılır
 * (lib/i18n.js init edildikten sonra import güvenli).
 */
import i18n from '@/lib/i18n';

/** @typedef {{ code?: string; message?: string | string[]; details?: unknown }} ErrorBody */
/** @typedef {{ error?: ErrorBody; path?: string; timestamp?: string }} BackendErrorResponse */

/**
 * UI için güvenli mesaj çözer — t() ile çevrilmiş string döner.
 * @param {string} code
 * @param {Record<string, unknown>} [opts]
 * @returns {string}
 */
function safeMessage(code, opts) {
  return String(i18n.t(`common:apiErrors.${code}`, opts));
}

/**
 * Backend error response'u parse eder.
 * @param {unknown} data - response.data veya raw body
 * @returns {{ code: string; message: string; details?: unknown }}
 */
export function parseBackendError(data) {
  if (!data || typeof data !== 'object') {
    return { code: 'UNKNOWN', message: safeMessage('UNEXPECTED_RESPONSE') };
  }
  const body = /** @type {BackendErrorResponse} */ (data);
  const err = body?.error;
  const code = err?.code ?? 'UNKNOWN';
  let message = err?.message;
  if (Array.isArray(message)) message = message[0];
  if (typeof message !== 'string') message = String(message || safeMessage('INTERNAL_ERROR'));
  return { code, message, details: err?.details };
}

/**
 * Axios/fetch hata nesnesinden güvenli UI mesajı üretir.
 * Prod'da stack trace veya hassas detay gösterilmez.
 * @param {any} err - Hata nesnesi (axios error / Error / bilinmeyen)
 * @param {{ isProd?: boolean }} [opts]
 * @returns {string}
 */
export function toSafeMessage(err, opts = {}) {
  const isProd = opts.isProd ?? (import.meta.env?.PROD ?? false);
  if (err?.response?.data) {
    const { code, message } = parseBackendError(err.response.data);
    const retryAfterSeconds = err?.response?.retryAfter;
    if (code === 'TOO_MANY_REQUESTS' && typeof retryAfterSeconds === 'number' && retryAfterSeconds > 0) {
      return safeMessage('TOO_MANY_REQUESTS_WITH_TIME', { seconds: retryAfterSeconds });
    }
    // Bilinen koda öncelik ver; backend message yalnızca fallback.
    // i18next bilinmeyen key için key'i geri verir — bu yüzden code listesi ile kontrol ediyoruz.
    const knownCodes = [
      'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'BAD_REQUEST',
      'TOO_MANY_REQUESTS', 'CAPTCHA_REQUIRED', 'CAPTCHA_INVALID',
      'INTERNAL_ERROR', 'ERR_NETWORK', 'TIMEOUT',
      'DEVICE_VERIFICATION_REQUIRED', 'ACCOUNT_SUSPENDED',
    ];
    if (knownCodes.includes(code)) return safeMessage(code);
    return message || safeMessage('INTERNAL_ERROR');
  }
  if (err?.code === 'ERR_NETWORK' || err?.message?.includes?.('Network') || err?.message?.includes?.('EMPTY_RESPONSE')) {
    return safeMessage('ERR_NETWORK');
  }
  if (err?.message?.includes?.('timeout') || err?.name === 'AbortError') {
    return safeMessage('TIMEOUT');
  }
  if (isProd) return safeMessage('INTERNAL_ERROR');
  return err?.message || safeMessage('INTERNAL_ERROR');
}

/**
 * Geri uyumluluk için: kod → güvenli mesaj proxy.
 * Eski `SAFE_MESSAGE_MAP[code]` kullanımları için (lazy okunur).
 */
export const SAFE_MESSAGE_MAP = new Proxy({}, {
  get(_, code) {
    return safeMessage(String(code));
  },
});
