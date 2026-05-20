// Mock prisma BEFORE other imports — real Prisma client'in load edilmesini engelle
// (CI/test ortamında query engine binary'si yok; ayrıca burada gerçek DB de yok).
jest.mock('../../src/infrastructure/database/prisma', () => ({
  prisma: {
    userPreference: {
      findUnique: jest.fn(async () => null),
    },
  },
}));

const { GetEducatorPageUseCase } = require('../../src/application/use-cases/educator/GetEducatorPageUseCase');

// prefsRepo mock — varsayılan null prefs
const makePrefsRepo = (prefs = null) => ({
  findByUserId: async () => prefs,
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('educator not found throws', async () => {
  const usersRepo = { findById: async () => null };
  const examsRepo = { listPublishedByEducator: async () => ({ items: [], total: 0 }) };
  const statsRepo = { findManyByTestIds: async () => [] };
  const reviewAgg = { getAggregatesForTestIds: async () => ({}) };
  const uc = new GetEducatorPageUseCase(usersRepo, examsRepo, statsRepo, reviewAgg, makePrefsRepo());
  await expect(uc.execute('no-such')).rejects.toThrow('EDUCATOR_NOT_FOUND');
});

test('returns published tests and pagination meta with enrichment preferring TestStats', async () => {
  const fakeUser = { id: 'ed1', username: 'ed1', role: 'EDUCATOR', status: 'ACTIVE' };
  const test1 = { id: 't1', title: 'T1', educatorId: 'ed1', publishedAt: new Date().toISOString(), isTimed: false, questionCount: 1 };
  const test2 = { id: 't2', title: 'T2', educatorId: 'ed1', publishedAt: new Date().toISOString(), isTimed: false, questionCount: 1 };

  const usersRepo = { findById: async () => fakeUser };
  const examsRepo = {
    listPublishedByEducator: async () => ({ items: [test1, test2], total: 2 }),
  };
  const statsRepo = {
    findManyByTestIds: async (ids) => [{ testId: 't1', ratingAvg: 4.5, ratingCount: 2, purchaseCount: 3 }],
  };
  const reviewAgg = { getAggregatesForTestIds: async () => ({ t1: { avg: 3.0, count: 1 }, t2: { avg: 2.0, count: 1 } }) };

  const uc = new GetEducatorPageUseCase(usersRepo, examsRepo, statsRepo, reviewAgg, makePrefsRepo());
  const res = await uc.execute('ed1', { page: 1, limit: 10 });
  expect(res.educator.id).toBe('ed1');
  expect(res.tests.items.length).toBe(2);
  // t1 should prefer testStats ratingAvg 4.5 over agg 3.0
  const t1 = res.tests.items.find((x) => x.id === 't1');
  expect(t1.ratingAvg).toBeCloseTo(4.5);
  expect(res.tests.meta.page).toBe(1);
  expect(res.tests.meta.limit).toBe(10);
});
