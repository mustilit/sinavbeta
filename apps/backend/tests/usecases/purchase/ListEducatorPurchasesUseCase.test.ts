/**
 * ListEducatorPurchasesUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Kullanıcı bulunamazsa → USER_NOT_FOUND
 * - Kullanıcı EDUCATOR değilse → USER_NOT_EDUCATOR
 * - Test yoksa boş dizi döner
 * - Satın almalar mapper ile dönüştürülür
 */

const mockUserFindById = jest.fn();
const mockExamTestFindMany = jest.fn();
const mockPurchaseFindMany = jest.fn();
const mockTunnelFindMany = jest.fn();
const mockTunnelPurchaseFindMany = jest.fn();

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    examTest: { findMany: (...args: any[]) => mockExamTestFindMany(...args) },
    purchase: { findMany: (...args: any[]) => mockPurchaseFindMany(...args) },
    // Eğitici satışları artık tünel satışlarını da kapsıyor
    tunnel: { findMany: (...args: any[]) => mockTunnelFindMany(...args) },
    tunnelPurchase: { findMany: (...args: any[]) => mockTunnelPurchaseFindMany(...args) },
  },
}));

import { ListEducatorPurchasesUseCase } from '../../../src/application/use-cases/purchase/ListEducatorPurchasesUseCase';

function makeUserRepo(user: any) {
  return { findById: mockUserFindById.mockResolvedValue(user) };
}

function makeEducator(overrides: Record<string, any> = {}) {
  return { id: 'edu-1', role: 'EDUCATOR', status: 'ACTIVE', ...overrides };
}

describe('ListEducatorPurchasesUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Varsayılan: eğiticinin tüneli/tünel satışı yok (testler gerekirse override eder)
    mockTunnelFindMany.mockResolvedValue([]);
    mockTunnelPurchaseFindMany.mockResolvedValue([]);
  });

  it('kullanıcı bulunamazsa USER_NOT_FOUND fırlatır', async () => {
    const uc = new ListEducatorPurchasesUseCase(makeUserRepo(null) as any);
    await expect(uc.execute('edu-missing')).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });

  it('CANDIDATE rolü → USER_NOT_EDUCATOR fırlatır', async () => {
    const uc = new ListEducatorPurchasesUseCase(makeUserRepo(makeEducator({ role: 'CANDIDATE' })) as any);
    await expect(uc.execute('cand-1')).rejects.toMatchObject({ code: 'USER_NOT_EDUCATOR' });
  });

  it('eğiticinin testi yoksa boş dizi döner', async () => {
    mockExamTestFindMany.mockResolvedValue([]);
    const uc = new ListEducatorPurchasesUseCase(makeUserRepo(makeEducator()) as any);
    const result = await uc.execute('edu-1');
    expect(result).toEqual([]);
    expect(mockPurchaseFindMany).not.toHaveBeenCalled();
  });

  it('satın almalar mapper ile dönüştürülür', async () => {
    mockExamTestFindMany.mockResolvedValue([{ id: 'test-1' }]);
    mockPurchaseFindMany.mockResolvedValue([
      {
        id: 'pur-1',
        testId: 'test-1',
        candidateId: 'cand-1',
        amountCents: 4900,
        status: 'PAID',
        createdAt: new Date('2026-05-01'),
        test: { id: 'test-1', title: 'Test Adı' },
        candidate: { id: 'cand-1', email: 'cand@test.com', username: 'Aday' },
      },
    ]);
    const uc = new ListEducatorPurchasesUseCase(makeUserRepo(makeEducator()) as any);
    const result = await uc.execute('edu-1');
    expect(result).toHaveLength(1);
    expect(result[0].testTitle).toBe('Test Adı');
    expect(result[0].candidateEmail).toBe('cand@test.com');
    expect(result[0].amountCents).toBe(4900);
  });
});
