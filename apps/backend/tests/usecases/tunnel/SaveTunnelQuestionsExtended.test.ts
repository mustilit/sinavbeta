/**
 * SaveTunnelQuestionsUseCase — uncovered branches:
 *   INVALID_LAYER, QUESTION_EMPTY, OPTION_EMPTY, transaction body, moderation setImmediate
 */
jest.mock('../../../src/infrastructure/database/prisma', () => {
  const txMock = {
    tunnelQuestion: { deleteMany: jest.fn(), create: jest.fn() },
    tunnel: { update: jest.fn() },
  };
  return {
    prisma: {
      tunnel: { findUnique: jest.fn() },
      $transaction: jest.fn(async (fn: any) => fn(txMock)),
      __tx: txMock,
    },
  };
});

import { SaveTunnelQuestionsUseCase } from '../../../src/application/use-cases/tunnel/SaveTunnelQuestionsUseCase';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
const tx = p.__tx;

beforeEach(() => jest.clearAllMocks());

const baseTunnel = {
  id: 'tn1',
  educatorId: 'edu1',
  tenantId: 't1',
  status: 'DRAFT',
  optionsPerQuestion: 3,
  layers: [
    { id: 'L1', index: 1 },
    { id: 'L2', index: 2 },
  ],
};

const validOpts = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ content: `opt-${i}`, isCorrect: i === 0 }));

