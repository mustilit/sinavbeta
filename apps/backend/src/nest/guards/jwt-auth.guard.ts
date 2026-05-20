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
    if (isPublic) return true;

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

    // Ban/suspension kontrolü — cache'den oku, yoksa DB'den çek
    const cacheKey = `userBanStatus:${payload.sub}`;
    let banStatus = await this.cache.get<{ isBanned: boolean; suspendedUntil: string | null }>(cacheKey);

    if (banStatus === null) {
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { isBanned: true, suspendedUntil: true },
      });
      banStatus = {
        isBanned: user?.isBanned ?? false,
        suspendedUntil: user?.suspendedUntil?.toISOString() ?? null,
      };
      await this.cache.set(cacheKey, banStatus, BAN_CACHE_TTL_SECONDS);
    }

    if (banStatus.isBanned) {
      throw new UnauthorizedException({ error: 'ACCOUNT_SUSPENDED_OR_BANNED' });
    }
    if (banStatus.suspendedUntil && new Date(banStatus.suspendedUntil) > new Date()) {
      throw new UnauthorizedException({ error: 'ACCOUNT_SUSPENDED_OR_BANNED' });
    }

    return true;
  }
}

