/**
 * IdempotencyInterceptor unit testleri.
 *
 * Senaryolar:
 *   - Header yoksa → pass-through, lock alınmaz.
 *   - Geçersiz format → 400 BadRequest.
 *   - İlk istek → SET NX, use case çalışır, sonuç completed olarak yazılır.
 *   - Aynı key + aynı body → cached response replay (use case bir daha çalışmaz).
 *   - Aynı key + farklı body → 409 Conflict.
 *   - In-progress (lock var, completed değil) → 409.
 *   - Use case throw → lock silinir (retry edilebilir).
 *
 * Mock: RedisCache.setIfNotExists / get / set / del — in-memory map.
 *
 * Skill: docs/proposed-claude/skills/idempotency/SKILL.md
 */
import { firstValueFrom, of, throwError } from 'rxjs';
import { IdempotencyInterceptor } from '../../src/nest/interceptors/idempotency.interceptor';
import { ConflictException, BadRequestException } from '@nestjs/common';

// ── Fake RedisCache ─────────────────────────────────────────────────────
class FakeRedisCache {
  store = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | null> {
    return (this.store.get(key) as T) ?? null;
  }
  async set(key: string, value: unknown): Promise<void> {
    this.store.set(key, value);
  }
  async setIfNotExists(key: string, value: unknown): Promise<boolean> {
    if (this.store.has(key)) return false;
    this.store.set(key, value);
    return true;
  }
  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}

function makeCtx(overrides: { headers?: Record<string, string>; body?: any; user?: any } = {}) {
  const req: any = {
    method: 'POST',
    path: '/purchases',
    headers: overrides.headers ?? {},
    body: overrides.body ?? { testId: 'test-1' },
    user: overrides.user,
    header(name: string) {
      return this.headers[name.toLowerCase()];
    },
  };
  const res: any = {
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
  };
  const ctx: any = {
    switchToHttp() {
      return {
        getRequest: () => req,
        getResponse: () => res,
      };
    },
  };
  return { ctx, req, res };
}

const VALID_KEY = 'abcd1234-efgh5678-ijklmnop';

describe('IdempotencyInterceptor', () => {
  let cache: FakeRedisCache;
  let interceptor: IdempotencyInterceptor;

  beforeEach(() => {
    cache = new FakeRedisCache();
    interceptor = new IdempotencyInterceptor(cache as unknown as any);
  });

  it('header yoksa pass-through', async () => {
    const { ctx } = makeCtx();
    const handlerSpy = jest.fn(() => of({ id: 'p1' }));
    const result$ = interceptor.intercept(ctx, { handle: handlerSpy } as any);
    const result = await firstValueFrom(result$);
    expect(result).toEqual({ id: 'p1' });
    expect(handlerSpy).toHaveBeenCalledTimes(1);
    expect(cache.store.size).toBe(0);
  });

  it('geçersiz key formatı → BadRequest', async () => {
    const { ctx } = makeCtx({ headers: { 'idempotency-key': 'too-short' } });
    const handler = { handle: jest.fn(() => of({})) };
    const result$ = interceptor.intercept(ctx, handler as any);
    await expect(firstValueFrom(result$)).rejects.toBeInstanceOf(BadRequestException);
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('ilk istek: SET NX + use case çalışır + completed kaydı yazılır', async () => {
    const { ctx, res } = makeCtx({ headers: { 'idempotency-key': VALID_KEY } });
    const handler = { handle: jest.fn(() => of({ id: 'p1' })) };
    res.statusCode = 201;
    const result = await firstValueFrom(interceptor.intercept(ctx, handler as any));
    expect(result).toEqual({ id: 'p1' });
    expect(handler.handle).toHaveBeenCalledTimes(1);
    // Cache'te completed entry olmalı (best-effort yazım nedeniyle next tick'i bekle)
    await new Promise((r) => setImmediate(r));
    const stored: any = Array.from(cache.store.values())[0];
    expect(stored).toMatchObject({ status: 'completed', responseStatus: 201 });
  });

  it('aynı key + aynı body → cached response, use case ÇALIŞMAZ', async () => {
    const headers = { 'idempotency-key': VALID_KEY };
    const body = { testId: 'test-1' };

    // 1. çağrı
    {
      const { ctx, res } = makeCtx({ headers, body });
      res.statusCode = 201;
      const handler = { handle: jest.fn(() => of({ id: 'p1' })) };
      await firstValueFrom(interceptor.intercept(ctx, handler as any));
      await new Promise((r) => setImmediate(r));
    }

    // 2. çağrı — aynı body
    const { ctx, res } = makeCtx({ headers, body });
    const handler = { handle: jest.fn(() => of({ id: 'p1-NEW' })) };
    const result = await firstValueFrom(interceptor.intercept(ctx, handler as any));
    expect(result).toEqual({ id: 'p1' }); // cached
    expect(handler.handle).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(201);
  });

  it('aynı key + farklı body → 409 Conflict', async () => {
    const headers = { 'idempotency-key': VALID_KEY };
    {
      const { ctx } = makeCtx({ headers, body: { testId: 'test-1' } });
      const handler = { handle: jest.fn(() => of({ id: 'p1' })) };
      await firstValueFrom(interceptor.intercept(ctx, handler as any));
      await new Promise((r) => setImmediate(r));
    }

    const { ctx } = makeCtx({ headers, body: { testId: 'DIFFERENT' } });
    const handler = { handle: jest.fn(() => of({})) };
    await expect(
      firstValueFrom(interceptor.intercept(ctx, handler as any)),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('in-progress lock varken → 409', async () => {
    const headers = { 'idempotency-key': VALID_KEY };
    // Lock'u manuel ekle
    cache.store.set('idem:public:anon:' + VALID_KEY, {
      status: 'in_progress',
      requestHash: 'x', // farklı hash ama yine de 409 (in_progress → conflict)
      createdAt: new Date().toISOString(),
    });

    const { ctx } = makeCtx({ headers, body: { testId: 'test-1' } });
    const handler = { handle: jest.fn(() => of({})) };
    await expect(
      firstValueFrom(interceptor.intercept(ctx, handler as any)),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('use case throw → lock silinir, retry edilebilir', async () => {
    const headers = { 'idempotency-key': VALID_KEY };
    const { ctx } = makeCtx({ headers });
    const handler = {
      handle: jest.fn(() => throwError(() => new Error('use case failed'))),
    };
    await expect(
      firstValueFrom(interceptor.intercept(ctx, handler as any)),
    ).rejects.toThrow('use case failed');
    // Lock silinmiş olmalı
    expect(cache.store.size).toBe(0);
  });
});
