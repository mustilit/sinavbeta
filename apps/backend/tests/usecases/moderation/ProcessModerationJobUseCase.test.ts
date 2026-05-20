/**
 * ProcessModerationJobUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - ClaudeTextProvider başarılı → verdict=REJECTED → status=REJECTED, violation oluşur
 * - Claude skoru threshold altı → APPROVED → violation oluşmaz
 * - Provider throw → moderationResult ESCALATED + examQuestion ESCALATED
 * - Hata sonrası return — violation kaydedilmez
 */

// Prisma mock
const mockAdminSettingsFindFirst = jest.fn();
const mockModerationResultUpdate = jest.fn();
const mockExamQuestionUpdateMany = jest.fn();
const mockModerationViolationCreate = jest.fn();
const mockPrismaTransaction = jest.fn();

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    adminSettings: { findFirst: (...args: any[]) => mockAdminSettingsFindFirst(...args) },
    moderationResult: { update: (...args: any[]) => mockModerationResultUpdate(...args) },
    examQuestion: { updateMany: (...args: any[]) => mockExamQuestionUpdateMany(...args) },
    $transaction: (...args: any[]) => mockPrismaTransaction(...args),
  },
}));

// logger mock
jest.mock('../../../src/infrastructure/logger/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

// ClaudeTextProvider mock — gerçek API çağrısı yapmasın
const mockClaudeAnalyze = jest.fn();
jest.mock('../../../src/application/services/content-safety/providers/ClaudeTextProvider', () => ({
  ClaudeTextProvider: jest.fn().mockImplementation(() => ({
    analyze: mockClaudeAnalyze,
  })),
}));

// ClaudeVisionProvider mock
jest.mock('../../../src/application/services/content-safety/providers/ClaudeVisionProvider', () => ({
  ClaudeVisionProvider: jest.fn().mockImplementation(() => ({
    analyze: jest.fn(),
  })),
}));

// RecordModerationViolationUseCase mock — saf Prisma bağımlı iç sınıf
jest.mock('../../../src/application/use-cases/moderation/RecordModerationViolationUseCase', () => ({
  RecordModerationViolationUseCase: jest.fn().mockImplementation(() => ({
    execute: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { ProcessModerationJobUseCase } from '../../../src/application/use-cases/moderation/ProcessModerationJobUseCase';
import { TextModerationJobPayload } from '../../../src/application/services/content-safety/utils/moderationQueue';
import { IModerationViolationRepository } from '../../../src/domain/interfaces/IModerationViolationRepository';
import { IEducatorRiskScoreRepository } from '../../../src/domain/interfaces/IEducatorRiskScoreRepository';
import { IModerationActionRepository } from '../../../src/domain/interfaces/IModerationActionRepository';

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

// ── Job payload fixture ──────────────────────────────────────────────────────

function makeTextPayload(overrides: Partial<TextModerationJobPayload> = {}): TextModerationJobPayload {
  return {
    type: 'text-moderation',
    resultId: 'mr-1',
    entityType: 'ExamQuestion',
    entityId: 'q-1',
    userId: 'edu-1',
    tenantId: 'tenant-1',
    content: 'soru içeriği',
    modelName: 'claude-3-haiku',
    l1Result: { status: 'SUSPECT', categories: ['PROFANITY' as any], matchedTerms: [], maxSeverity: 2 },
    ...overrides,
  };
}

// ── Claude sonuç fixture'ları ─────────────────────────────────────────────────

function makeLayer2Result(verdict: 'APPROVED' | 'REJECTED' | 'SUSPECT', overallScore = 0.5) {
  return {
    verdict,
    scores: { hate: 0, sexual: 0, violence: 0, personalData: 0, spam: 0, overall: overallScore },
    categories: verdict === 'REJECTED' ? ['HATE_SPEECH'] : [],
    reasoning: 'Test reasoning',
    raw: {},
    costUsd: 0.001,
    latencyMs: 500,
    tokensUsed: { input: 100, output: 50 },
  };
}

// ── Testler ────────────────────────────────────────────────────────────────────

describe('ProcessModerationJobUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Varsayılan AdminSettings
    mockAdminSettingsFindFirst.mockResolvedValue({
      id: 1,
      moderationThresholds: { hate: 0.7, sexual: 0.6, violence: 0.7 },
    });
    // Transaction — callback'i çalıştır
    mockPrismaTransaction.mockImplementation(async (fn: any) => {
      const tx = {
        moderationResult: { update: jest.fn().mockResolvedValue({}) },
        examQuestion: { updateMany: jest.fn().mockResolvedValue({}) },
        moderationViolation: { create: jest.fn().mockResolvedValue({ id: 'v-tx-1' }) },
      };
      return fn(tx);
    });
  });

  // ── Başarılı → REJECTED ──────────────────────────────────────────────────

  it('Claude verdict=REJECTED döndüğünde moderationResult REJECTED + violation oluşur', async () => {
    // Arrange
    const claudeResult = makeLayer2Result('REJECTED', 0.9);
    mockClaudeAnalyze.mockResolvedValue(claudeResult);
    const txMock = {
      moderationResult: { update: jest.fn().mockResolvedValue({}) },
      examQuestion: { updateMany: jest.fn().mockResolvedValue({}) },
      moderationViolation: { create: jest.fn().mockResolvedValue({ id: 'v-tx-1' }) },
    };
    mockPrismaTransaction.mockImplementation(async (fn: any) => fn(txMock));
    const uc = new ProcessModerationJobUseCase(makeViolationRepo(), makeRiskRepo(), makeActionRepo());
    // Act
    await uc.execute(makeTextPayload());
    // Assert
    expect(txMock.moderationResult.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'REJECTED' }),
      }),
    );
    expect(txMock.moderationViolation.create).toHaveBeenCalledTimes(1);
  });

  it('Claude verdict=REJECTED → ExamQuestion.moderationStatus=REJECTED ayarlanır', async () => {
    // Arrange
    mockClaudeAnalyze.mockResolvedValue(makeLayer2Result('REJECTED', 0.9));
    const txMock = {
      moderationResult: { update: jest.fn().mockResolvedValue({}) },
      examQuestion: { updateMany: jest.fn().mockResolvedValue({}) },
      moderationViolation: { create: jest.fn().mockResolvedValue({ id: 'v-tx-1' }) },
    };
    mockPrismaTransaction.mockImplementation(async (fn: any) => fn(txMock));
    const uc = new ProcessModerationJobUseCase(makeViolationRepo(), makeRiskRepo(), makeActionRepo());
    // Act
    await uc.execute(makeTextPayload());
    // Assert
    expect(txMock.examQuestion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ moderationStatus: 'REJECTED' }),
      }),
    );
  });

  // ── Eşik altı → APPROVED ─────────────────────────────────────────────────

  it('Claude skoru eşik altı → APPROVED + violation oluşmaz', async () => {
    // Arrange — verdict=APPROVED, overall=0.1
    mockClaudeAnalyze.mockResolvedValue(makeLayer2Result('APPROVED', 0.1));
    const txMock = {
      moderationResult: { update: jest.fn().mockResolvedValue({}) },
      examQuestion: { updateMany: jest.fn().mockResolvedValue({}) },
      moderationViolation: { create: jest.fn().mockResolvedValue({ id: 'v-tx-1' }) },
    };
    mockPrismaTransaction.mockImplementation(async (fn: any) => fn(txMock));
    const uc = new ProcessModerationJobUseCase(makeViolationRepo(), makeRiskRepo(), makeActionRepo());
    // Act
    await uc.execute(makeTextPayload());
    // Assert
    expect(txMock.moderationResult.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'APPROVED' }),
      }),
    );
    expect(txMock.moderationViolation.create).not.toHaveBeenCalled();
  });

  it('Claude overall score eşiği (0.8) aştığında verdict APPROVED bile REJECTED sayılır', async () => {
    // Arrange — verdict=APPROVED ama overall=0.9 → exceedsThreshold
    const overscored = { ...makeLayer2Result('APPROVED', 0.9) };
    overscored.scores.overall = 0.9;
    mockClaudeAnalyze.mockResolvedValue(overscored);
    const txMock = {
      moderationResult: { update: jest.fn().mockResolvedValue({}) },
      examQuestion: { updateMany: jest.fn().mockResolvedValue({}) },
      moderationViolation: { create: jest.fn().mockResolvedValue({ id: 'v-tx-1' }) },
    };
    mockPrismaTransaction.mockImplementation(async (fn: any) => fn(txMock));
    const uc = new ProcessModerationJobUseCase(makeViolationRepo(), makeRiskRepo(), makeActionRepo());
    // Act
    await uc.execute(makeTextPayload());
    // Assert
    expect(txMock.moderationResult.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'REJECTED' }),
      }),
    );
  });

  // ── Provider throw → ESCALATED ───────────────────────────────────────────

  it('Claude provider hata fırlatınca moderationResult ESCALATED olarak güncellenir', async () => {
    // Arrange
    mockClaudeAnalyze.mockRejectedValue(new Error('API timeout'));
    const uc = new ProcessModerationJobUseCase(makeViolationRepo(), makeRiskRepo(), makeActionRepo());
    // Act
    await uc.execute(makeTextPayload());
    // Assert — hata yolunda doğrudan prisma (tx dışı) güncelleme yapılıyor
    expect(mockModerationResultUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ESCALATED' }),
      }),
    );
  });

  it('Claude hata durumunda ExamQuestion.moderationStatus=ESCALATED ayarlanır', async () => {
    // Arrange
    mockClaudeAnalyze.mockRejectedValue(new Error('Network error'));
    const uc = new ProcessModerationJobUseCase(makeViolationRepo(), makeRiskRepo(), makeActionRepo());
    // Act
    await uc.execute(makeTextPayload());
    // Assert
    expect(mockExamQuestionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ moderationStatus: 'ESCALATED' }),
      }),
    );
  });

  it('Claude hata durumunda transaction çağrılmaz (violation oluşmaz)', async () => {
    // Arrange
    mockClaudeAnalyze.mockRejectedValue(new Error('Rate limit'));
    const uc = new ProcessModerationJobUseCase(makeViolationRepo(), makeRiskRepo(), makeActionRepo());
    // Act
    await uc.execute(makeTextPayload());
    // Assert — hata yolunda transaction (violation/result güncelleme) yapılmadı
    expect(mockPrismaTransaction).not.toHaveBeenCalled();
  });
});
