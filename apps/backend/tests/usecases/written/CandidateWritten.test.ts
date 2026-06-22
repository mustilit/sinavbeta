/**
 * CandidateWrittenUseCases unit testleri.
 * ListMyWrittenPurchases, ListPublishedWrittenPackages, GetPublishedWrittenPackage.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    user: { findMany: jest.fn() },
    gradeLevel: { findMany: jest.fn() },
    writtenPurchase: { findMany: jest.fn(), count: jest.fn() },
    writtenPackage: { findMany: jest.fn(), findUnique: jest.fn() },
    writtenAttempt: { findMany: jest.fn() },
    writtenReview: { groupBy: jest.fn(), aggregate: jest.fn() },
  },
}));

import {
  ListMyWrittenPurchasesUseCase,
  ListPublishedWrittenPackagesUseCase,
  GetPublishedWrittenPackageUseCase,
} from '../../../src/application/use-cases/written/CandidateWrittenUseCases';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
beforeEach(() => jest.clearAllMocks());

// ─── Yardımcılar ─────────────────────────────────────────────

function makePkg(overrides: any = {}) {
  return {
    id: 'pkg1',
    title: 'Yazili Test Paketi',
    description: 'Aciklama',
    coverImageUrl: null,
    difficulty: 'medium',
    educatorId: 'edu1',
    gradeLevelId: 'gl1',
    tests: [
      { id: 'tst1', title: 'Test 1', isTimed: false, duration: null, questionCount: 5 },
    ],
    ...overrides,
  };
}

// ─── ListMyWrittenPurchasesUseCase ──────────────────────────

describe('ListMyWrittenPurchasesUseCase', () => {
  const uc = new ListMyWrittenPurchasesUseCase();

  it('actorId yoksa UNAUTHORIZED', async () => {
    await expect(uc.execute(null)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('satin alma yoksa bos items doner', async () => {
    p.writtenPurchase.findMany.mockResolvedValue([]);
    const result = await uc.execute('cand1');
    expect(result).toEqual({ items: [] });
  });

  it('satin alinan paketler + deneme durumuyla doner', async () => {
    p.writtenPurchase.findMany.mockResolvedValue([
      { id: 'wp1', packageId: 'pkg1', createdAt: new Date('2026-01-01') },
    ]);
    p.writtenPackage.findMany.mockResolvedValue([makePkg()]);
    p.writtenAttempt.findMany.mockResolvedValue([
      { id: 'att1', testId: 'tst1', status: 'IN_PROGRESS' },
    ]);
    p.user.findMany.mockResolvedValue([{ id: 'edu1', username: 'egitici' }]);
    p.gradeLevel.findMany.mockResolvedValue([{ id: 'gl1', name: 'Sinif 1' }]);

    const result = await uc.execute('cand1');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe('Yazili Test Paketi');
    expect(result.items[0].educatorName).toBe('egitici');
    expect(result.items[0].gradeLevelName).toBe('Sinif 1');
    expect(result.items[0].tests[0].state).toBe('IN_PROGRESS');
    expect(result.items[0].tests[0].attemptId).toBe('att1');
  });

  it('paket bulunamazsa items listesinden filtrelenir', async () => {
    p.writtenPurchase.findMany.mockResolvedValue([
      { id: 'wp1', packageId: 'unknown-pkg', createdAt: new Date() },
    ]);
    p.writtenPackage.findMany.mockResolvedValue([]);
    p.writtenAttempt.findMany.mockResolvedValue([]);
    p.user.findMany.mockResolvedValue([]);
    p.gradeLevel.findMany.mockResolvedValue([]);

    const result = await uc.execute('cand1');
    expect(result.items).toHaveLength(0);
  });

  it('deneme yoksa state null doner', async () => {
    p.writtenPurchase.findMany.mockResolvedValue([
      { id: 'wp1', packageId: 'pkg1', createdAt: new Date() },
    ]);
    p.writtenPackage.findMany.mockResolvedValue([makePkg()]);
    p.writtenAttempt.findMany.mockResolvedValue([]);
    p.user.findMany.mockResolvedValue([{ id: 'edu1', username: 'egitici' }]);
    p.gradeLevel.findMany.mockResolvedValue([]);

    const result = await uc.execute('cand1');
    expect(result.items[0].tests[0].state).toBeNull();
    expect(result.items[0].tests[0].attemptId).toBeNull();
  });

  it('educatorId null ise educatorName null doner', async () => {
    p.writtenPurchase.findMany.mockResolvedValue([
      { id: 'wp1', packageId: 'pkg1', createdAt: new Date() },
    ]);
    p.writtenPackage.findMany.mockResolvedValue([makePkg({ educatorId: null })]);
    p.writtenAttempt.findMany.mockResolvedValue([]);
    p.user.findMany.mockResolvedValue([]);
    p.gradeLevel.findMany.mockResolvedValue([]);

    const result = await uc.execute('cand1');
    expect(result.items[0].educatorName).toBeNull();
  });

  it('gradeLevelId null ise gradeLevelName null doner', async () => {
    p.writtenPurchase.findMany.mockResolvedValue([
      { id: 'wp1', packageId: 'pkg1', createdAt: new Date() },
    ]);
    p.writtenPackage.findMany.mockResolvedValue([makePkg({ gradeLevelId: null })]);
    p.writtenAttempt.findMany.mockResolvedValue([]);
    p.user.findMany.mockResolvedValue([{ id: 'edu1', username: 'egitici' }]);
    p.gradeLevel.findMany.mockResolvedValue([]);

    const result = await uc.execute('cand1');
    expect(result.items[0].gradeLevelId).toBeNull();
    expect(result.items[0].gradeLevelName).toBeNull();
  });
});

// ─── ListPublishedWrittenPackagesUseCase ─────────────────────

describe('ListPublishedWrittenPackagesUseCase', () => {
  const uc = new ListPublishedWrittenPackagesUseCase();

  it('bos liste', async () => {
    p.writtenPackage.findMany.mockResolvedValue([]);
    p.user.findMany.mockResolvedValue([]);
    p.gradeLevel.findMany.mockResolvedValue([]);
    p.writtenReview.groupBy.mockResolvedValue([]);

    const result = await uc.execute();
    expect(result.items).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
  });

  it('paketler basarili listelenir', async () => {
    const pkg = {
      id: 'pkg1', title: 'Test Paketi', description: 'Desc',
      coverImageUrl: null, priceCents: 1000, currency: 'TRY',
      difficulty: 'medium', publishedAt: new Date(), educatorId: 'edu1',
      gradeLevelId: 'gl1', tests: [{ questionCount: 5 }],
    };
    p.writtenPackage.findMany.mockResolvedValue([pkg]);
    p.user.findMany.mockResolvedValue([{ id: 'edu1', username: 'Egitici' }]);
    p.gradeLevel.findMany.mockResolvedValue([{ id: 'gl1', name: 'Sinif 5' }]);
    p.writtenReview.groupBy.mockResolvedValue([{ packageId: 'pkg1', _avg: { rating: 4.5 } }]);

    const result = await uc.execute();
    expect(result.items).toHaveLength(1);
    expect(result.items[0].educatorName).toBe('Egitici');
    expect(result.items[0].gradeLevelName).toBe('Sinif 5');
    expect(result.items[0].avgRating).toBe(4.5);
    expect(result.items[0].testCount).toBe(1);
    expect(result.items[0].totalQuestions).toBe(5);
    expect(result.nextCursor).toBeNull();
  });

  it('hasMore true ise nextCursor doner', async () => {
    // Default limit 20, 21 item = hasMore
    const items = Array.from({ length: 21 }, (_, i) => ({
      id: `pkg${i}`, title: `P${i}`, description: null,
      coverImageUrl: null, priceCents: 0, currency: 'TRY',
      difficulty: 'easy', publishedAt: new Date(), educatorId: 'edu1',
      gradeLevelId: null, tests: [],
    }));
    p.writtenPackage.findMany.mockResolvedValue(items);
    p.user.findMany.mockResolvedValue([{ id: 'edu1', username: 'E' }]);
    p.gradeLevel.findMany.mockResolvedValue([]);
    p.writtenReview.groupBy.mockResolvedValue([]);

    const result = await uc.execute({ limit: 20 });
    expect(result.items).toHaveLength(20);
    expect(result.nextCursor).toBe('pkg19');
  });

  it('cursor pagination kullanilabilir', async () => {
    p.writtenPackage.findMany.mockResolvedValue([]);
    p.user.findMany.mockResolvedValue([]);
    p.gradeLevel.findMany.mockResolvedValue([]);
    p.writtenReview.groupBy.mockResolvedValue([]);

    await uc.execute({ cursor: 'pkg5', limit: 10 });
    const call = p.writtenPackage.findMany.mock.calls[0][0];
    expect(call.cursor).toEqual({ id: 'pkg5' });
    expect(call.skip).toBe(1);
    expect(call.take).toBe(11);
  });

  it('gradeLevelId filtresi uygulanir', async () => {
    p.writtenPackage.findMany.mockResolvedValue([]);
    p.user.findMany.mockResolvedValue([]);
    p.gradeLevel.findMany.mockResolvedValue([]);
    p.writtenReview.groupBy.mockResolvedValue([]);

    await uc.execute({ gradeLevelId: 'gl5' });
    const call = p.writtenPackage.findMany.mock.calls[0][0];
    expect(call.where.gradeLevelId).toBe('gl5');
  });

  it('limit sinirlandirmasi (min 1, max 100)', async () => {
    p.writtenPackage.findMany.mockResolvedValue([]);
    p.user.findMany.mockResolvedValue([]);
    p.gradeLevel.findMany.mockResolvedValue([]);
    p.writtenReview.groupBy.mockResolvedValue([]);

    await uc.execute({ limit: 200 });
    const call = p.writtenPackage.findMany.mock.calls[0][0];
    expect(call.take).toBe(101); // max 100 + 1
  });

  it('rating null ise avgRating null doner', async () => {
    p.writtenPackage.findMany.mockResolvedValue([{
      id: 'pkg1', title: 'T', description: null,
      coverImageUrl: null, priceCents: 0, currency: 'TRY',
      difficulty: 'easy', publishedAt: new Date(), educatorId: 'edu1',
      gradeLevelId: null, tests: [],
    }]);
    p.user.findMany.mockResolvedValue([{ id: 'edu1', username: 'E' }]);
    p.gradeLevel.findMany.mockResolvedValue([]);
    p.writtenReview.groupBy.mockResolvedValue([]); // no rating

    const result = await uc.execute();
    expect(result.items[0].avgRating).toBeNull();
  });
});

// ─── GetPublishedWrittenPackageUseCase ──────────────────────

describe('GetPublishedWrittenPackageUseCase', () => {
  const uc = new GetPublishedWrittenPackageUseCase();

  it('paket bulunamazsa WRITTEN_PACKAGE_NOT_FOUND', async () => {
    p.writtenPackage.findUnique.mockResolvedValue(null);
    await expect(uc.execute('pkg1')).rejects.toMatchObject({ code: 'WRITTEN_PACKAGE_NOT_FOUND' });
  });

  it('yayimlanmamis paket WRITTEN_PACKAGE_NOT_FOUND', async () => {
    p.writtenPackage.findUnique.mockResolvedValue({
      id: 'pkg1', publishedAt: null, isActive: true, educatorId: 'edu1', gradeLevelId: null,
      tests: [],
    });
    await expect(uc.execute('pkg1')).rejects.toMatchObject({ code: 'WRITTEN_PACKAGE_NOT_FOUND' });
  });

  it('aktif degil WRITTEN_PACKAGE_NOT_FOUND', async () => {
    p.writtenPackage.findUnique.mockResolvedValue({
      id: 'pkg1', publishedAt: new Date(), isActive: false, educatorId: 'edu1', gradeLevelId: null,
      tests: [],
    });
    await expect(uc.execute('pkg1')).rejects.toMatchObject({ code: 'WRITTEN_PACKAGE_NOT_FOUND' });
  });

  it('basarili detay donusu', async () => {
    p.writtenPackage.findUnique.mockResolvedValue({
      id: 'pkg1', title: 'Paket', description: 'Desc',
      coverImageUrl: null, priceCents: 2000, currency: 'TRY',
      difficulty: 'hard', isActive: true, publishedAt: new Date(),
      educatorId: 'edu1', gradeLevelId: 'gl1',
      tests: [{ id: 'tst1', title: 'Test 1', isTimed: true, duration: 60, questionCount: 10 }],
    });
    p.user.findMany.mockResolvedValue([{ id: 'edu1', username: 'Egitici' }]);
    p.gradeLevel.findMany.mockResolvedValue([{ id: 'gl1', name: 'Sinif 9' }]);
    p.writtenReview.aggregate.mockResolvedValue({ _avg: { rating: 4.2 }, _count: { _all: 15 } });
    p.writtenPurchase.count.mockResolvedValue(42);

    const result = await uc.execute('pkg1');
    expect(result.id).toBe('pkg1');
    expect(result.educatorName).toBe('Egitici');
    expect(result.educatorUsername).toBe('Egitici');
    expect(result.gradeLevelName).toBe('Sinif 9');
    expect(result.avgRating).toBe(4.2);
    expect(result.reviewCount).toBe(15);
    expect(result.salesCount).toBe(42);
    expect(result.testCount).toBe(1);
    expect(result.totalQuestions).toBe(10);
    expect(result.tests[0].questionCount).toBe(10);
  });

  it('educatorId null ise educatorName null doner', async () => {
    p.writtenPackage.findUnique.mockResolvedValue({
      id: 'pkg1', title: 'P', description: null,
      coverImageUrl: null, priceCents: 0, currency: 'TRY',
      difficulty: 'easy', isActive: true, publishedAt: new Date(),
      educatorId: null, gradeLevelId: null,
      tests: [],
    });
    p.user.findMany.mockResolvedValue([]);
    p.gradeLevel.findMany.mockResolvedValue([]);
    p.writtenReview.aggregate.mockResolvedValue({ _avg: { rating: null }, _count: { _all: 0 } });
    p.writtenPurchase.count.mockResolvedValue(0);

    const result = await uc.execute('pkg1');
    expect(result.educatorName).toBeNull();
    expect(result.avgRating).toBeNull();
    expect(result.reviewCount).toBe(0);
  });

  it('questionCount null ise 0 olarak doner', async () => {
    p.writtenPackage.findUnique.mockResolvedValue({
      id: 'pkg1', title: 'P', description: null,
      coverImageUrl: null, priceCents: 0, currency: 'TRY',
      difficulty: 'easy', isActive: true, publishedAt: new Date(),
      educatorId: 'edu1', gradeLevelId: null,
      tests: [{ id: 'tst1', title: 'T', isTimed: false, duration: null, questionCount: null }],
    });
    p.user.findMany.mockResolvedValue([{ id: 'edu1', username: 'E' }]);
    p.gradeLevel.findMany.mockResolvedValue([]);
    p.writtenReview.aggregate.mockResolvedValue({ _avg: { rating: null }, _count: { _all: 0 } });
    p.writtenPurchase.count.mockResolvedValue(0);

    const result = await uc.execute('pkg1');
    expect(result.tests[0].questionCount).toBe(0);
    expect(result.totalQuestions).toBe(0);
  });
});
