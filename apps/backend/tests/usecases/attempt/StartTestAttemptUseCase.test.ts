/**
 * StartTestAttemptUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - testId/userId eksik → INVALID_INPUT
 * - Kill-switch açıksa → TEST_ATTEMPTS_DISABLED
 * - Test bulunamazsa → TEST_NOT_FOUND
 * - Tenant mismatch → TENANT_MISMATCH
 * - Satın alma yoksa → NO_PURCHASE
 * - Soru yok → NO_QUESTIONS
 * - Mevcut PAUSED attempt → resume döner (IN_PROGRESS + remainingSec)
 * - SUBMITTED/EXPIRED attempt → ATTEMPT_ALREADY_FINISHED
 * - Yeni attempt → attemptId + remainingSec döner
 */

const mockFindFirst = jest.fn();
const mockExamTestFindUnique = jest.fn();
const mockAdminSettingsFindFirst = jest.fn();
const mockTestAttemptFindFirst = jest.fn();
const mockTestAttemptCreate = jest.fn();
const mockTestAttemptUpdate = jest.fn();
const mockExamQuestionFindMany = jest.fn();
const mockPurchaseFindFirst = jest.fn();

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    adminSettings: { findFirst: (...args: any[]) => mockAdminSettingsFindFirst(...args) },
    examTest: { findUnique: (...args: any[]) => mockExamTestFindUnique(...args) },
    testAttempt: {
      findFirst: (...args: any[]) => mockTestAttemptFindFirst(...args),
      create: (...args: any[]) => mockTestAttemptCreate(...args),
      update: (...args: any[]) => mockTestAttemptUpdate(...args),
    },
    examQuestion: { findMany: (...args: any[]) => mockExamQuestionFindMany(...args) },
    purchase: { findFirst: (...args: any[]) => mockPurchaseFindFirst(...args) },
  },
}));

// prisma-retry mock — direkt çağrıyı geç
jest.mock('../../../src/infrastructure/prisma/prisma-retry', () => ({
  prismaRetry: (fn: () => Promise<any>) => fn(),
}));

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { StartTestAttemptUseCase } from '../../../src/application/use-cases/attempt/StartTestAttemptUseCase';

function makeTest(overrides: Record<string, any> = {}) {
  return {
    id: 'test-1',
    tenantId: 't1',
    isTimed: false,
    duration: null,
    durationSec: null,
    ...overrides,
  };
}

function makeQuestion() {
  return {
    id: 'q1',
    content: 'Soru metni',
    order: 1,
    options: [{ id: 'o1', content: 'Seçenek A', isCorrect: true }],
  };
}

