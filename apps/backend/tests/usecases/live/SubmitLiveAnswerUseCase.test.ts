/**
 * SubmitLiveAnswerUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Oturum bulunamazsa → SESSION_NOT_FOUND
 * - Oturum ACTIVE değilse → SESSION_NOT_ACTIVE
 * - Soru bulunamazsa / yanlış oturuma aitsa → QUESTION_NOT_FOUND
 * - Yanlış soru (mevcut currentQuestionIdx ile eşleşmez) → WRONG_QUESTION
 * - Seçenek bulunamazsa / yanlış soruya aitsa → OPTION_NOT_FOUND
 * - Katılımcı oturuma katılmamışsa → NOT_JOINED
 * - Başarı: upsert çağrılır, cevap döner
 */

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    liveSession: { findUnique: jest.fn() },
    liveQuestion: { findUnique: jest.fn() },
    liveOption: { findUnique: jest.fn() },
    liveParticipant: { findUnique: jest.fn() },
    liveAnswer: { upsert: jest.fn() },
  },
}));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SubmitLiveAnswerUseCase } from '../../../src/application/use-cases/live/SubmitLiveAnswerUseCase';
import { prisma } from '../../../src/infrastructure/database/prisma';
import { AppError } from '../../../src/application/errors/AppError';

const mockPrisma = prisma as any;

function makeSession(overrides: Record<string, any> = {}) {
  return {
    id: 'sess-1',
    status: 'ACTIVE',
    currentQuestionIdx: 0, // 0-bazlı index → soru.order = 1
    ...overrides,
  };
}

function makeQuestion(overrides: Record<string, any> = {}) {
  return {
    id: 'q1',
    sessionId: 'sess-1',
    order: 1, // currentQuestionIdx + 1 = 0 + 1 = 1
    ...overrides,
  };
}

function makeOption() {
  return { id: 'opt-1', questionId: 'q1' };
}

function makeParticipant() {
  return { id: 'part-1', sessionId: 'sess-1', userId: 'u1' };
}

describe('SubmitLiveAnswerUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.liveSession.findUnique.mockResolvedValue(makeSession());
    mockPrisma.liveQuestion.findUnique.mockResolvedValue(makeQuestion());
    mockPrisma.liveOption.findUnique.mockResolvedValue(makeOption());
    mockPrisma.liveParticipant.findUnique.mockResolvedValue(makeParticipant());
    mockPrisma.liveAnswer.upsert.mockResolvedValue({ id: 'ans-1' });
  });

  it('oturum bulunamazsa SESSION_NOT_FOUND fırlatır', async () => {
    mockPrisma.liveSession.findUnique.mockResolvedValue(null);
    const uc = new SubmitLiveAnswerUseCase();
    await expect(uc.execute('sess-missing', { userId: 'u1' }, 'q1', 'opt-1')).rejects.toMatchObject({
      code: 'SESSION_NOT_FOUND',
    });
  });

  it('oturum DRAFT → SESSION_NOT_ACTIVE fırlatır', async () => {
    mockPrisma.liveSession.findUnique.mockResolvedValue(makeSession({ status: 'DRAFT' }));
    const uc = new SubmitLiveAnswerUseCase();
    await expect(uc.execute('sess-1', { userId: 'u1' }, 'q1', 'opt-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('oturum ENDED → SESSION_NOT_ACTIVE fırlatır', async () => {
    mockPrisma.liveSession.findUnique.mockResolvedValue(makeSession({ status: 'ENDED' }));
    const uc = new SubmitLiveAnswerUseCase();
    await expect(uc.execute('sess-1', { userId: 'u1' }, 'q1', 'opt-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('soru bulunamazsa QUESTION_NOT_FOUND fırlatır', async () => {
    mockPrisma.liveQuestion.findUnique.mockResolvedValue(null);
    const uc = new SubmitLiveAnswerUseCase();
    await expect(uc.execute('sess-1', { userId: 'u1' }, 'q-missing', 'opt-1')).rejects.toMatchObject({
      code: 'QUESTION_NOT_FOUND',
    });
  });

  it('başka oturumun sorusu → QUESTION_NOT_FOUND fırlatır', async () => {
    mockPrisma.liveQuestion.findUnique.mockResolvedValue(makeQuestion({ sessionId: 'other-sess' }));
    const uc = new SubmitLiveAnswerUseCase();
    await expect(uc.execute('sess-1', { userId: 'u1' }, 'q1', 'opt-1')).rejects.toMatchObject({
      code: 'QUESTION_NOT_FOUND',
    });
  });

  it('mevcut soru değil → WRONG_QUESTION fırlatır', async () => {
    // currentQuestionIdx = 0, ama soru order = 2
    mockPrisma.liveQuestion.findUnique.mockResolvedValue(makeQuestion({ order: 2 }));
    const uc = new SubmitLiveAnswerUseCase();
    await expect(uc.execute('sess-1', { userId: 'u1' }, 'q1', 'opt-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('seçenek bulunamazsa OPTION_NOT_FOUND fırlatır', async () => {
    mockPrisma.liveOption.findUnique.mockResolvedValue(null);
    const uc = new SubmitLiveAnswerUseCase();
    await expect(uc.execute('sess-1', { userId: 'u1' }, 'q1', 'opt-missing')).rejects.toMatchObject({
      code: 'OPTION_NOT_FOUND',
    });
  });

  it('başka sorunun seçeneği → OPTION_NOT_FOUND fırlatır', async () => {
    mockPrisma.liveOption.findUnique.mockResolvedValue({ id: 'opt-1', questionId: 'other-q' });
    const uc = new SubmitLiveAnswerUseCase();
    await expect(uc.execute('sess-1', { userId: 'u1' }, 'q1', 'opt-1')).rejects.toMatchObject({
      code: 'OPTION_NOT_FOUND',
    });
  });

  it('katılımcı oturuma katılmamışsa NOT_JOINED fırlatır', async () => {
    mockPrisma.liveParticipant.findUnique.mockResolvedValue(null);
    const uc = new SubmitLiveAnswerUseCase();
    await expect(uc.execute('sess-1', { userId: 'u-nojoined' }, 'q1', 'opt-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('başarı: liveAnswer.upsert çağrılır, cevap döner', async () => {
    const uc = new SubmitLiveAnswerUseCase();
    const result = await uc.execute('sess-1', { userId: 'u1' }, 'q1', 'opt-1');
    expect(mockPrisma.liveAnswer.upsert).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ id: 'ans-1' });
  });

  it('aynı soru ikinci kez cevaplandığında upsert update yolu izler', async () => {
    const uc = new SubmitLiveAnswerUseCase();
    await uc.execute('sess-1', { userId: 'u1' }, 'q1', 'opt-1');
    // upsert yeniden çağrılabilir (ikinci cevap)
    await uc.execute('sess-1', { userId: 'u1' }, 'q1', 'opt-1');
    expect(mockPrisma.liveAnswer.upsert).toHaveBeenCalledTimes(2);
  });
});
