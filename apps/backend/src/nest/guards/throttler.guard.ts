import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';

/**
 * Custom rate limiter — tenant/user/IP bazlı key + frontend kimliği bazlı
 * profil ayrıştırma.
 *
 * Katman C: X-Client-App header'ı eksik olan isteklere DAHA SIKI limit uygulanır
 * (varsayılan limit'in %20'si). Bu, GET endpoint'lerinde (OriginProtectionGuard
 * mutating-only olduğu için kontrol etmez) scraper/scriptkid'leri yavaşlatır.
 *
 * Mevcut frontend her zaman X-Client-App gönderir → normal limit uygulanır.
 * Header'sız bir scraper sıkı limite takılır.
 */
const CLIENT_APP_PREFIX = 'sinavsalonu-web';
const UNTRUSTED_RATIO = 0.2; // header'sız isteklere normal limit'in %20'si

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected override generateKey(context: ExecutionContext, _tracker: string): string {
    const req = context.switchToHttp().getRequest();
    // RATE LIMIT KİMLİĞİ KULLANICI/IP BAZLI OLMALI — tenant bazlı DEĞİL.
    // Uygulama tek "default" tenant ile çalıştığından, tenant:id ile anahtarlamak
    // TÜM kullanıcıları (eğitici + aday + anonim) tek bir 120/dk bucket'ına
    // sıkıştırır → SPA'nın sayfa başına onlarca çağrısı ortak limiti anında
    // doldurur, herkes "ilk denemede" 429 alır (üretimde yaşandı, 2026-06-07).
    // Önce authenticated user, sonra IP ile anahtarla; tenant'ı key olarak kullanma.
    const userId = req.user?.id;
    if (userId) return `user:${userId}`;
    // support X-Forwarded-For header for proxied clients
    const xff = req.headers?.['x-forwarded-for'];
    let ip: string;
    if (xff) {
      ip = Array.isArray(xff) ? xff[0] : String(xff).split(',')[0].trim();
    } else {
      ip = req.ip;
    }
    // Frontend header'sız istekler ayrı bucket'a düşer → daha sıkı limit
    const clientApp = (req.headers?.['x-client-app'] as string) ?? '';
    const trusted = clientApp.startsWith(CLIENT_APP_PREFIX);
    return trusted ? `ip:${ip}` : `ip:untrusted:${ip}`;
  }

  /**
   * X-Client-App header'ı eksikse limit'i %20'ye düşürür (örn. 100/dk → 20/dk).
   * Trusted frontend istekleri etkilenmez.
   */
  protected override async handleRequest(requestProps: {
    context: ExecutionContext;
    limit: number;
    ttl: number;
    throttler: any;
    blockDuration: number;
    getTracker: (req: Record<string, any>) => Promise<string>;
    generateKey: (context: ExecutionContext, trackerString: string, throttlerName: string) => string;
  }): Promise<boolean> {
    const req = requestProps.context.switchToHttp().getRequest();
    const clientApp = (req.headers?.['x-client-app'] as string) ?? '';
    const trusted = clientApp.startsWith(CLIENT_APP_PREFIX);
    const adjustedLimit = trusted
      ? requestProps.limit
      : Math.max(1, Math.floor(requestProps.limit * UNTRUSTED_RATIO));
    return super.handleRequest({ ...requestProps, limit: adjustedLimit });
  }

  /** ThrottlerLimitDetail tip uyumu (NestJS >= 5) */
  protected throwThrottlingException(_context: ExecutionContext, _throttlerLimitDetail: ThrottlerLimitDetail): Promise<void> {
    return super.throwThrottlingException(_context, _throttlerLimitDetail);
  }
}

