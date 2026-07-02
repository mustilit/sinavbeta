/**
 * useOffline — Bağlantı kesintisi tespiti ve otomatik çıkış yönetimi.
 *
 * Çalışma prensibi:
 *   1. navigator.onLine + window online/offline events (birincil kaynak)
 *   2. Heartbeat: her HEARTBEAT_INTERVAL_MS'de bir /me/ping çağrısı
 *      navigator.onLine doğru söylediği halde sunucuya erişilemeyen
 *      (captive portal, hat kopmadan VPN düşmesi vb.) senaryoları yakalar.
 *   3. İki ardışık heartbeat başarısızlığı → offline sayılır.
 *
 * Auto-exit:
 *   Bağlantı AUTO_EXIT_SECONDS boyunca gelmezse onAutoExit() tetiklenir.
 *
 * @param {object} [options]
 * @param {() => void} [options.onAutoExit]    - Süre dolunca çağrılır
 * @param {boolean}   [options.enabled]        - false ise heartbeat + countdown çalışmaz
 * @param {number}    [options.autoExitSeconds] - Varsayılan 30 saniye
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import api from '@/lib/api/apiClient';

const HEARTBEAT_INTERVAL_MS = 30_000;  // 30 saniye
const HEARTBEAT_FAIL_THRESHOLD = 2;    // Ardışık başarısız sayısı
const DEFAULT_AUTO_EXIT_SECONDS = 30;

export function useOffline(/** @type {any} */ {
  onAutoExit,
  enabled = true,
  autoExitSeconds = DEFAULT_AUTO_EXIT_SECONDS,
} = {}) {
  // navigator.onLine veya heartbeat başarısızlığına göre offline durumu
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine);
  // Kaç saniyedir offline
  const [offlineSeconds, setOfflineSeconds] = useState(0);

  // Referanslar — re-render'dan bağımsız iç durum
  const countdownRef        = useRef(null);
  const heartbeatRef        = useRef(null);
  const autoExitFiredRef    = useRef(false);
  const heartbeatFailsRef   = useRef(0);
  const isOfflineRef        = useRef(!navigator.onLine);
  const onAutoExitRef       = useRef(onAutoExit);

  // onAutoExit her render'da yeniden oluşabilir — ref üzerinden eriş
  useEffect(() => { onAutoExitRef.current = onAutoExit; }, [onAutoExit]);

  // ─── Countdown ───────────────────────────────────────────────────────────

  const startCountdown = useCallback(() => {
    if (countdownRef.current) return; // Zaten çalışıyor
    autoExitFiredRef.current = false;
    setOfflineSeconds(0);
    countdownRef.current = setInterval(() => {
      setOfflineSeconds((prev) => {
        const next = prev + 1;
        // Süre doldu ve henüz tetiklenmedi
        if (next >= autoExitSeconds && !autoExitFiredRef.current) {
          autoExitFiredRef.current = true;
          onAutoExitRef.current?.();
        }
        return next;
      });
    }, 1000);
  }, [autoExitSeconds]);

  const stopCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setOfflineSeconds(0);
    autoExitFiredRef.current = false;
  }, []);

  // ─── Offline / Online geçiş işlemleri ────────────────────────────────────

  const goOffline = useCallback(() => {
    if (isOfflineRef.current) return; // Zaten offline
    isOfflineRef.current = true;
    setIsOffline(true);
    startCountdown();
  }, [startCountdown]);

  const goOnline = useCallback(() => {
    if (!isOfflineRef.current) return; // Zaten online
    isOfflineRef.current = false;
    heartbeatFailsRef.current = 0;
    setIsOffline(false);
    stopCountdown();
  }, [stopCountdown]);

  // ─── Browser online/offline events ──────────────────────────────────────

  useEffect(() => {
    if (!enabled) return;

    const handleOffline = () => goOffline();
    const handleOnline  = () => {
      // navigator.onLine true oldu; heartbeat ile doğrula
      // Şimdilik optimistic olarak online say, heartbeat başarısız olursa geri döner
      heartbeatFailsRef.current = 0;
      goOnline();
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online',  handleOnline);

    // İlk yükleme kontrolü
    if (!navigator.onLine) goOffline();

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online',  handleOnline);
    };
  }, [enabled, goOffline, goOnline]);

  // ─── Heartbeat (G) ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!enabled) return;

    const beat = async () => {
      try {
        await api.get('/me/ping');
        // Başarılı → heartbeat hata sayacını sıfırla
        heartbeatFailsRef.current = 0;
        // navigator.onLine yanlış bildiriyorsa düzelt
        if (isOfflineRef.current && navigator.onLine) goOnline();
      } catch {
        // Ağ hatası ya da sunucu erişilemiyor
        heartbeatFailsRef.current += 1;
        if (heartbeatFailsRef.current >= HEARTBEAT_FAIL_THRESHOLD) {
          goOffline();
        }
      }
    };

    heartbeatRef.current = setInterval(beat, HEARTBEAT_INTERVAL_MS);
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [enabled, goOffline, goOnline]);

  // ─── Cleanup ─────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      stopCountdown();
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [stopCountdown]);

  return {
    isOffline,
    offlineSeconds,
    /** Otomatik çıkışa kalan saniye */
    remainingSeconds: Math.max(0, autoExitSeconds - offlineSeconds),
  };
}