describe('SaveTunnelQuestionsUseCase — extended', () => {
  it('actorId yoksa UNAUTHORIZED', async () => {
    await expect(new SaveTunnelQuestionsUseCase().execute('tn1', [], null)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('tunel yoksa TUNNEL_NOT_FOUND', async () => {
    p.tunnel.findUnique.mockResolvedValue(null);
    await expect(new SaveTunnelQuestionsUseCase().execute('tn-nope', [], 'edu1')).rejects.toMatchObject({ code: 'TUNNEL_NOT_FOUND' });
  });

  it('gecersiz katman indexi → INVALID_LAYER', async () => {
    p.tunnel.findUnique.mockResolvedValue(baseTunnel);
    const layers = [{ index: 99, questions: [{ content: 'q', options: validOpts(3) }] }];
    await expect(new SaveTunnelQuestionsUseCase().execute('tn1', layers, 'edu1')).rejects.toMatchObject({ code: 'INVALID_LAYER' });
  });

  it('soru icerigi bos → QUESTION_EMPTY', async () => {
    p.tunnel.findUnique.mockResolvedValue(baseTunnel);
    const layers = [{ index: 1, questions: [{ content: '  ', mediaUrl: '', options: validOpts(3) }] }];
    await expect(new SaveTunnelQuestionsUseCase().execute('tn1', layers, 'edu1')).rejects.toMatchObject({ code: 'QUESTION_EMPTY' });
  });

  it('soru icerigi bos ama gorsel varsa VALID', async () => {
    p.tunnel.findUnique.mockResolvedValue(baseTunnel);
    const layers = [{ index: 1, questions: [{ content: '', mediaUrl: 'img.png', options: validOpts(3) }] }];
    tx.tunnelQuestion.create.mockResolvedValue({ id: 'q-new' });
    tx.tunnel.update.mockResolvedValue({});
    const r = await new SaveTunnelQuestionsUseCase().execute('tn1', layers, 'edu1');
    expect(r.ok).toBe(true);
  });

  it('secenek icerigi bos → OPTION_EMPTY', async () => {
    p.tunnel.findUnique.mockResolvedValue(baseTunnel);
    const opts = [{ content: '', mediaUrl: '', isCorrect: true }, { content: 'b', isCorrect: false }, { content: 'c', isCorrect: false }];
    const layers = [{ index: 1, questions: [{ content: 'q', options: opts }] }];
    await expect(new SaveTunnelQuestionsUseCase().execute('tn1', layers, 'edu1')).rejects.toMatchObject({ code: 'OPTION_EMPTY' });
  });

  it('secenek icerigi bos ama gorsel varsa VALID', async () => {
    p.tunnel.findUnique.mockResolvedValue(baseTunnel);
    const opts = [
      { content: '', mediaUrl: 'img.png', isCorrect: true },
      { content: 'b', isCorrect: false },
      { content: 'c', isCorrect: false },
    ];
    const layers = [{ index: 1, questions: [{ content: 'q', options: opts }] }];
    tx.tunnelQuestion.create.mockResolvedValue({ id: 'q-new' });
    tx.tunnel.update.mockResolvedValue({});
    const r = await new SaveTunnelQuestionsUseCase().execute('tn1', layers, 'edu1');
    expect(r.ok).toBe(true);
  });

  it('gecerli veri ile transaction basarili calisir ve ok doner', async () => {
    p.tunnel.findUnique.mockResolvedValue(baseTunnel);
    tx.tunnelQuestion.create.mockResolvedValue({ id: 'qx' });
    tx.tunnel.update.mockResolvedValue({});
    const layers = [
      { index: 1, questions: [{ content: 'Soru 1', options: validOpts(3) }] },
      { index: 2, questions: [{ content: 'Soru 2', options: validOpts(3) }, { content: 'Soru 3', options: validOpts(3) }] },
    ];
    const r = await new SaveTunnelQuestionsUseCase().execute('tn1', layers, 'edu1');
    expect(r.ok).toBe(true);
    // deleteMany once cagirilir
    expect(tx.tunnelQuestion.deleteMany).toHaveBeenCalledWith({ where: { tunnelId: 'tn1' } });
    // 3 soru create edilir
    expect(tx.tunnelQuestion.create).toHaveBeenCalledTimes(3);
    expect(tx.tunnel.update).toHaveBeenCalled();
  });

  it('moderation verildiyse setImmediate ile calisir (best-effort)', async () => {
    p.tunnel.findUnique.mockResolvedValue(baseTunnel);
    tx.tunnelQuestion.create.mockResolvedValue({ id: 'qm' });
    tx.tunnel.update.mockResolvedValue({});

    const moderateMock = { execute: jest.fn().mockResolvedValue({ allowed: true }), moderateImage: jest.fn().mockResolvedValue({}) };
    const uc = new SaveTunnelQuestionsUseCase(moderateMock as any);
    const layers = [{ index: 1, questions: [{ content: 'Uygun icerik', mediaUrl: 'img.jpg', options: validOpts(3) }] }];
    await uc.execute('tn1', layers, 'edu1');
    // setImmediate moderasyon bloğunun (async) tamamlanmasına izin ver — gerçek tick.
    await new Promise((r) => setTimeout(r, 20));
    expect(moderateMock.execute).toHaveBeenCalled();
    expect(moderateMock.moderateImage).toHaveBeenCalled();
  });

  it('moderation hatasi loglama ile yutulur (best-effort)', async () => {
    p.tunnel.findUnique.mockResolvedValue(baseTunnel);
    tx.tunnelQuestion.create.mockResolvedValue({ id: 'qm' });
    tx.tunnel.update.mockResolvedValue({});

    const moderateMock = { execute: jest.fn().mockRejectedValue(new Error('AI fail')), moderateImage: jest.fn() };
    const uc = new SaveTunnelQuestionsUseCase(moderateMock as any);
    const layers = [{ index: 1, questions: [{ content: 'Icerik test', options: validOpts(3) }] }];
    // execute başarılı dönmeli (moderasyon best-effort, hatayı yutar, throw etmez)
    const r = await uc.execute('tn1', layers, 'edu1');
    expect(r.ok).toBe(true);
    await new Promise((res) => setTimeout(res, 20));
    expect(moderateMock.execute).toHaveBeenCalled();
  });

  it('bos layers listesi → sadece deleteMany ve update calisir', async () => {
    p.tunnel.findUnique.mockResolvedValue(baseTunnel);
    tx.tunnel.update.mockResolvedValue({});
    const r = await new SaveTunnelQuestionsUseCase().execute('tn1', [], 'edu1');
    expect(r.ok).toBe(true);
    expect(tx.tunnelQuestion.deleteMany).toHaveBeenCalled();
    expect(tx.tunnelQuestion.create).not.toHaveBeenCalled();
  });

  it('REJECTED durumda da duzenleme mumkun', async () => {
    p.tunnel.findUnique.mockResolvedValue({ ...baseTunnel, status: 'REJECTED' });
    tx.tunnelQuestion.create.mockResolvedValue({ id: 'qr' });
    tx.tunnel.update.mockResolvedValue({});
    const layers = [{ index: 1, questions: [{ content: 'Soru', options: validOpts(3) }] }];
    const r = await new SaveTunnelQuestionsUseCase().execute('tn1', layers, 'edu1');
    expect(r.ok).toBe(true);
  });
});
