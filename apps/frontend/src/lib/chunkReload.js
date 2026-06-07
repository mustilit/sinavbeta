/**
 * chunkReload — deploy sonrası / geçici ağ hatasında lazy-route chunk yükleme
 * çökmesinden otomatik kurtarma.
 *
 * SORUN: Sayfalar `React.lazy(() => import('./pages/X'))` ile kod-bölme kullanır.
 * Bir route'a girilince o chunk (örn. `EditTest-HASH.js`) indirilir. İndirme o an
 * başarısız olursa (geçici ağ kesintisi VEYA aktif service worker / cache geçişi /
 * yeni deploy ile eski hash'in sunucudan kalkması) `import()` reddedilir →
 * React.lazy hata fırlatır → ErrorBoundary "Bir şeyler ters gitti / Lütfen sayfayı
 * yenileyin" gösterir. Kullanıcı elle yenileyince düzelir (taze index + SW güncel).
 *
 * ÇÖZÜM: Böyle bir hata yakalanınca **tek sefer** otomatik reload — kullanıcı hata
 * ekranını hiç görmez. sessionStorage zaman damgası ile döngü engellenir: son
 * RELOAD_WINDOW_MS içinde tekrar reload edilmez (chunk gerçekten kalıcı 404 ise
 * sonsuz reload yerine ErrorBoundary'ye düşer).
 */

const RELOAD_TS_KEY = 'chunk_reload_ts';
const RELOAD_WINDOW_MS = 10_000;

// Hem webpack (ChunkLoadError) hem Vite/native dinamik import hata mesajları.
const CHUNK_ERROR_RE =
  /loading chunk|chunkloaderror|dynamically imported module|importing a module script failed|failed to fetch dynamically|error loading dynamically/i;

/**
 * Hata bir chunk/dinamik-import yükleme hatası mı?
 * @param {unknown} error
 * @returns {boolean}
 */
export function isChunkLoadError(error) {
  if (!error) return false;
  if (error.name === 'ChunkLoadError') return true;
  const msg = typeof error === 'string' ? error : error.message || '';
  return CHUNK_ERROR_RE.test(msg);
}

/**
 * Son RELOAD_WINDOW_MS içinde reload yapılmadıysa sayfayı bir kez yeniden yükler.
 * @returns {boolean} reload tetiklendiyse true (çağıran akışını durdurmalı)
 */
export function reloadOnceForChunkError() {
  if (typeof window === 'undefined') return false;
  try {
    const now = Date.now();
    const last = Number(sessionStorage.getItem(RELOAD_TS_KEY) || 0);
    if (now - last > RELOAD_WINDOW_MS) {
      sessionStorage.setItem(RELOAD_TS_KEY, String(now));
      window.location.reload();
      return true;
    }
  } catch {
    // private mode / storage erişilemez — döngü riskine girmemek için reload etme
  }
  return false;
}

/**
 * Vite'ın resmi mekanizması: dinamik import preload hatası `vite:preloadError`
 * event'i fırlatır. Bunu dinleyip tek-sefer reload ile kurtarırız (tüm lazy
 * import'ları kapsar; pages.config yeniden üretilse bile çalışmaya devam eder).
 */
export function setupChunkErrorRecovery() {
  if (typeof window === 'undefined') return;
  window.addEventListener('vite:preloadError', () => {
    reloadOnceForChunkError();
  });
}
