/**
 * ListEducatorPackagesUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Eğiticinin paketi yoksa boş dizi döner
 * - Paketler saleCount ve ratingAvg ile genişletilir
 * - Prisma groupBy sorguları çağrılır
 */

const mockPurchaseGroupBy = jest.fn();
const mockReviewGroupBy = jest.fn();

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    purchase: { groupBy: (...args: any[]) => mockPurchaseGroupBy(...args) },
    review: { groupBy: (...args: any[]) => mockReviewGroupBy(...args) },
  },
}));

import { ListEducatorPackagesUseCase } from '../../../src/application/use-cases/package/ListEducatorPackagesUseCase';

function makePackageRepo(packages: any[]) {
  return { findByEducatorId: jest.fn().mockResolvedValue(packages) };
}

function makePackage(overrides: Record<string, any> = {}) {
  return {
    id: 'pkg-1',
    educatorId: 'edu-1',
    title: 'Test Paketi',
    publishedAt: null,
    priceCents: 4900,
    ...overrides,
  };
}

describe('ListEducatorPackagesUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPurchaseGroupBy.mockResolvedValue([]);
    mockReviewGroupBy.mockResolvedValue([]);
  });

  it('eğiticinin paketi yoksa boş dizi döner', async () => {
    const uc = new ListEducatorPackagesUseCase(makePackageRepo([]) as any);
    const result = await uc.execute('edu-1');
    expect(result).toEqual([]);
    expect(mockPurchaseGroupBy).not.toHaveBeenCalled();
  });

  it('paket varsa groupBy sorguları yapılır', async () => {
    const uc = new ListEducatorPackagesUseCase(makePackageRepo([makePackage()]) as any);
    await uc.execute('edu-1');
    expect(mockPurchaseGroupBy).toHaveBeenCalledTimes(1);
  });

  it('saleCount 0 olarak döner (satış yokken)', async () => {
    const uc = new ListEducatorPackagesUseCase(makePackageRepo([makePackage()]) as any);
    const result = await uc.execute('edu-1') as any[];
    expect(result[0].saleCount).toBe(0);
  });

  it('saleCount satış sayısına göre hesaplanır', async () => {
    mockPurchaseGroupBy.mockResolvedValue([{ packageId: 'pkg-1', _count: { _all: 15 } }]);
    const uc = new ListEducatorPackagesUseCase(makePackageRepo([makePackage()]) as any);
    const result = await uc.execute('edu-1') as any[];
    expect(result[0].saleCount).toBe(15);
  });

  it('ratingAvg ve ratingCount yokken null/0 döner', async () => {
    const uc = new ListEducatorPackagesUseCase(makePackageRepo([makePackage()]) as any);
    const result = await uc.execute('edu-1') as any[];
    expect(result[0].ratingAvg).toBeNull();
    expect(result[0].ratingCount).toBe(0);
  });

  it('ratingAvg değerlendirmelerden hesaplanır', async () => {
    mockReviewGroupBy.mockResolvedValue([{ packageId: 'pkg-1', _avg: { testRating: 4.2 }, _count: { _all: 8 } }]);
    const uc = new ListEducatorPackagesUseCase(makePackageRepo([makePackage()]) as any);
    const result = await uc.execute('edu-1') as any[];
    expect(result[0].ratingAvg).toBe(4.2);
    expect(result[0].ratingCount).toBe(8);
  });
});
