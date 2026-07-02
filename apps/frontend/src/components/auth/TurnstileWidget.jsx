import { useEffect, useRef, useState } from 'react';
import api from '@/lib/api/apiClient';

/**
 * TurnstileWidget — Cloudflare Turnstile bot doğrulaması.
 *
 * Site key kaynağı (öncelik):
 *   1. GET /site/integrations/public → admin panelinden yönetilen DB değeri
 *   2. import.meta.env.VITE_TURNSTILE_SITE_KEY (build env fallback)
 *
 * Her ikisi de boşsa widget HİÇ render edilmez (CAPTCHA devre dışı; backend de
 * verify atlar). Bu, admin Cloudflare anahtarını girene kadar sistemin normal
 * çalışmasını sağlar.
 *
 * Site key fetch sonucu localStorage'a kısa süreli cache'lenir (5 dk) — her
 * sayfa açılışında network çağrısı gerekmez.
 */
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=__turnstileOnLoad&render=explicit';
const SITE_KEY_CACHE_KEY = 'turnstile_site_key_cache';
const SITE_KEY_CACHE_TTL_MS = 5 * 60 * 1000;

let scriptLoadPromise = null;

function loadScript() {
  if (scriptLoadPromise) return scriptLoadPromise;
  scriptLoadPromise = new Promise((resolve, reject) => {
    if (window.turnstile) return resolve();
    window.__turnstileOnLoad = () => resolve();
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onerror = () => reject(new Error('Turnstile script load failed'));
    document.head.appendChild(s);
  });
  return scriptLoadPromise;
}

async function fetchSiteKey() {
  // Cache kontrol
  try {
    const raw = localStorage.getItem(SITE_KEY_CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached && Date.now() - cached.fetchedAt < SITE_KEY_CACHE_TTL_MS) {
        return cached.value ?? null;
      }
    }
  } catch { /* ignore */ }

  try {
    const { data } = await api.get('/site/integrations/public');
    const value = data?.turnstileSiteKey || null;
    try {
      localStorage.setItem(SITE_KEY_CACHE_KEY, JSON.stringify({ value, fetchedAt: Date.now() }));
    } catch { /* ignore */ }
    return value;
  } catch {
    // Sunucu erişilemez → build env fallback
    return (import.meta.env?.VITE_TURNSTILE_SITE_KEY || '').trim() || null;
  }
}

export default function TurnstileWidget({ onSuccess, onError = null, action }) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const [siteKey, setSiteKey] = useState(undefined); // undefined: loading, null: disabled, string: ready
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchSiteKey().then((key) => {
      if (cancelled) return;
      setSiteKey(key);
      // Anahtar yoksa script bile yüklemeye gerek yok — kullanıcıya "başarılı" sinyali
      // gönderelim ki form'un submit butonu enabled kalsın.
      if (!key) {
        onSuccess?.(null);
        return;
      }
      loadScript()
        .then(() => { if (!cancelled) setLoaded(true); })
        .catch((err) => { if (!cancelled && onError) onError(err); });
    });
    return () => { cancelled = true; };
  }, [onError, onSuccess]);

  useEffect(() => {
    if (!loaded || !siteKey || !containerRef.current || !window.turnstile) return;
    if (widgetIdRef.current != null) {
      try { window.turnstile.remove(widgetIdRef.current); } catch { /* ignore */ }
      widgetIdRef.current = null;
    }
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      action: action || 'submit',
      callback: (token) => onSuccess?.(token),
      'error-callback': () => onError?.(new Error('Turnstile error')),
      'expired-callback': () => onSuccess?.(null),
      theme: 'light',
      size: 'normal',
    });
    return () => {
      if (widgetIdRef.current != null && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current); } catch { /* ignore */ }
        widgetIdRef.current = null;
      }
    };
  }, [loaded, siteKey, action, onSuccess, onError]);

  // siteKey null ise hiç render etme — CAPTCHA devre dışı
  if (siteKey === null) return null;
  return <div ref={containerRef} className="cf-turnstile" />;
}
