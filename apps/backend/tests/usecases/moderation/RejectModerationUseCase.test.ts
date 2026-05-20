/**
 * RejectModerationUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - ModerationResult.status=REJECTED + reviewedAt set edilir
 * - Mevcut violation CONFIRMED yapılır
 * - Violation yoksa yeni oluşturulur (CONFIRMED statüsünde)
 * - ExamQuestion.moderationStatus=REJECTED ayarlanır
 * - RecomputeEducatorRiskScore çağrılır
 * - Zaten REJECTED ise idempotent
 * - Result bulunamazsa MODERATION_RESULT_NOT_FOUND
 */

// Prisma mock
const mockResultFindUnique = jest.fn();
const mockPrismaTransaction = jest.fn();

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    moderationResult: {
      findUnique: (...args: any[]) => mockResultFindUnique(...args),
    },
    $transaction: (...args: any[]) => mockPrismaTransaction(...args),
  },
}));

// logger mock
jest.mock('../../../src/infrastructure/logger/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

// RecomputeEducatorRiskScoreUseCase mock
const mockRecomputeExecute = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../src/application/use-cases/moderation/RecomputeEducatorRiskScoreUseCase', () => ({
  RecomputeEducatorRiskScoreUseCase: jest.fn().mockImplementation(() => ({
    execute: mockRecomputeExecute,
  })),
}));

import { RejectModerationUseCase } from '../../../src/application/use-cases/moderation/RejectModerationUseCase';
import { IModerationViolationRepository } from '../../../src/domain/interfaces/IModerationViolationRepository';
import { IEducatorRiskScoreRepository } from '../../../src/domain/interfaces/IEducatorRiskScoreRepository';
import { IModerationActionRepository } from '../../../src/domain/interfaces/IModerationActionRepository';
import { AppError } from '../../../src/application/errors/AppError';

// ── Yardımcı: repository mock fabrikaları ─────────────────────────────────────

function makeViolationRepo(): IModerationViolationRepository {
  return {
    create: jest.fn().mockResolvedValue({ id: 'v-1' }),
    findOpenByUser: jest.fn().mockResolvedValue([]),
    findById: jest.fn(),
    findByUser: jest.fn(),
    findByModerationResult: jest.fn(),
    updateStatus: jest.fn(),
    markResolved: jest.fn(),
  };
}

function makeRiskRepo(): IEducatorRiskScoreRepository {
  return {
    upsert: jest.fn().mockResolvedValue({ id: 'rs-1' }),
    findByUser: jest.fn(),
    listRisky: jest.fn(),
    findRecentlyViolated: jest.fn(),
  };
}

function makeActionRepo(): IModerationActionRepository {
  return {
    create: jest.fn().mockResolvedValue({ id: 'act-1' }),
    findById: jest.fn(),
    findByUser: jest.fn(),
    findActivesuspension: jest.fn(),
  };
}

// ── Yardımcı: result fixture ──────────────────────────────────────────────────

function makeResultRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mr-1',
    tenantId: 'tenant-1',
    userId: 'edu-1',
    entityType: 'ExamQuestion',
    entityId: 'q-1',
    status: 'PENDING_REVIEW',
    categories: ['HATE_SPEECH'],
    score: 0.8,
    ...overrides,
  };
}

// ── Yardımcı: transaction mock ─────────────────────────────────────────────────

function makeTxMock(existingViolation: { id: string } | null = { id: 'v-existing' }) {
  return {
    moderationResult: { update: jest.fn().mockResolvedValue({}) },
    moderationViolation: {
      findFirst: jest.fn().mockResolvedValue(existingViolation),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({ id: 'v-new' }),
    },
    examQuestion: { update: jest.fn().mockResolvedValue({}) },
  };
}

// ── Testler ────────────────────────────────────────────────────────────────────

