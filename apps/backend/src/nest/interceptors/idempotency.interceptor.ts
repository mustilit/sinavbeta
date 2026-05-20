/**
 * IdempotencyInterceptor — Idempotency-Key desteği
 *
 * Para akışı olan POST/PUT endpoint'lerinde "ağ retry → çift fatura" hatasını
 * önler. Client her istekte UUID üretir, header ile yollar. Server aynı key
 * 24 saat içinde tekrar gelirse önceki response'u aynen döner.
 *
 * Kullanım:
 *   @UseInterceptors(IdempotencyInterceptor)
 *   @Post('purchases')
 *   create(@Body() dto: CreatePurchaseDto, @CurrentUser() user) { ... }
 *
 * Akış:
 *   1. Header okunur ve regex ile doğrulanır.
 *   2. Redis'te kayıt aranır:
 *      - var, completed, aynı body hash → cached response döner.
 *      - var, completed, farklı body → 409 Conflict.
 *      - var, in_progress → 409 (retry-after).
 *      - yok → SET NX EX ile lock alınır (60s), use case çalışır.
 *   3. Use case başarılı → 'completed' kaydı yazılır (24h TTL).
 *   4. Use case fail → lock silinir, retry edilebilir.
 *
 * İlgili skill: docs/proposed-claude/skills/idempotency/SKILL.md
 */
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Observable, of, from, throwError } from 'rxjs';
import { tap, switchMap, catchError } from 'rxjs/operators';
import { createHash } from 'crypto';
import { RedisCache } from '../../infrastructure/cache/RedisCache';

const COMPLETED_TTL_SECONDS = 60 * 60 * 24; // 24h
const LOCK_TTL_SECONDS = 60; // 60s — use case kısa sürmeli
const KEY_REGEX = /^[A-Za-z0-9_-]{16,128}$/;

interface InProgressEntry {
  status: 'in_progress';
  requestHash: string;
  createdAt: string;
}

interface CompletedEntry {
  status: 'completed';
  requestHash: string;
  responseStatus: number;
  responseBody: string;
  createdAt: string;
}

type StoredEntry = InProgressEntry | CompletedEntry;

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(private readonly cache: RedisCache) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();
    const key = req.header?.('idempotency-key') ?? req.headers?.['idempotency-key'];

    if (!key) {
      // Header opsiyonel; yoksa pass-through. Zorunlu yapmak istiyorsan burada throw.
      return next.handle();
    }
    if (typeof key !== 'string' || !KEY_REGEX.test(key)) {
      return throwError(
        () =>
          new BadRequestException(
            'Geçersiz Idempotency-Key formatı. 16-128 karakter [A-Za-z0-9_-]+.',
          ),
      );
    }

    const tenantId = req.tenant?.id ?? req.user?.tenantId ?? 'public';
    const userId = req.user?.id ?? 'anon';
    const storeKey = `idem:${tenantId}:${userId}:${key}`;
    const requestHash = hashRequest(req);

    return from(this.cache.get<StoredEntry>(storeKey)).pipe(
      switchMap((existing) => {
        if (existing) {
          if (existing.requestHash !== requestHash) {
            this.logger.warn(`idempotency key reuse with different payload: ${storeKey}`);
            return throwError(
              () =>
                new ConflictException(
                  'Idempotency-Key farklı bir istek için zaten kullanıldı.',
                ),
            );
          }
          if (existing.status === 'in_progress') {
            return throwError(
              () =>
                new ConflictException(
                  'Aynı istek hâlâ işleniyor, lütfen birkaç saniye sonra tekrar deneyin.',
                ),
            );
          }
          // Cached response replay
          res.status?.(existing.responseStatus);
          try {
            return of(JSON.parse(existing.responseBody));
          } catch {
            return of(existing.responseBody);
          }
        }

        // Atomic lock — race koşulunda sadece bir tane geçer
        const lockEntry: InProgressEntry = {
          status: 'in_progress',
          requestHash,
          createdAt: new Date().toISOString(),
        };
        return from(this.cache.setIfNotExists(storeKey, lockEntry, LOCK_TTL_SECONDS)).pipe(
          switchMap((acquired) => {
            if (!acquired) {
              // Yarışı kaybettik — yeniden oku ve davranışa karar ver
              return from(this.cache.get<StoredEntry>(storeKey)).pipe(
                switchMap((after) => {
                  if (after?.status === 'completed' && after.requestHash === requestHash) {
                    res.status?.(after.responseStatus);
                    try {
                      return of(JSON.parse(after.responseBody));
                    } catch {
                      return of(after.responseBody);
                    }
                  }
                  return throwError(
                    () =>
                      new ConflictException(
                        'Aynı istek hâlâ işleniyor, lütfen birkaç saniye sonra tekrar deneyin.',
                      ),
                  );
                }),
              );
            }

            // İş yapılıyor
            return next.handle().pipe(
              tap((body) => {
                const completed: CompletedEntry = {
                  status: 'completed',
                  requestHash,
                  responseStatus: res.statusCode ?? 200,
                  responseBody: JSON.stringify(body ?? null),
                  createdAt: new Date().toISOString(),
                };
                // Cache yazımı best-effort — başarısız olsa bile response gider
                this.cache
                  .set(storeKey, completed, COMPLETED_TTL_SECONDS)
                  .catch((err) =>
                    this.logger.warn(
                      `idempotency completed write failed: ${storeKey} ${err?.message ?? err}`,
                    ),
                  );
              }),
              catchError((err) => {
                // Lock'u temizle ki retry edilebilsin
                this.cache.del(storeKey).catch(() => undefined);
                return throwError(() => err);
              }),
            );
          }),
        );
      }),
    );
  }
}

function hashRequest(req: any): string {
  // Body + path + method — header'lar dahil değil (authorization farklılığı sorun olmasın)
  const payload = JSON.stringify({
    method: req.method,
    path: req.path ?? req.url,
    body: req.body ?? null,
    query: req.query ?? null,
  });
  return createHash('sha256').update(payload).digest('hex');
}
