import { Injectable } from '@nestjs/common';
import { FxRateService, FxCurrency } from '../../domain/interfaces/FxRateService';
import { bankerRound } from '../../domain/utils/bankerRound';

/**
 * Test ve dev için sabit FX kurları. .env üzerinden override edilebilir.
 * Kullanım: AppModule'da FX_RATE_SERVICE token'a useClass: FixedFxService.
 */
@Injectable()
export class FixedFxService implements FxRateService {
  // 1 unit = X cents oranı değil; 1 unit `from` = N unit `to` oranı.
  // TRY → USD: 0.031 (1 TRY ≈ 0.031 USD), USD → TRY: ~32
  private readonly rates: Record<string, number>;

  constructor() {
    // Env override formatı: FX_RATE_TRY_USD=0.031
    this.rates = {
      'TRY_TRY': 1, 'USD_USD': 1, 'EUR_EUR': 1, 'GBP_GBP': 1,
      'TRY_USD': Number(process.env.FX_RATE_TRY_USD ?? '0.031'),
      'TRY_EUR': Number(process.env.FX_RATE_TRY_EUR ?? '0.029'),
      'TRY_GBP': Number(process.env.FX_RATE_TRY_GBP ?? '0.025'),
      'USD_TRY': Number(process.env.FX_RATE_USD_TRY ?? '32.25'),
      'USD_EUR': Number(process.env.FX_RATE_USD_EUR ?? '0.93'),
      'USD_GBP': Number(process.env.FX_RATE_USD_GBP ?? '0.80'),
      'EUR_TRY': Number(process.env.FX_RATE_EUR_TRY ?? '34.50'),
      'EUR_USD': Number(process.env.FX_RATE_EUR_USD ?? '1.08'),
      'EUR_GBP': Number(process.env.FX_RATE_EUR_GBP ?? '0.86'),
      'GBP_TRY': Number(process.env.FX_RATE_GBP_TRY ?? '40.20'),
      'GBP_USD': Number(process.env.FX_RATE_GBP_USD ?? '1.25'),
      'GBP_EUR': Number(process.env.FX_RATE_GBP_EUR ?? '1.16'),
    };
  }

  async getRate(from: FxCurrency, to: FxCurrency): Promise<number> {
    const key = `${from}_${to}`;
    const rate = this.rates[key];
    if (rate === undefined || !Number.isFinite(rate) || rate <= 0) {
      throw new Error(`FX rate yok veya geçersiz: ${key}`);
    }
    return rate;
  }

  async convert(amountCents: number, from: FxCurrency, to: FxCurrency): Promise<number> {
    if (from === to) return amountCents;
    const rate = await this.getRate(from, to);
    return bankerRound(amountCents * rate);
  }
}
