/**
 * Typecheck (checkJs) için ortam tipleri — runtime etkisi yok.
 * dalClient axios kullanır: yakalanan hatalar AxiosError şeklidir; sayfalardaki
 * yaygın `e?.response?.data?.message` / `e?.code` erişimleri için Error genişletilir.
 */

interface Error {
  /** Axios hata yanıtı (varsa): { status, data: { message, code, ... } } */
  response?: {
    status?: number;
    data?: any;
    /** 429 yanıtlarında saniye cinsinden bekleme süresi (http.js ekler) */
    retryAfter?: number;
  };
  /** Uygulama/axios hata kodu (ör. ERR_NETWORK, DISCOUNT_NOT_FOUND) */
  code?: string;
  status?: number;
  /** Bazı ApiError akışlarında ham backend body'si */
  data?: any;
}

interface Window {
  /** Cloudflare Turnstile widget'ı (script yüklenince) */
  turnstile?: any;
  /** Turnstile script onload callback'i (TurnstileWidget kurar) */
  __turnstileOnLoad?: () => void;
  /** PWA offline durumu (src/lib/pwa.js set eder) */
  __sinavSalonuOffline?: boolean;
}
