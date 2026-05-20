/**
 * ApplyModerationActionUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - WARN → sadece ModerationAction kaydı, User'a dokunulmaz
 * - ACCOUNT_SUSPENDED + durationDays=7 → User.suspendedUntil = now+7g, expiresAt set
 * - ACCOUNT_BANNED → User.isBanned=true
 * - reason < 20 karakter → AppError('REASON_TOO_SHORT', ..., 400)
 * - User bulunamazsa AppError('USER_NOT_FOUND', ..., 404)
 */

// Prisma mock
const mockUserFindUnique = jest.fn();
const mockUserUpdate = jest.fn();

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...args: any[]) => mockUserFindUnique(...args),
      update: (...args: any[]) => mockUserUpdate(...args),
    },
  },
}));

// logger mock
jest.mock('../../../src/infrastructure/logger/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import { ApplyModerationActionUseCase, ApplyModerationActionParams } from '../../../src/application/use-cases/moderation/ApplyModerationActionUseCase';
import { IModerationActionRepository, ModerationActionRecord } from '../../../src/domain/interfaces/IModerationActionRepository';
import { AppError } from '../../../src/application/errors/AppError';

// ── Yardımcı: actionRepo mock ─────────────────────────────────────────────────

function makeActionRepo(actionOverrides: Partial<ModerationActionRecord> = {}): IModerationActionRepository {
  const baseAction: ModerationActionRecord = {
    id: 'act-1',
    tenantId: 'tenant-1',
    userId: 'edu-1',
    actorId: 'admin-1',
    actionType: 'WARN',
    reason: 'Test gerekçesi (yirmi karakter)',
    metadata: {},
    expiresAt: null,
    createdAt: new Date(),
    ...actionOverrides,
  };
  return {
    create: jest.fn().mockResolvedValue(baseAction),
    findById: jest.fn(),
    findByUser: jest.fn(),
    findActivesuspension: jest.fn(),
  };
}

// ── Yardımcı: standart params ────────────────────────────────────────────────

function makeParams(overrides: Partial<ApplyModerationActionParams> = {}): ApplyModerationActionParams {
  return {
    tenantId: 'tenant-1',
    userId: 'edu-1',
    actorId: 'admin-1',
    actionType: 'WARN',
    reason: 'Bu gerekçe yirmi karakterden uzundur',
    durationDays: null,
    violationId: null,
    ...overrides,
  };
}

// ── Testler ────────────────────────────────────────────────────────────────────

describe('ApplyModerationActionUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Varsayılan: aktif user
    mockUserFindUnique.mockResolvedValue({
      id: 'edu-1',
      isBanned: false,
      suspendedUntil: null,
    });
  });

  // ── Validation hatası ────────────────────────────────────────────────────

  it('reason 20 karakterden kısa ise REASON_TOO_SHORT hatası fırlatır', async () => {
    // Arrange
    const actionRepo = makeActionRepo();
    const uc = new ApplyModerationActionUseCase(actionRepo);
    const params = makeParams({ reason: 'Kısa gerekçe' }); // 13 karakter
    // Act & Assert
    await expect(uc.execute(params)).rejects.toMatchObject({
      code: 'REASON_TOO_SHORT',
      status: 400,
    });
  });

  it('reason boş string ise REASON_TOO_SHORT hatası fırlatır', async () => {
    // Arrange
    const uc = new ApplyModerationActionUseCase(makeActionRepo());
    const params = makeParams({ reason: '' });
    // Act & Assert
    await expect(uc.execute(params)).rejects.toBeInstanceOf(AppError);
  });

  it('reason tam 20 karakter ise hata fırlatmaz', async () => {
    // Arrange
    const uc = new ApplyModerationActionUseCase(makeActionRepo());
    // "12345678901234567890" = 20 karakter — trim().length = 20 değil, < 20 koşulu
    // Kaynak kodu: `params.reason.trim().length < 20` → 20 karakter geçerliyse hata yok
    const params = makeParams({ reason: '12345678901234567890' }); // 20 karakter
    // Act & Assert — hata fırlatmamalı
    await expect(uc.execute(params)).resolves.toBeDefined();
  });

  // ── User bulunamama ──────────────────────────────────────────────────────

  it('user bulunamazsa USER_NOT_FOUND hatası fırlatır', async () => {
    // Arrange
    mockUserFindUnique.mockResolvedValue(null);
    const uc = new ApplyModerationActionUseCase(makeActionRepo());
    const params = makeParams();
    // Act & Assert
    await expect(uc.execute(params)).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
      status: 404,
    });
  });

  // ── WARN aksiyonu ────────────────────────────────────────────────────────

  it('WARN aksiyonu sadece ModerationAction kaydeder, User güncellenmez', async () => {
    // Arrange
    const actionRepo = makeActionRepo({ actionType: 'WARN' });
    const uc = new ApplyModerationActionUseCase(actionRepo);
    const params = makeParams({ actionType: 'WARN' });
    // Act
    const result = await uc.execute(params);
    // Assert
    expect(actionRepo.create).toHaveBeenCalledTimes(1);
    expect(mockUserUpdate).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('WARN aksiyonu dönen action record actionType=WARN içerir', async () => {
    // Arrange
    const actionRepo = makeActionRepo({ actionType: 'WARN' });
    const uc = new ApplyModerationActionUseCase(actionRepo);
    // Act
    const result = await uc.execute(makeParams({ actionType: 'WARN' }));
    // Assert
    expect(result.actionType).toBe('WARN');
  });

  // ── ACCOUNT_SUSPENDED aksiyonu ────────────────────────────────────────────

  it('ACCOUNT_SUSPENDED + durationDays=7 → User.suspendedUntil now+7g olarak set edilir', async () => {
    // Arrange
    const before = Date.now();
    const actionRepo = makeActionRepo({ actionType: 'ACCOUNT_SUSPENDED', expiresAt: new Date(before + 7 * 86400000) });
    const uc = new ApplyModerationActionUseCase(actionRepo);
    const params = makeParams({ actionType: 'ACCOUNT_SUSPENDED', durationDays: 7 });
    // Act
    await uc.execute(params);
    // Assert
    const updateCall = mockUserUpdate.mock.calls[0][0];
    expect(updateCall.where.id).toBe('edu-1');
    const suspendedUntil: Date = updateCall.data.suspendedUntil;
    expect(suspendedUntil).toBeInstanceOf(Date);
    // 7 gün = 604800000ms; ±5s tolerans
    expect(suspendedUntil.getTime()).toBeGreaterThan(before + 7 * 86400000 - 5000);
    expect(suspendedUntil.getTime()).toBeLessThan(before + 7 * 86400000 + 5000);
  });

  it('ACCOUNT_SUSPENDED → actionRepo.create expiresAt içerir', async () => {
    // Arrange
    const actionRepo = makeActionRepo();
    const uc = new ApplyModerationActionUseCase(actionRepo);
    const params = makeParams({ actionType: 'ACCOUNT_SUSPENDED', durationDays: 3 });
    // Act
    await uc.execute(params);
    // Assert
    const createArgs = (actionRepo.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.expiresAt).toBeInstanceOf(Date);
  });

  it('ACCOUNT_SUSPENDED + durationDays null → expiresAt null', async () => {
    // Arrange
    const actionRepo = makeActionRepo();
    const uc = new ApplyModerationActionUseCase(actionRepo);
    const params = makeParams({ actionType: 'ACCOUNT_SUSPENDED', durationDays: null });
    // Act
    await uc.execute(params);
    // Assert
    const createArgs = (actionRepo.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.expiresAt).toBeNull();
  });

  // ── ACCOUNT_BANNED aksiyonu ──────────────────────────────────────────────

  it('ACCOUNT_BANNED → User.isBanned=true ayarlanır', async () => {
    // Arrange
    const actionRepo = makeActionRepo({ actionType: 'ACCOUNT_BANNED' });
    const uc = new ApplyModerationActionUseCase(actionRepo);
    const params = makeParams({ actionType: 'ACCOUNT_BANNED' });
    // Act
    await uc.execute(params);
    // Assert
    const updateCall = mockUserUpdate.mock.calls[0][0];
    expect(updateCall.data.isBanned).toBe(true);
  });

  it('ACCOUNT_BANNED → actionRepo.create çağrılır', async () => {
    // Arrange
    const actionRepo = makeActionRepo({ actionType: 'ACCOUNT_BANNED' });
    const uc = new ApplyModerationActionUseCase(actionRepo);
    // Act
    await uc.execute(makeParams({ actionType: 'ACCOUNT_BANNED' }));
    // Assert
    expect(actionRepo.create).toHaveBeenCalledTimes(1);
  });

  // ── CONTENT_REMOVED aksiyonu ─────────────────────────────────────────────

  it('CONTENT_REMOVED → User güncellenmez, sadece aksiyon kaydedilir', async () => {
    // Arrange
    const actionRepo = makeActionRepo({ actionType: 'CONTENT_REMOVED' });
    const uc = new ApplyModerationActionUseCase(actionRepo);
    // Act
    await uc.execute(makeParams({ actionType: 'CONTENT_REMOVED' }));
    // Assert
    expect(actionRepo.create).toHaveBeenCalledTimes(1);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });
});
