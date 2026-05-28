/**
 * ListPlatformPromoCodesUseCase testleri — Sprint 15 #3.
 *
 * Admin paneli için cursor pagination + opsiyonel scope/onlyActive filtreleri.
 * - Default limit 50, max 100
 * - take = limit + 1 (hasMore tek query'de)
 * - cursor varsa skip:1
 * - scope filtresi `scopes: { has: 'LIVE_SESSION' }` ile
 * - onlyActive filtresi `isActive: true` ile
 */

const mockPromoFindMany = jest.fn();

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    platformPromoCode: { findMany: (...args: any[]) => mockPromoFindMany(...args) },
  },
}));

import { ListPlatformPromoCodesUseCase } from '../../../src/application/use-cases/platform-promo/ListPlatformPromoCodesUseCase';

function makeRows(n: number, prefix = 'p') {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}-${i}`,
    code: `CODE-${i}`,
    percentOff: 10 + i,
    usedCount: 0,
    isActive: true,
    scopes: ['LIVE_SESSION'],
    createdAt: new Date(`2026-05-${String(28 - i).padStart(2, '0')}`),
  }));
}

describe('ListPlatformPromoCodesUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('default limit 50, take=51 (hasMore kontrolü için)', async () => {
    mockPromoFindMany.mockResolvedValue(makeRows(50));
    const uc = new ListPlatformPromoCodesUseCase();
    await uc.execute();
    expect(mockPromoFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 51, where: {} }),
    );
  });

  it('limit ≤ 0 → 1 minimum (Math.max), take=2', async () => {
    mockPromoFindMany.mockResolvedValue([]);
    const uc = new ListPlatformPromoCodesUseCase();
    await uc.execute({ limit: 0 });
    expect(mockPromoFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 2 }),
    );
  });

  it('limit 200 → 100 cap (Math.min), take=101', async () => {
    mockPromoFindMany.mockResolvedValue([]);
    const uc = new ListPlatformPromoCodesUseCase();
    await uc.execute({ limit: 200 });
    expect(mockPromoFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 101 }),
    );
  });

  it('scope filter → where.scopes.has', async () => {
    mockPromoFindMany.mockResolvedValue([]);
    const uc = new ListPlatformPromoCodesUseCase();
    await uc.execute({ scope: 'AD_PACKAGE' });
    expect(mockPromoFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { scopes: { has: 'AD_PACKAGE' } } }),
    );
  });

  it('onlyActive filter → where.isActive=true', async () => {
    mockPromoFindMany.mockResolvedValue([]);
    const uc = new ListPlatformPromoCodesUseCase();
    await uc.execute({ onlyActive: true });
    expect(mockPromoFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
  });

  it('cursor varsa cursor + skip:1 (Prisma inclusive cursor)', async () => {
    mockPromoFindMany.mockResolvedValue([]);
    const uc = new ListPlatformPromoCodesUseCase();
    await uc.execute({ cursor: 'p-10' });
    expect(mockPromoFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { id: 'p-10' }, skip: 1 }),
    );
  });

  it('cursor yoksa cursor/skip eklenmez', async () => {
    mockPromoFindMany.mockResolvedValue([]);
    const uc = new ListPlatformPromoCodesUseCase();
    await uc.execute();
    const arg = (mockPromoFindMany as jest.Mock).mock.calls[0][0];
    expect(arg.cursor).toBeUndefined();
    expect(arg.skip).toBeUndefined();
  });

  it('rows < limit → nextCursor null (liste bitti)', async () => {
    mockPromoFindMany.mockResolvedValue(makeRows(5));
    const uc = new ListPlatformPromoCodesUseCase();
    const result = await uc.execute({ limit: 50 });
    expect(result.items).toHaveLength(5);
    expect(result.nextCursor).toBeNull();
  });

  it('rows > limit → nextCursor = son item.id, son fazlalık item kırpılır', async () => {
    mockPromoFindMany.mockResolvedValue(makeRows(51)); // limit 50 + 1
    const uc = new ListPlatformPromoCodesUseCase();
    const result = await uc.execute({ limit: 50 });
    expect(result.items).toHaveLength(50);
    expect(result.nextCursor).toBe('p-49'); // 50. item'in id'si (0-indexed)
  });

  it('orderBy: createdAt desc + id desc (tie-breaker)', async () => {
    mockPromoFindMany.mockResolvedValue([]);
    const uc = new ListPlatformPromoCodesUseCase();
    await uc.execute();
    expect(mockPromoFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });
});
