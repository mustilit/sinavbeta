/**
 * Axios-benzeri API client - tüm istekler bu katmandan geçer.
 * - Base URL: config/env
 * - 401: storage temizle, redirect loop engeli
 */
import * as http from './http';
import { clearAuthStorage } from './http';

/** 401 sonrası redirect - loop engeli: aynı path'e tekrar push yapma */
let _last401RedirectAt = 0;
const REDIRECT_COOLDOWN_MS = 2000;

/**
 * 401 handler. Hata body'sinde { error: 'SESSION_REPLACED' } varsa kullanıcı
 * başka bir cihazda giriş yapmış demektir; ana login redirect'i öncesinde
 * UI'ya CustomEvent yayarız ki global toast/dialog gösterebilelim.
 */
function handle401(payload) {
  clearAuthStorage();
  if (typeof window === 'undefined') return;
  const errCode = payload?.error || payload?.code;
  if (errCode === 'SESSION_REPLACED') {
    try {
      window.dispatchEvent(new CustomEvent('session-replaced'));
    } catch { /* ignore */ }
  }
  const now = Date.now();
  if (now - _last401RedirectAt < REDIRECT_COOLDOWN_MS) return;
  _last401RedirectAt = now;
  const path = window.location.pathname || '';
  if (/^\/Login$/i.test(path)) return; // Zaten Login'deyse redirect yapma
  const params = new URLSearchParams();
  if (path && path !== '/') params.set('from', path);
  if (errCode === 'SESSION_REPLACED') params.set('reason', 'session_replaced');
  const qs = params.toString();
  window.location.replace('/Login' + (qs ? `?${qs}` : ''));
}

/**
 * 402 Payment Required → backend "tier'ı yetmiyor / aktif abonelik yok" demek istiyor.
 * Sayfalar bunu CustomEvent ile dinleyip TierUpgradePrompt'u açabilsin.
 * Detay payload backend'in döndüğü body (ör. { requiredTier, currentTier, feature }).
 */
function handle402(payload) {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('tier-upgrade-required', { detail: payload ?? {} }));
  } catch {
    // ignore (SSR / eski tarayıcı)
  }
}

/** Axios response şeklinde wrap */
function wrap(data) {
  return { data, status: 200, headers: {} };
}

/** Hata oluştur - axios uyumlu (err.response, err.code) */
function toAxiosError(e) {
  const err = e instanceof Error ? e : new Error(String(e));
  if (!err.response && e?.response) err.response = e.response;
  if (!err.code && e?.code) err.code = e.code;
  if (err.response?.status === 401) handle401(err.response?.data);
  if (err.response?.status === 402) handle402(err.response?.data);
  return err;
}

/**
 * Axios-like API client
 */
const api = {
  async get(path, config = {}) {
    try {
      const params = config.params;
      const search = params && Object.keys(params).length
        ? '?' + new URLSearchParams(params).toString()
        : '';
      const fullPath = path + search;
      const data = await http.apiGet(fullPath, { signal: config.signal, headers: config.headers });
      return wrap(data);
    } catch (e) {
      throw toAxiosError(e);
    }
  },
  async post(path, body, config = {}) {
    try {
      const data = await http.apiPost(path, body ?? config.data, { signal: config.signal, headers: config.headers });
      return wrap(data);
    } catch (e) {
      throw toAxiosError(e);
    }
  },
  async patch(path, body, config = {}) {
    try {
      const data = await http.apiPatch(path, body ?? config.data, { signal: config.signal });
      return wrap(data);
    } catch (e) {
      throw toAxiosError(e);
    }
  },
  async put(path, body, config = {}) {
    try {
      const data = await http.apiPut(path, body ?? config.data, { signal: config.signal });
      return wrap(data);
    } catch (e) {
      throw toAxiosError(e);
    }
  },
  async delete(path, config = {}) {
    try {
      await http.apiDelete(path, { signal: config.signal, body: config.data });
      return wrap(null);
    } catch (e) {
      throw toAxiosError(e);
    }
  },
};

api.defaults = { baseURL: '' };

export default api;
export { api };
