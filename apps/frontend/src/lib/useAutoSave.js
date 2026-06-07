/**
 * useAutoSave — Form verisini lokal (localStorage) + isteğe bağlı sunucu
 * (DraftSnapshot) yedeği olarak otomatik saklar.
 *
 * Veri akışı:
 *   - Aktivite olur (form değişir)        → debounceMs sonrası save tetiklenir
 *   - intervalMs idle ticki                → save tetiklenir (heartbeat)
 *   - Sayfa kapatılıyor (beforeunload/visibility) → save + sunucuya beacon
 *
 * Server-side draft (opsiyonel):
 *   - `serverKey` verilirse PUT /drafts/:key ile sunucuya da yedeklenir.
 *   - Localstorage sıfırlansa ya da cihaz değişse bile draft kurtarılabilir.
 *   - loadDraft() önce sunucuyu sorar, yoksa localStorage'a düşer.
 *
 * Kullanım:
 *   const { save, hasDraft, loadDraft, clearDraft, lastSavedAt, isSaving } =
 *     useAutoSave('createTestWizard_user123', () => formData, {
 *       serverKey: 'createTestWizard',
 *       debounceMs: 2000,
 *       intervalMs: 10000,
 *     });
 *
 * @param {string}       draftKey    - Benzersiz taslak anahtarı (localStorage için)
 * @param {() => object} getFormData - Anlık form verisini döndüren fonksiyon
 * @param {object}       [options]
 * @param {boolean}      [options.enabled]    - Auto-save aktif mi (default: true)
 * @param {number}       [options.intervalMs] - Idle heartbeat aralığı (default: 10000)
 * @param {number}       [options.debounceMs] - Aktivite sonrası debounce (default: 2000)
 * @param {string|null}  [options.serverKey]  - Verilirse sunucuya da yedek (null = sadece local)
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import api from '@/lib/api/apiClient';

const DRAFT_PREFIX        = 'autosave_';
const DEFAULT_INTERVAL_MS = 10_000; // 10 saniye (idle heartbeat)
const DEFAULT_DEBOUNCE_MS = 2_000;  // 2 saniye (aktivite sonrası)

export function useAutoSave(draftKey, getFormData, {
  enabled    = true,
  intervalMs = DEFAULT_INTERVAL_MS,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  serverKey  = null,
} = {}) {
  const storageKey  = `${DRAFT_PREFIX}${draftKey}`;
  const intervalRef = useRef(null);
  const debounceRef = useRef(null);
  const lastDataRef = useRef(null);
  const getFormRef  = useRef(getFormData);
  const enabledRef  = useRef(enabled);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [isSaving, setIsSaving]       = useState(false);

  useEffect(() => { getFormRef.current = getFormData; }, [getFormData]);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  // ─── Lokal kayıt (her zaman senkron, hata yutar) ────────────────────────

  const saveLocal = useCallback((data) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        data,
        savedAt: new Date().toISOString(),
      }));
    } catch {
      // Disk dolu veya private mode — sessizce geç
    }
  }, [storageKey]);

  // ─── Sunucu kaydı (best-effort, async) ──────────────────────────────────

  const saveServer = useCallback(async (data) => {
    if (!serverKey) return;
    try {
      await api.put(`/drafts/${encodeURIComponent(serverKey)}`, { payload: data });
    } catch {
      // Çevrimdışı, auth düşmüş vs. — lokal kayıt zaten var, sessizce geç
    }
  }, [serverKey]);

  // ─── Birleşik save (lokal + opsiyonel sunucu) ────────────────────────────

  const save = useCallback(async () => {
    if (!enabledRef.current) return;
    const data = getFormRef.current?.();
    if (data == null) return;

    // Veri değişmediyse atla (network gürültüsünü azalt)
    const serialized = JSON.stringify(data);
    if (serialized === lastDataRef.current) return;
    lastDataRef.current = serialized;

    saveLocal(data);
    setLastSavedAt(new Date());

    if (serverKey) {
      setIsSaving(true);
      try {
        await saveServer(data);
      } finally {
        setIsSaving(false);
      }
    }
  }, [saveLocal, saveServer, serverKey]);

  // ─── Aktivite ile tetiklenen debounce ────────────────────────────────────

  const scheduleSave = useCallback(() => {
    if (!enabledRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      save();
    }, debounceMs);
  }, [save, debounceMs]);

  // ─── Taslak okuma (önce sunucu, sonra lokal) ────────────────────────────

  /**
   * Sunucudaki + lokaldeki taslağı kontrol eder. İkisinden hangisi yeni ise
   * onu döner. Sadece lokal varsa onu, sadece sunucu varsa onu döner.
   * @returns {Promise<{ data: object, savedAt: string, source: 'server'|'local' } | null>}
   */
  const loadDraft = useCallback(async () => {
    let local = null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) local = JSON.parse(raw);
    } catch {}

    let server = null;
    if (serverKey) {
      try {
        const { data } = await api.get(`/drafts/${encodeURIComponent(serverKey)}`);
        if (data && data.payload) {
          server = { data: data.payload, savedAt: data.updatedAt };
        }
      } catch {
        // sunucu erişilemez, sadece lokali kullan
      }
    }

    if (server && local) {
      // İki yer de doluysa daha yeni olan kazanır
      const sTs = new Date(server.savedAt).getTime();
      const lTs = new Date(local.savedAt).getTime();
      return sTs >= lTs
        ? { ...server, source: 'server' }
        : { ...local, source: 'local' };
    }
    if (server) return { ...server, source: 'server' };
    if (local) return { ...local, source: 'local' };
    return null;
  }, [storageKey, serverKey]);

  /** Synchronous lokal kontrol — sadece "draft var mı" sorusu için. */
  const hasDraft = useCallback(() => {
    try {
      return !!localStorage.getItem(storageKey);
    } catch {
      return false;
    }
  }, [storageKey]);

  /**
   * Lokal + sunucu draft'ını siler. Başarılı bir kalıcı kayıt (publish vb.)
   * sonrası çağırılır.
   */
  const clearDraft = useCallback(async () => {
    try { localStorage.removeItem(storageKey); } catch {}
    lastDataRef.current = null;
    if (serverKey) {
      try {
        await api.delete(`/drafts/${encodeURIComponent(serverKey)}`);
      } catch { /* sessiz */ }
    }
  }, [storageKey, serverKey]);

  // ─── Idle heartbeat ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!enabled) return;
    intervalRef.current = setInterval(save, intervalMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [save, enabled, intervalMs]);

  // ─── Sayfa kapanma / sekme görünmez olma → flush ────────────────────────
  //
  // beforeunload'ta async fetch iptal olabildiği için iki yol:
  //   1) localStorage.setItem — anında, senkron, kaybolmaz
  //   2) navigator.sendBeacon — async ama tarayıcı bunu garantili gönderir
  //
  // visibilitychange + pagehide event'leri mobil tarayıcılarda beforeunload'tan
  // daha güvenilir tetiklenir; üçünü birden dinleriz.

  useEffect(() => {
    if (!enabled) return;

    const flushNow = () => {
      const data = getFormRef.current?.();
      if (data == null) return;
      // Senkron lokal yedek — sekme kapanırken garantili (localStorage). Sunucu
      // draft'ı zaten düzenleme sırasında debounce'lu PUT ile kaydediliyor ve
      // loadDraft() açılışta lokali de okuduğundan aynı cihazda iş kaybı olmaz.
      //
      // NOT: Burada eskiden sunucuya `navigator.sendBeacon` ile POST /api/drafts
      // atılıyordu; ama (a) backend draft endpoint'i yalnız PUT kabul ediyor →
      // 404 ve (b) token yanlış localStorage anahtarından ('jwt_token') okunuyordu
      // → her zaman boş. Yani HİÇ çalışmadı, sadece konsolda 404 gürültüsü üretti.
      // Kaldırıldı; lokal flush yeterli güvenceyi sağlıyor.
      saveLocal(data);
    };

    const onBeforeUnload = () => { flushNow(); };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushNow();
    };
    const onPageHide = () => { flushNow(); };

    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [saveLocal, enabled]);

  return {
    /** Anlık kayıt (lokal + opsiyonel sunucu) */
    save,
    /** Aktivite sonrası debounce'lu kayıt — onChange handler'larından çağırın */
    scheduleSave,
    /** Lokalde draft var mı (sync) */
    hasDraft,
    /** Lokal + sunucu draft'ını birleştir, en yeni olanı döner (async) */
    loadDraft,
    /** Hem lokali hem sunucuyu sil */
    clearDraft,
    /** En son başarılı kayıt zamanı (Date veya null) */
    lastSavedAt,
    /** Sunucuya kayıt sürüyor mu */
    isSaving,
  };
}
