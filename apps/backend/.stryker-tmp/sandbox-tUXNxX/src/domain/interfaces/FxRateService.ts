// @ts-nocheck
export type FxCurrency = 'TRY' | 'USD' | 'EUR' | 'GBP';

export const FX_RATE_SERVICE = 'FX_RATE_SERVICE';

export interface FxRateService {
  /**
   * İki currency arasındaki dönüşüm oranı.
   * Cache: implementation kendi cache'ini yönetir (TTL 1 saat önerilen).
   */
  getRate(from: FxCurrency, to: FxCurrency): Promise<number>;

  /**
   * Bir tutarı (cents) hedef currency'ye dönüştür.
   * Yuvarlama: banker (round half to even).
   */
  convert(amountCents: number, from: FxCurrency, to: FxCurrency): Promise<number>;
}
