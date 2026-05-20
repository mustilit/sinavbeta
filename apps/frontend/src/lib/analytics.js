/**
 * Frontend ürün analitiği — PostHog wrapper.
 *
 * Kullanım:
 *   1. main.jsx içinde:
 *        import { initAnalytics } from '@/lib/analytics';
 *        initAnalytics();
 *
 *   2. Component'lerde:
 *        import { track, identify, reset } from '@/lib/analytics';
 *        track('test_purchased', { testId, priceCents });
 *
 *   3. User login sonrası:
 *        identify(user.id, { role: user.role, tenantId });
 *
 *   4. Logout:
 *        reset();
 *
 * KVKK / GDPR:
 *   - User explicit consent vermeden PII gönderilmez.
 *   - `identify`/`track` sadece consent === 'granted' ise çalışır.
 *   - Session replay default'ta KAPALI; ayrıca opt-in gerekli.
 *
 * İlgili: KALITE-DEGERLENDIRME §13 — Müşteri/Kullanıcı Memnuniyeti.
 */
import posthog from 'posthog-js';

const POSTHOG_KEY = import.meta.env?.VITE_POSTHOG_KEY ?? null;
const POSTHOG_HOST = import.meta.env?.VITE_POSTHOG_HOST ?? 'https://eu.posthog.com';

let initialized = false;
let consentGranted = false;

function readStoredConsent() {
  try {
    return typeof localStorage !== 'undefined'
      ? localStorage.getItem('analytics_consent')
      : null;
  } catch {
    return null;
  }
}

/** PII alanlarını property'lerden ayıkla. */
function sanitize(props) {
  const out = { ...props };
  const piiKeys = ['email', 'phone', 'phoneNumber', 'tc', 'tcKimlik', 'cardNumber'];
  for (const k of piiKeys) delete out[k];
  return out;
}

/** Init — App boot'unda bir kez çağır. */
export function initAnalytics() {
  if (initialized) return;
  if (!POSTHOG_KEY) {
    if (import.meta.env?.DEV) {
      console.debug('[analytics] VITE_POSTHOG_KEY yok, devre dışı');
    }
    return;
  }
  consentGranted = readStoredConsent() === 'granted';
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: true,
    capture_pageleave: true,
    persistence: 'localStorage',
    property_blacklist: ['$ip'],
    mask_all_text: false,
    mask_all_element_attributes: false,
    disable_session_recording: true,
    loaded: (ph) => {
      if (!consentGranted) ph.opt_out_capturing();
    },
  });
  initialized = true;
}

/** Consent banner'dan "kabul" → analitik aktif. */
export function grantConsent() {
  consentGranted = true;
  try {
    localStorage.setItem('analytics_consent', 'granted');
  } catch {
    // SSR veya privacy mode → ignore
  }
  if (initialized) posthog.opt_in_capturing();
}

/** Consent banner'dan "ret" veya logout → analitik kapalı. */
export function revokeConsent() {
  consentGranted = false;
  try {
    localStorage.removeItem('analytics_consent');
  } catch {
    // ignore
  }
  if (initialized) posthog.opt_out_capturing();
}

/**
 * Event track.
 * properties içinde PII (email, phone, TC) GÖNDERME — sadece domain alanları.
 */
export function track(event, properties = {}) {
  if (!initialized || !consentGranted) return;
  posthog.capture(event, sanitize(properties));
}

/** User identify — login sonrası. */
export function identify(userId, traits = {}) {
  if (!initialized || !consentGranted) return;
  posthog.identify(userId, sanitize(traits));
}

/** Logout — distinct ID reset. */
export function reset() {
  if (!initialized) return;
  posthog.reset();
}

/** Pageview manuel tetikle (otomatik kapalıysa). */
export function pageview(path) {
  if (!initialized || !consentGranted) return;
  posthog.capture('$pageview', { $current_url: path });
}

/** Test / hook için durum sorgu. */
export function isEnabled() {
  return initialized && consentGranted;
}
