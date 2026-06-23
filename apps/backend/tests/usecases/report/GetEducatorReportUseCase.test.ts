/**
 * GetEducatorReportUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Filtre olmadan çalışır (default değerler)
 * - total ve items döner
 * - Sayısal alanlar Number tipine dönüştürülür
 * - q filtresi SQL'e yansır
 * - $queryRawUnsafe iki kez çağrılır (count + data)
 */

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    $queryRawUnsafe: jest.fn(),
    tunnel: { findMany: jest.fn(async () => []) },
    writtenPackage: { findMany: jest.fn(async () => []) },
    tunnelPurchase: { groupBy: jest.fn(async () => []) },
    writtenPurchase: { groupBy: jest.fn(async () => []) },
  },
}));

import { GetEducatorReportUseCase } from '../../../src/application/use-cases/report/GetEducatorReportUseCase';
import { prisma } from '../../../src/infrastructure/database/prisma';

const mockPrisma = prisma as any;

function makeCountResult(total: number) {
  return [{ total: String(total) }];
}

function makeDataRow(overrides: any = {}) {
  return {
    id: 'edu-1',
    email: 'edu@test.com',
    username: 'educator1',
    status: 'ACTIVE',
    registeredAt: new Date(),
    lastLoginAt: null,
    educatorApprovedAt: null,
    lastPublishedAt: null,
    totalTests: '5',
    publishedTests: '3',
    totalSales: '10',
    totalRevenueCents: '50000',
    uniqueCandidates: '8',
    avgTestRating: '4.3',
    avgEducatorRating: '4.5',
    totalObjections: '2',
    openObjections: '1',
    examTypeNames: 'KPSS, YKS',
    ...overrides,
  };
}

describe('GetEducatorReportUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce(makeCountResult(1))
      .mockResolvedValueOnce([makeDataRow()]);
  });

  it('filtre olmadan çalışır ve items/total döner', async () => {
    const uc = new GetEducatorReportUseCase();
    const result = await uc.execute();
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
  });

  it('$queryRawUnsafe iki kez çağrılır', async () => {
    const uc = new GetEducatorReportUseCase();
    await uc.execute();
    expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
  });

  it('sayısal alanlar Number tipine dönüştürülür', async () => {
    const uc = new GetEducatorReportUseCase();
    const result = await uc.execute();
    const item = result.items[0];
    expect(typeof item.totalTests).toBe('number');
    expect(typeof item.totalSales).toBe('number');
    expect(typeof item.totalRevenueCents).toBe('number');
    expect(item.totalRevenueCents).toBe(50000);
  });

  it('avgTestRating null ise null döner', async () => {
    mockPrisma.$queryRawUnsafe.mockReset();
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce(makeCountResult(1))
      .mockResolvedValueOnce([makeDataRow({ avgTestRating: null })]);
    const uc = new GetEducatorReportUseCase();
    const result = await uc.execute();
    expect(result.items[0].avgTestRating).toBeNull();
  });

  it('examTypeNames null ise null döner', async () => {
    mockPrisma.$queryRawUnsafe.mockReset();
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce(makeCountResult(1))
      .mockResolvedValueOnce([makeDataRow({ examTypeNames: null })]);
    const uc = new GetEducatorReportUseCase();
    const result = await uc.execute();
    expect(result.items[0].examTypeNames).toBeNull();
  });

  it('q filtresi ile arama SQL\'e ILIKE ekler', async () => {
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce(makeCountResult(0))
      .mockResolvedValueOnce([]);
    const uc = new GetEducatorReportUseCase();
    await uc.execute({ q: 'ahmet hoca' });
    const countCall = mockPrisma.$queryRawUnsafe.mock.calls[0][0];
    expect(countCall).toContain('ILIKE');
  });

  it('boş sonuç döndüğünde items boş liste', async () => {
    mockPrisma.$queryRawUnsafe.mockReset();
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce(makeCountResult(0))
      .mockResolvedValueOnce([]);
    const uc = new GetEducatorReportUseCase();
    const result = await uc.execute();
    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});
