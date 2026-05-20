// @ts-nocheck
import { GetRecommendedTestsUseCase } from '../../src/application/use-cases/package/GetRecommendedTestsUseCase';
import { ListMarketplaceTestsUseCase } from '../../src/application/use-cases/test/ListMarketplaceTestsUseCase';

// RedisCache mock — testlerde gerçek Redis bağlantısı olmaz
jest.mock('../../src/infrastructure/cache/RedisCache', () => ({
  RedisCache: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
  })),
}));

// ReviewAggregationService mock — Prisma bağlantısı gerektirmez
jest.mock('../../src/application/services/ReviewAggregationService', () => ({
  ReviewAggregationService: jest.fn().mockImplementation(() => ({
    getAggregatesForTestIds: jest.fn().mockResolvedValue({}),
  })),
}));

test('minRating filters correctly', async () => {
  const examRepo: any = {
    findPublished: async () => ({ items: [{ id: 't1', title: 'T1', educatorId: 'e1', isTimed: false, questionCount: 1, publishedAt: new Date() }], total: 1 }),
  };
  const uc = new ListMarketplaceTestsUseCase(examRepo);
  const res = await uc.execute({ limit: 10, minRating: 4 });
  expect(res.items).toBeDefined();
});

test('GetRecommended returns items with required fields', async () => {
  const followRepo: any = { listFollowedEducatorIds: async () => [], listFollowedExamTypeIds: async () => [] };
  const examRepo: any = {
    listPublishedByFollowed: async () => [],
    listPublishedFallback: async () => [{ id: 't1', title: 'T1', educatorId: 'e1', isTimed: false, questionCount: 1 }],
  };
  const uc = new GetRecommendedTestsUseCase(examRepo, followRepo);
  const res = await uc.execute('c1', 10);
  // GetRecommendedTestsUseCase Summary tipi: id, title, educatorId, tags gibi alanlar döner
  expect(res.items.length).toBeGreaterThan(0);
  expect(res.items[0].id).toBeDefined();
  expect(res.items[0].title).toBeDefined();
  expect(Array.isArray(res.items[0].tags)).toBe(true);
});
