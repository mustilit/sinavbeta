/**
 * ListMarketplaceTestsUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Geçersiz examTypeId UUID → INVALID_UUID
 * - Geçersiz topicId UUID → INVALID_UUID
 * - Geçersiz educatorId UUID → INVALID_UUID
 * - Geçersiz sort değeri → INVALID_SORT
 * - Geçersiz displayCurrency → INVALID_CURRENCY
 * - limit 50'yi aşarsa kırpılır
 * - Başarı: items ve meta döner
 * - FX servisi verilmişse converted alanı eklenir
 */

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    testStats: { findMany: jest.fn().mockResolvedValue([]) },
    review: { findMany: jest.fn().mockResolvedValue([]) },
    examTest: { findMany: jest.fn().mockResolvedValue([]) },
  },
}));

jest.mock('../../../src/application/services/ReviewAggregationService', () => ({
  ReviewAggregationService: jest.fn().mockImplementation(() => ({
    getAggregatesForTestIds: jest.fn().mockResolvedValue({}),
  })),
}));

import { ListMarketplaceTestsUseCase } from '../../../src/application/use-cases/test/ListMarketplaceTestsUseCase';

const VALID_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

function makeExamRepo(items: any[] = [], total = 0) {
  return {
    findPublished: jest.fn().mockResolvedValue({ items, total }),
  };
}

function makeItem(overrides: any = {}) {
  return {
    id: 'test-1',
    title: 'KPSS Sınav Testi',
    educatorId: 'edu-1',
    priceCents: 2000,
    currency: 'TRY',
    isTimed: false,
    questionCount: 10,
    ...overrides,
  };
}

describe('ListMarketplaceTestsUseCase', () => {
  it('geçersiz examTypeId UUID ise INVALID_UUID fırlatır', async () => {
    const uc = new ListMarketplaceTestsUseCase(makeExamRepo() as any);
    await expect(uc.execute({ examTypeId: 'not-a-uuid' })).rejects.toMatchObject({ code: 'INVALID_UUID' });
  });

  it('geçersiz topicId UUID ise INVALID_UUID fırlatır', async () => {
    const uc = new ListMarketplaceTestsUseCase(makeExamRepo() as any);
    await expect(uc.execute({ topicId: 'bad-id' })).rejects.toMatchObject({ code: 'INVALID_UUID' });
  });

  it('geçersiz educatorId UUID ise INVALID_UUID fırlatır', async () => {
    const uc = new ListMarketplaceTestsUseCase(makeExamRepo() as any);
    await expect(uc.execute({ educatorId: 'bad-edu' })).rejects.toMatchObject({ code: 'INVALID_UUID' });
  });

  it('geçersiz sort değeri ise INVALID_SORT fırlatır', async () => {
    const uc = new ListMarketplaceTestsUseCase(makeExamRepo() as any);
    await expect(uc.execute({ sort: 'random' as any })).rejects.toMatchObject({ code: 'INVALID_SORT' });
  });

  it('geçersiz displayCurrency ise INVALID_CURRENCY fırlatır', async () => {
    const uc = new ListMarketplaceTestsUseCase(makeExamRepo() as any);
    await expect(uc.execute({ displayCurrency: 'JPY' as any })).rejects.toMatchObject({
      code: 'INVALID_CURRENCY',
    });
  });

  it('filtre olmadan items ve meta döner', async () => {
    const uc = new ListMarketplaceTestsUseCase(makeExamRepo([makeItem()], 1) as any);
    const result = await uc.execute();
    expect(result.items).toHaveLength(1);
    expect(result.meta.total).toBe(1);
    expect(result.meta.page).toBe(1);
  });

  it('limit 50 ile sınırlandırılır', async () => {
    const repo = makeExamRepo([], 0);
    const uc = new ListMarketplaceTestsUseCase(repo as any);
    await uc.execute({ limit: 200 });
    const call = repo.findPublished.mock.calls[0][0];
    expect(call.limit).toBe(50);
  });

  it('geçerli UUID ile filtre uygulanır', async () => {
    const repo = makeExamRepo([makeItem()], 1);
    const uc = new ListMarketplaceTestsUseCase(repo as any);
    await uc.execute({ examTypeId: VALID_UUID });
    expect(repo.findPublished).toHaveBeenCalledWith(expect.objectContaining({ examTypeId: VALID_UUID }));
  });

  it('FX servisi yoksa converted alanı bulunmaz', async () => {
    const uc = new ListMarketplaceTestsUseCase(makeExamRepo([makeItem()], 1) as any);
    const result = await uc.execute({ displayCurrency: 'USD' });
    expect((result.items[0] as any).converted).toBeUndefined();
  });

  it('FX servisi varsa converted alanı eklenir', async () => {
    const fxService = {
      convert: jest.fn().mockResolvedValue(60),
      getRate: jest.fn().mockResolvedValue(0.03),
    };
    const uc = new ListMarketplaceTestsUseCase(makeExamRepo([makeItem()], 1) as any, fxService as any);
    const result = await uc.execute({ displayCurrency: 'USD' });
    expect((result.items[0] as any).converted).toBeDefined();
    expect((result.items[0] as any).converted.currency).toBe('USD');
  });
});
