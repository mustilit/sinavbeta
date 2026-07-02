import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';
import { JwtService } from '../../infrastructure/services/JwtService';

// Throttler global APP_GUARD'dır ve route-level auth guard'dan ÖNCE çalışır →
// req.user henüz set DEĞİLDİR. Bu yüzden rate-limit key'i IP'ye düşüyordu; aynı
// NAT IP'si arkasındaki (okul/dershane lab) onlarca aday tek 120/dk bucket'ını
// paylaşıp 429 alıyordu (yük testinde doğrulandı, 2026-06-08). Çözüm: throttler
// Authorization token'ını KENDİSİ doğrulayıp userId çıkarsın → per-user key.
const jwtService = new JwtService();

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
  /**
   * `name` parametresi (throttler adı, örn. 'default') ve route/handler bilgisi
   * kasıtlı olarak DAHİL EDİLİR. 2026-06-08'deki NAT-IP düzeltmesi sırasında bu
   * parametreler tamamen atılmıştı (yalnız `user:<id>` / `ip:<ip>` döndürülüyordu)
   * — bu, base class'ın normalde `${ClassName}-${handlerName}-${throttlerName}`
   * öneki ile sağladığı ROTA AYRIMINI kaldırdı. Sonuç: aynı throttler adını
   * paylaşan (`@Throttle({ default: {...} })`) TÜM endpoint'ler — global limiter
   * dahil — aynı kullanıcı için TEK bir sayaç paylaşıyordu. Düşük limitli bir
   * route (örn. mesaj gönderme, 10/dk) sayacı, o kullanıcının SİTE GENELİNDEKİ
   * TÜM API çağrılarına (GET'ler dahil) karşı kontrol ediliyordu → kullanıcı
   * sayfayı gezinirken birkaç GET yapar yapmaz, hiç o route'u çağırmadan önce
   * "Gönderilemedi" (429) alıyordu (üretimde yaşandı, 2026-07-02 — E-Sınıf
   * "Mesaj Gönder" diyaloğu ilk denemede 429 döndü). Düzeltme: kullanıcı/IP
   * kimliğini KORU (NAT sorunu çözümü) ama rota ayrımını da GERİ EKLE.
   */
  protected override generateKey(context: ExecutionContext, _tracker: string, name: string): string {
    const req = context.switchToHttp().getRequest();
    // RATE LIMIT KİMLİĞİ KULLANICI/IP BAZLI OLMALI — tenant bazlı DEĞİL.
    // Uygulama tek "default" tenant ile çalıştığından, tenant:id ile anahtarlamak
    // TÜM kullanıcıları (eğitici + aday + anonim) tek bir 120/dk bucket'ına
    // sıkıştırır → SPA'nın sayfa başına onlarca çağrısı ortak limiti anında
    // doldurur, herkes "ilk denemede" 429 alır (üretimde yaşandı, 2026-06-07).
    // Önce authenticated user, sonra IP ile anahtarla; tenant'ı key olarak kullanma.
    const userId = req.user?.id ?? this.userIdFromToken(req);
    let identity: string;
    if (userId) {
      identity = `user:${userId}`;
    } else {
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
      identity = trusted ? `ip:${ip}` : `ip:untrusted:${ip}`;
    }
    // Rota ayrımı: aynı ismi paylaşan throttler'lar bile Class+Handler ile ayrılır.
    const routePrefix = `${context.getClass().name}-${context.getHandler().name}-${name}`;
    return `${routePrefix}-${identity}`;
  }

  /**
   * Authorization: Bearer <jwt> header'ını DOĞRULAYIP userId döner. Geçersiz/eksik/
   * süresi dolmuş token → null (IP fallback). İmza doğrulanır (verify); sadece
   * decode etseydik saldırgan sahte userId ile limit kaçırabilirdi. Rate-limit
   * yolunda olduğu için hata YUTULUR — auth kararı route guard'ın işi.
   */
  private userIdFromToken(req: { headers?: Record<string, unknown> }): string | null {
    const raw = req.headers?.['authorization'] ?? req.headers?.['Authorization'];
    const header = Array.isArray(raw) ? raw[0] : (raw as string | undefined);
    if (!header || typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
    const token = header.slice(7).trim();
    if (!token) return null;
    try {
      return jwtService.verify(token)?.sub ?? null;
    } catch {
      return null;
    }
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

