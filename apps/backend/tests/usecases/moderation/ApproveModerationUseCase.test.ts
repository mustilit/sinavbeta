/**
 * ApproveModerationUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - ModerationResult.status=APPROVED + reviewedAt set edilir
 * - Violation varsa DISMISSED yapılır
 * - ExamQuestion.moderationStatus=APPROVED ayarlanır
 * - Zaten APPROVED ise idempotent (tekrar işlem yapılmaz)
 * - Result bulunamazsa MODERATION_RESULT_NOT_FOUND hatası
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

import { ApproveModerationUseCase } from '../../../src/application/use-cases/moderation/ApproveModerationUseCase';
import { AppError } from '../../../src/application/errors/AppError';

// ── Yardımcı: transaction mock ────────────────────────────────────────────────

function makeTxMock() {
  return {
    moderationResult: { update: jest.fn().mockResolvedValue({}) },
    moderationViolation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    examQuestion: { update: jest.fn().mockResolvedValue({}) },
  };
}

// ── Testler ────────────────────────────────────────────────────────────────────

describe('ApproveModerationUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Temel başarı akışı ────────────────────────────────────────────────────

  it('ModerationResult.status=APPROVED + reviewedAt set edilir', async () => {
    // Arrange
    mockResultFindUnique.mockResolvedValue({
      id: 'mr-1',
      entityType: 'ExamQuestion',
      entityId: 'q-1',
      status: 'PENDING_REVIEW',
    });
    const txMock = makeTxMock();
    mockPrismaTransaction.mockImplementation(async (fn: any) => fn(txMock));
    const uc = new ApproveModerationUseCase();
    // Act
    await uc.execute({ resultId: 'mr-1', reviewerId: 'admin-1' });
    // Assert
    expect(txMock.moderationResult.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'APPROVED',
          reviewedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('Violation DISMISSED yapılır (updateMany)', async () => {
    // Arrange
    mockResultFindUnique.mockResolvedValue({
      id: 'mr-1',
      entityType: 'ExamQuestion',
      entityId: 'q-1',
      status: 'PENDING_REVIEW',
    });
    const txMock = makeTxMock();
    mockPrismaTransaction.mockImplementation(async (fn: any) => fn(txMock));
    const uc = new ApproveModerationUseCase();
    // Act
    await uc.execute({ resultId: 'mr-1', reviewerId: 'admin-1' });
    // Assert
    expect(txMock.moderationViolation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { moderationResultId: 'mr-1' },
        data: expect.objectContaining({ status: 'DISMISSED' }),
      }),
    );
  });

  it('ExamQuestion.moderationStatus=APPROVED ayarlanır', async () => {
    // Arrange
    mockResultFindUnique.mockResolvedValue({
      id: 'mr-1',
      entityType: 'ExamQuestion',
      entityId: 'q-1',
      status: 'PENDING_REVIEW',
    });
    const txMock = makeTxMock();
    mockPrismaTransaction.mockImplementation(async (fn: any) => fn(txMock));
    const uc = new ApproveModerationUseCase();
    // Act
    await uc.execute({ resultId: 'mr-1', reviewerId: 'admin-1', reviewerNote: 'Temiz' });
    // Assert
    expect(txMock.examQuestion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'q-1' },
        data: expect.objectContaining({ moderationStatus: 'APPROVED' }),
      }),
    );
  });

  it('reviewerNote varsa ModerationResult güncellenmesine dahil edilir', async () => {
    // Arrange
    mockResultFindUnique.mockResolvedValue({
      id: 'mr-1',
      entityType: 'ExamQuestion',
      entityId: 'q-1',
      status: 'PENDING_REVIEW',
    });
    const txMock = makeTxMock();
    mockPrismaTransaction.mockImplementation(async (fn: any) => fn(txMock));
    const uc = new ApproveModerationUseCase();
    // Act
    await uc.execute({ resultId: 'mr-1', reviewerId: 'admin-1', reviewerNote: 'Kabul' });
    // Assert
    expect(txMock.moderationResult.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reviewerNote: 'Kabul' }),
      }),
    );
  });

  // ── ExamQuestion dışında entityType ──────────────────────────────────────

  it('entityType ExamQuestion değilse examQuestion.update çağrılmaz', async () => {
    // Arrange — entityType = ExamTest
    mockResultFindUnique.mockResolvedValue({
      id: 'mr-1',
      entityType: 'ExamTest',
      entityId: 'test-1',
      status: 'PENDING_REVIEW',
    });
    const txMock = makeTxMock();
    mockPrismaTransaction.mockImplementation(async (fn: any) => fn(txMock));
    const uc = new ApproveModerationUseCase();
    // Act
    await uc.execute({ resultId: 'mr-1', reviewerId: 'admin-1' });
    // Assert
    expect(txMock.examQuestion.update).not.toHaveBeenCalled();
  });

  // ── İdempotent davranış ───────────────────────────────────────────────────

  it('zaten APPROVED olan result için transaction başlatılmaz (idempotent)', async () => {
    // Arrange
    mockResultFindUnique.mockResolvedValue({
      id: 'mr-already',
      entityType: 'ExamQuestion',
      entityId: 'q-1',
      status: 'APPROVED',
    });
    const uc = new ApproveModerationUseCase();
    // Act
    await uc.execute({ resultId: 'mr-already', reviewerId: 'admin-1' });
    // Assert — zaten approve, transaction çağrılmadı
    expect(mockPrismaTransaction).not.toHaveBeenCalled();
  });

  // ── Hata senaryoları ─────────────────────────────────────────────────────

  it('result bulunamazsa MODERATION_RESULT_NOT_FOUND hatası fırlatır', async () => {
    // Arrange
    mockResultFindUnique.mockResolvedValue(null);
    const uc = new ApproveModerationUseCase();
    // Act & Assert
    await expect(uc.execute({ resultId: 'yok', reviewerId: 'admin-1' })).rejects.toMatchObject({
      code: 'MODERATION_RESULT_NOT_FOUND',
      status: 404,
    });
  });

  it('result bulunamazsa AppError instance fırlatılır', async () => {
    // Arrange
    mockResultFindUnique.mockResolvedValue(null);
    const uc = new ApproveModerationUseCase();
    // Act & Assert
    await expect(uc.execute({ resultId: 'nonexistent', reviewerId: 'admin-1' })).rejects.toBeInstanceOf(AppError);
  });
});
