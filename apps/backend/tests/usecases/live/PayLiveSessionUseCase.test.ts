/**
 * PayLiveSessionUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Oturum bulunamazsa → SESSION_NOT_FOUND
 * - Eğitici değilse → ForbiddenException
 * - Zaten ödenmişse → ALREADY_PAID
 * - ENDED oturumda → SESSION_ENDED
 * - Başarı: paidAt güncellenir
 */

const mockSessionFindUnique = jest.fn();
const mockSessionUpdate = jest.fn();

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    liveSession: {
      findUnique: (...args: any[]) => mockSessionFindUnique(...args),
      update: (...args: any[]) => mockSessionUpdate(...args),
    },
  },
}));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PayLiveSessionUseCase } from '../../../src/application/use-cases/live/PayLiveSessionUseCase';

function makeSession(overrides: Record<string, any> = {}) {
  return {
    id: 'sess-1',
    educatorId: 'edu-1',
    status: 'DRAFT',
    paidAt: null,
    ...overrides,
  };
}

describe('PayLiveSessionUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSessionFindUnique.mockResolvedValue(makeSession());
    mockSessionUpdate.mockResolvedValue({ ...makeSession(), paidAt: new Date() });
  });

  it('oturum bulunamazsa SESSION_NOT_FOUND AppError fırlatır', async () => {
    mockSessionFindUnique.mockResolvedValue(null);
    const uc = new PayLiveSessionUseCase();
    await expect(uc.execute('sess-missing', 'edu-1')).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
  });

  it('eğitici oturumun sahibi değilse ForbiddenException fırlatır', async () => {
    const uc = new PayLiveSessionUseCase();
    await expect(uc.execute('sess-1', 'other-edu')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('oturum zaten ödenmişse ALREADY_PAID BadRequestException fırlatır', async () => {
    mockSessionFindUnique.mockResolvedValue(makeSession({ paidAt: new Date() }));
    const uc = new PayLiveSessionUseCase();
    await expect(uc.execute('sess-1', 'edu-1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ALREADY_PAID' }),
    });
  });

  it('ENDED oturumda SESSION_ENDED BadRequestException fırlatır', async () => {
    mockSessionFindUnique.mockResolvedValue(makeSession({ status: 'ENDED' }));
    const uc = new PayLiveSessionUseCase();
    await expect(uc.execute('sess-1', 'edu-1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SESSION_ENDED' }),
    });
  });

  it('başarı: paidAt güncellenir', async () => {
    const uc = new PayLiveSessionUseCase();
    await uc.execute('sess-1', 'edu-1');
    expect(mockSessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sess-1' },
        data: expect.objectContaining({ paidAt: expect.any(Date) }),
      }),
    );
  });
});
