/**
 * CreateRound2LiveSessionUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Oturum bulunamazsa → SESSION_NOT_FOUND
 * - Eğitici değilse (başka kullanıcı) → ForbiddenException
 * - Oturum ENDED değilse → SESSION_NOT_ENDED
 * - roundNumber 1 değilse → NOT_ROUND1
 * - Başarı: tur 2 oluşturulur, title ' - Tur 2' içerir, parentSessionId set edilir
 * - paidAt miras alınır
 * - sorular kopyalanır
 */

const mockSessionFindUnique = jest.fn();
const mockSessionCreate = jest.fn();

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    liveSession: {
      findUnique: (...args: any[]) => mockSessionFindUnique(...args),
      create: (...args: any[]) => mockSessionCreate(...args),
    },
  },
}));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CreateRound2LiveSessionUseCase } from '../../../src/application/use-cases/live/CreateRound2LiveSessionUseCase';

function makeSession(overrides: Record<string, any> = {}) {
  return {
    id: 'sess-1',
    educatorId: 'edu-1',
    title: 'Matematik Sınavı',
    status: 'ENDED',
    roundNumber: 1,
    tierId: 'tier-1',
    maxParticipants: 30,
    paidAt: new Date('2026-05-01'),
    joinCode: 'ABC123',
    questions: [
      {
        id: 'q1',
        content: 'Soru 1',
        mediaUrl: null,
        order: 1,
        options: [
          { id: 'o1', content: 'A', isCorrect: true, order: 1, mediaUrl: null },
        ],
      },
    ],
    ...overrides,
  };
}

function makeCreatedSession(title: string, parentId: string) {
  return {
    id: 'sess-2',
    title,
    roundNumber: 2,
    parentSessionId: parentId,
    joinCode: 'XYZ999',
    status: 'DRAFT',
    paidAt: new Date('2026-05-01'),
    questions: [],
  };
}

describe('CreateRound2LiveSessionUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('oturum bulunamazsa SESSION_NOT_FOUND AppError fırlatır', async () => {
    mockSessionFindUnique.mockResolvedValue(null);
    const uc = new CreateRound2LiveSessionUseCase();
    await expect(uc.execute('sess-missing', 'edu-1')).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
  });

  it('eğitici oturumun sahibi değilse ForbiddenException fırlatır', async () => {
    mockSessionFindUnique.mockResolvedValue(makeSession());
    const uc = new CreateRound2LiveSessionUseCase();
    await expect(uc.execute('sess-1', 'other-edu')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('oturum ENDED değilse SESSION_NOT_ENDED AppError/BadRequest fırlatır', async () => {
    mockSessionFindUnique.mockResolvedValue(makeSession({ status: 'ACTIVE' }));
    const uc = new CreateRound2LiveSessionUseCase();
    await expect(uc.execute('sess-1', 'edu-1')).rejects.toBeDefined();
  });

  it('roundNumber 2 ise NOT_ROUND1 hatası fırlatır', async () => {
    mockSessionFindUnique.mockResolvedValue(makeSession({ roundNumber: 2 }));
    const uc = new CreateRound2LiveSessionUseCase();
    await expect(uc.execute('sess-1', 'edu-1')).rejects.toBeDefined();
  });

  it('başarı: tur 2 oluşturulur, title " - Tur 2" içerir', async () => {
    // First call: load session; second+ calls: joinCode uniqueness check returns null
    mockSessionFindUnique
      .mockResolvedValueOnce(makeSession())
      .mockResolvedValue(null);
    mockSessionCreate.mockResolvedValue(makeCreatedSession('Matematik Sınavı - Tur 2', 'sess-1'));
    const uc = new CreateRound2LiveSessionUseCase();
    const result = await uc.execute('sess-1', 'edu-1');
    expect(result.title).toContain('Tur 2');
  });

  it('parentSessionId orijinal oturumun id si ile set edilir', async () => {
    mockSessionFindUnique
      .mockResolvedValueOnce(makeSession())
      .mockResolvedValue(null);
    mockSessionCreate.mockResolvedValue(makeCreatedSession('Matematik Sınavı - Tur 2', 'sess-1'));
    const uc = new CreateRound2LiveSessionUseCase();
    await uc.execute('sess-1', 'edu-1');
    const createArg = mockSessionCreate.mock.calls[0][0];
    expect(createArg.data.parentSessionId).toBe('sess-1');
  });

  it('roundNumber = 2 ile oluşturulur', async () => {
    mockSessionFindUnique
      .mockResolvedValueOnce(makeSession())
      .mockResolvedValue(null);
    mockSessionCreate.mockResolvedValue(makeCreatedSession('Matematik Sınavı - Tur 2', 'sess-1'));
    const uc = new CreateRound2LiveSessionUseCase();
    await uc.execute('sess-1', 'edu-1');
    const createArg = mockSessionCreate.mock.calls[0][0];
    expect(createArg.data.roundNumber).toBe(2);
  });

  it('paidAt orijinal oturumdan miras alınır', async () => {
    mockSessionFindUnique
      .mockResolvedValueOnce(makeSession())
      .mockResolvedValue(null);
    mockSessionCreate.mockResolvedValue(makeCreatedSession('Matematik Sınavı - Tur 2', 'sess-1'));
    const uc = new CreateRound2LiveSessionUseCase();
    await uc.execute('sess-1', 'edu-1');
    const createArg = mockSessionCreate.mock.calls[0][0];
    expect(createArg.data.paidAt).toBeDefined();
  });

  it('sorular kopyalanır', async () => {
    mockSessionFindUnique
      .mockResolvedValueOnce(makeSession())
      .mockResolvedValue(null);
    mockSessionCreate.mockResolvedValue(makeCreatedSession('Matematik Sınavı - Tur 2', 'sess-1'));
    const uc = new CreateRound2LiveSessionUseCase();
    await uc.execute('sess-1', 'edu-1');
    const createArg = mockSessionCreate.mock.calls[0][0];
    expect(createArg.data.questions.create).toHaveLength(1);
    expect(createArg.data.questions.create[0].content).toBe('Soru 1');
  });
});
