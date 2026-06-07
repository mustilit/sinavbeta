/**
 * useAnswerQueue — Test sırasında cevapları localStorage'a yedekler,
 * API'ye iletir; ağ hatası durumunda kuyruğa alır, bağlantı gelince flush eder.
 *
 * Cevap akışı:
 *   seçim → localStorage kuyruğuna yaz (anında, senkron)
 *           → POST /attempts/:id/answers dene
 *           → Başarı:  kuyruktan sil
 *           → Hata:    kuyrukta bırak — bağlantı gelince otomatik flush
 *
 * Sayfa yenilenirse:
 *   Mount'ta kuyruk kontrol edilir, online ise hemen flush edilir.
 *   Bu sayede yenilemeden önceki kaydedilmemiş cevaplar kurtarılır.
 *
 * @param {string | null} attemptId - Aktif attempt ID'si
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import api from '@/lib/api/apiClient';

// localStorage anahtar fabrikası
const queueKey = (attemptId) => `ans_q_${attemptId}`;

export function useAnswerQueue(attemptId) {
  // Gönderilmeyi bekleyen cevap sayısı
  const [pendingCount, setPendingCount] = useState(0);
  // Flush işlemi sürüyor mu
  const [isFlushing, setIsFlushing] = useState(false);

  // Eşzamanlı flush önlemek için kilit
  const flushLockRef = useRef(false);

  // ─── Yardımcı: localStorage'daki kuyruk sayısını güncelle ───────────────

  const syncCount = useCallback(() => {
    if (!attemptId) return;
    try {
      const raw = localStorage.getItem(queueKey(attemptId));
      const q   = raw ? JSON.parse(raw) : [];
      setPendingCount(Array.isArray(q) ? q.length : 0);
    } catch {
      setPendingCount(0);
    }
  }, [attemptId]);

  // ─── Kuyruğa cevap ekle ─────────────────────────────────────────────────

  const enqueue = useCallback((questionId, optionId) => {
    if (!attemptId) return;
    try {
      const raw      = localStorage.getItem(queueKey(attemptId));
      const q        = raw ? JSON.parse(raw) : [];
      // Aynı soru için önceki girişi kaldır (idempotent overwrite)
      const filtered = q.filter((item) => item.questionId !== questionId);
      filtered.push({ questionId, optionId: optionId ?? null, ts: Date.now() });
      localStorage.setItem(queueKey(attemptId), JSON.stringify(filtered));
      syncCount();
    } catch {}
  }, [attemptId, syncCount]);

  // ─── Başarılı gönderim sonrası kuyruktan kaldır ──────────────────────────

  const dequeue = useCallback((questionId) => {
    if (!attemptId) return;
    try {
      const raw      = localStorage.getItem(queueKey(attemptId));
      const q        = raw ? JSON.parse(raw) : [];
      const filtered = q.filter((item) => item.questionId !== questionId);
      localStorage.setItem(queueKey(attemptId), JSON.stringify(filtered));
      syncCount();
    } catch {}
  }, [attemptId, syncCount]);

  // ─── Kuyrukta bekleyen tüm cevapları gönder ─────────────────────────────

  const flush = useCallback(async () => {
    if (!attemptId || flushLockRef.current) return;
    flushLockRef.current = true;
    setIsFlushing(true);
    try {
      const raw = localStorage.getItem(queueKey(attemptId));
      const q   = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(q) || q.length === 0) return;

      for (const item of q) {
        try {
          const body = { questionId: item.questionId };
          // optionId null → boş bırakma (cevabı temizle)
          if (item.optionId) body.optionId = item.optionId;
          await api.post(`/attempts/${attemptId}/answers`, body);
          dequeue(item.questionId);
        } catch {
          // Bu item başarısız — kuyrukta kalsın, sonraki denemede tekrar denenecek
          break;
        }
      }
    } finally {
      flushLockRef.current = false;
      setIsFlushing(false);
      syncCount();
    }
  }, [attemptId, dequeue, syncCount]);

  // ─── Birleşik submit: kuyruğa ekle + API'ye gönder ──────────────────────

  /**
   * Cevabı hem localStorage kuyruğuna yazar hem de API'ye göndermeye çalışır.
   * API başarısız olursa kuyruğa alınmış cevap daha sonra flush ile iletilir.
   *
   * @param {string} questionId
   * @param {string | undefined} optionId - undefined = boş bırak
   */
  const submitAnswer = useCallback(async (questionId, optionId) => {
    // 1. Önce kuyruğa yaz (anında, kayıp yok)
    enqueue(questionId, optionId);
    try {
      // 2. API'ye gönder
      const body = { questionId };
      if (optionId !== undefined) body.optionId = optionId;
      await api.post(`/attempts/${attemptId}/answers`, body);
      // 3. Başarı: kuyruktan temizle
      dequeue(questionId);
    } catch {
      // 4. Hata: kuyrukta kalsın — flush ile yeniden denenecek
    }
  }, [attemptId, enqueue, dequeue]);

  // ─── Bağlantı gelince otomatik flush ────────────────────────────────────

  useEffect(() => {
    const handleOnline = () => flush();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [flush]);

  // ─── Sayfa kapanıyor → sendBeacon ile son fırsat flush ───────────────────
  //
  // beforeunload/visibilitychange'te async fetch tarayıcı tarafından iptal
  // edilebilir; navigator.sendBeacon küçük POST'ları garantili gönderir.
  // Token URL parametresi olarak iletilir çünkü beacon custom header taşımaz —
  // backend bunu fallback olarak kabul edebilir; etmezse en azından
  // localStorage kuyruğu kalır, sonraki açılışta flush olur.

  // Eski hali navigator.sendBeacon ile POST /api/attempts/:id/answers?t=<token>
  // atıyordu; token yanlış localStorage anahtarından ('jwt_token') okunduğu için
  // HER ZAMAN boştu → backend 401/404, hiç çalışmadı, sadece konsol gürültüsü
  // üretti. Kaldırıldı. Yerine working flush() best-effort çağrılır (apiClient
  // proper auth header'ı ekler, gürültüsüz). Cevap kalıcılığı zaten: (1) her
  // cevapta anlık POST, (2) localStorage kuyruğu, (3) `online` event, (4) mount
  // flush ile güvencede — beacon zaten hiçbir zaman bu zincire katkı yapmıyordu.
  useEffect(() => {
    if (!attemptId) return;
    const onHidden = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', flush);
    };
  }, [attemptId, flush]);

  // ─── Mount: sayımı senkronize et, online ise hemen flush et ─────────────

  useEffect(() => {
    syncCount();
    // Önceki oturumdan kalan bekleyen cevapları temizle
    if (navigator.onLine) flush();
  }, [attemptId]);  

  // ─── Test bitince kuyruğu tamamen temizle ───────────────────────────────

  const clearQueue = useCallback(() => {
    if (!attemptId) return;
    try {
      localStorage.removeItem(queueKey(attemptId));
      setPendingCount(0);
    } catch {}
  }, [attemptId]);

  return {
    /** Cevabı kuyruğa yaz ve API'ye göndermeye çalış */
    submitAnswer,
    /** Gönderilmeyi bekleyen cevap sayısı */
    pendingCount,
    /** Flush işlemi devam ediyor mu */
    isFlushing,
    /** Kuyruğu manuel olarak flush et */
    flush,
    /** Test bitince kuyruğu temizle */
    clearQueue,
  };
}
