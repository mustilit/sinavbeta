/**
 * Tünel use-case testleri (Faz 1): Create snapshot+katman, Save yapısal doğrulama,
 * Submit min/max kapısı, Approve/Reject durum geçişleri + sahiplik.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    examType: { findUnique: jest.fn() },
    gradeLevel: { findUnique: jest.fn(async () => ({ id: 'genel-id' })) },
    topic: { findUnique: jest.fn() },
    adminSettings: { findFirst: jest.fn() },
    tunnel: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    tunnelQuestion: { deleteMany: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(async (fn: any) => fn({ tunnelQuestion: { deleteMany: jest.fn(), create: jest.fn() }, tunnel: { update: jest.fn() } })),
  },
}));

import { CreateTunnelUseCase } from '../../../src/application/use-cases/tunnel/CreateTunnelUseCase';
import { SaveTunnelQuestionsUseCase } from '../../../src/application/use-cases/tunnel/SaveTunnelQuestionsUseCase';
import { SubmitTunnelForApprovalUseCase } from '../../../src/application/use-cases/tunnel/SubmitTunnelForApprovalUseCase';
import { ApproveTunnelUseCase, RejectTunnelUseCase } from '../../../src/application/use-cases/tunnel/ReviewTunnelUseCase';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
const UUID = '550e8400-e29b-41d4-a716-446655440000';
const UUID2 = '660e8400-e29b-41d4-a716-446655440000';

beforeEach(() => jest.clearAllMocks());

describe('CreateTunnelUseCase', () => {
  it('admin ayarından snapshot + N katman ile oluşturur', async () => {
    p.user.findUnique.mockResolvedValue({ id: 'edu1', tenantId: 't1' });
    p.examType.findUnique.mockResolvedValue({ id: UUID });
    p.topic.findUnique.mockResolvedValue({ id: UUID2 });
    p.adminSettings.findFirst.mockResolvedValue({ maxLayersPerTunnel: 5, tunnelOptionsPerQuestion: 8, tunnelAdvanceStreak: 9 });
    p.tunnel.create.mockImplementation(({ data }: any) => ({ id: 'tn1', ...data }));

    await new CreateTunnelUseCase().execute({ title: 'T', examTypeId: UUID, topicId: UUID2 }, 'edu1');

    const arg = p.tunnel.create.mock.calls[0][0];
    expect(arg.data.layerCount).toBe(5);
    expect(arg.data.optionsPerQuestion).toBe(8);
    expect(arg.data.advanceStreak).toBe(9);
    expect(arg.data.status).toBe('DRAFT');
    expect(arg.data.layers.create).toHaveLength(5);
    expect(arg.data.layers.create[0]).toEqual({ index: 1 });
  });

  it('başlık boşsa hata', async () => {
    await expect(new CreateTunnelUseCase().execute({ title: '  ', examTypeId: UUID, topicId: UUID2 }, 'edu1'))
      .rejects.toMatchObject({ code: 'TUNNEL_TITLE_REQUIRED' });
  });
});

describe('SaveTunnelQuestionsUseCase', () => {
  const base = { id: 'tn1', educatorId: 'edu1', status: 'DRAFT', optionsPerQuestion: 10, layers: [{ id: 'L1', index: 1 }] };

  it('başka eğitici → FORBIDDEN', async () => {
    p.tunnel.findUnique.mockResolvedValue({ ...base, educatorId: 'other' });
    await expect(new SaveTunnelQuestionsUseCase().execute('tn1', [], 'edu1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('yayınlanmış tünel → düzenlenemez', async () => {
    p.tunnel.findUnique.mockResolvedValue({ ...base, status: 'PUBLISHED' });
    await expect(new SaveTunnelQuestionsUseCase().execute('tn1', [], 'edu1')).rejects.toMatchObject({ code: 'TUNNEL_NOT_EDITABLE' });
  });

  it('seçenek sayısı yanlış → OPTION_COUNT', async () => {
    p.tunnel.findUnique.mockResolvedValue(base);
    const layers = [{ index: 1, questions: [{ content: 'q', options: [{ content: 'a', isCorrect: true }] }] }];
    await expect(new SaveTunnelQuestionsUseCase().execute('tn1', layers, 'edu1')).rejects.toMatchObject({ code: 'OPTION_COUNT' });
  });

  it('doğru şık yoksa → ONE_CORRECT', async () => {
    p.tunnel.findUnique.mockResolvedValue(base);
    const opts = Array.from({ length: 10 }, (_, i) => ({ content: 'o' + i, isCorrect: false }));
    const layers = [{ index: 1, questions: [{ content: 'q', options: opts }] }];
    await expect(new SaveTunnelQuestionsUseCase().execute('tn1', layers, 'edu1')).rejects.toMatchObject({ code: 'ONE_CORRECT' });
  });
});

describe('SubmitTunnelForApprovalUseCase', () => {
  it('katman yetersiz soru → LAYER_TOO_FEW', async () => {
    p.tunnel.findUnique.mockResolvedValue({ id: 'tn1', educatorId: 'edu1', status: 'DRAFT', layers: [{ index: 1, _count: { questions: 3 } }] });
    p.adminSettings.findFirst.mockResolvedValue({ minQuestionsPerLayer: 10, maxQuestionsPerLayer: 50 });
    await expect(new SubmitTunnelForApprovalUseCase().execute('tn1', 'edu1')).rejects.toMatchObject({ code: 'LAYER_TOO_FEW' });
  });

  it('tüm katmanlar yeterli → PENDING_APPROVAL', async () => {
    p.tunnel.findUnique.mockResolvedValue({ id: 'tn1', educatorId: 'edu1', status: 'DRAFT', layers: [{ index: 1, _count: { questions: 12 } }] });
    p.adminSettings.findFirst.mockResolvedValue({ minQuestionsPerLayer: 10, maxQuestionsPerLayer: 50 });
    p.tunnel.update.mockImplementation(({ data }: any) => ({ id: 'tn1', ...data }));
    const r = await new SubmitTunnelForApprovalUseCase().execute('tn1', 'edu1');
    expect(r.status).toBe('PENDING_APPROVAL');
  });
});

describe('Approve/Reject', () => {
  it('approve: PENDING → PUBLISHED', async () => {
    p.tunnel.findUnique.mockResolvedValue({ id: 'tn1', status: 'PENDING_APPROVAL' });
    p.tunnel.update.mockImplementation(({ data }: any) => ({ id: 'tn1', ...data }));
    const r = await new ApproveTunnelUseCase().execute('tn1', 'admin1');
    expect(r.status).toBe('PUBLISHED');
    expect(p.tunnel.update.mock.calls[0][0].data.publishedAt).toBeInstanceOf(Date);
  });

  it('approve: PENDING değilse → hata', async () => {
    p.tunnel.findUnique.mockResolvedValue({ id: 'tn1', status: 'DRAFT' });
    await expect(new ApproveTunnelUseCase().execute('tn1', 'admin1')).rejects.toMatchObject({ code: 'TUNNEL_NOT_PENDING' });
  });

  it('reject: sebep zorunlu', async () => {
    await expect(new RejectTunnelUseCase().execute('tn1', '  ', 'admin1')).rejects.toMatchObject({ code: 'REASON_REQUIRED' });
  });

  it('reject: PENDING → REJECTED (+ not)', async () => {
    p.tunnel.findUnique.mockResolvedValue({ id: 'tn1', status: 'PENDING_APPROVAL' });
    p.tunnel.update.mockImplementation(({ data }: any) => ({ id: 'tn1', ...data }));
    const r = await new RejectTunnelUseCase().execute('tn1', 'eksik içerik', 'admin1');
    expect(r.status).toBe('REJECTED');
    expect(r.reviewNote).toBe('eksik içerik');
  });
});
