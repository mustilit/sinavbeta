/**
 * UpdateQuestionUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - actorId geçersizse USER_NOT_FOUND
 * - Soru bulunamazsa QUESTION_NOT_FOUND
 * - Test bulunamazsa TEST_NOT_FOUND
 * - Sahibi olmayan eğitici güncellemeye çalışırsa FORBIDDEN_NOT_OWNER
 * - actorId yoksa sahip kontrolü yapılmaz
 * - Başarı: examRepository.updateQuestion çağrılır
 */

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    examQuestion: { findUnique: jest.fn() },
    examTest: { findUnique: jest.fn() },
  },
}));

import { UpdateQuestionUseCase } from '../../../src/application/use-cases/question/UpdateQuestionUseCase';

function makeUserRepo(user: any = null) {
  return { findById: jest.fn().mockResolvedValue(user) };
}

function makeAttemptRepo() {
  return {};
}

function makeExamRepo(question: any = null, test: any = null) {
  return {
    findQuestionById: jest.fn().mockResolvedValue(question),
    findById: jest.fn().mockResolvedValue(test),
    updateQuestion: jest.fn().mockImplementation(async (id: string, updates: any) => ({ id, ...updates })),
  };
}

function makeUser(overrides: any = {}) {
  return {
    id: 'edu-1',
    role: 'EDUCATOR',
    status: 'ACTIVE',
    educatorApprovedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeQuestion(overrides: any = {}) {
  return { id: 'q-1', testId: 'test-1', content: 'Soru metni', ...overrides };
}

function makeTest(overrides: any = {}) {
  return { id: 'test-1', educatorId: 'edu-1', ...overrides };
}

describe('UpdateQuestionUseCase', () => {
  it('actorId verilmiş ama kullanıcı bulunamazsa USER_NOT_FOUND fırlatır', async () => {
    const uc = new UpdateQuestionUseCase(
      makeExamRepo(makeQuestion(), makeTest()) as any,
      makeUserRepo(null) as any,
      makeAttemptRepo() as any,
    );
    await expect(uc.execute('q-1', { content: 'yeni' }, 'nonexistent-user')).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
    });
  });

  it('soru bulunamazsa QUESTION_NOT_FOUND fırlatır', async () => {
    const uc = new UpdateQuestionUseCase(
      makeExamRepo(null, makeTest()) as any,
      makeUserRepo(makeUser()) as any,
      makeAttemptRepo() as any,
    );
    await expect(uc.execute('bad-q', { content: 'yeni' }, 'edu-1')).rejects.toMatchObject({
      code: 'QUESTION_NOT_FOUND',
    });
  });

  it('test bulunamazsa TEST_NOT_FOUND fırlatır', async () => {
    const uc = new UpdateQuestionUseCase(
      makeExamRepo(makeQuestion(), null) as any,
      makeUserRepo(makeUser()) as any,
      makeAttemptRepo() as any,
    );
    await expect(uc.execute('q-1', { content: 'yeni' }, 'edu-1')).rejects.toMatchObject({
      code: 'TEST_NOT_FOUND',
    });
  });

  it('başkasının testinin sorusunu güncelleyince FORBIDDEN_NOT_OWNER fırlatır', async () => {
    const uc = new UpdateQuestionUseCase(
      makeExamRepo(makeQuestion(), makeTest({ educatorId: 'other-edu' })) as any,
      makeUserRepo(makeUser()) as any,
      makeAttemptRepo() as any,
    );
    await expect(uc.execute('q-1', { content: 'yeni' }, 'edu-1')).rejects.toMatchObject({
      code: 'FORBIDDEN_NOT_OWNER',
    });
  });

  it('actorId yoksa sahip kontrolü atlanır ve güncelleme gerçekleşir', async () => {
    const examRepo = makeExamRepo(makeQuestion(), makeTest({ educatorId: 'any-edu' }));
    const uc = new UpdateQuestionUseCase(
      examRepo as any,
      makeUserRepo() as any,
      makeAttemptRepo() as any,
    );
    await uc.execute('q-1', { content: 'Updated without actor' }, undefined);
    expect(examRepo.updateQuestion).toHaveBeenCalledWith('q-1', expect.objectContaining({ content: 'Updated without actor' }));
  });

  it('başarı: examRepository.updateQuestion çağrılır', async () => {
    const examRepo = makeExamRepo(makeQuestion(), makeTest());
    const uc = new UpdateQuestionUseCase(
      examRepo as any,
      makeUserRepo(makeUser()) as any,
      makeAttemptRepo() as any,
    );
    await uc.execute('q-1', { content: 'Güncellenmiş içerik', order: 2 }, 'edu-1');
    expect(examRepo.updateQuestion).toHaveBeenCalledWith('q-1', { content: 'Güncellenmiş içerik', order: 2 });
  });

  it('askıya alınmış eğitici güncelleme yapamaz (ensureEducatorActive)', async () => {
    const uc = new UpdateQuestionUseCase(
      makeExamRepo(makeQuestion(), makeTest()) as any,
      makeUserRepo(makeUser({ status: 'SUSPENDED' })) as any,
      makeAttemptRepo() as any,
    );
    await expect(uc.execute('q-1', { content: 'yeni' }, 'edu-1')).rejects.toBeDefined();
  });
});
