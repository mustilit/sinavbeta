/**
 * GetEducatorAdStatsUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Satın alım yoksa boş purchases ve sıfır totals döner
 * - Satın alımlar varsa günlük dağılım hesaplanır
 * - totalDelivered ve totalRemaining doğru hesaplanır
 * - isActive: validUntil gelecekte ve impressionsRemaining > 0 ise true
 * - TEST türü satın alımda test bilgisi döner
 */

const mockAdPurchaseFindMany = jest.fn();
const mockAdImpressionFindMany = jest.fn();

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    adPurchase: { findMany: (...args: any[]) => mockAdPurchaseFindMany(...args) },
    adImpression: { findMany: (...args: any[]) => mockAdImpressionFindMany(...args) },
  },
}));

import { GetEducatorAdStatsUseCase } from '../../../src/application/use-cases/ad/GetEducatorAdStatsUseCase';

function makeAdPurchase(overrides: Record<string, any> = {}) {
  return {
    id: 'adp-1',
    educatorId: 'edu-1',
    targetType: 'HOMEPAGE',
    impressionsDelivered: 200,
    impressionsRemaining: 800,
    validUntil: new Date(Date.now() + 7 * 24 * 3600_000), // gelecek
    createdAt: new Date(),
    adPackage: { name: 'Standart', impressions: 1000, durationDays: 30 },
    test: null,
    ...overrides,
  };
}

describe('GetEducatorAdStatsUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAdImpressionFindMany.mockResolvedValue([]);
  });

  it('satın alım yoksa boş purchases ve sıfır totals döner', async () => {
    mockAdPurchaseFindMany.mockResolvedValue([]);
    const uc = new GetEducatorAdStatsUseCase();
    const result = await uc.execute('edu-1');
    expect(result.purchases).toHaveLength(0);
    expect(result.totals.totalDelivered).toBe(0);
    expect(result.totals.totalRemaining).toBe(0);
  });

  it('totalDelivered ve totalRemaining toplamları döner', async () => {
    mockAdPurchaseFindMany.mockResolvedValue([
      makeAdPurchase({ impressionsDelivered: 300, impressionsRemaining: 700 }),
      makeAdPurchase({ id: 'adp-2', impressionsDelivered: 150, impressionsRemaining: 850 }),
    ]);
    const uc = new GetEducatorAdStatsUseCase();
    const result = await uc.execute('edu-1');
    expect(result.totals.totalDelivered).toBe(450);
    expect(result.totals.totalRemaining).toBe(1550);
  });

  it('isActive: validUntil gelecekte ve impressionsRemaining > 0 ise true', async () => {
    mockAdPurchaseFindMany.mockResolvedValue([makeAdPurchase()]);
    const uc = new GetEducatorAdStatsUseCase();
    const result = await uc.execute('edu-1');
    expect(result.purchases[0].isActive).toBe(true);
  });

  it('isActive: validUntil geçmişte ise false', async () => {
    mockAdPurchaseFindMany.mockResolvedValue([
      makeAdPurchase({ validUntil: new Date(Date.now() - 3600_000) }),
    ]);
    const uc = new GetEducatorAdStatsUseCase();
    const result = await uc.execute('edu-1');
    expect(result.purchases[0].isActive).toBe(false);
  });

  it('isActive: impressionsRemaining = 0 ise false', async () => {
    mockAdPurchaseFindMany.mockResolvedValue([
      makeAdPurchase({ impressionsRemaining: 0 }),
    ]);
    const uc = new GetEducatorAdStatsUseCase();
    const result = await uc.execute('edu-1');
    expect(result.purchases[0].isActive).toBe(false);
  });

  it('dailyBreakdown 30 gün içerir', async () => {
    mockAdPurchaseFindMany.mockResolvedValue([makeAdPurchase()]);
    const uc = new GetEducatorAdStatsUseCase();
    const result = await uc.execute('edu-1');
    expect(result.dailyBreakdown).toHaveLength(30);
  });

  it('TEST türü satın alımda test bilgisi döner', async () => {
    const purchaseWithTest = makeAdPurchase({
      targetType: 'TEST',
      test: { id: 'test-1', title: 'Test Adı' },
    });
    mockAdPurchaseFindMany.mockResolvedValue([purchaseWithTest]);
    const uc = new GetEducatorAdStatsUseCase();
    const result = await uc.execute('edu-1');
    expect(result.purchases[0].test).toEqual({ id: 'test-1', title: 'Test Adı' });
  });
});