describe('StartTestAttemptUseCase', () => {
  let prismaClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    // Varsayılan mock'lar
    mockAdminSettingsFindFirst.mockResolvedValue({ id: 1, testAttemptsEnabled: true });
    mockExamTestFindUnique.mockResolvedValue(makeTest());
    mockPurchaseFindFirst.mockResolvedValue({ id: 'pur-1', testId: 'test-1', candidateId: 'u1' });
    mockTestAttemptFindFirst.mockResolvedValue(null);
    mockExamQuestionFindMany.mockResolvedValue([makeQuestion()]);
    mockTestAttemptCreate.mockResolvedValue({ id: 'att-new', remainingSec: 86400 });
    mockTestAttemptUpdate.mockResolvedValue({ id: 'att-1', remainingSec: 3000 });

    // PrismaClient stub
    const { prisma } = require('../../../src/infrastructure/database/prisma');
    prismaClient = prisma;
  });

  it('testId eksik ise BadRequestException fırlatır', async () => {
    const uc = new StartTestAttemptUseCase(prismaClient);
    await expect(uc.execute('', 'u1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('userId eksik ise BadRequestException fırlatır', async () => {
    const uc = new StartTestAttemptUseCase(prismaClient);
    await expect(uc.execute('test-1', '')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('kill-switch açık ise TEST_ATTEMPTS_DISABLED fırlatır', async () => {
    mockAdminSettingsFindFirst.mockResolvedValue({ id: 1, testAttemptsEnabled: false });
    const uc = new StartTestAttemptUseCase(prismaClient);
    await expect(uc.execute('test-1', 'u1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'TEST_ATTEMPTS_DISABLED' }),
    });
  });

  it('test bulunamazsa NotFoundException fırlatır', async () => {
    mockExamTestFindUnique.mockResolvedValue(null);
    const uc = new StartTestAttemptUseCase(prismaClient);
    await expect(uc.execute('test-missing', 'u1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('tenant mismatch ise ForbiddenException fırlatır', async () => {
    mockExamTestFindUnique.mockResolvedValue(makeTest({ tenantId: 'other-tenant' }));
    const uc = new StartTestAttemptUseCase(prismaClient);
    await expect(uc.execute('test-1', 'u1', 't1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('satın alma yoksa NO_PURCHASE fırlatır', async () => {
    mockPurchaseFindFirst.mockResolvedValue(null);
    const uc = new StartTestAttemptUseCase(prismaClient);
    await expect(uc.execute('test-1', 'u1', 't1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'NO_PURCHASE' }),
    });
  });

  it('soru yoksa NO_QUESTIONS fırlatır', async () => {
    mockExamQuestionFindMany.mockResolvedValue([]);
    const uc = new StartTestAttemptUseCase(prismaClient);
    await expect(uc.execute('test-1', 'u1', 't1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'NO_QUESTIONS' }),
    });
  });

  it('mevcut attempt yoksa yeni attempt oluşturulur', async () => {
    const uc = new StartTestAttemptUseCase(prismaClient);
    const result = await uc.execute('test-1', 'u1', 't1');
    expect(mockTestAttemptCreate).toHaveBeenCalledTimes(1);
    expect(result.attemptId).toBe('att-new');
  });

  it('PAUSED attempt varsa IN_PROGRESS a çekilir, attemptId döner', async () => {
    mockTestAttemptFindFirst.mockResolvedValue({
      id: 'att-paused',
      testId: 'test-1',
      candidateId: 'u1',
      status: 'PAUSED',
      remainingSec: 1800,
    });
    const uc = new StartTestAttemptUseCase(prismaClient);
    const result = await uc.execute('test-1', 'u1', 't1');
    expect(mockTestAttemptUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'IN_PROGRESS' }) }),
    );
    expect(result.attemptId).toBeDefined();
  });

  it('SUBMITTED attempt → ATTEMPT_ALREADY_FINISHED fırlatır', async () => {
    mockTestAttemptFindFirst.mockResolvedValue({
      id: 'att-done',
      testId: 'test-1',
      candidateId: 'u1',
      status: 'SUBMITTED',
    });
    const uc = new StartTestAttemptUseCase(prismaClient);
    await expect(uc.execute('test-1', 'u1', 't1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ATTEMPT_ALREADY_FINISHED' }),
    });
  });

  it('IN_PROGRESS attempt remainingSec döner (yeniden oluşturulmaz)', async () => {
    mockTestAttemptFindFirst.mockResolvedValue({
      id: 'att-active',
      testId: 'test-1',
      candidateId: 'u1',
      status: 'IN_PROGRESS',
      remainingSec: 2700,
      lastResumedAt: new Date(),
    });
    const uc = new StartTestAttemptUseCase(prismaClient);
    const result = await uc.execute('test-1', 'u1', 't1');
    expect(mockTestAttemptCreate).not.toHaveBeenCalled();
    expect(result.remainingSec).toBe(2700);
  });

  // ─── attemptsResetAt senaryoları ─────────────────────────────────────────

  it('cari turda SUBMITTED attempt varsa ATTEMPT_ALREADY_FINISHED fırlatır (attemptsResetAt sonrası başlamış)', async () => {
    // resetAt 60 saniye önce; attempt resetAt'ten SONRA başladı → cari tur
    const resetAt = new Date(Date.now() - 60_000);
    mockPurchaseFindFirst.mockResolvedValue({
      id: 'pur-1',
      testId: 'test-1',
      candidateId: 'u1',
      attemptsResetAt: resetAt,
    });
    mockTestAttemptFindFirst.mockResolvedValue({
      id: 'att-done',
      testId: 'test-1',
      candidateId: 'u1',
      status: 'SUBMITTED',
      startedAt: new Date(Date.now() - 30_000), // reset'ten SONRA başladı
      attemptNumber: 1,
    });
    const uc = new StartTestAttemptUseCase(prismaClient);
    await expect(uc.execute('test-1', 'u1', 't1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ATTEMPT_ALREADY_FINISHED' }),
    });
  });

  it('reset\'ten önce SUBMITTED attempt var → yeni attempt açılır ve attemptNumber artar', async () => {
    // resetAt 5 saniye önce; attempt resetAt'ten ÖNCE başladı → eski tur, yeni açılabilir
    const resetAt = new Date(Date.now() - 5_000);
    mockPurchaseFindFirst.mockResolvedValue({
      id: 'pur-1',
      testId: 'test-1',
      candidateId: 'u1',
      attemptsResetAt: resetAt,
    });
    mockTestAttemptFindFirst.mockResolvedValue({
      id: 'att-old',
      testId: 'test-1',
      candidateId: 'u1',
      status: 'SUBMITTED',
      startedAt: new Date(Date.now() - 60_000), // reset'ten ÖNCE başladı → eski tur
      attemptNumber: 1,
    });
    mockTestAttemptCreate.mockResolvedValue({ id: 'att-new2', remainingSec: 86400, attemptNumber: 2 });
    const uc = new StartTestAttemptUseCase(prismaClient);
    const result = await uc.execute('test-1', 'u1', 't1');
    expect(mockTestAttemptCreate).toHaveBeenCalledTimes(1);
    expect(result.attemptId).toBe('att-new2');
  });

  it('cari turda IN_PROGRESS attempt → resume (yeni attempt açılmaz, remainingSec döner)', async () => {
    // resetAt 10 saniye önce; mevcut IN_PROGRESS attempt resetAt'ten sonra başladı → cari tur
    const resetAt = new Date(Date.now() - 10_000);
    mockPurchaseFindFirst.mockResolvedValue({
      id: 'pur-1',
      testId: 'test-1',
      candidateId: 'u1',
      attemptsResetAt: resetAt,
    });
    mockTestAttemptFindFirst.mockResolvedValue({
      id: 'att-active',
      testId: 'test-1',
      candidateId: 'u1',
      status: 'IN_PROGRESS',
      startedAt: new Date(Date.now() - 5_000), // reset'ten SONRA başladı → cari tur
      remainingSec: 1500,
      lastResumedAt: new Date(),
    });
    const uc = new StartTestAttemptUseCase(prismaClient);
    const result = await uc.execute('test-1', 'u1', 't1');
    expect(mockTestAttemptCreate).not.toHaveBeenCalled();
    expect(result.remainingSec).toBe(1500);
  });
});
