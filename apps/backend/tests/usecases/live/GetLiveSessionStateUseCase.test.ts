/**
 * GetLiveSessionStateUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Oturum bulunamazsa → SESSION_NOT_FOUND
 * - Başarı: temel session bilgileri döner
 * - Educator isteğinde isCorrect açılır
 * - Candidate isteğinde IN_PROGRESS sırasında isCorrect kapalı
 * - ENDED oturumda myResults döner
 * - showStats=true ile stats döner
 */

const mockSessionFindUnique = jest.fn();
const mockParticipantCount = jest.fn();
const mockParticipantFindUnique = jest.fn();
const mockLiveAnswerFindUnique = jest.fn();
const mockLiveAnswerGroupBy = jest.fn();
const mockLiveAnswerFindMany = jest.fn();

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    liveSession: { findUnique: (...args: any[]) => mockSessionFindUnique(...args) },
    liveParticipant: {
      count: (...args: any[]) => mockParticipantCount(...args),
      findUnique: (...args: any[]) => mockParticipantFindUnique(...args),
    },
    liveAnswer: {
      findUnique: (...args: any[]) => mockLiveAnswerFindUnique(...args),
      groupBy: (...args: any[]) => mockLiveAnswerGroupBy(...args),
      findMany: (...args: any[]) => mockLiveAnswerFindMany(...args),
    },
  },
}));

import { GetLiveSessionStateUseCase } from '../../../src/application/use-cases/live/GetLiveSessionStateUseCase';

function makeSession(overrides: Record<string, any> = {}) {
  return {
    id: 'sess-1',
    title: 'Test Oturumu',
    joinCode: 'ABC123',
    educatorId: 'edu-1',
    status: 'ACTIVE',
    currentQuestionIdx: 0,
    showStats: false,
    roundNumber: 1,
    parentSessionId: null,
    maxParticipants: null,
    paidAt: new Date(),
    tier: { id: 'tier-1', label: 'Standart' },
    _count: { participants: 3 },
    rounds: [],
    parent: null,
    questions: [
      {
        id: 'q1',
        content: 'Soru 1',
        mediaUrl: null,
        order: 1,
        options: [
          { id: 'o1', content: 'A', isCorrect: true, order: 1, mediaUrl: null },
          { id: 'o2', content: 'B', isCorrect: false, order: 2, mediaUrl: null },
        ],
      },
    ],
    ...overrides,
  };
}

describe('GetLiveSessionStateUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSessionFindUnique.mockResolvedValue(makeSession());
    mockParticipantCount.mockResolvedValue(2);
    mockParticipantFindUnique.mockResolvedValue(null);
    mockLiveAnswerFindUnique.mockResolvedValue(null);
    mockLiveAnswerGroupBy.mockResolvedValue([]);
    mockLiveAnswerFindMany.mockResolvedValue([]);
  });

  it('oturum bulunamazsa SESSION_NOT_FOUND AppError fırlatır', async () => {
    mockSessionFindUnique.mockResolvedValue(null);
    const uc = new GetLiveSessionStateUseCase();
    await expect(uc.execute('sess-missing')).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
  });

  it('temel session bilgileri döner', async () => {
    const uc = new GetLiveSessionStateUseCase();
    const result = await uc.execute('sess-1');
    expect(result.id).toBe('sess-1');
    expect(result.title).toBe('Test Oturumu');
    expect(result.joinCode).toBe('ABC123');
    expect(result.status).toBe('ACTIVE');
    expect(result.totalQuestions).toBe(1);
  });

  it('educator isteğinde currentQuestion.options isCorrect içerir', async () => {
    const uc = new GetLiveSessionStateUseCase();
    const result = await uc.execute('sess-1', { userId: 'edu-1' }); // educator requesterId
    expect(result.currentQuestion).not.toBeNull();
    expect(result.currentQuestion!.options[0]).toHaveProperty('isCorrect');
  });

  it('candidate isteğinde ACTIVE sırasında isCorrect undefined', async () => {
    const uc = new GetLiveSessionStateUseCase();
    const result = await uc.execute('sess-1', { userId: 'cand-1' }); // candidate
    expect(result.currentQuestion!.options[0].isCorrect).toBeUndefined();
  });

  it('participantCount döner', async () => {
    const uc = new GetLiveSessionStateUseCase();
    const result = await uc.execute('sess-1');
    expect(result.participantCount).toBe(3);
    expect(result.activeParticipantCount).toBe(2);
  });

  it('showStats=true ile stats döner', async () => {
    mockSessionFindUnique.mockResolvedValue(makeSession({ showStats: true }));
    mockLiveAnswerGroupBy.mockResolvedValue([{ optionId: 'o1', _count: { optionId: 5 } }]);
    const uc = new GetLiveSessionStateUseCase();
    const result = await uc.execute('sess-1');
    expect(result.stats).not.toBeNull();
    expect(result.stats!['q1']).toHaveLength(2); // 2 seçenek
    expect(result.stats!['q1'][0].count).toBe(5);
  });

  it('ENDED oturumda katılımcının myResults döner', async () => {
    mockSessionFindUnique.mockResolvedValue(makeSession({ status: 'ENDED' }));
    const participant = { id: 'part-1', sessionId: 'sess-1', userId: 'cand-1' };
    mockParticipantFindUnique.mockResolvedValue(participant);
    mockLiveAnswerFindMany.mockResolvedValue([{ questionId: 'q1', optionId: 'o1' }]);
    const uc = new GetLiveSessionStateUseCase();
    const result = await uc.execute('sess-1', { userId: 'cand-1' });
    expect(result.myResults).not.toBeNull();
    expect(result.myResults.total).toBe(1);
    expect(result.myResults.correct).toBe(1);
  });

  it('tier bilgisi döner', async () => {
    const uc = new GetLiveSessionStateUseCase();
    const result = await uc.execute('sess-1');
    expect(result.tier).toEqual({ id: 'tier-1', label: 'Standart' });
  });
});
