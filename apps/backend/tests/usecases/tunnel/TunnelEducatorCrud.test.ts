/**
 * Eğitici/admin tünel CRUD: detay (sahiplik/rol kapısı + serialize), listeler,
 * meta güncelleme (sahiplik + durum + doğrulama), soru hata bildirimi.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    tunnel: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    examType: { findUnique: jest.fn() },
    topic: { findUnique: jest.fn() },
    adminSettings: { findFirst: jest.fn() },
    tunnelPurchase: { findUnique: jest.fn() },
    tunnelQuestionReport: { create: jest.fn() },
    auditLog: { create: jest.fn(async () => ({})) },
  },
}));

import { GetTunnelUseCase } from '../../../src/application/use-cases/tunnel/GetTunnelUseCase';
import { ListEducatorTunnelsUseCase, ListPendingTunnelsUseCase } from '../../../src/application/use-cases/tunnel/ListTunnelsUseCase';
import { UpdateTunnelUseCase } from '../../../src/application/use-cases/tunnel/UpdateTunnelUseCase';
import { ReportTunnelQuestionUseCase } from '../../../src/application/use-cases/tunnel/ReportTunnelQuestionUseCase';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
const UUID = '550e8400-e29b-41d4-a716-446655440000';
beforeEach(() => jest.clearAllMocks());

const detail = (over: any = {}) => ({
  id: 'tn1', title: 'T', description: 'd', coverImageUrl: null, status: 'DRAFT',
  priceCents: 5000, currency: 'TRY', layerCount: 2, optionsPerQuestion: 10, advanceStreak: 3,
  educatorId: 'edu1', examType: { id: 'e1', name: 'YDS' }, topic: { id: 'tp1', name: 'K' },
  educator: { id: 'edu1', username: 'Selin' }, layers: [{ index: 1, questions: [] }], ...over,
});

describe('GetTunnelUseCase', () => {
  it('giriş yoksa → UNAUTHORIZED', async () => {
    await expect(new GetTunnelUseCase().execute('tn1', null)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
  it('bulunamadı → TUNNEL_NOT_FOUND', async () => {
    p.tunnel.findUnique.mockResolvedValue(null);
    await expect(new GetTunnelUseCase().execute('tn1', 'edu1')).rejects.toMatchObject({ code: 'TUNNEL_NOT_FOUND' });
  });
  it('başka eğitici (admin değil) → FORBIDDEN', async () => {
    p.tunnel.findUnique.mockResolvedValue(detail({ educatorId: 'other' }));
    await expect(new GetTunnelUseCase().execute('tn1', 'edu1', 'EDUCATOR')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('admin her tüneli görebilir + serialize', async () => {
    p.tunnel.findUnique.mockResolvedValue(detail({ educatorId: 'other' }));
    const r = await new GetTunnelUseCase().execute('tn1', 'admin1', 'ADMIN');
    expect(r.id).toBe('tn1');
    expect(r.layers).toHaveLength(1);
    expect(r.educator).toMatchObject({ username: 'Selin' });
  });
  it('sahibi görebilir', async () => {
    p.tunnel.findUnique.mockResolvedValue(detail());
    const r = await new GetTunnelUseCase().execute('tn1', 'edu1', 'EDUCATOR');
    expect(r.id).toBe('tn1');
  });
});

describe('Liste use-case’leri', () => {
  it('ListEducatorTunnels giriş yoksa → UNAUTHORIZED', async () => {
    await expect(new ListEducatorTunnelsUseCase().execute(null)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
  it('ListEducatorTunnels özet döner', async () => {
    p.tunnel.findMany.mockResolvedValue([{ id: 'a', title: 'A', status: 'DRAFT', priceCents: 0, currency: 'TRY', layerCount: 1, examType: { name: 'YDS' }, topic: { name: 'K' }, educator: { username: 'S' }, _count: { questions: 12 } }]);
    const r = await new ListEducatorTunnelsUseCase().execute('edu1');
    expect(r.items[0]).toMatchObject({ id: 'a', examTypeName: 'YDS', questionCount: 12 });
  });
  it('ListPendingTunnels PENDING_APPROVAL filtreler', async () => {
    p.tunnel.findMany.mockResolvedValue([]);
    await new ListPendingTunnelsUseCase().execute();
    expect(p.tunnel.findMany.mock.calls[0][0].where).toMatchObject({ status: 'PENDING_APPROVAL' });
  });
});

describe('UpdateTunnelUseCase', () => {
  it('bulunamadı → TUNNEL_NOT_FOUND', async () => {
    p.tunnel.findUnique.mockResolvedValue(null);
    await expect(new UpdateTunnelUseCase().execute('tn1', { title: 'X' }, 'edu1')).rejects.toMatchObject({ code: 'TUNNEL_NOT_FOUND' });
  });
  it('başka eğitici → FORBIDDEN', async () => {
    p.tunnel.findUnique.mockResolvedValue({ id: 'tn1', educatorId: 'other', status: 'DRAFT' });
    await expect(new UpdateTunnelUseCase().execute('tn1', { title: 'X' }, 'edu1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('PUBLISHED → TUNNEL_NOT_EDITABLE', async () => {
    p.tunnel.findUnique.mockResolvedValue({ id: 'tn1', educatorId: 'edu1', status: 'PUBLISHED' });
    await expect(new UpdateTunnelUseCase().execute('tn1', { title: 'X' }, 'edu1')).rejects.toMatchObject({ code: 'TUNNEL_NOT_EDITABLE' });
  });
  it('boş başlık → TUNNEL_TITLE_REQUIRED', async () => {
    p.tunnel.findUnique.mockResolvedValue({ id: 'tn1', educatorId: 'edu1', status: 'DRAFT' });
    await expect(new UpdateTunnelUseCase().execute('tn1', { title: '  ' }, 'edu1')).rejects.toMatchObject({ code: 'TUNNEL_TITLE_REQUIRED' });
  });
  it('geçersiz examTypeId → INVALID_EXAMTYPE', async () => {
    p.tunnel.findUnique.mockResolvedValue({ id: 'tn1', educatorId: 'edu1', status: 'DRAFT' });
    await expect(new UpdateTunnelUseCase().execute('tn1', { examTypeId: 'not-uuid' }, 'edu1')).rejects.toMatchObject({ code: 'INVALID_EXAMTYPE' });
  });
  it('başarılı güncelleme (title + description trim)', async () => {
    p.tunnel.findUnique.mockResolvedValue({ id: 'tn1', educatorId: 'edu1', status: 'REJECTED' });
    p.tunnel.update.mockResolvedValue(detail({ title: 'Yeni' }));
    const r = await new UpdateTunnelUseCase().execute('tn1', { title: '  Yeni  ', description: '  ' }, 'edu1');
    const data = p.tunnel.update.mock.calls[0][0].data;
    expect(data.title).toBe('Yeni');
    expect(data.description).toBeNull();
    expect(r.id).toBe('tn1');
  });
  it('fiyat min altı → TUNNEL_PRICE_TOO_LOW', async () => {
    p.tunnel.findUnique.mockResolvedValue({ id: 'tn1', educatorId: 'edu1', status: 'DRAFT' });
    p.adminSettings.findFirst.mockResolvedValue({ minTunnelPriceCents: 5000 });
    await expect(new UpdateTunnelUseCase().execute('tn1', { priceCents: 1000 }, 'edu1')).rejects.toMatchObject({ code: 'TUNNEL_PRICE_TOO_LOW' });
  });
});

describe('ReportTunnelQuestionUseCase', () => {
  it('giriş yoksa → UNAUTHORIZED', async () => {
    await expect(new ReportTunnelQuestionUseCase().execute('tn1', { reason: 'x' }, null)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
  it('boş sebep → REASON_REQUIRED', async () => {
    await expect(new ReportTunnelQuestionUseCase().execute('tn1', { reason: '  ' }, 'c1')).rejects.toMatchObject({ code: 'REASON_REQUIRED' });
  });
  it('satın almamış → TUNNEL_NOT_PURCHASED', async () => {
    p.tunnelPurchase.findUnique.mockResolvedValue(null);
    await expect(new ReportTunnelQuestionUseCase().execute('tn1', { reason: 'hata' }, 'c1')).rejects.toMatchObject({ code: 'TUNNEL_NOT_PURCHASED' });
  });
  it('başarılı bildirim oluşturur', async () => {
    p.tunnelPurchase.findUnique.mockResolvedValue({ id: 'pp', status: 'ACTIVE', tenantId: 't1' });
    p.tunnelQuestionReport.create.mockResolvedValue({ id: 'rep1' });
    const r = await new ReportTunnelQuestionUseCase().execute('tn1', { questionId: 'q1', reason: 'yanlış cevap' }, 'c1');
    expect(r).toEqual({ ok: true, id: 'rep1' });
    expect(p.tunnelQuestionReport.create.mock.calls[0][0].data).toMatchObject({ tenantId: 't1', tunnelId: 'tn1', questionId: 'q1', candidateId: 'c1' });
  });
});
