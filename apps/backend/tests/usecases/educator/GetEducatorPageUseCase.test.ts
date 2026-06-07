/**
 * GetEducatorPageUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - educatorId eksik → INVALID_INPUT hatası
 * - Educator bulunamazsa → EDUCATOR_NOT_FOUND
 * - Kullanıcı EDUCATOR değilse → EDUCATOR_NOT_FOUND
 * - Test yoksa boş items döner
 * - Başarı: educator, stats, tests bilgileri döner
 * - Sayfalama: page ve limit uygulanır
 * - ReviewAggregationService çağrılır
 */

// Use case happy-path'te require('.../prisma') ile prisma.review.aggregate ve
// $queryRaw (eğitici puanı + toplam satış) çağırır. Repo'lar enjekte edilse de
// bu iki çağrı doğrudan prisma'ya gider → mock'lanmazsa gerçek DB'ye bağlanmaya
// çalışır (PrismaClientInitializationError).
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    review: {
      aggregate: jest.fn(async () => ({ _avg: { educatorRating: null }, _count: { _all: 0 } })),
    },
    $queryRaw: jest.fn(async () => [{ cnt: 0 }]),
  },
}));

import { GetEducatorPageUseCase } from '../../../src/application/use-cases/educator/GetEducatorPageUseCase';

function makeUsersRepo(educator: any) {
  return { findById: jest.fn().mockResolvedValue(educator) };
}

function makeExamsRepo(items: any[] = [], total = 0) {
  return { listPublishedByEducator: jest.fn().mockResolvedValue({ items, total }) };
}

function makeStatsRepo(stats: any[] = []) {
  return { findManyByTestIds: jest.fn().mockResolvedValue(stats) };
}

function makeReviewAgg(aggregates: Record<string, any> = {}) {
  return { getAggregatesForTestIds: jest.fn().mockResolvedValue(aggregates) };
}

function makePrefsRepo(prefs: any = null) {
  return { findByUserId: jest.fn().mockResolvedValue(prefs) };
}

function makeEducator(overrides: Record<string, any> = {}) {
  return { id: 'edu-1', role: 'EDUCATOR', status: 'ACTIVE', username: 'educator1', bio: 'Biyografi', ...overrides };
}

