import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '../../infrastructure/services/JwtService';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { RedisCache } from '../../infrastructure/cache/RedisCache';
import { prisma } from '../../infrastructure/database/prisma';

const BAN_CACHE_TTL_SECONDS = 60;

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly cache: RedisCache,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler();
    const cls = context.getClass();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [handler, cls]);
    if (isPublic) {
      // Opsiyonel kimlik: token varsa req.user'ı doldur (örn. tünel/yazılı liste-detay
      // "satın alındı mı" hesabı), yoksa veya geçersizse SESSİZCE geç — public route
      // asla reddedilmez. Ban/oturum kontrolü public içerikte uygulanmaz.
      const reqPub = context.switchToHttp().getRequest();
      const authPub = reqPub.headers['authorization'];
      if (authPub && authPub.startsWith('Bearer ')) {
        try {
          const payloadPub = this.jwtService.verify(authPub.slice(7));
          reqPub.user = { ...payloadPub, id: payloadPub.sub };
        } catch {
          /* geçersiz token → public erişim, yoksay */
        }
      }
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new UnauthorizedException('No token');
    }
    const token = auth.slice(7);
    let payload: ReturnType<JwtService['verify']>;
    try {
      payload = this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    req.user = { ...payload, id: payload.sub };

    // Ban/suspension + tek oturum kontrolü. Cache'de ban + activeSessionId
    // birlikte tutulur; eski cache şemasıyla uyumlu — activeSessionId yoksa
    // DB'den taze çekilir.
    const cacheKey = `userBanStatus:${payload.sub}`;
    let status = await this.cache.get<{ isBanned: boolean; suspendedUntil: string | null; activeSessionId: string | null }>(cacheKey);

    // Eski cache şeması (activeSessionId yok) → invalidate et
    if (status !== null && !('activeSessionId' in status)) {
      status = null;
    }

    if (status === null) {
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { isBanned: true, suspendedUntil: true, activeSessionId: true } as any,
      });
      status = {
        isBanned: (user as any)?.isBanned ?? false,
        suspendedUntil: (user as any)?.suspendedUntil?.toISOString() ?? null,
        activeSessionId: (user as any)?.activeSessionId ?? null,
      };
      await this.cache.set(cacheKey, status, BAN_CACHE_TTL_SECONDS);
    }

    if (status.isBanned) {
      throw new UnauthorizedException({ error: 'ACCOUNT_SUSPENDED_OR_BANNED' });
    }
    if (status.suspendedUntil && new Date(status.suspendedUntil) > new Date()) {
      throw new UnauthorizedException({ error: 'ACCOUNT_SUSPENDED_OR_BANNED' });
    }

    // Tek aktif oturum kuralı:
    //   - User.activeSessionId NULL ise (eski legacy tokenlar) geçirme.
    //   - User.activeSessionId varsa payload.sid ile eşleşmelidir.
    //   - payload.sid yoksa (eski token), aktif oturum ile karşılaştırılamaz →
    //     başka cihazda yeni login olmuşsa bu token reddedilir.
    if (status.activeSessionId) {
      if (!payload.sid || payload.sid !== status.activeSessionId) {
        throw new UnauthorizedException({ error: 'SESSION_REPLACED' });
      }
    }

    return true;
  }
}

