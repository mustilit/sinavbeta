/**
 * Tek noktadan API istek katmanı.
 * - Base URL: VITE_API_BASE_URL veya VITE_API_URL (env)
 * - Timeout, retry (sadece idempotent GET), abort controller
 * - JSON parse güvenliği
 * - Auth header interceptor
 */
import { getApiBaseUrl } from '@/config/env';
import { parseBackendError } from './errors';

const DEFAULT_TIMEOUT_MS = 15000;
const RETRY_GET_MAX = 2;

/**
 * Token'ı storage'dan al (dalClient ile uyumlu)
 * @returns {string | null}
 */
function getStoredToken() {
  if (typeof window === 'undefined') return null;
  try {
    const token =
      sessionStorage.getItem('token') ||
      sessionStorage.getItem('dal_auth') ||
      localStorage.getItem('token') ||
      localStorage.getItem('dal_auth');
    if (!token) return null;
    if (token.startsWith('{')) {
      const parsed = JSON.parse(token);
      return parsed?.token ?? token;
    }
    return token;
  } catch {
    return null;
  }
}

/**
 * Storage'dan auth bilgisini temizle
 */
export function clearAuthStorage() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('dal_auth');
    localStorage.removeItem('token');
    localStorage.removeItem('dal_auth');
    localStorage.removeItem('base44_access_token');
  } catch {}
}

/**
 * Güvenli JSON parse - bozuk JSON'da anlamlı error
 * @param {string} text
 * @returns {unknown}
 */
function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Geçersiz JSON yanıtı: ${String(e?.message || e)}`);
  }
}

/**
 * Base URL + path birleştirmeyi güvenli yapan yardımcı.
 * - base boş ise path'i root-relative hale getirir
 * - base içinde yanlışlıkla tırnak vs. varsa URL() ile normalize eder
 * @param {string} base
 * @param {string} path
 * @returns {string}
 */
export function joinUrl(base, path) {
  const b = `${(base || '').trim().replace(/\/+$/, '')}/`;
  const p = (path || '').trim().replace(/^\/+/, '');
  // Base boş ise relative path döndür (Vite proxy senaryosu)
  if (!b.trim() || b === '/') {
    return `/${p}`;
  }
  return new URL(p, b).toString();
}

/**
 * @typedef {Object} RequestOptions
 * @property {string} [method] - GET, POST, etc.
 * @property {Record<string, string>} [headers]
 * @property {unknown} [body] - JSON serialize edilir
 * @property {number} [timeout]
 * @property {boolean} [skipAuth] - Auth header ekleme
 * @property {AbortSignal} [signal]
 */

/**
 * Fetch tabanlı HTTP client
 * @param {string} path - API path (örn. /auth/login)
 * @param {RequestOptions} [opts]
 * @returns {Promise<unknown>}
 */
export async function apiRequest(path, opts = {}) {
  const {
    method = 'GET',
    headers: customHeaders = {},
    body,
    timeout = DEFAULT_TIMEOUT_MS,
    skipAuth = false,
    signal: externalSignal,
  } = opts;

  const baseUrl = getApiBaseUrl();
  const url = joinUrl(baseUrl, path);

  // FormData ise Content-Type browser tarafından boundary ile otomatik eklenir.
  // ÖNEMLİ: Çağıran taraf yanlışlıkla "Content-Type: multipart/form-data" (boundary'siz)
  // geçse bile bunu TEMİZLE — aksi halde browser boundary eklemez, sunucu (multer)
  // body'yi parse edemez ve dosya kaybolur ("Görsel yüklenemedi" hatası).
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  /** @type {Record<string, string>} */
  let headers;
  if (isFormData) {
    headers = { ...customHeaders };
    for (const k of Object.keys(headers)) {
      if (k.toLowerCase() === 'content-type') delete headers[k];
    }
  } else {
    headers = { 'Content-Type': 'application/json', ...customHeaders };
  }
  if (!skipAuth) {
    const token = getStoredToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  // Katman B: Frontend kimliği — backend OriginProtectionGuard bunu zorunlu
  // tutuyor (mutating endpoint'lerde). Bypass'i trivial ama otomatik
  // scraper/Postman default isteklerini durdurur ve log'da iz bırakır.
  if (!headers['X-Client-App']) {
    const version = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_APP_VERSION) || 'v3';
    headers['X-Client-App'] = `sinavsalonu-web/${version}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const signal = externalSignal || controller.signal;

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body != null ? (isFormData ? body : JSON.stringify(body)) : undefined,
      signal,
      credentials: 'same-origin',
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err?.name === 'AbortError') {
      const e = new Error('İstek zaman aşımına uğradı.');
      e.code = 'TIMEOUT';
      throw e;
    }
    // Ağ hatası: sunucu hiç cevap vermedi (hat kopması, DNS, vb.)
    // Bu hata 401 değildir — kullanıcı oturumu kapatılmamalı
    const netErr = err instanceof Error ? err : new Error(String(err));
    if (!netErr.code) netErr.code = 'NETWORK_ERROR';
    throw netErr;
  }
  clearTimeout(timeoutId);

  const text = await res.text();
  if (!res.ok) {
    /** @type {any} */
    let parsed;
    try {
      parsed = text ? safeJsonParse(text) : null;
    } catch {
      parsed = null;
    }
    const { code, message } = parsed?.error
      ? parseBackendError(parsed)
      : { code: 'HTTP_ERROR', message: res.statusText || `HTTP ${res.status}` };
    const e = new Error(message);
    const retryAfterRaw = res.headers?.get?.('retry-after');
    const retryAfterSeconds = retryAfterRaw != null ? Number(retryAfterRaw) : NaN;
    e.response = {
      status: res.status,
      data: parsed,
      retryAfter: !Number.isNaN(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds : undefined,
    };
    e.code = code;
    throw e;
  }

  if (!text) return null;
  return safeJsonParse(text);
}

/**
 * GET isteği - idempotent olduğu için retry destekler
 * @param {string} path
 * @param {{ retry?: number; timeout?: number; signal?: AbortSignal; headers?: Record<string, string> }} [opts]
 */
export async function apiGet(path, opts = {}) {
  const { retry = RETRY_GET_MAX, timeout, signal, headers } = opts;
  let lastErr;
  for (let i = 0; i <= retry; i++) {
    try {
      return await apiRequest(path, { method: 'GET', timeout, signal, headers });
    } catch (e) {
      lastErr = e;
      if (i < retry && e?.code !== 'UNAUTHORIZED' && e?.code !== 'FORBIDDEN') {
        await new Promise((r) => setTimeout(r, 300 * (i + 1)));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

/** POST */
export async function apiPost(path, body, opts = {}) {
  return apiRequest(path, { ...opts, method: 'POST', body });
}

/** PATCH */
export async function apiPatch(path, body, opts = {}) {
  return apiRequest(path, { ...opts, method: 'PATCH', body });
}

/** PUT */
export async function apiPut(path, body, opts = {}) {
  return apiRequest(path, { ...opts, method: 'PUT', body });
}

/** DELETE */
export async function apiDelete(path, opts = {}) {
  return apiRequest(path, { ...opts, method: 'DELETE', body: opts.body });
}
