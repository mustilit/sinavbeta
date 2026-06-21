/**
 * Aday tünel pazar use-case'leri: meta (salesCount + educatorId + satın alma/ilerleme),
 * liste (purchased/attemptStatus eşleme) ve hafif rapor (ilerleme yüzdesi + durum).
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    tunnel: { findUnique: jest.fn(), findMany: jest.fn() },
    tunnelPurchase: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    tunnelAttempt: { findUnique: jest.fn(), findMany: jest.fn() },
    tunnelQuestionProgress: { groupBy: jest.fn() },
  },
}));

import {
  GetPublishedTunnelMetaUseCase,
  ListPublishedTunnelsUseCase,
} from '../../../src/application/use-cases/tunnel/CandidateTunnelUseCases';
import { GetCandidateTunnelReportsUseCase } from '../../../src/application/use-cases/tunnel/GetCandidateTunnelReportsUseCase';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
beforeEach(() => jest.clearAllMocks());

const fullTunnel = (over: any = {}) => ({
  id: 'tn1',
  title: 'YDS Tüneli',
  description: 'açıklama',
  coverImageUrl: null,
  priceCents: 5000,
  currency: 'TRY',
  layerCount: 3,
  status: 'PUBLISHED',
  educatorId: 'edu1',
  examType: { name: 'YDS' },
  topic: { name: 'Kelime' },
  educator: { username: 'Selin' },
  _count: { questions: 30 },
  ...over,
});

describe('GetPublishedTunnelMetaUseCase', () => {
  it('tünel yoksa → TUNNEL_NOT_FOUND', async () => {
    p.tunnel.findUnique.mockResolvedValue(null);
    await expect(new GetPublishedTunnelMetaUseCase().execute('tn1', 'c1'))
      .rejects.toMatchObject({ code: 'TUNNEL_NOT_FOUND' });
  });

  it('yayında değilse → TUNNEL_NOT_FOUND', async () => {
    p.tunnel.findUnique.mockResolvedValue(fullTunnel({ status: 'DRAFT' }));
    await expect(new GetPublishedTunnelMetaUseCase().execute('tn1', 'c1'))
      .rejects.toMatchObject({ code: 'TUNNEL_NOT_FOUND' });
  });

  it('giriş yokken: educatorId + salesCount döner, purchased false', async () => {
    p.tunnel.findUnique.mockResolvedValue(fullTunnel());
    p.tunnelPurchase.count.mockResolvedValue(7);
    const r = await new GetPublishedTunnelMetaUseCase().execute('tn1', null);
    expect(r.educatorId).toBe('edu1');
    expect(r.educatorUsername).toBe('Selin');
    expect(r.salesCount).toBe(7);
    expect(r.questionCount).toBe(30);
    expect(r.purchased).toBe(false);
    expect(r.attemptStatus).toBeNull();
    expect(p.tunnelPurchase.findUnique).not.toHaveBeenCalled(); // actor yok
  });

  it('satın alan aday: purchased true + attemptStatus', async () => {
    p.tunnel.findUnique.mockResolvedValue(fullTunnel());
    p.tunnelPurchase.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    p.tunnelAttempt.findUnique.mockResolvedValue({ status: 'IN_PROGRESS' });
    p.tunnelPurchase.count.mockResolvedValue(3);
    const r = await new GetPublishedTunnelMetaUseCase().execute('tn1', 'c1');
    expect(r.purchased).toBe(true);
    expect(r.attemptStatus).toBe('IN_PROGRESS');
    expect(r.salesCount).toBe(3);
  });

  it('satın alma REFUNDED → purchased false', async () => {
    p.tunnel.findUnique.mockResolvedValue(fullTunnel());
    p.tunnelPurchase.findUnique.mockResolvedValue({ status: 'REFUNDED' });
    p.tunnelAttempt.findUnique.mockResolvedValue(null);
    p.tunnelPurchase.count.mockResolvedValue(0);
    const r = await new GetPublishedTunnelMetaUseCase().execute('tn1', 'c1');
    expect(r.purchased).toBe(false);
  });

  it('actorId undefined (guest) → purchased false, findUnique cagirilmaz', async () => {
    p.tunnel.findUnique.mockResolvedValue(fullTunnel());
    p.tunnelPurchase.count.mockResolvedValue(2);
    const r = await new GetPublishedTunnelMetaUseCase().execute('tn1', undefined);
    expect(r.purchased).toBe(false);
    expect(r.attemptStatus).toBeNull();
    expect(p.tunnelPurchase.findUnique).not.toHaveBeenCalled();
    expect(p.tunnelAttempt.findUnique).not.toHaveBeenCalled();
  });

  it('satın alma PENDING → purchased false (yalniz ACTIVE gecerli)', async () => {
    p.tunnel.findUnique.mockResolvedValue(fullTunnel());
    p.tunnelPurchase.findUnique.mockResolvedValue({ status: 'PENDING' });
    p.tunnelAttempt.findUnique.mockResolvedValue(null);
    p.tunnelPurchase.count.mockResolvedValue(1);
    const r = await new GetPublishedTunnelMetaUseCase().execute('tn1', 'c1');
    expect(r.purchased).toBe(false);
  });

  it('ACTIVE satin alma + attempt yok → purchased true, attemptStatus null', async () => {
    p.tunnel.findUnique.mockResolvedValue(fullTunnel());
    p.tunnelPurchase.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    p.tunnelAttempt.findUnique.mockResolvedValue(null);
    p.tunnelPurchase.count.mockResolvedValue(5);
    const r = await new GetPublishedTunnelMetaUseCase().execute('tn1', 'c1');
    expect(r.purchased).toBe(true);
    expect(r.attemptStatus).toBeNull();
  });

  it('ACTIVE satin alma + COMPLETED attempt', async () => {
    p.tunnel.findUnique.mockResolvedValue(fullTunnel());
    p.tunnelPurchase.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    p.tunnelAttempt.findUnique.mockResolvedValue({ status: 'COMPLETED' });
    p.tunnelPurchase.count.mockResolvedValue(10);
    const r = await new GetPublishedTunnelMetaUseCase().execute('tn1', 'c1');
    expect(r.purchased).toBe(true);
    expect(r.attemptStatus).toBe('COMPLETED');
    expect(r.salesCount).toBe(10);
  });

  it('REJECTED status tunel → TUNNEL_NOT_FOUND', async () => {
    p.tunnel.findUnique.mockResolvedValue(fullTunnel({ status: 'REJECTED' }));
    await expect(new GetPublishedTunnelMetaUseCase().execute('tn1', 'c1'))
      .rejects.toMatchObject({ code: 'TUNNEL_NOT_FOUND' });
  });

  it('PENDING_APPROVAL status tunel → TUNNEL_NOT_FOUND', async () => {
    p.tunnel.findUnique.mockResolvedValue(fullTunnel({ status: 'PENDING_APPROVAL' }));
    await expect(new GetPublishedTunnelMetaUseCase().execute('tn1', 'c1'))
      .rejects.toMatchObject({ code: 'TUNNEL_NOT_FOUND' });
  });
});

describe('ListPublishedTunnelsUseCase', () => {
  it('actor yokken purchased/attemptStatus boş', async () => {
    p.tunnel.findMany.mockResolvedValue([fullTunnel()]);
    const r = await new ListPublishedTunnelsUseCase().execute({}, null);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].purchased).toBe(false);
    expect(r.items[0].attemptStatus).toBeNull();
    expect(r.items[0].educatorId).toBe('edu1');
  });

  it('actor varken satın alma + ilerleme eşlenir', async () => {
    p.tunnel.findMany.mockResolvedValue([fullTunnel({ id: 'a' }), fullTunnel({ id: 'b' })]);
    p.tunnelPurchase.findMany.mockResolvedValue([{ tunnelId: 'a' }]);
    p.tunnelAttempt.findMany.mockResolvedValue([{ tunnelId: 'a', status: 'COMPLETED' }]);
    const r = await new ListPublishedTunnelsUseCase().execute({}, 'c1');
    const a = r.items.find((x: any) => x.id === 'a');
    const b = r.items.find((x: any) => x.id === 'b');
    expect(a.purchased).toBe(true);
    expect(a.attemptStatus).toBe('COMPLETED');
    expect(b.purchased).toBe(false);
  });

  it('actorId undefined (guest) → hic purchase sorgusu yapilmaz', async () => {
    p.tunnel.findMany.mockResolvedValue([fullTunnel({ id: 'x' })]);
    const r = await new ListPublishedTunnelsUseCase().execute({}, undefined);
    expect(r.items[0].purchased).toBe(false);
    expect(r.items[0].attemptStatus).toBeNull();
    expect(p.tunnelPurchase.findMany).not.toHaveBeenCalled();
    expect(p.tunnelAttempt.findMany).not.toHaveBeenCalled();
  });

  it('actor var ama hic ACTIVE satin alma yok → hepsi purchased false', async () => {
    p.tunnel.findMany.mockResolvedValue([fullTunnel({ id: 'a' }), fullTunnel({ id: 'b' })]);
    p.tunnelPurchase.findMany.mockResolvedValue([]); // findMany status:'ACTIVE' filtresini zaten uyguluyor
    p.tunnelAttempt.findMany.mockResolvedValue([]);
    const r = await new ListPublishedTunnelsUseCase().execute({}, 'c1');
    expect(r.items[0].purchased).toBe(false);
    expect(r.items[1].purchased).toBe(false);
  });

  it('birden fazla tunel satinalinmis, dogru esleme', async () => {
    p.tunnel.findMany.mockResolvedValue([
      fullTunnel({ id: 'a' }),
      fullTunnel({ id: 'b' }),
      fullTunnel({ id: 'c' }),
    ]);
    p.tunnelPurchase.findMany.mockResolvedValue([{ tunnelId: 'a' }, { tunnelId: 'c' }]);
    p.tunnelAttempt.findMany.mockResolvedValue([
      { tunnelId: 'a', status: 'IN_PROGRESS' },
      { tunnelId: 'c', status: 'COMPLETED' },
    ]);
    const r = await new ListPublishedTunnelsUseCase().execute({}, 'c1');
    const a = r.items.find((x: any) => x.id === 'a');
    const b = r.items.find((x: any) => x.id === 'b');
    const c = r.items.find((x: any) => x.id === 'c');
    expect(a.purchased).toBe(true);
    expect(a.attemptStatus).toBe('IN_PROGRESS');
    expect(b.purchased).toBe(false);
    expect(b.attemptStatus).toBeNull();
    expect(c.purchased).toBe(true);
    expect(c.attemptStatus).toBe('COMPLETED');
  });

  it('bos tunel listesi → bos items dondurir, purchase sorgusu yapilmaz', async () => {
    p.tunnel.findMany.mockResolvedValue([]);
    const r = await new ListPublishedTunnelsUseCase().execute({}, 'c1');
    expect(r.items).toEqual([]);
    expect(p.tunnelPurchase.findMany).not.toHaveBeenCalled();
  });
});

describe('GetCandidateTunnelReportsUseCase', () => {
  it('giriş yoksa → UNAUTHORIZED', async () => {
    await expect(new GetCandidateTunnelReportsUseCase().execute(null))
      .rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('satın alma yoksa boş liste', async () => {
    p.tunnelPurchase.findMany.mockResolvedValue([]);
    const r = await new GetCandidateTunnelReportsUseCase().execute('c1');
    expect(r).toEqual({ items: [] });
  });

  it('ilerleme yüzdesi = öğrenilen / toplam; durum attempt’ten', async () => {
    p.tunnelPurchase.findMany.mockResolvedValue([
      { tunnelId: 'tn1', tunnel: { id: 'tn1', title: 'T1', examType: { name: 'YDS' }, topic: { name: 'K' }, _count: { questions: 20 } } },
      { tunnelId: 'tn2', tunnel: { id: 'tn2', title: 'T2', examType: null, topic: null, _count: { questions: 10 } } },
    ]);
    p.tunnelAttempt.findMany.mockResolvedValue([{ id: 'a1', tunnelId: 'tn1', status: 'IN_PROGRESS', startedAt: new Date(), completedAt: null }]);
    p.tunnelQuestionProgress.groupBy.mockResolvedValue([{ attemptId: 'a1', _count: { _all: 5 } }]);
    const r = await new GetCandidateTunnelReportsUseCase().execute('c1');
    const t1 = r.items.find((x: any) => x.tunnelId === 'tn1');
    const t2 = r.items.find((x: any) => x.tunnelId === 'tn2');
    expect(t1.masteredQuestions).toBe(5);
    expect(t1.progressPercent).toBe(25); // 5/20
    expect(t1.status).toBe('IN_PROGRESS');
    expect(t2.status).toBeNull(); // başlanmadı
    expect(t2.progressPercent).toBe(0);
  });
});
