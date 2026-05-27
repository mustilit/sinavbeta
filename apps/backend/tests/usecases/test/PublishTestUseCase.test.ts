/**
 * PublishTestUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Kill-switch aktifse TEST_PUBLISHING_DISABLED hatası
 * - Kullanıcı bulunamazsa USER_NOT_FOUND
 * - Test bulunamazsa TEST_NOT_FOUND
 * - examTypeId yoksa TEST_TAXONOMY_REQUIRED
 * - Soru sayısı < 5 ise MIN_QUESTIONS_VIOLATION
 * - Seçenek sayısı < 2 → QUESTION_OPTIONS_VIOLATION
 * - Birden fazla doğru seçenek → ONE_CORRECT_OPTION_VIOLATION
 * - Sahibi değilse FORBIDDEN_NOT_OWNER
 * - Başarı: examRepository.publish çağrılır
 */

const mockAdminSettings = jest.fn();

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    adminSettings: { findFirst: (...args: any[]) => mockAdminSettings(...args) },
  },
}));

jest.mock('../../../src/infrastructure/repositories/PrismaFollowRepository', () => ({
  PrismaFollowRepository: jest.fn().mockImplementation(() => ({
    listFollowersForEducator: jest.fn().mockResolvedValue([]),
    listFollowersForExamType: jest.fn().mockResolvedValue([]),
  })),
}));

jest.mock('../../../src/infrastructure/cache/RedisCache', () => ({
  RedisCache: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    delByPrefix: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../src/infrastructure/queue/queue.service', () => ({
  QueueService: jest.fn().mockImplementation(() => ({
    enqueueJob: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { PublishTestUseCase } from '../../../src/application/use-cases/test/PublishTestUseCase';
import { AppError } from '../../../src/application/errors/AppError';

function makeUserRepo(user: any) {
  return { findById: jest.fn().mockResolvedValue(user) };
}

function makeAuditRepo() {
  return { create: jest.fn().mockResolvedValue(undefined) };
}

function makeExamRepo(test: any, publishResult: any = { id: 'test-1' }) {
  return {
    findById: jest.fn().mockResolvedValue(test),
    publish: jest.fn().mockResolvedValue(publishResult),
  };
}

function makeUser(overrides: Record<string, any> = {}) {
  return { id: 'edu-1', role: 'EDUCATOR', status: 'ACTIVE', educatorApprovedAt: new Date(), ...overrides };
}

function makeQuestion(overrides: Record<string, any> = {}) {
  return {
    id: 'q1',
    options: [
      { id: 'o1', isCorrect: true },
      { id: 'o2', isCorrect: false },
    ],
    solutionText: null,
    solutionMediaUrl: null,
    ...overrides,
  };
}

function makeTest(questionCount = 5, overrides: Record<string, any> = {}) {
  return {
    id: 'test-1',
    educatorId: 'edu-1',
    title: 'Test',
    examTypeId: 'et-1',
    isTimed: false,
    duration: null,
    hasSolutions: false,
    questions: Array.from({ length: questionCount }, (_, i) => makeQuestion({ id: `q${i}` })),
    ...overrides,
  };
}

describe('PublishTestUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAdminSettings.mockResolvedValue({ id: 1, testPublishingEnabled: true });
  });

  it('kill-switch aktifse TEST_PUBLISHING_DISABLED fırlatır', async () => {
    mockAdminSettings.mockResolvedValue({ id: 1, testPublishingEnabled: false });
    const uc = new PublishTestUseCase(makeExamRepo(makeTest()) as any, makeAuditRepo() as any, makeUserRepo(makeUser()) as any);
    await expect(uc.execute('test-1', 'edu-1')).rejects.toMatchObject({ code: 'TEST_PUBLISHING_DISABLED' });
  });

  it('kullanıcı bulunamazsa USER_NOT_FOUND fırlatır', async () => {
    const uc = new PublishTestUseCase(makeExamRepo(makeTest()) as any, makeAuditRepo() as any, makeUserRepo(null) as any);
    await expect(uc.execute('test-1', 'edu-1')).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });

  it('test bulunamazsa TEST_NOT_FOUND fırlatır', async () => {
    const uc = new PublishTestUseCase(makeExamRepo(null) as any, makeAuditRepo() as any, makeUserRepo(makeUser()) as any);
    await expect(uc.execute('test-missing', 'edu-1')).rejects.toMatchObject({ code: 'TEST_NOT_FOUND' });
  });

  it('examTypeId yoksa TEST_TAXONOMY_REQUIRED fırlatır', async () => {
    const uc = new PublishTestUseCase(makeExamRepo(makeTest(5, { examTypeId: null })) as any, makeAuditRepo() as any, makeUserRepo(makeUser()) as any);
    await expect(uc.execute('test-1', 'edu-1')).rejects.toMatchObject({ code: 'TEST_TAXONOMY_REQUIRED' });
  });

  it('soru sayısı < 5 ise MIN_QUESTIONS_VIOLATION fırlatır', async () => {
    const uc = new PublishTestUseCase(makeExamRepo(makeTest(3)) as any, makeAuditRepo() as any, makeUserRepo(makeUser()) as any);
    await expect(uc.execute('test-1', 'edu-1')).rejects.toMatchObject({ code: 'MIN_QUESTIONS_VIOLATION' });
  });

  it('seçenek sayısı < 2 olan soru varsa QUESTION_OPTIONS_VIOLATION fırlatır', async () => {
    const badQ = makeQuestion({ options: [{ id: 'o1', isCorrect: true }] }); // 1 seçenek
    const test = makeTest(5, { questions: [badQ, ...Array.from({ length: 4 }, (_, i) => makeQuestion({ id: `q${i}` }))] });
    const uc = new PublishTestUseCase(makeExamRepo(test) as any, makeAuditRepo() as any, makeUserRepo(makeUser()) as any);
    await expect(uc.execute('test-1', 'edu-1')).rejects.toMatchObject({ code: 'QUESTION_OPTIONS_VIOLATION' });
  });

  it('birden fazla doğru seçenek → ONE_CORRECT_OPTION_VIOLATION', async () => {
    const badQ = makeQuestion({ options: [{ id: 'o1', isCorrect: true }, { id: 'o2', isCorrect: true }] });
    const test = makeTest(5, { questions: [badQ, ...Array.from({ length: 4 }, (_, i) => makeQuestion({ id: `q${i}` }))] });
    const uc = new PublishTestUseCase(makeExamRepo(test) as any, makeAuditRepo() as any, makeUserRepo(makeUser()) as any);
    await expect(uc.execute('test-1', 'edu-1')).rejects.toMatchObject({ code: 'ONE_CORRECT_OPTION_VIOLATION' });
  });

  it('sahibi değilse FORBIDDEN_NOT_OWNER fırlatır', async () => {
    const test = makeTest(5, { educatorId: 'other-edu' });
    const uc = new PublishTestUseCase(makeExamRepo(test) as any, makeAuditRepo() as any, makeUserRepo(makeUser()) as any);
    await expect(uc.execute('test-1', 'edu-1')).rejects.toMatchObject({ code: 'FORBIDDEN_NOT_OWNER' });
  });

  it('başarı: examRepository.publish çağrılır', async () => {
    const examRepo = makeExamRepo(makeTest());
    const uc = new PublishTestUseCase(examRepo as any, makeAuditRepo() as any, makeUserRepo(makeUser()) as any);
    await uc.execute('test-1', 'edu-1');
    expect(examRepo.publish).toHaveBeenCalledWith('test-1');
  });
});
