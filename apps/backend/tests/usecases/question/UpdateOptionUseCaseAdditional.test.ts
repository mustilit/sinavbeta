/**
 * UpdateOptionUseCase ek test case'leri
 *
 * Doğrulanan davranışlar:
 * - actorId verilmezse sahiplik kontrolü yapılmaz
 * - Seçenek bulunamazsa → OPTION_NOT_FOUND
 * - Test bulunamazsa → TEST_NOT_FOUND
 * - Başkasının test seçeneği → FORBIDDEN_NOT_OWNER
 * - Başarı: examRepository.updateOption çağrılır
 * - SUSPENDED eğitici seçenek güncelleyemez
 */

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {},
}));

import { UpdateOptionUseCase } from '../../../src/application/use-cases/question/UpdateOptionUseCase';

function makeUserRepo(user: any) {
  return { findById: jest.fn().mockResolvedValue(user) };
}

function makeAttemptRepo() {
  return { hasAnswersForOption: jest.fn().mockResolvedValue(false) };
}

function makeExamRepo(option: any, test: any) {
  return {
    findOptionById: jest.fn().mockResolvedValue(option),
    findById: jest.fn().mockResolvedValue(test),
    updateOption: jest.fn().mockResolvedValue({ id: 'o1', content: 'Güncel', isCorrect: true }),
  };
}

function makeEducator(overrides: Record<string, any> = {}) {
  return { id: 'edu-1', role: 'EDUCATOR', status: 'ACTIVE', educatorApprovedAt: new Date(), ...overrides };
}

function makeOption() {
  return { id: 'o1', testId: 'test-1', content: 'Seçenek A', isCorrect: false };
}

function makeTest(overrides: Record<string, any> = {}) {
  return { id: 'test-1', educatorId: 'edu-1', title: 'Test', ...overrides };
}

describe('UpdateOptionUseCase — ek senaryolar', () => {
  it('seçenek bulunamazsa OPTION_NOT_FOUND fırlatır', async () => {
    const uc = new UpdateOptionUseCase(makeExamRepo(null, makeTest()) as any, makeUserRepo(makeEducator()) as any, makeAttemptRepo() as any);
    await expect(uc.execute('o-missing', { content: 'Yeni' }, 'edu-1')).rejects.toMatchObject({ code: 'OPTION_NOT_FOUND' });
  });

  it('test bulunamazsa TEST_NOT_FOUND fırlatır', async () => {
    const uc = new UpdateOptionUseCase(makeExamRepo(makeOption(), null) as any, makeUserRepo(makeEducator()) as any, makeAttemptRepo() as any);
    await expect(uc.execute('o1', { content: 'Yeni' }, 'edu-1')).rejects.toMatchObject({ code: 'TEST_NOT_FOUND' });
  });

  it('başkasının test seçeneği → FORBIDDEN_NOT_OWNER fırlatır', async () => {
    const uc = new UpdateOptionUseCase(makeExamRepo(makeOption(), makeTest({ educatorId: 'other-edu' })) as any, makeUserRepo(makeEducator()) as any, makeAttemptRepo() as any);
    await expect(uc.execute('o1', { content: 'Yeni' }, 'edu-1')).rejects.toMatchObject({ code: 'FORBIDDEN_NOT_OWNER' });
  });

  it('actorId verilmezse sahiplik kontrolü yapılmaz', async () => {
    const examRepo = makeExamRepo(makeOption(), makeTest({ educatorId: 'other-edu' }));
    const uc = new UpdateOptionUseCase(examRepo as any, makeUserRepo(null) as any, makeAttemptRepo() as any);
    await uc.execute('o1', { content: 'Yeni' }); // no actorId
    expect(examRepo.updateOption).toHaveBeenCalledTimes(1);
  });

  it('başarı: examRepository.updateOption çağrılır', async () => {
    const examRepo = makeExamRepo(makeOption(), makeTest());
    const uc = new UpdateOptionUseCase(examRepo as any, makeUserRepo(makeEducator()) as any, makeAttemptRepo() as any);
    await uc.execute('o1', { content: 'Güncel İçerik', isCorrect: true }, 'edu-1');
    expect(examRepo.updateOption).toHaveBeenCalledWith('o1', expect.objectContaining({ content: 'Güncel İçerik' }));
  });

  it('SUSPENDED educator → EDUCATOR_SUSPENDED hatası', async () => {
    const uc = new UpdateOptionUseCase(makeExamRepo(makeOption(), makeTest()) as any, makeUserRepo(makeEducator({ status: 'SUSPENDED' })) as any, makeAttemptRepo() as any);
    await expect(uc.execute('o1', { content: 'Yeni' }, 'edu-1')).rejects.toMatchObject({ code: 'EDUCATOR_SUSPENDED' });
  });
});
