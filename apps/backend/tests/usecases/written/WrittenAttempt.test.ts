/**
 * WrittenAttempt use-case testleri — StartWrittenAttempt, SubmitWrittenAnswer,
 * GetWrittenAttemptState, SubmitWrittenAttempt dallanma regresyonlari.
 *
 * Regression context:
 *  - SubmitWrittenAnswer: drawingUrl + textAnswer birlikte/ayri/bos senaryolari.
 *  - StartWrittenAttempt: 3 dal — resume IN_PROGRESS, dondur SUBMITTED/TIMEOUT, yeni olustur.
 *  - GetWrittenAttemptState: drawingUrl round-trip, cozum gizleme IN_PROGRESS vs SUBMITTED.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    writtenTest: { findUnique: jest.fn() },
    writtenPurchase: { findUnique: jest.fn() },
    writtenQuestion: { findMany: jest.fn() },
    writtenAttempt: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    writtenAnswer: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

import {
  StartWrittenAttemptUseCase,
  SubmitWrittenAnswerUseCase,
  GetWrittenAttemptStateUseCase,
  SubmitWrittenAttemptUseCase,
} from '../../../src/application/use-cases/written/WrittenAttemptUseCases';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
beforeEach(() => jest.clearAllMocks());

/* ---------- helpers ---------- */
const testRow = (over: any = {}) => ({
  id: 'wt1',
  packageId: 'pkg1',
  title: 'Deneme',
  isTimed: false,
  duration: null,
  hasSolutions: true,
  tenantId: 't1',
  deletedAt: null,
  ...over,
});

const purchaseRow = (over: any = {}) => ({
  id: 'wp1',
  status: 'ACTIVE',
  testsSnapshot: [
    {
      testId: 'wt1',
      questions: [
        { id: 'q1', content: 'Soru1', mediaUrl: null, order: 0, solutionText: 'Cozum1', solutionMediaUrl: null },
        { id: 'q2', content: 'Soru2', mediaUrl: null, order: 1, solutionText: 'Cozum2', solutionMediaUrl: '/sol2.png' },
      ],
    },
  ],
  ...over,
});

const attemptRow = (over: any = {}) => ({
  id: 'att1',
  testId: 'wt1',
  candidateId: 'u1',
  attemptNumber: 1,
  status: 'IN_PROGRESS',
  startedAt: new Date('2026-06-01T10:00:00Z'),
  submittedAt: null,
  questionsSnapshot: purchaseRow().testsSnapshot[0].questions,
  tenantId: 't1',
  ...over,
});

function setupPurchased() {
  p.writtenTest.findUnique.mockResolvedValue(testRow());
  p.writtenPurchase.findUnique.mockResolvedValue(purchaseRow());
}

