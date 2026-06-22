/**
 * Tünel değerlendirme use-case'leri: Upsert (satın alma kapısı + puan doğrulama +
 * create/update), List (ortalama + gizli ad çözümleme), GetMy.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    tunnelPurchase: { findUnique: jest.fn() },
    tunnelReview: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), aggregate: jest.fn(), findMany: jest.fn() },
    user: { findMany: jest.fn() },
    auditLog: { create: jest.fn(async () => ({})) },
  },
}));

import {
  UpsertTunnelReviewUseCase,
  ListTunnelReviewsUseCase,
  GetMyTunnelReviewUseCase,
} from '../../../src/application/use-cases/tunnel/TunnelReviewUseCases';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
beforeEach(() => jest.clearAllMocks());

describe('UpsertTunnelReviewUseCase', () => {
  it('giriş yoksa → UNAUTHORIZED', async () => {
    await expect(new UpsertTunnelReviewUseCase().execute('tn1', null, { rating: 5 }))
      .rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('puan aralık dışı → INVALID_RATING', async () => {
    await expect(new UpsertTunnelReviewUseCase().execute('tn1', 'c1', { rating: 0 }))
      .rejects.toMatchObject({ code: 'INVALID_RATING' });
    await expect(new UpsertTunnelReviewUseCase().execute('tn1', 'c1', { rating: 6 }))
      .rejects.toMatchObject({ code: 'INVALID_RATING' });
  });

  it('satın almamış → TUNNEL_NOT_PURCHASED', async () => {
    p.tunnelPurchase.findUnique.mockResolvedValue(null);
    await expect(new UpsertTunnelReviewUseCase().execute('tn1', 'c1', { rating: 5 }))
      .rejects.toMatchObject({ code: 'TUNNEL_NOT_PURCHASED' });
  });

  it('satın alma ACTIVE değil → TUNNEL_NOT_PURCHASED', async () => {
    p.tunnelPurchase.findUnique.mockResolvedValue({ status: 'REFUNDED', tenantId: 't1' });
    await expect(new UpsertTunnelReviewUseCase().execute('tn1', 'c1', { rating: 5 }))
      .rejects.toMatchObject({ code: 'TUNNEL_NOT_PURCHASED' });
  });

  it('mevcut yoksa → create (tenant snapshot + comment trim)', async () => {
    p.tunnelPurchase.findUnique.mockResolvedValue({ status: 'ACTIVE', tenantId: 't1' });
    p.tunnelReview.findUnique.mockResolvedValue(null);
    p.tunnelReview.create.mockResolvedValue({});
    const r = await new UpsertTunnelReviewUseCase().execute('tn1', 'c1', { rating: 4, comment: '  iyi  ' });
    expect(r).toEqual({ ok: true });
    expect(p.tunnelReview.create).toHaveBeenCalledTimes(1);
    const data = p.tunnelReview.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ tenantId: 't1', tunnelId: 'tn1', candidateId: 'c1', rating: 4, comment: 'iyi' });
    expect(p.tunnelReview.update).not.toHaveBeenCalled();
  });

  it('mevcut varsa → update (create çağrılmaz)', async () => {
    p.tunnelPurchase.findUnique.mockResolvedValue({ status: 'ACTIVE', tenantId: 't1' });
    p.tunnelReview.findUnique.mockResolvedValue({ id: 'r1' });
    p.tunnelReview.update.mockResolvedValue({});
    await new UpsertTunnelReviewUseCase().execute('tn1', 'c1', { rating: 3, comment: null });
    expect(p.tunnelReview.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { rating: 3, comment: null } });
    expect(p.tunnelReview.create).not.toHaveBeenCalled();
  });
});

describe('ListTunnelReviewsUseCase', () => {
  it('ortalama yuvarlanır + ad çözümlenir (eksikse fallback)', async () => {
    p.tunnelReview.aggregate.mockResolvedValue({ _avg: { rating: 4.25 }, _count: { _all: 2 } });
    p.tunnelReview.findMany.mockResolvedValue([
      { id: 'r1', rating: 5, comment: 'a', createdAt: new Date(), candidateId: 'u1' },
      { id: 'r2', rating: 4, comment: null, createdAt: new Date(), candidateId: 'u2' },
    ]);
    p.user.findMany.mockResolvedValue([{ id: 'u1', username: 'Ali' }]);
    const r = await new ListTunnelReviewsUseCase().execute('tn1', { limit: 10, offset: 0 });
    expect(r.avg).toBe(4.3); // 4.25 → 4.3
    expect(r.count).toBe(2);
    expect(r.items[0].candidateName).toBe('Ali');
    expect(r.items[1].candidateName).toBe('Aday'); // u2 yok → fallback
  });

  it('hiç değerlendirme yoksa avg null', async () => {
    p.tunnelReview.aggregate.mockResolvedValue({ _avg: { rating: null }, _count: { _all: 0 } });
    p.tunnelReview.findMany.mockResolvedValue([]);
    const r = await new ListTunnelReviewsUseCase().execute('tn1');
    expect(r.avg).toBeNull();
    expect(r.count).toBe(0);
    expect(r.items).toEqual([]);
    expect(p.user.findMany).not.toHaveBeenCalled(); // id yok → sorgu yapılmaz
  });
});

describe('GetMyTunnelReviewUseCase', () => {
  it('giriş yoksa null', async () => {
    expect(await new GetMyTunnelReviewUseCase().execute('tn1', null)).toBeNull();
    expect(p.tunnelReview.findUnique).not.toHaveBeenCalled();
  });

  it('varsa kendi değerlendirmesini döner', async () => {
    p.tunnelReview.findUnique.mockResolvedValue({ rating: 5, comment: 'x', createdAt: new Date(), updatedAt: new Date() });
    const r = await new GetMyTunnelReviewUseCase().execute('tn1', 'c1');
    expect(r?.rating).toBe(5);
  });
});
