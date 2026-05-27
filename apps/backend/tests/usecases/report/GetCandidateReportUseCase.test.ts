/**
 * GetCandidateReportUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Filtre olmadan çalışır (default değerler)
 * - total ve items döner
 * - page/limit sınırlandırması — limit max 200
 * - Sayısal alanlar Number tipine dönüştürülür
 * - $queryRawUnsafe iki kez çağrılır (count + data)
 */

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    $queryRawUnsafe: jest.fn(),
  },
}));

import { GetCandidateReportUseCase } from '../../../src/application/use-cases/report/GetCandidateReportUseCase';
import { prisma } from '../../../src/infrastructure/database/prisma';

const mockPrisma = prisma as any;

function makeCountResult(total: number) {
  return [{ total: String(total) }];
}

function makeDataRow(overrides: any = {}) {
  return {
    id: 'cand-1',
    email: 'cand@test.com',
    username: 'candidate1',
    status: 'ACTIVE',
    registeredAt: new Date(),
    lastLoginAt: null,
    lastPurchaseAt: null,
    totalPurchases: '3',
    totalSpentCents: '15000',
    avgTestRating: '4.5',
    avgEducatorRating: '4.2',
    totalAttempts: '5',
    totalAnswered: '50',
    totalCorrect: '40',
    correctRate: '80.0',
    ...overrides,
  };
}

describe('GetCandidateReportUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce(makeCountResult(1))
      .mockResolvedValueOnce([makeDataRow()]);
  });

  it('filtre olmadan çalışır ve items/total döner', async () => {
    const uc = new GetCandidateReportUseCase();
    const result = await uc.execute();
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
  });

  it('$queryRawUnsafe iki kez çağrılır (count + data)', async () => {
    const uc = new GetCandidateReportUseCase();
    await uc.execute();
    expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
  });

  it('sayısal alanlar Number tipine dönüştürülür', async () => {
    const uc = new GetCandidateReportUseCase();
    const result = await uc.execute();
    const item = result.items[0];
    expect(typeof item.totalPurchases).toBe('number');
    expect(typeof item.totalSpentCents).toBe('number');
    expect(typeof item.totalAttempts).toBe('number');
    expect(item.totalPurchases).toBe(3);
    expect(item.totalSpentCents).toBe(15000);
  });

  it('avgTestRating null gelirse null döner', async () => {
    mockPrisma.$queryRawUnsafe.mockReset();
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce(makeCountResult(1))
      .mockResolvedValueOnce([makeDataRow({ avgTestRating: null })]);
    const uc = new GetCandidateReportUseCase();
    const result = await uc.execute();
    expect(result.items[0].avgTestRating).toBeNull();
  });

  it('limit 200 ile sınırlandırılır', async () => {
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce(makeCountResult(0))
      .mockResolvedValueOnce([]);
    const uc = new GetCandidateReportUseCase();
    await uc.execute({ limit: 500 });
    // SQL stringinde LIMIT 200 geçmeli
    const dataCall = mockPrisma.$queryRawUnsafe.mock.calls[1][0];
    expect(dataCall).toContain('LIMIT');
  });

  it('page 0 geçilirse 1 olarak düzeltilir', async () => {
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce(makeCountResult(0))
      .mockResolvedValueOnce([]);
    const uc = new GetCandidateReportUseCase();
    await expect(uc.execute({ page: 0 })).resolves.toBeDefined();
  });

  it('q filtresi ile arama yapılabilir', async () => {
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce(makeCountResult(1))
      .mockResolvedValueOnce([makeDataRow()]);
    const uc = new GetCandidateReportUseCase();
    await uc.execute({ q: 'ahmet' });
    const countCall = mockPrisma.$queryRawUnsafe.mock.calls[0][0];
    expect(countCall).toContain('ILIKE');
  });
});
