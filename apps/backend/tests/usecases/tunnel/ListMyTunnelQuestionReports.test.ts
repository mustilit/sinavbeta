/**
 * ListMyTunnelQuestionReportsUseCase — adayın tünel soru hata bildirimlerini
 * MyObjections sayfasının okuduğu "objection benzeri" şekle map'ler.
 * Regresyon: tünel hata bildirimi /me/objections'da görünmüyordu (2026-06-15).
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    tunnelQuestionReport: { findMany: jest.fn() },
    tunnel: { findMany: jest.fn() },
    tunnelQuestion: { findMany: jest.fn() },
  },
}));

import { ListMyTunnelQuestionReportsUseCase } from '../../../src/application/use-cases/tunnel/ListMyTunnelQuestionReportsUseCase';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
beforeEach(() => jest.clearAllMocks());

describe('ListMyTunnelQuestionReportsUseCase', () => {
  it('actorId yoksa 401 fırlatır', async () => {
    await expect(new ListMyTunnelQuestionReportsUseCase().execute(undefined)).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    });
  });

  it('rapor yoksa boş dizi döner', async () => {
    p.tunnelQuestionReport.findMany.mockResolvedValue([]);
    const out = await new ListMyTunnelQuestionReportsUseCase().execute('c1');
    expect(out).toEqual([]);
    expect(p.tunnel.findMany).not.toHaveBeenCalled();
  });

  it('raporu objection şekline map\'ler; tünel başlığı + soru içeriği eklenir', async () => {
    p.tunnelQuestionReport.findMany.mockResolvedValue([
      { id: 'r1', tunnelId: 'tn1', questionId: 'q1', reason: 'dddd', status: 'OPEN', createdAt: new Date('2026-06-16') },
    ]);
    p.tunnel.findMany.mockResolvedValue([{ id: 'tn1', title: 'Demo Tüneli' }]);
    p.tunnelQuestion.findMany.mockResolvedValue([{ id: 'q1', content: 'Soru 3?' }]);

    const out = await new ListMyTunnelQuestionReportsUseCase().execute('c1');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 'r1',
      reason: 'dddd',
      status: 'OPEN',
      questionContent: 'Soru 3?',
      testId: 'tn1',
      testTitle: 'Tünel: Demo Tüneli',
      source: 'TUNNEL',
    });
  });

  it('RESOLVED durumu ANSWERED\'a map\'lenir (yeşil rozet için)', async () => {
    p.tunnelQuestionReport.findMany.mockResolvedValue([
      { id: 'r2', tunnelId: 'tn1', questionId: null, reason: 'x', status: 'RESOLVED', createdAt: new Date() },
    ]);
    p.tunnel.findMany.mockResolvedValue([{ id: 'tn1', title: 'T' }]);
    const out = await new ListMyTunnelQuestionReportsUseCase().execute('c1');
    expect(out[0].status).toBe('ANSWERED');
    expect(out[0].questionContent).toBe('');
    // questionId yoksa tunnelQuestion sorgusu atlanır
    expect(p.tunnelQuestion.findMany).not.toHaveBeenCalled();
  });

  it('server-side status filtresi uygulanır', async () => {
    p.tunnelQuestionReport.findMany.mockResolvedValue([
      { id: 'r1', tunnelId: 'tn1', questionId: null, reason: 'a', status: 'OPEN', createdAt: new Date() },
      { id: 'r2', tunnelId: 'tn1', questionId: null, reason: 'b', status: 'RESOLVED', createdAt: new Date() },
    ]);
    p.tunnel.findMany.mockResolvedValue([{ id: 'tn1', title: 'T' }]);
    const out = await new ListMyTunnelQuestionReportsUseCase().execute('c1', { status: 'OPEN' });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('r1');
  });
});
