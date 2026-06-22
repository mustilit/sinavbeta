/**
 * GetEducatorSalesReportUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Kullanıcı bulunamazsa → USER_NOT_FOUND
 * - CANDIDATE ise → ensureEducatorActive hatası fırlatır
 * - Eğiticinin testi yoksa sıfır rakamlı rapor döner
 * - Başarı: toplam satın alma, gelir ve test bazlı bilgiler döner
 */

const mockExamTestFindMany = jest.fn();
const mockPurchaseAggregate = jest.fn();
const mockTunnelPurchaseAggregate = jest.fn();
const mockTestAttemptCount = jest.fn();
const mockObjectionFindMany = jest.fn();
const mockObjectionCount = jest.fn();
const mockExamTestFindUnique = jest.fn();
// Yazılı: default boş — written paketi olmayan eğitici (mevcut testler etkilenmez)
const mockWrittenPackageFindMany = jest.fn(async () => [] as any[]);
const mockWrittenPurchaseAggregate = jest.fn(async () => ({ _count: 0, _sum: { amountCents: 0 } }));

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    examTest: {
      findMany: (...args: any[]) => mockExamTestFindMany(...args),
      findUnique: (...args: any[]) => mockExamTestFindUnique(...args),
    },
    purchase: { aggregate: (...args: any[]) => mockPurchaseAggregate(...args) },
    tunnelPurchase: { aggregate: (...args: any[]) => mockTunnelPurchaseAggregate(...args) },
    writtenPackage: { findMany: (...args: any[]) => mockWrittenPackageFindMany(...args) },
    writtenPurchase: { aggregate: (...args: any[]) => mockWrittenPurchaseAggregate(...args) },
    testAttempt: { count: (...args: any[]) => mockTestAttemptCount(...args) },
    objection: {
      findMany: (...args: any[]) => mockObjectionFindMany(...args),
      count: (...args: any[]) => mockObjectionCount(...args),
    },
  },
}));

import { GetEducatorSalesReportUseCase } from '../../../src/application/use-cases/report/GetEducatorSalesReportUseCase';

function makeUserRepo(user: any) {
  return { findById: jest.fn().mockResolvedValue(user) };
}

function makeEducator(overrides: Record<string, any> = {}) {
  return {
    id: 'edu-1',
    role: 'EDUCATOR',
    status: 'ACTIVE',
    educatorApprovedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

describe('GetEducatorSalesReportUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExamTestFindMany.mockResolvedValue([]);
    mockPurchaseAggregate.mockResolvedValue({ _count: 0, _sum: { amountCents: 0 } });
    mockTunnelPurchaseAggregate.mockResolvedValue({ _count: 0, _sum: { amountCents: null } });
    mockTestAttemptCount.mockResolvedValue(0);
    mockObjectionFindMany.mockResolvedValue([]);
    mockObjectionCount.mockResolvedValue(0);
    mockExamTestFindUnique.mockResolvedValue({ title: 'Test 1' });
  });

  it('kullanıcı bulunamazsa USER_NOT_FOUND fırlatır', async () => {
    const uc = new GetEducatorSalesReportUseCase(makeUserRepo(null) as any);
    await expect(uc.execute('edu-missing')).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });

  it('CANDIDATE rolü → ensureEducatorActive hatası fırlatır', async () => {
    const uc = new GetEducatorSalesReportUseCase(makeUserRepo(makeEducator({ role: 'CANDIDATE' })) as any);
    await expect(uc.execute('cand-1')).rejects.toBeDefined();
  });

  it('testi yoksa sıfır rakamlı rapor döner', async () => {
    mockExamTestFindMany.mockResolvedValue([]);
    const uc = new GetEducatorSalesReportUseCase(makeUserRepo(makeEducator()) as any);
    const result = await uc.execute('edu-1');
    expect(result.totalPurchases).toBe(0);
    expect(result.totalRevenueCents).toBe(0);
    expect(result.totalAttempts).toBe(0);
    expect(result.byTest).toHaveLength(0);
  });

  it('başarı: toplam satın alma ve gelir döner', async () => {
    mockExamTestFindMany.mockResolvedValue([{ id: 'test-1' }]);
    mockPurchaseAggregate.mockResolvedValue({ _count: 5, _sum: { amountCents: 24500 } });
    mockTestAttemptCount.mockResolvedValue(3);
    mockObjectionFindMany.mockResolvedValue([]);
    mockObjectionCount.mockResolvedValue(0);
    const uc = new GetEducatorSalesReportUseCase(makeUserRepo(makeEducator()) as any);
    const result = await uc.execute('edu-1');
    expect(result.totalPurchases).toBe(5);
    expect(result.totalRevenueCents).toBe(24500);
    expect(result.totalAttempts).toBe(3);
  });

  it('itirazlar durum bazlı kategorize edilir', async () => {
    mockExamTestFindMany.mockResolvedValue([{ id: 'test-1' }]);
    mockObjectionFindMany.mockResolvedValue([
      { status: 'OPEN', escalatedAt: null },
      { status: 'ANSWERED', escalatedAt: null },
      { status: 'OPEN', escalatedAt: new Date() }, // escalated
    ]);
    const uc = new GetEducatorSalesReportUseCase(makeUserRepo(makeEducator()) as any);
    const result = await uc.execute('edu-1');
    expect(result.objectionsOpen).toBe(2);
    expect(result.objectionsResolved).toBe(1);
    expect(result.objectionsEscalated).toBe(1);
  });
});
