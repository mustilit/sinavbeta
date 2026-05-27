/**
 * SelectAdSlotsUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - adCount <= 0 ise boş dizi döner
 * - Aktif satın alım yoksa boş dizi döner
 * - Süresi dolmuş veya gösterim hakkı olmayan reklamlar hariç tutulur (Prisma where ile)
 * - excludeIds listesindeki testler hariç tutulur
 * - PUBLISHED olmayan testler TEST türü reklamlarda hariç tutulur
 * - İstenen slot sayısı kadar döner (daha az varsa hepsi)
 * - EDUCATOR türü reklamlar döner
 */

const mockAdPurchaseFindMany = jest.fn();

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    adPurchase: {
      findMany: (...args: any[]) => mockAdPurchaseFindMany(...args),
    },
  },
}));

import { SelectAdSlotsUseCase } from '../../../src/application/use-cases/ad/SelectAdSlotsUseCase';

function makeTestAd(testId: string, status = 'PUBLISHED', overrides: Record<string, any> = {}) {
  return {
    id: `ap-${testId}`,
    testId,
    targetType: 'TEST',
    validUntil: new Date(Date.now() + 3600 * 1000),
    impressionsRemaining: 10,
    test: { id: testId, title: 'Test', educatorId: 'edu-1', examTypeId: 'et-1', priceCents: 100, currency: 'TRY', isTimed: false, questionCount: 10, status },
    educator: { id: 'edu-1', username: 'edu', metadata: {} },
    ...overrides,
  };
}

function makeEducatorAd(educatorId: string) {
  return {
    id: `ep-${educatorId}`,
    testId: null,
    targetType: 'EDUCATOR',
    validUntil: new Date(Date.now() + 3600 * 1000),
    impressionsRemaining: 5,
    test: null,
    educator: { id: educatorId, username: 'edu', metadata: {} },
  };
}

describe('SelectAdSlotsUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('adCount 0 ise Prisma sorgusu yapılmaz, boş dizi döner', async () => {
    const uc = new SelectAdSlotsUseCase();
    const result = await uc.execute(0);
    expect(result).toEqual([]);
    expect(mockAdPurchaseFindMany).not.toHaveBeenCalled();
  });

  it('adCount negatifse boş dizi döner', async () => {
    const uc = new SelectAdSlotsUseCase();
    const result = await uc.execute(-5);
    expect(result).toEqual([]);
  });

  it('aktif satın alım yoksa boş dizi döner', async () => {
    mockAdPurchaseFindMany.mockResolvedValue([]);
    const uc = new SelectAdSlotsUseCase();
    const result = await uc.execute(3);
    expect(result).toHaveLength(0);
  });

  it('excludeIds listesindeki test hariç tutulur', async () => {
    mockAdPurchaseFindMany.mockResolvedValue([makeTestAd('test-1'), makeTestAd('test-2')]);
    const uc = new SelectAdSlotsUseCase();
    const result = await uc.execute(2, ['test-1']);
    const ids = result.map((r: any) => r.testId);
    expect(ids).not.toContain('test-1');
  });

  it('PUBLISHED olmayan test reklamı döndürülmez', async () => {
    mockAdPurchaseFindMany.mockResolvedValue([makeTestAd('test-1', 'DRAFT'), makeTestAd('test-2', 'PUBLISHED')]);
    const uc = new SelectAdSlotsUseCase();
    const result = await uc.execute(2);
    const ids = result.map((r: any) => r.testId);
    expect(ids).not.toContain('test-1');
    expect(ids).toContain('test-2');
  });

  it('istenen slot sayısı kadar döner', async () => {
    mockAdPurchaseFindMany.mockResolvedValue([
      makeTestAd('t1'), makeTestAd('t2'), makeTestAd('t3'), makeTestAd('t4'),
    ]);
    const uc = new SelectAdSlotsUseCase();
    const result = await uc.execute(2);
    expect(result).toHaveLength(2);
  });

  it('EDUCATOR türü reklamlar döner', async () => {
    mockAdPurchaseFindMany.mockResolvedValue([makeEducatorAd('edu-1')]);
    const uc = new SelectAdSlotsUseCase();
    const result = await uc.execute(1);
    expect(result).toHaveLength(1);
    expect((result[0] as any).targetType).toBe('EDUCATOR');
  });
});