/* ============================== StartWrittenAttemptUseCase ============================== */
describe('StartWrittenAttemptUseCase', () => {
  const uc = new StartWrittenAttemptUseCase();

  it('giris yoksa 401 UNAUTHORIZED', async () => {
    await expect(uc.execute('wt1')).rejects.toMatchObject({ code: 'UNAUTHORIZED', status: 401 });
    await expect(uc.execute('wt1', null)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('satin alma yoksa NOT_PURCHASED', async () => {
    p.writtenTest.findUnique.mockResolvedValue(testRow());
    p.writtenPurchase.findUnique.mockResolvedValue(null);
    await expect(uc.execute('wt1', 'u1')).rejects.toMatchObject({ code: 'NOT_PURCHASED' });
  });

  it('satin alma REFUNDED ise NOT_PURCHASED', async () => {
    p.writtenTest.findUnique.mockResolvedValue(testRow());
    p.writtenPurchase.findUnique.mockResolvedValue(purchaseRow({ status: 'REFUNDED' }));
    await expect(uc.execute('wt1', 'u1')).rejects.toMatchObject({ code: 'NOT_PURCHASED' });
  });

  // --- Dal 1: aktif IN_PROGRESS deneme varsa resume ---
  it('aktif IN_PROGRESS deneme varsa resume eder, create cagirilmaz', async () => {
    setupPurchased();
    p.writtenAttempt.findFirst.mockResolvedValueOnce({ id: 'att-active', status: 'IN_PROGRESS' });
    const out = await uc.execute('wt1', 'u1');
    expect(out).toEqual({ attemptId: 'att-active', resumed: true });
    expect(p.writtenAttempt.create).not.toHaveBeenCalled();
  });

  it('aktif PAUSED deneme varsa resume eder', async () => {
    setupPurchased();
    p.writtenAttempt.findFirst.mockResolvedValueOnce({ id: 'att-paused', status: 'PAUSED' });
    const out = await uc.execute('wt1', 'u1');
    expect(out).toEqual({ attemptId: 'att-paused', resumed: true });
    expect(p.writtenAttempt.create).not.toHaveBeenCalled();
  });

  // --- Dal 2: son deneme SUBMITTED/TIMEOUT ise yeni deneme ACMA, mevcut dondur ---
  it('son deneme SUBMITTED ise yeni olusturmaz, review:true dondurur', async () => {
    setupPurchased();
    p.writtenAttempt.findFirst
      .mockResolvedValueOnce(null) // aktif IN_PROGRESS/PAUSED yok
      .mockResolvedValueOnce({ id: 'att-done', attemptNumber: 1, status: 'SUBMITTED' }); // son deneme
    const out = await uc.execute('wt1', 'u1');
    expect(out).toEqual({ attemptId: 'att-done', resumed: true, review: true });
    expect(p.writtenAttempt.create).not.toHaveBeenCalled();
  });

  it('son deneme TIMEOUT ise yeni olusturmaz, review:true dondurur', async () => {
    setupPurchased();
    p.writtenAttempt.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'att-timeout', attemptNumber: 2, status: 'TIMEOUT' });
    const out = await uc.execute('wt1', 'u1');
    expect(out).toEqual({ attemptId: 'att-timeout', resumed: true, review: true });
    expect(p.writtenAttempt.create).not.toHaveBeenCalled();
  });

  // --- Dal 3: hic deneme yoksa yeni olustur ---
  it('hic deneme yoksa yeni IN_PROGRESS deneme olusturur', async () => {
    setupPurchased();
    p.writtenAttempt.findFirst
      .mockResolvedValueOnce(null) // aktif yok
      .mockResolvedValueOnce(null); // hic deneme yok
    p.writtenAttempt.create.mockResolvedValue({ id: 'att-new' });
    const out = await uc.execute('wt1', 'u1');
    expect(out).toEqual({ attemptId: 'att-new', resumed: false });
    const createArg = p.writtenAttempt.create.mock.calls[0][0];
    expect(createArg.data.status).toBe('IN_PROGRESS');
    expect(createArg.data.attemptNumber).toBe(1);
    expect(createArg.data.candidateId).toBe('u1');
  });

  it('test silinmisse WRITTEN_TEST_NOT_FOUND', async () => {
    p.writtenTest.findUnique.mockResolvedValue(testRow({ deletedAt: new Date() }));
    await expect(uc.execute('wt1', 'u1')).rejects.toMatchObject({ code: 'WRITTEN_TEST_NOT_FOUND' });
  });

  it('test yoksa WRITTEN_TEST_NOT_FOUND', async () => {
    p.writtenTest.findUnique.mockResolvedValue(null);
    await expect(uc.execute('wt1', 'u1')).rejects.toMatchObject({ code: 'WRITTEN_TEST_NOT_FOUND' });
  });
});

/* ============================== SubmitWrittenAnswerUseCase ============================== */
describe('SubmitWrittenAnswerUseCase', () => {
  const uc = new SubmitWrittenAnswerUseCase();

  it('giris yoksa 401', async () => {
    await expect(uc.execute('a1', 'q1', { textAnswer: 'x' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('baskasinin denemesi ise NOT_ATTEMPT_OWNER', async () => {
    p.writtenAttempt.findUnique.mockResolvedValue(attemptRow({ candidateId: 'other' }));
    await expect(uc.execute('att1', 'q1', { textAnswer: 'x' }, 'u1')).rejects.toMatchObject({ code: 'NOT_ATTEMPT_OWNER' });
  });

  it('deneme IN_PROGRESS degilse ATTEMPT_NOT_IN_PROGRESS', async () => {
    p.writtenAttempt.findUnique.mockResolvedValue(attemptRow({ status: 'SUBMITTED' }));
    await expect(uc.execute('att1', 'q1', { textAnswer: 'x' }, 'u1')).rejects.toMatchObject({ code: 'ATTEMPT_NOT_IN_PROGRESS' });
  });

  // --- drawing-only (metin bos) kaydedilir ---
  it('sadece drawingUrl (metin bos) -> upsert yapilir, silinmez', async () => {
    p.writtenAttempt.findUnique.mockResolvedValue(attemptRow());
    await uc.execute('att1', 'q1', { textAnswer: '', drawingUrl: '/uploads/d.png' }, 'u1');
    expect(p.writtenAnswer.deleteMany).not.toHaveBeenCalled();
    expect(p.writtenAnswer.upsert).toHaveBeenCalledTimes(1);
    const arg = p.writtenAnswer.upsert.mock.calls[0][0];
    expect(arg.create.drawingUrl).toBe('/uploads/d.png');
    expect(arg.create.textAnswer).toBeNull();
    expect(arg.update.drawingUrl).toBe('/uploads/d.png');
  });

  it('sadece drawingUrl (textAnswer undefined) -> upsert yapilir', async () => {
    p.writtenAttempt.findUnique.mockResolvedValue(attemptRow());
    await uc.execute('att1', 'q1', { drawingUrl: '/uploads/d2.png' }, 'u1');
    expect(p.writtenAnswer.deleteMany).not.toHaveBeenCalled();
    expect(p.writtenAnswer.upsert).toHaveBeenCalledTimes(1);
    const arg = p.writtenAnswer.upsert.mock.calls[0][0];
    expect(arg.create.drawingUrl).toBe('/uploads/d2.png');
  });

  // --- text-only kaydedilir ---
  it('sadece text (drawingUrl yok) -> upsert yapilir, drawingUrl null', async () => {
    p.writtenAttempt.findUnique.mockResolvedValue(attemptRow());
    await uc.execute('att1', 'q1', { textAnswer: 'Cevabim' }, 'u1');
    expect(p.writtenAnswer.deleteMany).not.toHaveBeenCalled();
    expect(p.writtenAnswer.upsert).toHaveBeenCalledTimes(1);
    const arg = p.writtenAnswer.upsert.mock.calls[0][0];
    expect(arg.create.textAnswer).toBe('Cevabim');
    expect(arg.create.drawingUrl).toBeNull();
  });

  // --- hem text hem drawing ---
  it('text ve drawingUrl birlikte -> upsert, ikisi de kaydedilir', async () => {
    p.writtenAttempt.findUnique.mockResolvedValue(attemptRow());
    await uc.execute('att1', 'q1', { textAnswer: 'Cevap', drawingUrl: '/uploads/combined.png' }, 'u1');
    expect(p.writtenAnswer.upsert).toHaveBeenCalledTimes(1);
    const arg = p.writtenAnswer.upsert.mock.calls[0][0];
    expect(arg.create.textAnswer).toBe('Cevap');
    expect(arg.create.drawingUrl).toBe('/uploads/combined.png');
  });

  // --- ikisi de bos -> sil ---
  it('text ve drawingUrl ikisi de bos string -> deleteMany (cleared)', async () => {
    p.writtenAttempt.findUnique.mockResolvedValue(attemptRow());
    const out = await uc.execute('att1', 'q1', { textAnswer: '  ', drawingUrl: '' }, 'u1');
    expect(out).toMatchObject({ cleared: true });
    expect(p.writtenAnswer.deleteMany).toHaveBeenCalledWith({ where: { attemptId: 'att1', questionId: 'q1' } });
    expect(p.writtenAnswer.upsert).not.toHaveBeenCalled();
  });

  it('text ve drawingUrl ikisi de null/undefined -> deleteMany (cleared)', async () => {
    p.writtenAttempt.findUnique.mockResolvedValue(attemptRow());
    const out = await uc.execute('att1', 'q1', { textAnswer: null, drawingUrl: null }, 'u1');
    expect(out).toMatchObject({ cleared: true });
    expect(p.writtenAnswer.deleteMany).toHaveBeenCalled();
  });

  // --- drawingUrl null, text dolu -> text kaydedilir ---
  it('drawingUrl null, text dolu -> upsert, text korunur', async () => {
    p.writtenAttempt.findUnique.mockResolvedValue(attemptRow());
    await uc.execute('att1', 'q1', { textAnswer: 'Sadece metin', drawingUrl: null }, 'u1');
    expect(p.writtenAnswer.upsert).toHaveBeenCalledTimes(1);
    const arg = p.writtenAnswer.upsert.mock.calls[0][0];
    expect(arg.create.textAnswer).toBe('Sadece metin');
    expect(arg.create.drawingUrl).toBeNull();
  });

  // --- whitespace trim ---
  it('metin whitespace-only, drawingUrl whitespace -> cleared', async () => {
    p.writtenAttempt.findUnique.mockResolvedValue(attemptRow());
    const out = await uc.execute('att1', 'q1', { textAnswer: '  \n\t ', drawingUrl: '   ' }, 'u1');
    expect(out).toMatchObject({ cleared: true });
    expect(p.writtenAnswer.deleteMany).toHaveBeenCalled();
  });
});

/* ============================== GetWrittenAttemptStateUseCase ============================== */
describe('GetWrittenAttemptStateUseCase', () => {
  const uc = new GetWrittenAttemptStateUseCase();
  const snap = [
    { id: 'q1', content: 'Soru1', mediaUrl: null, order: 0, solutionText: 'Cozum1', solutionMediaUrl: null },
    { id: 'q2', content: 'Soru2', mediaUrl: '/img2.png', order: 1, solutionText: 'Cozum2', solutionMediaUrl: '/sol2.png' },
  ];

  it('giris yoksa 401', async () => {
    await expect(uc.execute('att1')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('baskasinin denemesi ise NOT_ATTEMPT_OWNER', async () => {
    p.writtenAttempt.findUnique.mockResolvedValue(attemptRow({ candidateId: 'other' }));
    await expect(uc.execute('att1', 'u1')).rejects.toMatchObject({ code: 'NOT_ATTEMPT_OWNER' });
  });

  it('IN_PROGRESS durumda cozum gizli, drawingUrl round-trip', async () => {
    p.writtenAttempt.findUnique.mockResolvedValue(attemptRow({ questionsSnapshot: snap }));
    p.writtenTest.findUnique.mockResolvedValue(testRow());
    p.writtenAnswer.findMany.mockResolvedValue([
      { questionId: 'q1', textAnswer: 'metin', drawingUrl: '/uploads/draw1.png' },
      { questionId: 'q2', textAnswer: null, drawingUrl: null },
    ]);
    const out: any = await uc.execute('att1', 'u1');

    // Cozum gizli
    expect(out.questions[0]).not.toHaveProperty('solutionText');
    expect(out.questions[0]).not.toHaveProperty('solutionMediaUrl');
    expect(out.questions[1]).not.toHaveProperty('solutionText');

    // drawingUrl round-trip
    expect(out.questions[0].drawingUrl).toBe('/uploads/draw1.png');
    expect(out.questions[0].textAnswer).toBe('metin');
    expect(out.questions[0].answered).toBe(true);

    // q2: her ikisi de null -> answered = false
    expect(out.questions[1].drawingUrl).toBeNull();
    expect(out.questions[1].textAnswer).toBeNull();
    expect(out.questions[1].answered).toBe(false);

    // score alani YOK
    expect(out.attempt).not.toHaveProperty('score');
  });

  it('SUBMITTED durumda cozum gorulur, drawingUrl korunur', async () => {
    p.writtenAttempt.findUnique.mockResolvedValue(
      attemptRow({ status: 'SUBMITTED', submittedAt: new Date(), questionsSnapshot: snap }),
    );
    p.writtenTest.findUnique.mockResolvedValue(testRow());
    p.writtenAnswer.findMany.mockResolvedValue([
      { questionId: 'q1', textAnswer: 'cevabim', drawingUrl: '/uploads/draw-final.png' },
    ]);
    const out: any = await uc.execute('att1', 'u1');

    expect(out.questions[0].solutionText).toBe('Cozum1');
    expect(out.questions[0].solutionMediaUrl).toBeNull();
    expect(out.questions[0].drawingUrl).toBe('/uploads/draw-final.png');
    expect(out.questions[0].textAnswer).toBe('cevabim');
    expect(out.questions[0].answered).toBe(true);

    expect(out.questions[1].solutionText).toBe('Cozum2');
    expect(out.questions[1].solutionMediaUrl).toBe('/sol2.png');
    expect(out.questions[1].answered).toBe(false);
  });

  it('TIMEOUT durumda cozum gorulur', async () => {
    p.writtenAttempt.findUnique.mockResolvedValue(
      attemptRow({ status: 'TIMEOUT', submittedAt: new Date(), questionsSnapshot: snap }),
    );
    p.writtenTest.findUnique.mockResolvedValue(testRow());
    p.writtenAnswer.findMany.mockResolvedValue([]);
    const out: any = await uc.execute('att1', 'u1');
    expect(out.questions[0].solutionText).toBe('Cozum1');
    expect(out.questions[1].solutionText).toBe('Cozum2');
  });

  it('drawingUrl only answer -> answered = true', async () => {
    p.writtenAttempt.findUnique.mockResolvedValue(attemptRow({ questionsSnapshot: snap }));
    p.writtenTest.findUnique.mockResolvedValue(testRow());
    p.writtenAnswer.findMany.mockResolvedValue([
      { questionId: 'q1', textAnswer: null, drawingUrl: '/uploads/only-draw.png' },
    ]);
    const out: any = await uc.execute('att1', 'u1');
    expect(out.questions[0].answered).toBe(true);
    expect(out.questions[0].drawingUrl).toBe('/uploads/only-draw.png');
    expect(out.questions[0].textAnswer).toBeNull();
  });

  it('summary dogru sayilar dondurur', async () => {
    p.writtenAttempt.findUnique.mockResolvedValue(attemptRow({ questionsSnapshot: snap }));
    p.writtenTest.findUnique.mockResolvedValue(testRow());
    p.writtenAnswer.findMany.mockResolvedValue([
      { questionId: 'q1', textAnswer: 'var', drawingUrl: null },
    ]);
    const out: any = await uc.execute('att1', 'u1');
    expect(out.summary.total).toBe(2);
    expect(out.summary.answeredCount).toBe(1);
    expect(out.summary.blankCount).toBe(1);
  });
});

/* ============================== SubmitWrittenAttemptUseCase ============================== */
describe('SubmitWrittenAttemptUseCase', () => {
  const uc = new SubmitWrittenAttemptUseCase();

  it('giris yoksa 401', async () => {
    await expect(uc.execute('att1')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('baskasinin denemesi ise NOT_ATTEMPT_OWNER', async () => {
    p.writtenAttempt.findUnique.mockResolvedValue(attemptRow({ candidateId: 'other' }));
    await expect(uc.execute('att1', 'u1')).rejects.toMatchObject({ code: 'NOT_ATTEMPT_OWNER' });
  });

  it('zaten SUBMITTED ise alreadySubmitted:true doner, update cagirilmaz', async () => {
    p.writtenAttempt.findUnique.mockResolvedValue(attemptRow({ status: 'SUBMITTED' }));
    const out = await uc.execute('att1', 'u1');
    expect(out).toMatchObject({ ok: true, alreadySubmitted: true });
    expect(p.writtenAttempt.update).not.toHaveBeenCalled();
  });

  it('zaten TIMEOUT ise alreadySubmitted:true doner', async () => {
    p.writtenAttempt.findUnique.mockResolvedValue(attemptRow({ status: 'TIMEOUT' }));
    const out = await uc.execute('att1', 'u1');
    expect(out).toMatchObject({ ok: true, alreadySubmitted: true });
  });

  it('IN_PROGRESS ise SUBMITTED yapar, data\'da score YOK', async () => {
    p.writtenAttempt.findUnique.mockResolvedValue(attemptRow());
    p.writtenTest.findUnique.mockResolvedValue(testRow());
    p.writtenAttempt.update.mockResolvedValue({});
    const out = await uc.execute('att1', 'u1');
    expect(out).toMatchObject({ ok: true });
    const updateArg = p.writtenAttempt.update.mock.calls[0][0];
    expect(updateArg.data.status).toBe('SUBMITTED');
    expect(updateArg.data).not.toHaveProperty('score');
    expect(updateArg.data.submittedAt).toBeInstanceOf(Date);
  });
});
