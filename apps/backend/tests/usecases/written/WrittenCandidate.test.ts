/**
 * Yazılı Test S3 — aday backend use-case testleri (satın alma + çözme + rapor).
 * PUAN YOK; çözüm yalnız teslim sonrası; satın alma idempotent.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => {
  const tx = {
    discountCode: { updateMany: jest.fn() },
    writtenPurchase: { create: jest.fn() },
  };
  return {
    prisma: {
      user: { findUnique: jest.fn() },
      writtenPackage: { findUnique: jest.fn() },
      writtenPurchase: { findUnique: jest.fn(), create: jest.fn() },
      writtenTest: { findUnique: jest.fn(), findMany: jest.fn() },
      writtenQuestion: { findMany: jest.fn() },
      writtenAttempt: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      writtenAnswer: { findMany: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
      writtenQuestionReport: { create: jest.fn(), findMany: jest.fn() },
      contract: { findFirst: jest.fn() },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
      __tx: tx,
    },
  };
});

import { PurchaseWrittenPackageUseCase } from '../../../src/application/use-cases/written/WrittenPurchaseUseCases';
import {
  StartWrittenAttemptUseCase,
  SubmitWrittenAnswerUseCase,
  GetWrittenAttemptStateUseCase,
  SubmitWrittenAttemptUseCase,
} from '../../../src/application/use-cases/written/WrittenAttemptUseCases';
import { ReportWrittenQuestionUseCase } from '../../../src/application/use-cases/written/ReportWrittenQuestionUseCase';
import { ListMyWrittenQuestionReportsUseCase } from '../../../src/application/use-cases/written/ListMyWrittenQuestionReportsUseCase';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
beforeEach(() => jest.clearAllMocks());

describe('PurchaseWrittenPackageUseCase', () => {
  it('giriş yoksa 401', async () => {
    await expect(new PurchaseWrittenPackageUseCase().execute('pkg')).rejects.toMatchObject({ status: 401 });
  });

  it('eğitici kendi paketini alamaz → OWN_PACKAGE', async () => {
    p.user.findUnique.mockResolvedValue({ id: 'u1', tenantId: 't1' });
    p.writtenPackage.findUnique.mockResolvedValue({ id: 'pkg', educatorId: 'u1', priceCents: 0, currency: 'TRY', isActive: true, publishedAt: new Date() });
    await expect(new PurchaseWrittenPackageUseCase().execute('pkg', 'u1')).rejects.toMatchObject({ code: 'OWN_PACKAGE' });
  });

  it('zaten ACTIVE satın alma varsa idempotent döner', async () => {
    p.user.findUnique.mockResolvedValue({ id: 'u2', tenantId: 't1' });
    p.writtenPackage.findUnique.mockResolvedValue({ id: 'pkg', educatorId: 'edu', priceCents: 1000, currency: 'TRY', isActive: true, publishedAt: new Date() });
    const existing = { id: 'wp1', status: 'ACTIVE' };
    p.writtenPurchase.findUnique.mockResolvedValue(existing);
    const out = await new PurchaseWrittenPackageUseCase().execute('pkg', 'u2');
    expect(out).toBe(existing);
    expect(p.writtenPurchase.create).not.toHaveBeenCalled();
  });

  it('ücretsiz paket (sözleşme yok) → ACTIVE create, snapshot ŞIKSIZ', async () => {
    p.user.findUnique.mockResolvedValue({ id: 'u3', tenantId: 't1' });
    p.writtenPackage.findUnique.mockResolvedValue({ id: 'pkg', educatorId: 'edu', priceCents: 0, currency: 'TRY', isActive: true, publishedAt: new Date() });
    p.writtenPurchase.findUnique.mockResolvedValue(null);
    p.contract.findFirst.mockResolvedValue(null);
    p.writtenTest.findMany.mockResolvedValue([{ id: 'wt1', title: 'T', isTimed: false, duration: null, questions: [{ id: 'q1', content: 'c', mediaUrl: null, order: 0, solutionText: 's', solutionMediaUrl: null }] }]);
    p.writtenPurchase.create.mockImplementation(async ({ data }: any) => ({ id: 'new', ...data }));
    const out: any = await new PurchaseWrittenPackageUseCase().execute('pkg', 'u3');
    expect(out.status).toBe('ACTIVE');
    expect(out.amountCents).toBe(0);
    const snap = out.testsSnapshot;
    expect(snap[0].questions[0]).not.toHaveProperty('options');
  });

  it('aktif sözleşme varsa onay yoksa → TERMS_NOT_ACCEPTED', async () => {
    p.user.findUnique.mockResolvedValue({ id: 'u4', tenantId: 't1' });
    p.writtenPackage.findUnique.mockResolvedValue({ id: 'pkg', educatorId: 'edu', priceCents: 0, currency: 'TRY', isActive: true, publishedAt: new Date() });
    p.writtenPurchase.findUnique.mockResolvedValue(null);
    p.contract.findFirst.mockResolvedValue({ id: 'contract-1' });
    await expect(new PurchaseWrittenPackageUseCase().execute('pkg', 'u4', null, {})).rejects.toMatchObject({ code: 'TERMS_NOT_ACCEPTED' });
  });
});

describe('StartWrittenAttemptUseCase', () => {
  it('satın alma yoksa → NOT_PURCHASED', async () => {
    p.writtenTest.findUnique.mockResolvedValue({ id: 'wt1', packageId: 'pkg', tenantId: 't1', isTimed: false, duration: null, hasSolutions: true, deletedAt: null });
    p.writtenPurchase.findUnique.mockResolvedValue(null);
    await expect(new StartWrittenAttemptUseCase().execute('wt1', 'u1')).rejects.toMatchObject({ code: 'NOT_PURCHASED' });
  });

  it('aktif deneme varsa resume döndürür', async () => {
    p.writtenTest.findUnique.mockResolvedValue({ id: 'wt1', packageId: 'pkg', tenantId: 't1', isTimed: false, duration: null, hasSolutions: true, deletedAt: null });
    p.writtenPurchase.findUnique.mockResolvedValue({ id: 'wp', status: 'ACTIVE', testsSnapshot: [{ testId: 'wt1', questions: [] }] });
    p.writtenAttempt.findFirst.mockResolvedValue({ id: 'att-active' });
    const out = await new StartWrittenAttemptUseCase().execute('wt1', 'u1');
    expect(out).toEqual({ attemptId: 'att-active', resumed: true });
    expect(p.writtenAttempt.create).not.toHaveBeenCalled();
  });
});

describe('SubmitWrittenAnswerUseCase', () => {
  it('boş metin → cevabı siler (blank)', async () => {
    p.writtenAttempt.findUnique.mockResolvedValue({ id: 'a1', candidateId: 'u1', status: 'IN_PROGRESS' });
    const out = await new SubmitWrittenAnswerUseCase().execute('a1', 'q1', '   ', 'u1');
    expect(out).toMatchObject({ cleared: true });
    expect(p.writtenAnswer.deleteMany).toHaveBeenCalled();
    expect(p.writtenAnswer.upsert).not.toHaveBeenCalled();
  });

  it('dolu metin → upsert', async () => {
    p.writtenAttempt.findUnique.mockResolvedValue({ id: 'a1', candidateId: 'u1', status: 'IN_PROGRESS' });
    await new SubmitWrittenAnswerUseCase().execute('a1', 'q1', 'cevabım', 'u1');
    expect(p.writtenAnswer.upsert).toHaveBeenCalled();
  });
});

describe('GetWrittenAttemptStateUseCase', () => {
  const snap = [{ id: 'q1', content: 'c', mediaUrl: null, order: 0, solutionText: 'ÇÖZÜM', solutionMediaUrl: null }];
  it('IN_PROGRESS → çözüm GİZLİ, score alanı YOK', async () => {
    p.writtenAttempt.findUnique.mockResolvedValue({ id: 'a1', candidateId: 'u1', status: 'IN_PROGRESS', startedAt: new Date(), submittedAt: null, questionsSnapshot: snap });
    p.writtenTest.findUnique.mockResolvedValue({ id: 'wt1', title: 'T', isTimed: false, duration: null, hasSolutions: true });
    p.writtenAnswer.findMany.mockResolvedValue([]);
    const out: any = await new GetWrittenAttemptStateUseCase().execute('a1', 'u1');
    expect(out.questions[0]).not.toHaveProperty('solutionText');
    expect(out.questions[0]).not.toHaveProperty('isCorrect');
    expect(out.attempt).not.toHaveProperty('score');
  });

  it('SUBMITTED → çözüm GÖRÜNÜR (öz-kıyas)', async () => {
    p.writtenAttempt.findUnique.mockResolvedValue({ id: 'a1', candidateId: 'u1', status: 'SUBMITTED', startedAt: new Date(), submittedAt: new Date(), questionsSnapshot: snap });
    p.writtenTest.findUnique.mockResolvedValue({ id: 'wt1', title: 'T', isTimed: false, duration: null, hasSolutions: true });
    p.writtenAnswer.findMany.mockResolvedValue([{ questionId: 'q1', textAnswer: 'benim cevabım' }]);
    const out: any = await new GetWrittenAttemptStateUseCase().execute('a1', 'u1');
    expect(out.questions[0].solutionText).toBe('ÇÖZÜM');
    expect(out.questions[0].textAnswer).toBe('benim cevabım');
  });
});

describe('SubmitWrittenAttemptUseCase', () => {
  it('teslim → SUBMITTED, update data\'da score YOK', async () => {
    p.writtenAttempt.findUnique.mockResolvedValue({ id: 'a1', candidateId: 'u1', status: 'IN_PROGRESS', startedAt: new Date() });
    p.writtenTest.findUnique.mockResolvedValue({ isTimed: false, duration: null });
    p.writtenAttempt.update.mockResolvedValue({});
    await new SubmitWrittenAttemptUseCase().execute('a1', 'u1');
    const arg = p.writtenAttempt.update.mock.calls[0][0];
    expect(arg.data.status).toBe('SUBMITTED');
    expect(arg.data).not.toHaveProperty('score');
  });
});

describe('ReportWrittenQuestionUseCase', () => {
  it('satın alma yoksa → NOT_PURCHASED', async () => {
    p.writtenTest.findUnique.mockResolvedValue({ id: 'wt1', packageId: 'pkg', tenantId: 't1' });
    p.writtenPurchase.findUnique.mockResolvedValue(null);
    await expect(new ReportWrittenQuestionUseCase().execute('wt1', { reason: 'x' }, 'u1')).rejects.toMatchObject({ code: 'NOT_PURCHASED' });
  });
});

describe('ListMyWrittenQuestionReportsUseCase', () => {
  it('RESOLVED→ANSWERED, "Yazılı:" başlık, source WRITTEN', async () => {
    p.writtenQuestionReport.findMany.mockResolvedValue([
      { id: 'r1', testId: 'wt1', questionId: 'q1', reason: 'dd', status: 'RESOLVED', createdAt: new Date() },
    ]);
    p.writtenTest.findMany.mockResolvedValue([{ id: 'wt1', title: 'Deneme' }]);
    p.writtenQuestion.findMany.mockResolvedValue([{ id: 'q1', content: 'Soru?' }]);
    const out: any = await new ListMyWrittenQuestionReportsUseCase().execute('u1');
    expect(out[0]).toMatchObject({ status: 'ANSWERED', testTitle: 'Yazılı: Deneme', source: 'WRITTEN', questionContent: 'Soru?' });
  });
});
