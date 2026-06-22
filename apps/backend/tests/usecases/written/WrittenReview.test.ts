/**
 * WrittenReviewUseCases unit testleri.
 * UpsertWrittenReview, ListWrittenReviews, GetMyWrittenReview.
 * Gerçek imzalar:
 *   UpsertWrittenReviewUseCase(moderate?).execute(packageId, actorId, { rating, comment })
 *   ListWrittenReviewsUseCase.execute(packageId, { limit, offset }) -> { avg, count, items }
 *   GetMyWrittenReviewUseCase.execute(packageId, actorId)
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    writtenPurchase: { findUnique: jest.fn() },
    writtenReview: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      aggregate: jest.fn(),
      count: jest.fn(),
    },
    user: { findMany: jest.fn() },
  },
}));

import {
  UpsertWrittenReviewUseCase,
  ListWrittenReviewsUseCase,
  GetMyWrittenReviewUseCase,
} from '../../../src/application/use-cases/written/WrittenReviewUseCases';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;

beforeEach(() => jest.clearAllMocks());

describe('UpsertWrittenReviewUseCase', () => {
  const activePurchase = { status: 'ACTIVE', tenantId: 'tn1' };

  it('actorId yoksa UNAUTHORIZED', async () => {
    const uc = new UpsertWrittenReviewUseCase();
    await expect(uc.execute('pkg1', null, { rating: 5 })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(p.writtenPurchase.findUnique).not.toHaveBeenCalled();
  });

  it('rating 1-5 dışındaysa INVALID_RATING', async () => {
    const uc = new UpsertWrittenReviewUseCase();
    await expect(uc.execute('pkg1', 'cand1', { rating: 0 })).rejects.toMatchObject({ code: 'INVALID_RATING' });
    await expect(uc.execute('pkg1', 'cand1', { rating: 6 })).rejects.toMatchObject({ code: 'INVALID_RATING' });
    await expect(uc.execute('pkg1', 'cand1', { rating: NaN })).rejects.toMatchObject({ code: 'INVALID_RATING' });
    expect(p.writtenPurchase.findUnique).not.toHaveBeenCalled();
  });

  it('satın alma yoksa NOT_PURCHASED', async () => {
    p.writtenPurchase.findUnique.mockResolvedValue(null);
    const uc = new UpsertWrittenReviewUseCase();
    await expect(uc.execute('pkg1', 'cand1', { rating: 4 })).rejects.toMatchObject({ code: 'NOT_PURCHASED' });
  });

  it('satın alma ACTIVE değilse NOT_PURCHASED', async () => {
    p.writtenPurchase.findUnique.mockResolvedValue({ status: 'REFUNDED', tenantId: 'tn1' });
    const uc = new UpsertWrittenReviewUseCase();
    await expect(uc.execute('pkg1', 'cand1', { rating: 4 })).rejects.toMatchObject({ code: 'NOT_PURCHASED' });
  });

  it('moderasyon blocked ise COMMENT_REJECTED', async () => {
    p.writtenPurchase.findUnique.mockResolvedValue(activePurchase);
    const moderate = { execute: jest.fn().mockResolvedValue({ allowed: false, message: 'Uygunsuz' }) };
    const uc = new UpsertWrittenReviewUseCase(moderate as any);
    await expect(uc.execute('pkg1', 'cand1', { rating: 5, comment: 'kötü söz' })).rejects.toMatchObject({ code: 'COMMENT_REJECTED' });
    expect(moderate.execute).toHaveBeenCalled();
    expect(p.writtenReview.create).not.toHaveBeenCalled();
  });

  it('mevcut inceleme varsa günceller (update)', async () => {
    p.writtenPurchase.findUnique.mockResolvedValue(activePurchase);
    p.writtenReview.findUnique.mockResolvedValue({ id: 'rev1' });
    p.writtenReview.update.mockResolvedValue({});
    const uc = new UpsertWrittenReviewUseCase();
    const r = await uc.execute('pkg1', 'cand1', { rating: 4, comment: 'iyi' });
    expect(r.ok).toBe(true);
    expect(p.writtenReview.update).toHaveBeenCalledWith({ where: { id: 'rev1' }, data: { rating: 4, comment: 'iyi' } });
    expect(p.writtenReview.create).not.toHaveBeenCalled();
  });

  it('yeni inceleme oluşturur (create)', async () => {
    p.writtenPurchase.findUnique.mockResolvedValue(activePurchase);
    p.writtenReview.findUnique.mockResolvedValue(null);
    p.writtenReview.create.mockResolvedValue({});
    const uc = new UpsertWrittenReviewUseCase();
    const r = await uc.execute('pkg1', 'cand1', { rating: 5, comment: 'harika' });
    expect(r.ok).toBe(true);
    expect(p.writtenReview.create).toHaveBeenCalledWith({
      data: { tenantId: 'tn1', packageId: 'pkg1', candidateId: 'cand1', rating: 5, comment: 'harika' },
    });
  });

  it('comment null ise moderasyon çağrılmaz', async () => {
    p.writtenPurchase.findUnique.mockResolvedValue(activePurchase);
    p.writtenReview.findUnique.mockResolvedValue(null);
    p.writtenReview.create.mockResolvedValue({});
    const moderate = { execute: jest.fn() };
    const uc = new UpsertWrittenReviewUseCase(moderate as any);
    await uc.execute('pkg1', 'cand1', { rating: 5, comment: null });
    expect(moderate.execute).not.toHaveBeenCalled();
  });

  it('comment boş string ise moderasyon çağrılmaz, comment null kaydedilir', async () => {
    p.writtenPurchase.findUnique.mockResolvedValue(activePurchase);
    p.writtenReview.findUnique.mockResolvedValue(null);
    p.writtenReview.create.mockResolvedValue({});
    const moderate = { execute: jest.fn() };
    const uc = new UpsertWrittenReviewUseCase(moderate as any);
    await uc.execute('pkg1', 'cand1', { rating: 3, comment: '   ' });
    expect(moderate.execute).not.toHaveBeenCalled();
    expect(p.writtenReview.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ comment: null }) }),
    );
  });

  it('moderasyon modülü yoksa da çalışır', async () => {
    p.writtenPurchase.findUnique.mockResolvedValue(activePurchase);
    p.writtenReview.findUnique.mockResolvedValue(null);
    p.writtenReview.create.mockResolvedValue({});
    const uc = new UpsertWrittenReviewUseCase();
    const r = await uc.execute('pkg1', 'cand1', { rating: 4, comment: 'yorum' });
    expect(r.ok).toBe(true);
  });

  it('rating ondalıksa yuvarlanır (3.4 -> 3)', async () => {
    p.writtenPurchase.findUnique.mockResolvedValue(activePurchase);
    p.writtenReview.findUnique.mockResolvedValue(null);
    p.writtenReview.create.mockResolvedValue({});
    const uc = new UpsertWrittenReviewUseCase();
    await uc.execute('pkg1', 'cand1', { rating: 3.4 });
    expect(p.writtenReview.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ rating: 3 }) }),
    );
  });
});

describe('ListWrittenReviewsUseCase', () => {
  const uc = new ListWrittenReviewsUseCase();

  it('boş liste → avg null, count 0, items []', async () => {
    p.writtenReview.aggregate.mockResolvedValue({ _avg: { rating: null }, _count: { _all: 0 } });
    p.writtenReview.findMany.mockResolvedValue([]);
    const r = await uc.execute('pkg1');
    expect(r.avg).toBeNull();
    expect(r.count).toBe(0);
    expect(r.items).toEqual([]);
    expect(p.user.findMany).not.toHaveBeenCalled();
  });

  it('incelemeler başarılı listelenir (avg + candidateName eşlenir)', async () => {
    p.writtenReview.aggregate.mockResolvedValue({ _avg: { rating: 4.5 }, _count: { _all: 2 } });
    p.writtenReview.findMany.mockResolvedValue([
      { id: 'r1', rating: 5, comment: 'a', createdAt: new Date(), candidateId: 'c1' },
      { id: 'r2', rating: 4, comment: 'b', createdAt: new Date(), candidateId: 'c2' },
    ]);
    p.user.findMany.mockResolvedValue([
      { id: 'c1', username: 'ali' },
      { id: 'c2', username: 'veli' },
    ]);
    const r = await uc.execute('pkg1', { limit: 10, offset: 0 });
    expect(r.avg).toBe(4.5);
    expect(r.count).toBe(2);
    expect(r.items[0].candidateName).toBe('ali');
    expect(r.items[1].candidateName).toBe('veli');
  });

  it('pagination skip/take uygulanır (limit clamp 50, offset>=0)', async () => {
    p.writtenReview.aggregate.mockResolvedValue({ _avg: { rating: 3 }, _count: { _all: 5 } });
    p.writtenReview.findMany.mockResolvedValue([]);
    await uc.execute('pkg1', { limit: 999, offset: -5 });
    expect(p.writtenReview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 50 }),
    );
  });

  it('candidate bulunamazsa candidateName "Aday" döner', async () => {
    p.writtenReview.aggregate.mockResolvedValue({ _avg: { rating: 2 }, _count: { _all: 1 } });
    p.writtenReview.findMany.mockResolvedValue([
      { id: 'r1', rating: 2, comment: null, createdAt: new Date(), candidateId: 'cX' },
    ]);
    p.user.findMany.mockResolvedValue([]);
    const r = await uc.execute('pkg1');
    expect(r.items[0].candidateName).toBe('Aday');
  });

  it('varsayılan limit (10) ve offset (0)', async () => {
    p.writtenReview.aggregate.mockResolvedValue({ _avg: { rating: null }, _count: { _all: 0 } });
    p.writtenReview.findMany.mockResolvedValue([]);
    await uc.execute('pkg1');
    expect(p.writtenReview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 10 }),
    );
  });
});

describe('GetMyWrittenReviewUseCase', () => {
  const uc = new GetMyWrittenReviewUseCase();

  it('actorId yoksa null', async () => {
    const r = await uc.execute('pkg1', null);
    expect(r).toBeNull();
    expect(p.writtenReview.findUnique).not.toHaveBeenCalled();
  });

  it('kayıt varsa döner', async () => {
    const rev = { rating: 5, comment: 'iyi', createdAt: new Date(), updatedAt: new Date() };
    p.writtenReview.findUnique.mockResolvedValue(rev);
    const r = await uc.execute('pkg1', 'cand1');
    expect(r).toEqual(rev);
  });

  it('kayıt yoksa null', async () => {
    p.writtenReview.findUnique.mockResolvedValue(null);
    const r = await uc.execute('pkg1', 'cand1');
    expect(r).toBeNull();
  });
});
