/**
 * WrittenQuestionUseCases unit testleri.
 * SOLUTION_REQUIRED + CONTENT_REQUIRED + FORBIDDEN + PACKAGE_PUBLISHED lock.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    writtenTest: { findUnique: jest.fn() },
    writtenQuestion: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn(), count: jest.fn() },
    writtenPackage: { findUnique: jest.fn() },
  },
}));

import {
  CreateWrittenQuestionUseCase,
  UpdateWrittenQuestionUseCase,
  DeleteWrittenQuestionUseCase,
} from '../../../src/application/use-cases/written/WrittenQuestionUseCases';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
beforeEach(() => jest.clearAllMocks());

// ─── Yardımcı ─────────────────────────────────────────────────

function makeTest(overrides: any = {}) {
  return {
    id: 'tst1',
    packageId: 'pkg1',
    package: {
      id: 'pkg1',
      educatorId: 'edu1',
      publishedAt: null,
    },
    ...overrides,
  };
}

// ─── CreateWrittenQuestionUseCase ─────────────────────────────

describe('CreateWrittenQuestionUseCase', () => {
  it('actorId yoksa → UNAUTHORIZED', async () => {
    await expect(
      new CreateWrittenQuestionUseCase().execute({ testId: 'tst1', content: 'Soru', solutionText: 'Çözüm' }, null),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('content VE mediaUrl yoksa → CONTENT_REQUIRED', async () => {
    await expect(
      new CreateWrittenQuestionUseCase().execute(
        { testId: 'tst1', solutionText: 'Çözüm' },
        'edu1',
      ),
    ).rejects.toMatchObject({ code: 'CONTENT_REQUIRED' });
  });

  it('solutionText VE solutionMediaUrl yoksa → SOLUTION_REQUIRED', async () => {
    await expect(
      new CreateWrittenQuestionUseCase().execute(
        { testId: 'tst1', content: 'Soru metni' },
        'edu1',
      ),
    ).rejects.toMatchObject({ code: 'SOLUTION_REQUIRED' });
  });

  it('sadece boşluk → CONTENT_REQUIRED', async () => {
    await expect(
      new CreateWrittenQuestionUseCase().execute(
        { testId: 'tst1', content: '   ', solutionText: 'Çözüm' },
        'edu1',
      ),
    ).rejects.toMatchObject({ code: 'CONTENT_REQUIRED' });
  });

  it('sadece boşluk çözüm → SOLUTION_REQUIRED', async () => {
    await expect(
      new CreateWrittenQuestionUseCase().execute(
        { testId: 'tst1', content: 'Soru', solutionText: '   ' },
        'edu1',
      ),
    ).rejects.toMatchObject({ code: 'SOLUTION_REQUIRED' });
  });

  it('test bulunamadı → TEST_NOT_FOUND', async () => {
    p.writtenTest.findUnique.mockResolvedValue(null);
    await expect(
      new CreateWrittenQuestionUseCase().execute(
        { testId: 'tst1', content: 'Soru', solutionText: 'Çözüm' },
        'edu1',
      ),
    ).rejects.toMatchObject({ code: 'TEST_NOT_FOUND' });
  });

  it('başka eğitici testi → FORBIDDEN', async () => {
    p.writtenTest.findUnique.mockResolvedValue(
      makeTest({ package: { id: 'pkg1', educatorId: 'other', publishedAt: null } }),
    );
    await expect(
      new CreateWrittenQuestionUseCase().execute(
        { testId: 'tst1', content: 'Soru', solutionText: 'Çözüm' },
        'edu1',
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('paket yayımlıysa → PACKAGE_PUBLISHED', async () => {
    p.writtenTest.findUnique.mockResolvedValue(
      makeTest({ package: { id: 'pkg1', educatorId: 'edu1', publishedAt: new Date() } }),
    );
    await expect(
      new CreateWrittenQuestionUseCase().execute(
        { testId: 'tst1', content: 'Soru', solutionText: 'Çözüm' },
        'edu1',
      ),
    ).rejects.toMatchObject({ code: 'PACKAGE_PUBLISHED' });
  });

  it('admin başka eğiticinin testine soru ekleyebilir', async () => {
    p.writtenTest.findUnique.mockResolvedValue(
      makeTest({ package: { id: 'pkg1', educatorId: 'other', publishedAt: null } }),
    );
    p.writtenQuestion.create.mockResolvedValue({ id: 'q1', testId: 'tst1' });
    p.writtenQuestion.count.mockResolvedValue(1);
    p.writtenTest.findUnique.mockResolvedValue(makeTest({ package: { id: 'pkg1', educatorId: 'other', publishedAt: null } }));
    // update için writtenTest mock — recount
    p.writtenTest.update = jest.fn().mockResolvedValue({ id: 'tst1', questionCount: 1 });

    const result = await new CreateWrittenQuestionUseCase().execute(
      { testId: 'tst1', content: 'Soru', solutionText: 'Çözüm' },
      'admin1',
      'ADMIN',
    );
    expect(result).toMatchObject({ id: 'q1' });
  });

  it('mediaUrl ve solutionMediaUrl → başarılı (text olmadan)', async () => {
    p.writtenTest.findUnique.mockResolvedValue(makeTest());
    p.writtenQuestion.create.mockResolvedValue({ id: 'q1', testId: 'tst1' });
    p.writtenQuestion.count.mockResolvedValue(1);
    (p.writtenTest as any).update = jest.fn().mockResolvedValue({ id: 'tst1', questionCount: 1 });

    const result = await new CreateWrittenQuestionUseCase().execute(
      {
        testId: 'tst1',
        mediaUrl: 'https://example.com/img.png',
        solutionMediaUrl: 'https://example.com/sol.png',
      },
      'edu1',
    );
    expect(result).toMatchObject({ id: 'q1' });
  });

  it('başarılı create — content + solutionText', async () => {
    p.writtenTest.findUnique.mockResolvedValue(makeTest());
    p.writtenQuestion.create.mockResolvedValue({ id: 'q1', testId: 'tst1', content: 'Soru', solutionText: 'Çözüm' });
    p.writtenQuestion.count.mockResolvedValue(1);
    (p.writtenTest as any).update = jest.fn().mockResolvedValue({ id: 'tst1', questionCount: 1 });

    const result = await new CreateWrittenQuestionUseCase().execute(
      { testId: 'tst1', content: 'Soru metni', solutionText: 'Çözüm açıklaması', order: 1 },
      'edu1',
    );
    expect(result).toMatchObject({ id: 'q1' });
    const createCall = p.writtenQuestion.create.mock.calls[0][0].data;
    expect(createCall.content).toBe('Soru metni');
    expect(createCall.solutionText).toBe('Çözüm açıklaması');
    expect(createCall.order).toBe(1);
  });
});

// ─── UpdateWrittenQuestionUseCase ─────────────────────────────

describe('UpdateWrittenQuestionUseCase', () => {
  function setupQuestion() {
    p.writtenTest.findUnique.mockResolvedValue(makeTest());
    p.writtenQuestion.findUnique.mockResolvedValue({ id: 'q1', testId: 'tst1' });
  }

  it('actorId yoksa → UNAUTHORIZED', async () => {
    await expect(
      new UpdateWrittenQuestionUseCase().execute('tst1', 'q1', { solutionText: 'X' }, null),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('paket yayımlıysa → PACKAGE_PUBLISHED', async () => {
    p.writtenTest.findUnique.mockResolvedValue(
      makeTest({ package: { id: 'pkg1', educatorId: 'edu1', publishedAt: new Date() } }),
    );
    p.writtenQuestion.findUnique.mockResolvedValue({ id: 'q1', testId: 'tst1' });
    await expect(
      new UpdateWrittenQuestionUseCase().execute('tst1', 'q1', { solutionText: 'X' }, 'edu1'),
    ).rejects.toMatchObject({ code: 'PACKAGE_PUBLISHED' });
  });

  it('soru başka teste ait → QUESTION_NOT_FOUND', async () => {
    p.writtenTest.findUnique.mockResolvedValue(makeTest());
    p.writtenQuestion.findUnique.mockResolvedValue({ id: 'q1', testId: 'BASKA_TST' });
    await expect(
      new UpdateWrittenQuestionUseCase().execute('tst1', 'q1', {}, 'edu1'),
    ).rejects.toMatchObject({ code: 'QUESTION_NOT_FOUND' });
  });

  it('başarılı güncelleme', async () => {
    setupQuestion();
    p.writtenQuestion.update.mockResolvedValue({ id: 'q1', solutionText: 'Yeni çözüm' });
    const result = await new UpdateWrittenQuestionUseCase().execute(
      'tst1', 'q1', { solutionText: 'Yeni çözüm' }, 'edu1',
    );
    expect(result).toMatchObject({ solutionText: 'Yeni çözüm' });
  });

  it('alan yoksa findUnique döner', async () => {
    setupQuestion();
    p.writtenQuestion.findUnique.mockResolvedValueOnce({ id: 'q1', testId: 'tst1' }); // resolveQuestion
    p.writtenQuestion.findUnique.mockResolvedValueOnce({ id: 'q1', solutionText: 'Mevcut' }); // no-op return
    const result = await new UpdateWrittenQuestionUseCase().execute('tst1', 'q1', {}, 'edu1');
    expect(p.writtenQuestion.update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: 'q1' });
  });
});

// ─── DeleteWrittenQuestionUseCase ─────────────────────────────

describe('DeleteWrittenQuestionUseCase', () => {
  function setupQuestion() {
    p.writtenTest.findUnique.mockResolvedValue(makeTest());
    p.writtenQuestion.findUnique.mockResolvedValue({ id: 'q1', testId: 'tst1' });
    p.writtenQuestion.delete.mockResolvedValue({ id: 'q1' });
    p.writtenQuestion.count.mockResolvedValue(0);
    if (!p.writtenTest.update) {
      (p.writtenTest as any).update = jest.fn().mockResolvedValue({ id: 'tst1', questionCount: 0 });
    } else {
      (p.writtenTest.update as jest.Mock).mockResolvedValue({ id: 'tst1', questionCount: 0 });
    }
  }

  it('actorId yoksa → UNAUTHORIZED', async () => {
    await expect(
      new DeleteWrittenQuestionUseCase().execute('tst1', 'q1', null),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('paket yayımlıysa → PACKAGE_PUBLISHED', async () => {
    p.writtenTest.findUnique.mockResolvedValue(
      makeTest({ package: { id: 'pkg1', educatorId: 'edu1', publishedAt: new Date() } }),
    );
    p.writtenQuestion.findUnique.mockResolvedValue({ id: 'q1', testId: 'tst1' });
    await expect(
      new DeleteWrittenQuestionUseCase().execute('tst1', 'q1', 'edu1'),
    ).rejects.toMatchObject({ code: 'PACKAGE_PUBLISHED' });
  });

  it('başarılı silme + recount', async () => {
    setupQuestion();
    const result = await new DeleteWrittenQuestionUseCase().execute('tst1', 'q1', 'edu1');
    expect(result).toMatchObject({ ok: true });
    expect(p.writtenQuestion.delete).toHaveBeenCalledWith({ where: { id: 'q1' } });
  });
});