describe('GetEducatorPageUseCase', () => {
  it('educatorId eksik ise INVALID_INPUT hatası fırlatır', async () => {
    const uc = new GetEducatorPageUseCase(makeUsersRepo(null) as any, makeExamsRepo() as any, makeStatsRepo() as any, makeReviewAgg() as any, makePrefsRepo() as any);
    await expect(uc.execute('')).rejects.toThrow('INVALID_INPUT');
  });

  it('educator bulunamazsa EDUCATOR_NOT_FOUND hatası fırlatır', async () => {
    const uc = new GetEducatorPageUseCase(makeUsersRepo(null) as any, makeExamsRepo() as any, makeStatsRepo() as any, makeReviewAgg() as any, makePrefsRepo() as any);
    await expect(uc.execute('edu-missing')).rejects.toThrow('EDUCATOR_NOT_FOUND');
  });

  it('kullanıcı CANDIDATE ise EDUCATOR_NOT_FOUND fırlatır', async () => {
    const uc = new GetEducatorPageUseCase(makeUsersRepo(makeEducator({ role: 'CANDIDATE' })) as any, makeExamsRepo() as any, makeStatsRepo() as any, makeReviewAgg() as any, makePrefsRepo() as any);
    await expect(uc.execute('edu-1')).rejects.toThrow('EDUCATOR_NOT_FOUND');
  });

  it('başarı: educator bilgileri döner', async () => {
    const uc = new GetEducatorPageUseCase(makeUsersRepo(makeEducator()) as any, makeExamsRepo() as any, makeStatsRepo() as any, makeReviewAgg() as any, makePrefsRepo() as any);
    const result = await uc.execute('edu-1');
    expect(result.educator.id).toBe('edu-1');
    expect(result.educator.displayName).toBe('educator1');
    expect(result.educator.bio).toBe('Biyografi');
  });

  it('bio metadata.bio\'dan okunur (kanonik saklama — kolon boşken)', async () => {
    // Gerçek dünya: UpdateEducatorProfileUseCase tanıtım metnini metadata.bio'ya yazar,
    // bio kolonu boş kalır. Public profil metadata'dan okumalı (yoksa "tanıtım yok" görünür).
    const educator = makeEducator({ bio: '', metadata: { bio: 'Metadata tanıtım metni' } });
    const uc = new GetEducatorPageUseCase(makeUsersRepo(educator) as any, makeExamsRepo() as any, makeStatsRepo() as any, makeReviewAgg() as any, makePrefsRepo() as any);
    const result = await uc.execute('edu-1');
    expect(result.educator.bio).toBe('Metadata tanıtım metni');
  });

  it('metadata.bio kolon bio\'dan önceliklidir', async () => {
    const educator = makeEducator({ bio: 'Eski kolon bio', metadata: { bio: 'Güncel metadata bio' } });
    const uc = new GetEducatorPageUseCase(makeUsersRepo(educator) as any, makeExamsRepo() as any, makeStatsRepo() as any, makeReviewAgg() as any, makePrefsRepo() as any);
    const result = await uc.execute('edu-1');
    expect(result.educator.bio).toBe('Güncel metadata bio');
  });

  it('ne metadata.bio ne kolon varsa null döner', async () => {
    const educator = makeEducator({ bio: undefined, metadata: {} });
    const uc = new GetEducatorPageUseCase(makeUsersRepo(educator) as any, makeExamsRepo() as any, makeStatsRepo() as any, makeReviewAgg() as any, makePrefsRepo() as any);
    const result = await uc.execute('edu-1');
    expect(result.educator.bio).toBeNull();
  });

  it('test yoksa items boş döner', async () => {
    const uc = new GetEducatorPageUseCase(makeUsersRepo(makeEducator()) as any, makeExamsRepo([], 0) as any, makeStatsRepo() as any, makeReviewAgg() as any, makePrefsRepo() as any);
    const result = await uc.execute('edu-1');
    expect(result.tests.items).toHaveLength(0);
    expect(result.stats.totalPublishedTests).toBe(0);
  });

  it('testler ve sayfalama meta döner', async () => {
    const tests = [
      { id: 't1', title: 'Test 1', educatorId: 'edu-1', priceCents: 4900, currency: 'TRY', isTimed: false, questionCount: 10 },
    ];
    const uc = new GetEducatorPageUseCase(makeUsersRepo(makeEducator()) as any, makeExamsRepo(tests, 1) as any, makeStatsRepo() as any, makeReviewAgg({ t1: { avg: 4.5, count: 10 } }) as any, makePrefsRepo() as any);
    const result = await uc.execute('edu-1', { page: 1, limit: 20 });
    expect(result.tests.items).toHaveLength(1);
    expect(result.tests.items[0].title).toBe('Test 1');
    expect(result.tests.meta.page).toBe(1);
    expect(result.tests.meta.total).toBe(1);
  });

  it('stats tablosundan rating verisi alınır', async () => {
    const tests = [{ id: 't1', title: 'Test 1', educatorId: 'edu-1', priceCents: 0, currency: 'TRY', isTimed: false, questionCount: 5 }];
    const statsRows = [{ testId: 't1', ratingAvg: 4.8, ratingCount: 20 }];
    const uc = new GetEducatorPageUseCase(makeUsersRepo(makeEducator()) as any, makeExamsRepo(tests, 1) as any, makeStatsRepo(statsRows) as any, makeReviewAgg() as any, makePrefsRepo() as any);
    const result = await uc.execute('edu-1');
    expect(result.tests.items[0].ratingAvg).toBe(4.8);
    expect(result.tests.items[0].ratingCount).toBe(20);
  });

  it('avatarUrl profil tercihlerinden alınır', async () => {
    const uc = new GetEducatorPageUseCase(makeUsersRepo(makeEducator()) as any, makeExamsRepo() as any, makeStatsRepo() as any, makeReviewAgg() as any, makePrefsRepo({ preferences: { profile_image_url: 'https://img.example.com/avatar.jpg' } }) as any);
    const result = await uc.execute('edu-1');
    expect(result.educator.avatarUrl).toBe('https://img.example.com/avatar.jpg');
  });
});
