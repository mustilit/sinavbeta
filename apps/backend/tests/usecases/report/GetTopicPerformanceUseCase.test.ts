/**
 * GetTopicPerformanceUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - candidateId eksik → boş sonuç döner
 * - Deneme yoksa boş groups ve examTypes döner
 * - Gruplar (topicId+examTypeId) bazında aggregation yapılır
 * - overallPct doğru hesaplanır
 * - trend: 2+ deneme varsa son iki arasındaki fark hesaplanır
 * - __none__ examTypeId examTypes listesine eklenmez
 * - hasOvertime ve overtimeCount alanları doldurulur
 */

const mockPrismaQueryRaw = jest.fn();

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    $queryRaw: (...args: any[]) => mockPrismaQueryRaw(...args),
  },
}));

// Prisma import'u tetiklenmesin
import { GetTopicPerformanceUseCase } from '../../../src/application/use-cases/report/GetTopicPerformanceUseCase';

function makeRow(overrides: Record<string, any> = {}) {
  return {
    topicId: 'topic-1',
    topicName: 'Matematik',
    examTypeId: 'et-1',
    examTypeName: 'YKS',
    attemptId: 'att-1',
    completedAt: new Date('2026-05-01'),
    totalQuestions: BigInt(10),
    correct: BigInt(7),
    wrong: BigInt(2),
    blank: BigInt(1),
    overtimeSeconds: null,
    ...overrides,
  };
}

describe('GetTopicPerformanceUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrismaQueryRaw.mockResolvedValue([]);
  });

  it('candidateId eksik ise boş sonuç döner (guard bypass)', async () => {
    const uc = new GetTopicPerformanceUseCase();
    const result = await uc.execute('');
    expect(result.groups).toHaveLength(0);
    expect(result.examTypes).toHaveLength(0);
  });

  it('deneme yoksa boş groups ve examTypes döner', async () => {
    mockPrismaQueryRaw.mockResolvedValue([]);
    const uc = new GetTopicPerformanceUseCase();
    const result = await uc.execute('cand-1');
    expect(result.groups).toHaveLength(0);
    expect(result.examTypes).toHaveLength(0);
  });

  it('tek deneme için grup oluşturulur', async () => {
    mockPrismaQueryRaw.mockResolvedValue([makeRow()]);
    const uc = new GetTopicPerformanceUseCase();
    const result = await uc.execute('cand-1');
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].topicName).toBe('Matematik');
    expect(result.groups[0].totalAttempts).toBe(1);
  });

  it('overallPct doğru hesaplanır (7/10 = 70)', async () => {
    mockPrismaQueryRaw.mockResolvedValue([makeRow()]);
    const uc = new GetTopicPerformanceUseCase();
    const result = await uc.execute('cand-1');
    expect(result.groups[0].overallPct).toBe(70);
  });

  it('iki deneme için trend hesaplanır', async () => {
    mockPrismaQueryRaw.mockResolvedValue([
      makeRow({ attemptId: 'att-1', completedAt: new Date('2026-05-01'), correct: BigInt(5), totalQuestions: BigInt(10) }),
      makeRow({ attemptId: 'att-2', completedAt: new Date('2026-05-10'), correct: BigInt(8), totalQuestions: BigInt(10) }),
    ]);
    const uc = new GetTopicPerformanceUseCase();
    const result = await uc.execute('cand-1');
    // Trend: 80 - 50 = 30
    expect(result.groups[0].trend).toBe(30);
  });

  it('tek deneme için trend null döner', async () => {
    mockPrismaQueryRaw.mockResolvedValue([makeRow()]);
    const uc = new GetTopicPerformanceUseCase();
    const result = await uc.execute('cand-1');
    expect(result.groups[0].trend).toBeNull();
  });

  it('__none__ examTypeId examTypes listesine eklenmez', async () => {
    mockPrismaQueryRaw.mockResolvedValue([makeRow({ examTypeId: '__none__', examTypeName: 'Türsüz' })]);
    const uc = new GetTopicPerformanceUseCase();
    const result = await uc.execute('cand-1');
    expect(result.examTypes).toHaveLength(0);
  });

  it('overtime varsa hasOvertime=true ve overtimeCount artar', async () => {
    mockPrismaQueryRaw.mockResolvedValue([makeRow({ overtimeSeconds: 120 })]);
    const uc = new GetTopicPerformanceUseCase();
    const result = await uc.execute('cand-1');
    expect(result.groups[0].hasOvertime).toBe(true);
    expect(result.groups[0].overtimeCount).toBe(1);
  });

  it('examTypes listesinde benzersiz sınav türleri döner', async () => {
    mockPrismaQueryRaw.mockResolvedValue([
      makeRow({ examTypeId: 'et-1', examTypeName: 'YKS' }),
      makeRow({ topicId: 'topic-2', topicName: 'Fizik', examTypeId: 'et-1', examTypeName: 'YKS', attemptId: 'att-2' }),
    ]);
    const uc = new GetTopicPerformanceUseCase();
    const result = await uc.execute('cand-1');
    expect(result.examTypes).toHaveLength(1);
    expect(result.examTypes[0].name).toBe('YKS');
  });
});
