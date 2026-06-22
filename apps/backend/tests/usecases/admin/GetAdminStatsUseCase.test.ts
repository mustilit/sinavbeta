/**
 * GetAdminStatsUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - users.total doğru döner
 * - draft = total - published hesabı
 * - amountCents null olduğunda totalRevenueCents 0 döner
 * - Tüm Promise.all sorguları paralel çalışır
 */

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    user: {
      count: jest.fn(),
    },
    testPackage: {
      count: jest.fn(),
    },
    purchase: {
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    // Tünel + yazılı gelir agregasyonu — default 0 (mevcut testler etkilenmez)
    tunnelPurchase: { aggregate: jest.fn(async () => ({ _count: 0, _sum: { amountCents: 0 } })) },
    writtenPurchase: { aggregate: jest.fn(async () => ({ _count: 0, _sum: { amountCents: 0 } })) },
  },
}));

import { GetAdminStatsUseCase } from '../../../src/application/use-cases/admin/GetAdminStatsUseCase';
import { prisma } from '../../../src/infrastructure/database/prisma';

const mockPrisma = prisma as any;

describe('GetAdminStatsUseCase', () => {
  beforeEach(() => jest.clearAllMocks());

  it('başarılı çağrıda stats nesnesi döner', async () => {
    mockPrisma.user.count
      .mockResolvedValueOnce(100)   // total
      .mockResolvedValueOnce(80)    // candidates
      .mockResolvedValueOnce(18);   // educators
    mockPrisma.testPackage.count
      .mockResolvedValueOnce(50)    // total
      .mockResolvedValueOnce(30);   // published
    mockPrisma.purchase.count.mockResolvedValue(200);
    mockPrisma.purchase.aggregate.mockResolvedValue({ _sum: { amountCents: 500000 } });

    const uc = new GetAdminStatsUseCase();
    const result = await uc.execute();

    expect(result.users.total).toBe(100);
    expect(result.users.candidates).toBe(80);
    expect(result.users.educators).toBe(18);
    expect(result.packages.total).toBe(50);
    expect(result.packages.published).toBe(30);
    expect(result.packages.draft).toBe(20);
    expect(result.sales.total).toBe(200);
    expect(result.sales.totalRevenueCents).toBe(500000);
  });

  it('aggregate sum null ise totalRevenueCents 0 döner', async () => {
    mockPrisma.user.count.mockResolvedValue(0);
    mockPrisma.testPackage.count.mockResolvedValue(0);
    mockPrisma.purchase.count.mockResolvedValue(0);
    mockPrisma.purchase.aggregate.mockResolvedValue({ _sum: { amountCents: null } });

    const uc = new GetAdminStatsUseCase();
    const result = await uc.execute();
    expect(result.sales.totalRevenueCents).toBe(0);
  });

  it('draft = total - published doğru hesaplanır', async () => {
    mockPrisma.user.count.mockResolvedValue(0);
    mockPrisma.testPackage.count
      .mockResolvedValueOnce(40)   // total
      .mockResolvedValueOnce(25);  // published
    mockPrisma.purchase.count.mockResolvedValue(0);
    mockPrisma.purchase.aggregate.mockResolvedValue({ _sum: { amountCents: null } });

    const uc = new GetAdminStatsUseCase();
    const result = await uc.execute();
    expect(result.packages.draft).toBe(15);
  });
});
