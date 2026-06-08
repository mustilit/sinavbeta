/**
 * useTestProctoring — Aday'ın test çözme oturumunda anti-leak / anti-cheat
 * korumalarını yönetir.
 *
 * KATMANLAR:
 *   A) UX engelleri      → sağ tık, copy/cut/paste, klavye kısayolları
 *   E) Fullscreen + visibility cezası → çıkışlar sayılır, sınıra ulaşılınca
 *      submit edilir veya pause edilir
 *   C) Telemetri         → tüm engellenen / şüpheli olaylar sunucuya yazılır
 *
 * GERÇEKLER:
 *   - Kararlı bir kullanıcı DevTools'tan event listener'ları silebilir;
 *     telefonla ekran fotoğrafı çekilebilir. Mutlak güvenlik yok.
 *     Bu hook caydırıcılık + tespit izi + sorumluluğa bağlama amacı taşır.
 *   - Görünür filigran (Watermark bileşeni) bunun en güçlü tamamlayıcısıdır.
 *
 * KULLANIM:
 *   const { violations } = useTestProctoring({
 *     attemptId,
 *     enabled: testStarted && !isReviewMode,
 *     onViolationLimit: () => handleFinish(),
 *     containerRef,  // protect bu DOM node'un içinde uygulanır
 *   });
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import api from '@/lib/api/apiClient';

// Görünür çıkış (fullscreen veya tab) sınırı — bu kadar çıktıktan sonra
// onViolationLimit callback'i tetiklenir.
const DEFAULT_EXIT_LIMIT = 3;

// Aynı tipten event server'a saniyede birden fazla gönderilmesin
const CLIENT_THROTTLE_MS = 1500;

export function useTestProctoring({
  attemptId,
  enabled = true,
  exitLimit = DEFAULT_EXIT_LIMIT,
  containerRef,
  onViolationLimit,
}) {
  // Tab switch + fullscreen exit toplam sayacı
  const [exitCount, setExitCount] = useState(0);
  // Son rapor edilen event'ler için throttling
  const lastReportRef = useRef({});
  // Callback ref — useCallback bağımlılığı sıfırlamasın
  const onLimitRef = useRef(onViolationLimit);
  useEffect(() => { onLimitRef.current = onViolationLimit; }, [onViolationLimit]);

  // ─── Server'a olay raporu ───────────────────────────────────────────────

  const report = useCallback((type, payload = null) => {
    if (!attemptId || !enabled) return;
    const now = Date.now();
    const last = lastReportRef.current[type] || 0;
    if (now - last < CLIENT_THROTTLE_MS) return;
    lastReportRef.current[type] = now;
    // Best-effort; hatayı yutuyoruz çünkü engelleme zaten yerel olarak yapıldı
    api.post(`/attempts/${attemptId}/anomaly`, { type, payload }).catch(() => {});
  }, [attemptId, enabled]);

  // ─── UX engelleri: container içinde event'leri yakala ────────────────────

  useEffect(() => {
    if (!enabled) return;
    const el = containerRef?.current || document.body;

    const onContextMenu = (e) => {
      e.preventDefault();
      report('CONTEXT_MENU');
    };
    const onCopy = (e) => {
      e.preventDefault();
      report('COPY_ATTEMPT');
    };
    const onCut = (e) => {
      e.preventDefault();
      report('CUT_ATTEMPT');
    };
    const onPaste = (e) => {
      e.preventDefault();
      report('PASTE_ATTEMPT');
    };
    const onDragStart = (e) => {
      // İmaj sürükleme + text dragging engelle
      e.preventDefault();
    };
    const onSelectStart = (e) => {
      // Drag-select engelle (mobil long-press menüsü dahil)
      const target = e.target;
      if (target && target.tagName === 'INPUT') return; // form input'ları hariç
      e.preventDefault();
    };

    el.addEventListener('contextmenu', onContextMenu);
    el.addEventListener('copy', onCopy);
    el.addEventListener('cut', onCut);
    el.addEventListener('paste', onPaste);
    el.addEventListener('dragstart', onDragStart);
    el.addEventListener('selectstart', onSelectStart);

    return () => {
      el.removeEventListener('contextmenu', onContextMenu);
      el.removeEventListener('copy', onCopy);
      el.removeEventListener('cut', onCut);
      el.removeEventListener('paste', onPaste);
      el.removeEventListener('dragstart', onDragStart);
      el.removeEventListener('selectstart', onSelectStart);
    };
  }, [enabled, containerRef, report]);

  // ─── Klavye kısayolları ─────────────────────────────────────────────────

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e) => {
      // Ctrl/Cmd kombinasyonları
      const ctrl = e.ctrlKey || e.metaKey;
      const key = (e.key || '').toLowerCase();

      // Yazdırma + kaydetme + tümünü seç + console
      if (ctrl && ['p', 's', 'a', 'u'].includes(key)) {
        e.preventDefault();
        report('SHORTCUT_BLOCKED', { combo: `ctrl+${key}` });
        return;
      }

      // DevTools açıcılar (best-effort — Ctrl+Shift+I/J/C, F12)
      if (
        e.key === 'F12' ||
        (ctrl && e.shiftKey && ['i', 'j', 'c'].includes(key))
      ) {
        e.preventDefault();
        report('SHORTCUT_BLOCKED', { combo: e.key === 'F12' ? 'F12' : `ctrl+shift+${key}` });
        return;
      }

      // PrintScreen — keyup'ta gelir, bazı tarayıcılarda hiç gelmez
      if (e.key === 'PrintScreen') {
        report('PRINT_KEY');
        // Tarayıcılar PrintScreen'i engelleyemez; sadece logluyoruz
      }
    };

    const onKeyUp = (e) => {
      if (e.key === 'PrintScreen') {
        report('PRINT_KEY');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [enabled, report]);

  // ─── Headless / bot detection (mount'ta bir kez) ─────────────────────────

  useEffect(() => {
    if (!enabled) return;
    try {
      if (navigator.webdriver === true) {
        report('HEADLESS_DETECTED', { reason: 'navigator.webdriver' });
      }
      // Headless Chrome bazı sürümlerde plugin'siz gelir
      if (navigator.plugins && navigator.plugins.length === 0 && /HeadlessChrome/i.test(navigator.userAgent || '')) {
        report('HEADLESS_DETECTED', { reason: 'HeadlessChrome UA + 0 plugins' });
      }
    } catch { /* sessiz */ }
  }, [enabled, report]);

  // ─── DevTools açık heuristic (pencere boyut farkı) ──────────────────────
  // Threshold: pencere outerHeight - innerHeight > 160 (devtools alt panel)
  // veya outerWidth - innerWidth > 200 (devtools yan panel)
  // False positive riski: zoom, ekran scale. Bu yüzden sadece logla, engelleme.

  useEffect(() => {
    if (!enabled) return;
    const check = () => {
      const dh = window.outerHeight - window.innerHeight;
      const dw = window.outerWidth - window.innerWidth;
      if (dh > 160 || dw > 200) {
        report('DEVTOOLS_HEURISTIC', { dh, dw });
      }
    };
    // Her 3 saniyede bir kontrol — throttle backend tarafında saniyede 1
    const id = setInterval(check, 3000);
    return () => clearInterval(id);
  }, [enabled, report]);

  // ─── Fullscreen + Visibility ────────────────────────────────────────────

  const tryEnterFullscreen = useCallback(() => {
    const el = containerRef?.current || document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) {
      el.requestFullscreen().catch(() => { /* kullanıcı izin vermedi */ });
    }
  }, [containerRef]);

  useEffect(() => {
    if (!enabled) return;

    const bumpExit = (reason) => {
      report(reason === 'fullscreen' ? 'FULLSCREEN_EXIT' : 'TAB_SWITCH');
      setExitCount((c) => {
        const next = c + 1;
        if (next >= exitLimit && onLimitRef.current) {
          onLimitRef.current({ count: next, limit: exitLimit, reason });
        }
        return next;
      });
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') bumpExit('tab');
    };
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) bumpExit('fullscreen');
    };
    const onBlur = () => {
      // Pencere odağı kayboldu (alt+tab vb.) — visibility ile çakışabilir,
      // throttle backend'de
      report('WINDOW_BLUR');
    };

    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      window.removeEventListener('blur', onBlur);
    };
  }, [enabled, exitLimit, report]);

  // Proctoring kapanınca (test bitti / review / süre doldu → enabled=false) tarayıcı
  // fullscreen'inden ÇIK. Aksi halde sonuç ekranı ve sonraki NORMAL sayfalar
  // "widescreen" (tam ekran) kalıyordu. Bu effect yukarıdaki proctoring effect'inden
  // SONRA tanımlı: enabled true→false geçişinde önce onun cleanup'ı fullscreenchange
  // listener'ını kaldırır, sonra burada exit edilir → exit bir FULLSCREEN_EXIT
  // ihlali olarak SAYILMAZ.
  useEffect(() => {
    if (enabled) return;
    if (typeof document !== 'undefined' && document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => { /* tarayıcı reddetti — sessiz */ });
    }
  }, [enabled]);

  return {
    /** Toplam tab switch + fullscreen exit sayısı */
    exitCount,
    /** Aday onayı sonrası fullscreen'i başlat */
    enterFullscreen: tryEnterFullscreen,
    /** Manuel anomaly raporu (örn. RAPID_ANSWER) */
    reportAnomaly: report,
  };
}
