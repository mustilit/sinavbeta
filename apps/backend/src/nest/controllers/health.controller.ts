import { Controller, Get, HttpException, HttpStatus, Optional } from '@nestjs/common';
import { Public } from '../decorators/public.decorator';
import { InternalOnly } from '../decorators/internal-only.decorator';
import { prisma } from '../../infrastructure/database/prisma';
import { ReportingTestRepository } from '../../infrastructure/repositories/ReportingTestRepository';
import Redis from 'ioredis';
import { getRedisUrl, isRedisDisabled } from '../../config/redis';

/**
 * Sağlık kontrolü endpoint'leri — load balancer ve monitoring sistemleri için.
 *
 * /health (liveness): sadece servisin yaşıyor olduğunu söyler, kimsiz açıktır.
 * Diğer /health/* + /ready endpoint'leri DB/Redis/replica iç durumunu sızdırır,
 * bu yüzden InternalOnly ile yalnızca METRICS_ALLOWED_IPS allowlist'inden ulaşılır.
 * Kubernetes readinessProbe için pod CIDR'sini allowlist'e ekleyin.
 */
@Controller()
export class HealthController {
  // ReportingTestRepository DI'a kayıtlı değil; manuel default instantiation ile
  // sağlanır. @Optional() olmadan Nest paramtype'ı container'da arar ve boot'ta patlar.
  constructor(
    @Optional() private readonly reportingRepo: ReportingTestRepository = new ReportingTestRepository(),
  ) {}

  @Public()
  @Get('health')
  health() {
    return { ok: true, service: 'dal' };
  }

  @Public()
  @InternalOnly()
  @Get('health/replica')
  async replica() {
    const enabled = !!process.env.DATABASE_REPLICA_URL;
    const lag = await this.reportingRepo.replicationLagSeconds();
    return { enabled, lagSeconds: lag, ok: !enabled || (lag >= 0 && lag < 30) };
  }

  @Public()
  @InternalOnly()
  @Get('health/redis')
  async redisHealth() {
    if (isRedisDisabled()) {
      return { ok: true, redis: false, disabled: true };
    }

    const url = getRedisUrl();
    const client = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
    });
    try {
      const pong = await client.ping();
      if (pong !== 'PONG') {
        throw new Error(`Unexpected PING response: ${pong}`);
      }
      return { ok: true, redis: true };
    } catch (e: any) {
      const message = e?.message || 'Redis health check failed';
      // eslint-disable-next-line no-console
      console.error('Redis health check error', message);
      throw new HttpException(
        {
          ok: false,
          redis: false,
          error: message,
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    } finally {
      try {
        await client.quit();
      } catch {
        client.disconnect();
      }
    }
  }

  @Public()
  @InternalOnly()
  @Get('health/db')
  async dbHealth() {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { ok: true, db: true };
    } catch (e: any) {
      const message = e?.message || 'DB health check failed';
      // Prisma hatası ise code bilgisini maskelemeden ama host'u göstermeden loglayalım
      // eslint-disable-next-line no-console
      console.error('DB health check error', {
        code: (e as any)?.code,
        message,
      });
      throw new HttpException(
        {
          error: {
            code: 'DB_UNAVAILABLE',
            message,
            details: { prismaCode: (e as any)?.code ?? null },
          },
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Public()
  @InternalOnly()
  @Get('ready')
  async ready() {
    const checks: { db: boolean; redis: boolean | 'disabled' } = {
      db: false,
      redis: isRedisDisabled() ? 'disabled' : false,
    };

    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.db = true;
    } catch (e) {
      checks.db = false;
    }

    if (checks.redis !== 'disabled') {
      try {
        const client = new Redis(getRedisUrl(), { maxRetriesPerRequest: 1, enableReadyCheck: true });
        const pong = await client.ping();
        checks.redis = pong === 'PONG';
        try {
          await client.quit();
        } catch {
          client.disconnect();
        }
      } catch {
        checks.redis = false;
      }
    }

    const ok = checks.db === true && (checks.redis === true || checks.redis === 'disabled');
    if (!ok) {
      throw new HttpException(
        { error: { code: 'SERVICE_UNAVAILABLE', message: 'Readiness check failed', details: checks } },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return { ok: true, service: 'dal', checks };
  }
}

