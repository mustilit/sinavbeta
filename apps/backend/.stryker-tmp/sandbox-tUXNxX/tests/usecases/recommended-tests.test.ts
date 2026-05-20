// @ts-nocheck
import { GetRecommendedTestsUseCase } from '../../src/application/use-cases/package/GetRecommendedTestsUseCase';

// RedisCache mock — testlerde gerçek Redis bağlantısı olmaz
jest.mock('../../src/infrastructure/cache/RedisCache', () => ({
  RedisCache: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
  })),
}));

test('no follows -> fallback only', async () => {
  const followRepo: any = { listFollowedEducatorIds: async () => [], listFollowedExamTypeIds: async () => [] };
  const examRepo: any = {
    listPublishedByFollowed: async () => [],
    listPublishedFallback: async () => [{ id: 't1', title: 'T1', educatorId: 'e1', isTimed: false, questionCount: 1 }],
  };
  const uc = new GetRecommendedTestsUseCase(examRepo, followRepo);
  const res = await uc.execute('c1', 10);
  expect(res.items.length).toBeGreaterThanOrEqual(1);
  expect(res.items[0].tags).toContain('POPULAR');
});

test('educator follow -> followed boosted', async () => {
  const followRepo: any = { listFollowedEducatorIds: async () => ['e1'], listFollowedExamTypeIds: async () => [] };
  const examRepo: any = {
    listPublishedByFollowed: async () => [{ id: 't2', title: 'T2', educatorId: 'e1', isTimed: false, questionCount: 1 }],
    listPublishedFallback: async () => [{ id: 't3', title: 'T3', educatorId: 'e2', isTimed: false, questionCount: 1 }],
  };
  const uc = new GetRecommendedTestsUseCase(examRepo, followRepo);
  const res = await uc.execute('c1', 10);
  expect(res.items[0].tags).toContain('FOLLOWED_EDUCATOR');
});

test('examType follow -> followed examType boosted', async () => {
  const followRepo: any = { listFollowedEducatorIds: async () => [], listFollowedExamTypeIds: async () => ['et1'] };
  const examRepo: any = {
    listPublishedByFollowed: async () => [{ id: 't4', title: 'T4', educatorId: 'e3', examTypeId: 'et1', isTimed: false, questionCount: 1 }],
    listPublishedFallback: async () => [],
  };
  const uc = new GetRecommendedTestsUseCase(examRepo, followRepo);
  const res = await uc.execute('c1', 10);
  expect(res.items[0].tags).toContain('FOLLOWED_EXAMTYPE');
});

test('dedupe when both follow types include same test', async () => {
  const followRepo: any = { listFollowedEducatorIds: async () => ['e1'], listFollowedExamTypeIds: async () => ['et1'] };
  const t = { id: 't5', title: 'T5', educatorId: 'e1', examTypeId: 'et1', isTimed: false, questionCount: 1 };
  const examRepo: any = {
    listPublishedByFollowed: async () => [t],
    listPublishedFallback: async () => [],
  };
  const uc = new GetRecommendedTestsUseCase(examRepo, followRepo);
  const res = await uc.execute('c1', 10);
  expect(res.items.length).toBe(1);
  expect(res.items[0].tags).toEqual(expect.arrayContaining(['FOLLOWED_EDUCATOR', 'FOLLOWED_EXAMTYPE']));
});

test('fallback only when no follows', async () => {
  // Arrange: takip yok, fallback listeden sonuçlar gelmeli
  const followRepo: any = { listFollowedEducatorIds: async () => [], listFollowedExamTypeIds: async () => [] };
  const examRepo: any = {
    listPublishedByFollowed: async () => [],
    listPublishedFallback: async () => [{ id: 't1', title: 'T1' }],
  };
  const uc = new GetRecommendedTestsUseCase(examRepo, followRepo);
  // Act
  const res = await uc.execute('c1', 10);
  // Assert
  expect(res.items.length).toBeGreaterThanOrEqual(1);
});

test('limit respected and dedupe', async () => {
  // Arrange: followed+fallback arasında t2 ortak → dedupe sonrası 2 unique
  const followRepo: any = { listFollowedEducatorIds: async () => [], listFollowedExamTypeIds: async () => [] };
  const examRepo: any = {
    listPublishedByFollowed: async () => [{ id: 't1', title: 'T1' }, { id: 't2', title: 'T2' }],
    listPublishedFallback: async () => [{ id: 't2', title: 'T2' }, { id: 't3', title: 'T3' }],
  };
  const uc = new GetRecommendedTestsUseCase(examRepo, followRepo);
  // Act
  const res = await uc.execute('c1', 2);
  // Assert
  expect(res.items.length).toBe(2);
  const ids = res.items.map((i: any) => i.id);
  expect(new Set(ids).size).toBe(ids.length);
});
