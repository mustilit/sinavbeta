/**
 * Tünel oyun döngüsü: başlat/sürdür, durum, cevap işleme (adaptif motorla).
 * tunnelPlay yardımcıları (loadPlayData/loadMasks/buildAttemptState) mock'lanır;
 * motor (engine) gerçek çalışır.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    tunnelPurchase: { findUnique: jest.fn() },
    tunnelAttempt: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    tunnelQuestionProgress: { upsert: jest.fn() },
  },
}));
jest.mock('../../../src/application/use-cases/tunnel/tunnelPlay', () => ({
  loadPlayData: jest.fn(),
  loadMasks: jest.fn(),
  buildAttemptState: jest.fn((a: any) => ({ id: a.id, status: a.status })),
}));

import { StartTunnelAttemptUseCase, GetTunnelAttemptStateUseCase } from '../../../src/application/use-cases/tunnel/StartTunnelAttemptUseCase';
import { SubmitTunnelAnswerUseCase } from '../../../src/application/use-cases/tunnel/SubmitTunnelAnswerUseCase';
import { prisma } from '../../../src/infrastructure/database/prisma';
import { loadPlayData, loadMasks } from '../../../src/application/use-cases/tunnel/tunnelPlay';

const p = prisma as any;
const playMock = loadPlayData as jest.Mock;
const masksMock = loadMasks as jest.Mock;
beforeEach(() => jest.clearAllMocks());

const eq = (id: string, layerIndex = 1, correct = `${id}_c`) => ({
  id, layerIndex, optionIds: [correct, `${id}_d1`, `${id}_d2`], correctOptionId: correct,
});

describe('StartTunnelAttemptUseCase', () => {
  it('giriş yoksa → UNAUTHORIZED', async () => {
    await expect(new StartTunnelAttemptUseCase().execute('tn1', null)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('satın alınmamış → TUNNEL_NOT_PURCHASED', async () => {
    p.tunnelPurchase.findUnique.mockResolvedValue({ status: 'REFUNDED' });
    await expect(new StartTunnelAttemptUseCase().execute('tn1', 'c1')).rejects.toMatchObject({ code: 'TUNNEL_NOT_PURCHASED' });
  });

  it('attempt yoksa oluşturur + ilk soruyu seçer', async () => {
    p.tunnelPurchase.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    p.user.findUnique.mockResolvedValue({ tenantId: 't1' });
    p.tunnelAttempt.findUnique.mockResolvedValue(null);
    p.tunnelAttempt.create.mockResolvedValue({ id: 'at1', status: 'IN_PROGRESS', currentQuestionId: null, baseLayer: 1, upperOpen: false });
    p.tunnelAttempt.update.mockImplementation(({ data }: any) => ({ id: 'at1', status: 'IN_PROGRESS', ...data }));
    playMock.mockResolvedValue({ questions: [eq('q1')], qmeta: new Map([['q1', { options: [] }]]), tunnel: { advanceStreak: 3, layerCount: 1 } });
    masksMock.mockResolvedValue(new Map());

    const r = await new StartTunnelAttemptUseCase().execute('tn1', 'c1');
    expect(p.tunnelAttempt.create).toHaveBeenCalledTimes(1);
    expect(p.tunnelAttempt.update).toHaveBeenCalled(); // ilk soru persist
    expect(r).toMatchObject({ id: 'at1' });
  });

  it('mevcut geçerli soru varsa yeniden seçmez', async () => {
    p.tunnelPurchase.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    p.user.findUnique.mockResolvedValue({ tenantId: 't1' });
    p.tunnelAttempt.findUnique.mockResolvedValue({ id: 'at1', status: 'IN_PROGRESS', currentQuestionId: 'q1', baseLayer: 1, upperOpen: false });
    playMock.mockResolvedValue({ questions: [eq('q1')], qmeta: new Map([['q1', { options: [] }]]), tunnel: { advanceStreak: 3, layerCount: 1 } });
    masksMock.mockResolvedValue(new Map());

    await new StartTunnelAttemptUseCase().execute('tn1', 'c1');
    expect(p.tunnelAttempt.create).not.toHaveBeenCalled();
    expect(p.tunnelAttempt.update).not.toHaveBeenCalled();
  });
});

describe('GetTunnelAttemptStateUseCase', () => {
  it('attempt yoksa → ATTEMPT_NOT_FOUND', async () => {
    p.tunnelPurchase.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    p.tunnelAttempt.findUnique.mockResolvedValue(null);
    await expect(new GetTunnelAttemptStateUseCase().execute('tn1', 'c1')).rejects.toMatchObject({ code: 'ATTEMPT_NOT_FOUND' });
  });
});

describe('SubmitTunnelAnswerUseCase', () => {
  const playOneLayer = (questions: any[]) => ({
    questions,
    qmeta: new Map(questions.map((q) => [q.id, { options: q.optionIds.map((id: string) => ({ id })) }])),
    tunnel: { advanceStreak: 3, layerCount: 1 },
  });

  it('giriş yoksa → UNAUTHORIZED', async () => {
    await expect(new SubmitTunnelAnswerUseCase().execute('tn1', 'o', null)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('attempt yoksa → ATTEMPT_NOT_FOUND', async () => {
    p.tunnelAttempt.findUnique.mockResolvedValue(null);
    await expect(new SubmitTunnelAnswerUseCase().execute('tn1', 'o', 'c1')).rejects.toMatchObject({ code: 'ATTEMPT_NOT_FOUND' });
  });

  it('tamamlanmış attempt → ATTEMPT_DONE', async () => {
    p.tunnelAttempt.findUnique.mockResolvedValue({ id: 'at1', status: 'COMPLETED' });
    await expect(new SubmitTunnelAnswerUseCase().execute('tn1', 'o', 'c1')).rejects.toMatchObject({ code: 'ATTEMPT_DONE' });
  });

  it('aktif soru yoksa → NO_CURRENT_QUESTION', async () => {
    p.tunnelAttempt.findUnique.mockResolvedValue({ id: 'at1', status: 'IN_PROGRESS', currentQuestionId: null, currentCorrectPosition: null });
    await expect(new SubmitTunnelAnswerUseCase().execute('tn1', 'o', 'c1')).rejects.toMatchObject({ code: 'NO_CURRENT_QUESTION' });
  });

  it('geçersiz seçenek → INVALID_OPTION', async () => {
    p.tunnelAttempt.findUnique.mockResolvedValue({ id: 'at1', status: 'IN_PROGRESS', currentQuestionId: 'q1', currentCorrectPosition: 1, baseLayer: 1, upperOpen: false, streakCount: 0 });
    playMock.mockResolvedValue(playOneLayer([eq('q1')]));
    masksMock.mockResolvedValue(new Map());
    await expect(new SubmitTunnelAnswerUseCase().execute('tn1', 'YOK', 'c1')).rejects.toMatchObject({ code: 'INVALID_OPTION' });
  });

  it('doğru cevap (katman bitmedi) → correct true, completed false, sıradaki soru', async () => {
    p.tunnelAttempt.findUnique.mockResolvedValue({ id: 'at1', status: 'IN_PROGRESS', currentQuestionId: 'q1', currentCorrectPosition: 1, baseLayer: 1, upperOpen: false, streakCount: 0 });
    playMock.mockResolvedValue(playOneLayer([eq('q1'), eq('q2')])); // 2 soru → katman bitmez
    masksMock.mockResolvedValue(new Map());
    p.tunnelQuestionProgress.upsert.mockResolvedValue({});
    p.tunnelAttempt.update.mockImplementation(({ data }: any) => ({ id: 'at1', status: data.status ?? 'IN_PROGRESS', ...data }));

    const r = await new SubmitTunnelAnswerUseCase().execute('tn1', 'q1_c', 'c1');
    expect(r.correct).toBe(true);
    expect(r.completed).toBe(false);
    expect(r.correctOptionId).toBe('q1_c');
    expect(p.tunnelQuestionProgress.upsert).toHaveBeenCalled();
  });

  it('son soru ustalaşınca tünel tamamlanır', async () => {
    // q1 zaten 2 pozisyon doğru (0b011); 3. doğru → ustalık → tek katman biter
    p.tunnelAttempt.findUnique.mockResolvedValue({ id: 'at1', status: 'IN_PROGRESS', currentQuestionId: 'q1', currentCorrectPosition: 3, baseLayer: 1, upperOpen: false, streakCount: 2 });
    playMock.mockResolvedValue(playOneLayer([eq('q1')]));
    masksMock.mockResolvedValue(new Map([['q1', 0b011]]));
    p.tunnelQuestionProgress.upsert.mockResolvedValue({});
    p.tunnelAttempt.update.mockImplementation(({ data }: any) => ({ id: 'at1', status: data.status ?? 'IN_PROGRESS', ...data }));

    const r = await new SubmitTunnelAnswerUseCase().execute('tn1', 'q1_c', 'c1');
    expect(r.correct).toBe(true);
    expect(r.masteredQuestion).toBe(true);
    expect(r.completed).toBe(true);
    const upd = p.tunnelAttempt.update.mock.calls[0][0].data;
    expect(upd.status).toBe('COMPLETED');
  });

  it('yanlış cevap → correct false (doğru şık öğrenme için döner)', async () => {
    p.tunnelAttempt.findUnique.mockResolvedValue({ id: 'at1', status: 'IN_PROGRESS', currentQuestionId: 'q1', currentCorrectPosition: 1, baseLayer: 1, upperOpen: false, streakCount: 0 });
    playMock.mockResolvedValue(playOneLayer([eq('q1'), eq('q2')]));
    masksMock.mockResolvedValue(new Map());
    p.tunnelQuestionProgress.upsert.mockResolvedValue({});
    p.tunnelAttempt.update.mockImplementation(({ data }: any) => ({ id: 'at1', status: 'IN_PROGRESS', ...data }));

    const r = await new SubmitTunnelAnswerUseCase().execute('tn1', 'q1_d1', 'c1');
    expect(r.correct).toBe(false);
    expect(r.correctOptionId).toBe('q1_c');
  });
});
