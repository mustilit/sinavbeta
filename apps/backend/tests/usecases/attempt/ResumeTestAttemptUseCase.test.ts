/**
 * ResumeTestAttemptUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - attemptId/userId eksik → INVALID_INPUT
 * - Attempt bulunamazsa → ATTEMPT_NOT_FOUND
 * - Attempt başka kullanıcıya ait → NOT_OWNER
 * - EXPIRED attempt → ALREADY_EXPIRED
 * - IN_PROGRESS attempt → NOT_PAUSED
 * - SUBMITTED attempt → NOT_PAUSED
 * - PAUSED attempt → IN_PROGRESS döner, lastResumedAt güncellenir
 */

const mockFindUnique = jest.fn();
const mockUpdate = jest.fn();

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {},
}));

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ResumeTestAttemptUseCase } from '../../../src/application/use-cases/attempt/ResumeTestAttemptUseCase';

function makePrisma() {
  return {
    testAttempt: {
      findUnique: mockFindUnique,
      update: mockUpdate,
    },
  } as any;
}

function makePausedAttempt(overrides: Record<string, any> = {}) {
  return {
    id: 'att-1',
    testId: 'test-1',
    candidateId: 'u1',
    status: 'PAUSED',
    remainingSec: 1800,
    ...overrides,
  };
}

describe('ResumeTestAttemptUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindUnique.mockResolvedValue(makePausedAttempt());
    mockUpdate.mockResolvedValue({ status: 'IN_PROGRESS', remainingSec: 1800 });
  });

  it('attemptId eksik ise BadRequestException fırlatır', async () => {
    const uc = new ResumeTestAttemptUseCase(makePrisma());
    await expect(uc.execute('', 'u1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('userId eksik ise BadRequestException fırlatır', async () => {
    const uc = new ResumeTestAttemptUseCase(makePrisma());
    await expect(uc.execute('att-1', '')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('attempt bulunamazsa NotFoundException fırlatır', async () => {
    mockFindUnique.mockResolvedValue(null);
    const uc = new ResumeTestAttemptUseCase(makePrisma());
    await expect(uc.execute('att-missing', 'u1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('attempt başka kullanıcıya ait ise ForbiddenException fırlatır', async () => {
    mockFindUnique.mockResolvedValue(makePausedAttempt({ candidateId: 'other-user' }));
    const uc = new ResumeTestAttemptUseCase(makePrisma());
    await expect(uc.execute('att-1', 'u1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('EXPIRED attempt ise ALREADY_EXPIRED kodu ile BadRequestException fırlatır', async () => {
    mockFindUnique.mockResolvedValue(makePausedAttempt({ status: 'EXPIRED' }));
    const uc = new ResumeTestAttemptUseCase(makePrisma());
    await expect(uc.execute('att-1', 'u1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ALREADY_EXPIRED' }),
    });
  });

  it('IN_PROGRESS attempt ise NOT_PAUSED kodu ile BadRequestException fırlatır', async () => {
    mockFindUnique.mockResolvedValue(makePausedAttempt({ status: 'IN_PROGRESS' }));
    const uc = new ResumeTestAttemptUseCase(makePrisma());
    await expect(uc.execute('att-1', 'u1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'NOT_PAUSED' }),
    });
  });

  it('SUBMITTED attempt ise NOT_PAUSED kodu ile BadRequestException fırlatır', async () => {
    mockFindUnique.mockResolvedValue(makePausedAttempt({ status: 'SUBMITTED' }));
    const uc = new ResumeTestAttemptUseCase(makePrisma());
    await expect(uc.execute('att-1', 'u1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'NOT_PAUSED' }),
    });
  });

  it('PAUSED attempt IN_PROGRESS e geçer, status döner', async () => {
    const uc = new ResumeTestAttemptUseCase(makePrisma());
    const result = await uc.execute('att-1', 'u1');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'att-1' },
        data: expect.objectContaining({ status: 'IN_PROGRESS' }),
      }),
    );
    expect(result.status).toBe('IN_PROGRESS');
  });

  it('lastResumedAt güncelleme datasına eklenir', async () => {
    const uc = new ResumeTestAttemptUseCase(makePrisma());
    await uc.execute('att-1', 'u1');
    const callArg = mockUpdate.mock.calls[0][0];
    expect(callArg.data).toHaveProperty('lastResumedAt');
    expect(callArg.data.lastResumedAt).toBeInstanceOf(Date);
  });
});
