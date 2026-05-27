/**
 * LogAttemptAnomalyUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - attemptId/candidateId eksik → INVALID_INPUT
 * - type eksik → INVALID_TYPE
 * - Attempt bulunamazsa → ATTEMPT_NOT_FOUND
 * - Başka kullanıcının attempt'i → NOT_ATTEMPT_OWNER
 * - Aynı tipten son 2sn içinde event varsa → throttled=true döner
 * - Yeni event → create çağrılır, throttled=false
 * - Bilinmeyen type → 'OTHER' olarak normalize edilir
 * - Payload 4096 bayt sınırı aşılırsa truncated edilir
 */

const mockFindUnique = jest.fn();
const mockAnomalyFindFirst = jest.fn();
const mockAnomalyCreate = jest.fn();

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {},
}));

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { LogAttemptAnomalyUseCase } from '../../../src/application/use-cases/attempt/LogAttemptAnomalyUseCase';

function makePrisma() {
  return {
    testAttempt: { findUnique: mockFindUnique },
    attemptAnomalyEvent: {
      findFirst: mockAnomalyFindFirst,
      create: mockAnomalyCreate,
    },
  } as any;
}

function makeAttempt(overrides: Record<string, any> = {}) {
  return { id: 'att-1', candidateId: 'u1', status: 'IN_PROGRESS', ...overrides };
}

describe('LogAttemptAnomalyUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindUnique.mockResolvedValue(makeAttempt());
    mockAnomalyFindFirst.mockResolvedValue(null);
    mockAnomalyCreate.mockResolvedValue({ id: 'ev-1' });
  });

  it('attemptId eksik ise INVALID_INPUT BadRequestException fırlatır', async () => {
    const uc = new LogAttemptAnomalyUseCase(makePrisma());
    await expect(uc.execute('', 'u1', 'TAB_SWITCH', {})).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVALID_INPUT' }),
    });
  });

  it('candidateId eksik ise INVALID_INPUT BadRequestException fırlatır', async () => {
    const uc = new LogAttemptAnomalyUseCase(makePrisma());
    await expect(uc.execute('att-1', '', 'TAB_SWITCH', {})).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVALID_INPUT' }),
    });
  });

  it('type eksik ise INVALID_TYPE BadRequestException fırlatır', async () => {
    const uc = new LogAttemptAnomalyUseCase(makePrisma());
    await expect(uc.execute('att-1', 'u1', '', {})).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVALID_TYPE' }),
    });
  });

  it('attempt bulunamazsa NotFoundException fırlatır', async () => {
    mockFindUnique.mockResolvedValue(null);
    const uc = new LogAttemptAnomalyUseCase(makePrisma());
    await expect(uc.execute('att-missing', 'u1', 'TAB_SWITCH', {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it('başka kullanıcının attempt i → ForbiddenException fırlatır', async () => {
    mockFindUnique.mockResolvedValue(makeAttempt({ candidateId: 'other-user' }));
    const uc = new LogAttemptAnomalyUseCase(makePrisma());
    await expect(uc.execute('att-1', 'u1', 'TAB_SWITCH', {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('aynı tipten son 2sn içinde event varsa throttled=true döner, create çağrılmaz', async () => {
    mockAnomalyFindFirst.mockResolvedValue({ id: 'ev-existing' });
    const uc = new LogAttemptAnomalyUseCase(makePrisma());
    const result = await uc.execute('att-1', 'u1', 'TAB_SWITCH', {});
    expect(result.throttled).toBe(true);
    expect(mockAnomalyCreate).not.toHaveBeenCalled();
  });

  it('yeni event → create çağrılır, throttled=false döner', async () => {
    const uc = new LogAttemptAnomalyUseCase(makePrisma());
    const result = await uc.execute('att-1', 'u1', 'TAB_SWITCH', { url: 'test.com' });
    expect(mockAnomalyCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'TAB_SWITCH' }) }),
    );
    expect(result.throttled).toBe(false);
  });

  it('bilinmeyen type → OTHER olarak normalize edilir', async () => {
    const uc = new LogAttemptAnomalyUseCase(makePrisma());
    await uc.execute('att-1', 'u1', 'UNKNOWN_TYPE_XYZ', {});
    expect(mockAnomalyCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'OTHER' }) }),
    );
  });

  it('geçerli type listesi (TAB_SWITCH, COPY_ATTEMPT vb.) normalize edilmez', async () => {
    const uc = new LogAttemptAnomalyUseCase(makePrisma());
    await uc.execute('att-1', 'u1', 'COPY_ATTEMPT', {});
    expect(mockAnomalyCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'COPY_ATTEMPT' }) }),
    );
  });

  it('payload 4096 bayt sınırı aşılırsa truncated edilir', async () => {
    const largePayload = { data: 'x'.repeat(5000) };
    const uc = new LogAttemptAnomalyUseCase(makePrisma());
    await uc.execute('att-1', 'u1', 'TAB_SWITCH', largePayload);
    const createdPayload = mockAnomalyCreate.mock.calls[0][0].data.payload;
    expect(createdPayload?.truncated).toBe(true);
  });

  it('payload null ise safePayload null kaydedilir', async () => {
    const uc = new LogAttemptAnomalyUseCase(makePrisma());
    await uc.execute('att-1', 'u1', 'TAB_SWITCH', null);
    const createdPayload = mockAnomalyCreate.mock.calls[0][0].data.payload;
    expect(createdPayload).toBeNull();
  });
});
