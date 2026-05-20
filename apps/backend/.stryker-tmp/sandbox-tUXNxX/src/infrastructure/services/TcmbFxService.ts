// @ts-nocheck
import { Injectable, Logger } from '@nestjs/common';
import { FxRateService, FxCurrency } from '../../domain/interfaces/FxRateService';
import { bankerRound } from '../../domain/utils/bankerRound';

interface CachedRate { rate: number; fetchedAt: number; }

/**
 * Türkiye Cumhuriyet Merkez Bankası günlük döviz kurları kaynağı.
 * XML uç noktası TRY-anchored kurlar verir; cross-rate'ler iki bacaklı hesaplanır.
 * Cache TTL: 1 saat (TCMB günde tek defa kur açıklar, ancak güvenlik için saatlik refresh).
 */
@Injectable()
export class TcmbFxService implements FxRateService {
  private readonly logger = new Logger(TcmbFxService.name);
  private cache: Map<string, CachedRate> = new Map();
  private readonly TTL_MS = 60 * 60 * 1000; // 1 saat
  private readonly TCMB_URL = 'https://www.tcmb.gov.tr/kurlar/today.xml';

  async getRate(from: FxCurrency, to: FxCurrency): Promise<number> {
    if (from === to) return 1;
    const key = `${from}_${to}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.fetchedAt < this.TTL_MS) {
      return cached.rate;
    }
    const rate = await this.fetchRate(from, to);
    this.cache.set(key, { rate, fetchedAt: Date.now() });
    return rate;
  }

  async convert(amountCents: number, from: FxCurrency, to: FxCurrency): Promise<number> {
    if (from === to) return amountCents;
    const rate = await this.getRate(from, to);
    return bankerRound(amountCents * rate);
  }

  /**
   * TCMB XML'i parse edip TRY-anchored kurlardan target kuru hesapla.
   * USD → EUR gibi cross-rate için iki bacak: USD→TRY ve TRY→EUR.
   * fetch API Node 18+'da global.
   */
  private async fetchRate(from: FxCurrency, to: FxCurrency): Promise<number> {
    try {
      const res = await fetch(this.TCMB_URL, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`TCMB HTTP ${res.status}`);
      const xml = await res.text();
      // TCMB XML structure: <Currency Kod="USD"><ForexBuying>32.1234</ForexBuying></Currency>
      const parseAnchor = (cur: FxCurrency): number => {
        if (cur === 'TRY') return 1;
        const re = new RegExp(`<Currency[^>]*Kod="${cur}"[^>]*>[\\s\\S]*?<ForexBuying>([\\d.]+)</ForexBuying>`);
        const m = xml.match(re);
        if (!m) throw new Error(`TCMB'de ${cur} bulunamadı`);
        return Number(m[1]);
      };
      const fromInTry = parseAnchor(from);  // 1 from = X TRY
      const toInTry = parseAnchor(to);
      // 1 from = (fromInTry / toInTry) to
      return fromInTry / toInTry;
    } catch (err) {
      this.logger.error(`TCMB FX fetch failed: ${(err as Error).message}`);
      throw err;
    }
  }
}