describe('RejectModerationUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Temel başarı akışı ────────────────────────────────────────────────────

  it('ModerationResult.status=REJECTED + reviewedAt set edilir', async () => {
    // Arrange
    mockResultFindUnique.mockResolvedValue(makeResultRecord());
    const txMock = makeTxMock();
    mockPrismaTransaction.mockImplementation(async (fn: any) => fn(txMock));
    const uc = new RejectModerationUseCase(makeViolationRepo(), makeRiskRepo(), makeActionRepo());
    // Act
    await uc.execute({ resultId: 'mr-1', reviewerId: 'admin-1' });
    // Assert
    expect(txMock.moderationResult.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'REJECTED',
          reviewedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('ExamQuestion.moderationStatus=REJECTED ayarlanır', async () => {
    // Arrange
    mockResultFindUnique.mockResolvedValue(makeResultRecord());
    const txMock = makeTxMock();
    mockPrismaTransaction.mockImplementation(async (fn: any) => fn(txMock));
    const uc = new RejectModerationUseCase(makeViolationRepo(), makeRiskRepo(), makeActionRepo());
    // Act
    await uc.execute({ resultId: 'mr-1', reviewerId: 'admin-1' });
    // Assert
    expect(txMock.examQuestion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'q-1' },
        data: expect.objectContaining({ moderationStatus: 'REJECTED' }),
      }),
    );
  });

  // ── Violation güncelleme ──────────────────────────────────────────────────

  it('mevcut violation varsa CONFIRMED statüsüne güncellenir', async () => {
    // Arrange
    mockResultFindUnique.mockResolvedValue(makeResultRecord());
    const txMock = makeTxMock({ id: 'v-existing' });
    mockPrismaTransaction.mockImplementation(async (fn: any) => fn(txMock));
    const uc = new RejectModerationUseCase(makeViolationRepo(), makeRiskRepo(), makeActionRepo());
    // Act
    await uc.execute({ resultId: 'mr-1', reviewerId: 'admin-1' });
    // Assert
    expect(txMock.moderationViolation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'v-existing' },
        data: expect.objectContaining({ status: 'CONFIRMED' }),
      }),
    );
    expect(txMock.moderationViolation.create).not.toHaveBeenCalled();
  });

  it('violation yoksa yeni CONFIRMED violation oluşturulur', async () => {
    // Arrange
    mockResultFindUnique.mockResolvedValue(makeResultRecord());
    const txMock = makeTxMock(null); // violation yok
    mockPrismaTransaction.mockImplementation(async (fn: any) => fn(txMock));
    const uc = new RejectModerationUseCase(makeViolationRepo(), makeRiskRepo(), makeActionRepo());
    // Act
    await uc.execute({ resultId: 'mr-1', reviewerId: 'admin-1' });
    // Assert
    expect(txMock.moderationViolation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CONFIRMED' }),
      }),
    );
    expect(txMock.moderationViolation.update).not.toHaveBeenCalled();
  });

  // ── RecomputeEducatorRiskScore ─────────────────────────────────────────────

  it('reject sonrası RecomputeEducatorRiskScore execute çağrılır', async () => {
    // Arrange
    mockResultFindUnique.mockResolvedValue(makeResultRecord());
    const txMock = makeTxMock();
    mockPrismaTransaction.mockImplementation(async (fn: any) => fn(txMock));
    const uc = new RejectModerationUseCase(makeViolationRepo(), makeRiskRepo(), makeActionRepo());
    // Act
    await uc.execute({ resultId: 'mr-1', reviewerId: 'admin-1' });
    // Assert
    expect(mockRecomputeExecute).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'edu-1', tenantId: 'tenant-1' }),
    );
  });

  // ── İdempotent ────────────────────────────────────────────────────────────

  it('zaten REJECTED olan result için idempotent — transaction başlatılmaz', async () => {
    // Arrange
    mockResultFindUnique.mockResolvedValue(makeResultRecord({ status: 'REJECTED' }));
    const uc = new RejectModerationUseCase(makeViolationRepo(), makeRiskRepo(), makeActionRepo());
    // Act
    await uc.execute({ resultId: 'mr-1', reviewerId: 'admin-1' });
    // Assert
    expect(mockPrismaTransaction).not.toHaveBeenCalled();
    expect(mockRecomputeExecute).not.toHaveBeenCalled();
  });

  // ── Hata senaryoları ─────────────────────────────────────────────────────

  it('result bulunamazsa MODERATION_RESULT_NOT_FOUND fırlatır', async () => {
    // Arrange
    mockResultFindUnique.mockResolvedValue(null);
    const uc = new RejectModerationUseCase(makeViolationRepo(), makeRiskRepo(), makeActionRepo());
    // Act & Assert
    await expect(uc.execute({ resultId: 'yok', reviewerId: 'admin-1' })).rejects.toMatchObject({
      code: 'MODERATION_RESULT_NOT_FOUND',
      status: 404,
    });
  });

  it('result bulunamazsa AppError instance fırlatılır', async () => {
    // Arrange
    mockResultFindUnique.mockResolvedValue(null);
    const uc = new RejectModerationUseCase(makeViolationRepo(), makeRiskRepo(), makeActionRepo());
    // Act & Assert
    await expect(
      uc.execute({ resultId: 'nonexistent', reviewerId: 'admin-1' }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('reviewerNote varsa ModerationResult güncellenmesine dahil edilir', async () => {
    // Arrange
    mockResultFindUnique.mockResolvedValue(makeResultRecord());
    const txMock = makeTxMock();
    mockPrismaTransaction.mockImplementation(async (fn: any) => fn(txMock));
    const uc = new RejectModerationUseCase(makeViolationRepo(), makeRiskRepo(), makeActionRepo());
    // Act
    await uc.execute({ resultId: 'mr-1', reviewerId: 'admin-1', reviewerNote: 'İhlal tespit edildi' });
    // Assert
    expect(txMock.moderationResult.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reviewerNote: 'İhlal tespit edildi' }),
      }),
    );
  });
});
