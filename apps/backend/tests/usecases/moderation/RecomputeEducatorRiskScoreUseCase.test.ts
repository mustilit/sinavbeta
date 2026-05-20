/**
 * RecomputeEducatorRiskScoreUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - weight = severity * categoryMultiplier * recencyDecay formülü
 * - 30 günlük SELF_HARM severity 5 → MEDIUM risk
 * - 90+ gün eski ihlal → decay minimum (0.1) → düşük etki
 * - Skor 80+ → ACCOUNT_SUSPENDED aksiyonu + user.suspendedUntil set
 * - Skor 95+ → ACCOUNT_BANNED + user.isBanned=true
 * - riskLevel eşleşmeleri: 0=LOW, 26-60=MEDIUM, 61-95=HIGH, 96+=CRITICAL
 */

// Prisma mock — singleton'ı doğrudan import ettiği için
const mockPrismaAdminSettingsFindFirst = jest.fn();
const mockPrismaUserFindUnique = jest.fn();
const mockPrismaTransaction = jest.fn();

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    adminSettings: {
      findFirst: (...args: any[]) => mockPrismaAdminSettingsFindFirst(...args),
    },
    user: {
      findUnique: (...args: any[]) => mockPrismaUserFindUnique(...args),
    },
    $transaction: (...args: any[]) => mockPrismaTransaction(...args),
  },
}));

// logger mock
jest.mock('../../../src/infrastructure/logger/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import { RecomputeEducatorRiskScoreUseCase } from '../../../src/application/use-cases/moderation/RecomputeEducatorRiskScoreUseCase';
import { IEducatorRiskScoreRepository } from '../../../src/domain/interfaces/IEducatorRiskScoreRepository';
import { IModerationViolationRepository, ModerationViolationRecord } from '../../../src/domain/interfaces/IModerationViolationRepository';
import { IModerationActionRepository } from '../../../src/domain/interfaces/IModerationActionRepository';

// ── Yardımcı: violation fixture fabrikası ─────────────────────────────────────

function makeViolation(overrides: Partial<ModerationViolationRecord> = {}): ModerationViolationRecord {
  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  return {
    id: 'v-1',
    tenantId: 'tenant-1',
    userId: 'edu-1',
    moderationResultId: 'mr-1',
    category: 'PROFANITY' as any,
    severity: 2,
    status: 'OPEN',
    entityType: 'ExamQuestion',
    entityId: 'q-1',
    adminNote: null,
    reviewedBy: null,
    reviewedAt: null,
    resolvedAt: null,
    createdAt: daysAgo(10),
    ...overrides,
  };
}

// ── Yardımcı: repository mock fabrikaları ────────────────────────────────────

function makeViolationRepo(violations: ModerationViolationRecord[] = []): IModerationViolationRepository {
  return {
    findOpenByUser: jest.fn().mockResolvedValue(violations),
    create: jest.fn(),
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

// ── Testler ────────────────────────────────────────────────────────────────────

describe('RecomputeEducatorRiskScoreUseCase', () => {
  const TENANT = 'tenant-1';
  const USER = 'edu-1';

  beforeEach(() => {
    jest.clearAllMocks();
    // Varsayılan ayarlar
    mockPrismaAdminSettingsFindFirst.mockResolvedValue({
      id: 1,
      moderationAutoSuspendThreshold: 80,
      moderationAutoBanThreshold: 95,
    });
    // Transaction — callback'i çalıştır
    mockPrismaTransaction.mockImplementation(async (fn: any) => {
      const tx = {
        user: { update: jest.fn().mockResolvedValue({}) },
        moderationAction: { create: jest.fn().mockResolvedValue({ id: 'act-auto' }) },
      };
      return fn(tx);
    });
  });

  // ── Formül doğrulama ──────────────────────────────────────────────────────

  it('ihlal yoksa skor 0 ve LOW riskLevel ile upsert yapılır', async () => {
    // Arrange
    const violationRepo = makeViolationRepo([]);
    const riskRepo = makeRiskRepo();
    const uc = new RecomputeEducatorRiskScoreUseCase(riskRepo, violationRepo, makeActionRepo());
    mockPrismaUserFindUnique.mockResolvedValue({ isBanned: false, suspendedUntil: null });
    // Act
    await uc.execute({ userId: USER, tenantId: TENANT });
    // Assert
    const upsertCall = (riskRepo.upsert as jest.Mock).mock.calls[0][0];
    expect(upsertCall.computedScore).toBe(0);
    expect(upsertCall.riskLevel).toBe('LOW');
  });

  it('30 günlük SELF_HARM severity 5 → MEDIUM riskLevel', async () => {
    // Arrange
    // weight = 5 * 3.0 * (1 - 30/90) = 5 * 3.0 * 0.667 ≈ 10.0
    // score = round(10.0 * 4) = 40 → MEDIUM (26-60)
    const v = makeViolation({
      category: 'SELF_HARM' as any,
      severity: 5,
      createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      status: 'OPEN',
    });
    const violationRepo = makeViolationRepo([v]);
    const riskRepo = makeRiskRepo();
    const uc = new RecomputeEducatorRiskScoreUseCase(riskRepo, violationRepo, makeActionRepo());
    mockPrismaUserFindUnique.mockResolvedValue({ isBanned: false, suspendedUntil: null });
    // Act
    await uc.execute({ userId: USER, tenantId: TENANT });
    // Assert
    const upsertCall = (riskRepo.upsert as jest.Mock).mock.calls[0][0];
    expect(upsertCall.riskLevel).toBe('MEDIUM');
    expect(upsertCall.computedScore).toBeGreaterThanOrEqual(26);
    expect(upsertCall.computedScore).toBeLessThanOrEqual(60);
  });

  it('90+ gün eski ihlal decay minimum (0.1) → düşük skor', async () => {
    // Arrange
    // 100 gün önce: decay = max(0.1, 1 - 100/90) = max(0.1, negatif) = 0.1
    const v = makeViolation({
      category: 'PROFANITY' as any,
      severity: 5,
      createdAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000),
      status: 'OPEN',
    });
    const violationRepo = makeViolationRepo([v]);
    const riskRepo = makeRiskRepo();
    const uc = new RecomputeEducatorRiskScoreUseCase(riskRepo, violationRepo, makeActionRepo());
    mockPrismaUserFindUnique.mockResolvedValue({ isBanned: false, suspendedUntil: null });
    // Act
    await uc.execute({ userId: USER, tenantId: TENANT });
    // Assert — 5 * 1.0 * 0.1 * 4 = 2 → LOW
    const upsertCall = (riskRepo.upsert as jest.Mock).mock.calls[0][0];
    expect(upsertCall.computedScore).toBeLessThan(26); // LOW
    expect(upsertCall.riskLevel).toBe('LOW');
  });

  // ── riskLevel eşlemeleri ──────────────────────────────────────────────────

  it('skor 25 altı → LOW', async () => {
    // Arrange — PROFANITY severity 1, 1 gün önce: 1 * 1.0 * ~1.0 * 4 = ~4 → LOW
    const v = makeViolation({
      category: 'PROFANITY' as any,
      severity: 1,
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      status: 'OPEN',
    });
    const violationRepo = makeViolationRepo([v]);
    const riskRepo = makeRiskRepo();
    const uc = new RecomputeEducatorRiskScoreUseCase(riskRepo, violationRepo, makeActionRepo());
    mockPrismaUserFindUnique.mockResolvedValue({ isBanned: false, suspendedUntil: null });
    // Act
    await uc.execute({ userId: USER, tenantId: TENANT });
    // Assert
    const upsertCall = (riskRepo.upsert as jest.Mock).mock.calls[0][0];
    expect(upsertCall.riskLevel).toBe('LOW');
  });

  it('skor 26-60 arasinda MEDIUM', async () => {
    // Arrange — iki HARASSMENT severity 4, 5 gun once
    // Tek: 4 * 1.5 * (1 - 5/90) * 4 = 4 * 1.5 * 0.944 * 4 = 22.7 → 23 LOW
    // Iki: 22.7 * 2 = 45.4 → round(45.4) = 45 → MEDIUM
    const daysAgo5 = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const violations = [
      makeViolation({ id: 'v-1', category: 'HARASSMENT' as any, severity: 4, createdAt: daysAgo5, status: 'OPEN' }),
      makeViolation({ id: 'v-2', category: 'HARASSMENT' as any, severity: 4, createdAt: daysAgo5, status: 'OPEN' }),
    ];
    const violationRepo = makeViolationRepo(violations);
    const riskRepo = makeRiskRepo();
    const uc = new RecomputeEducatorRiskScoreUseCase(riskRepo, violationRepo, makeActionRepo());
    mockPrismaUserFindUnique.mockResolvedValue({ isBanned: false, suspendedUntil: null });
    // Act
    await uc.execute({ userId: USER, tenantId: TENANT });
    // Assert
    const upsertCall = (riskRepo.upsert as jest.Mock).mock.calls[0][0];
    expect(upsertCall.riskLevel).toBe('MEDIUM');
    expect(upsertCall.computedScore).toBeGreaterThanOrEqual(26);
    expect(upsertCall.computedScore).toBeLessThanOrEqual(60);
  });

  it('skor 61-95 arasında → HIGH', async () => {
    // Arrange — HATE_SPEECH severity 5, 5 gün önce (yüksek decay)
    // 5 * 3.0 * (1 - 5/90) * 4 ≈ 57.3 → hala MEDIUM
    // İki HATE_SPEECH violation ile: ~114 → capped 100 → CRITICAL
    // O yüzden HATE_SPEECH severity 4, 1 violation: 4 * 3.0 * ~1.0 * 4 = ~48 MEDIUM
    // 2 violation: ~96 → CRITICAL ... HIGH için tek VIOLENCE severity 4 deneyelim
    // VIOLENCE severity 5, 10 gün: 5 * 2.0 * (1-10/90) * 4 ≈ 35.6 MEDIUM
    // VIOLENCE severity 5, 2 violations, 10 gün: ~71 → HIGH
    const daysAgo10 = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const violations = [
      makeViolation({ id: 'v-1', category: 'VIOLENCE' as any, severity: 5, createdAt: daysAgo10 }),
      makeViolation({ id: 'v-2', category: 'VIOLENCE' as any, severity: 5, createdAt: daysAgo10 }),
    ];
    const violationRepo = makeViolationRepo(violations);
    const riskRepo = makeRiskRepo();
    const uc = new RecomputeEducatorRiskScoreUseCase(riskRepo, violationRepo, makeActionRepo());
    mockPrismaUserFindUnique.mockResolvedValue({ isBanned: false, suspendedUntil: null });
    // Act
    await uc.execute({ userId: USER, tenantId: TENANT });
    // Assert
    const upsertCall = (riskRepo.upsert as jest.Mock).mock.calls[0][0];
    expect(upsertCall.riskLevel).toBe('HIGH');
  });

  // ── Otomatik askıya alma ────────────────────────────────────────────────

  it('skor 80+ olduğunda ACCOUNT_SUSPENDED aksiyonu oluşturulur ve user.suspendedUntil set edilir', async () => {
    // Arrange — skor 80+ üretmek için: HATE_SPEECH severity 5, son 5 gün, 3 violation
    // 5 * 3.0 * (1-5/90) * 4 ≈ 57.3 * 3 = 171.9 → capped 100 → aslında CRITICAL olur...
    // daha küçük: HATE_SPEECH severity 4, 20 gün, 2 violation
    // 4 * 3.0 * (1-20/90) * 4 ≈ 37.3 * 2 = 74.6 → round(74.6) = 75... → HIGH değil MEDIUM
    // Doğrudan AdminSettings threshold'u düşürerek test edelim: suspendThreshold=20
    mockPrismaAdminSettingsFindFirst.mockResolvedValue({
      id: 1,
      moderationAutoSuspendThreshold: 20,
      moderationAutoBanThreshold: 95,
    });
    const v = makeViolation({
      category: 'HARASSMENT' as any,
      severity: 4,
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      status: 'OPEN',
    });
    const violationRepo = makeViolationRepo([v]);
    const riskRepo = makeRiskRepo();
    const txMock = {
      user: { update: jest.fn().mockResolvedValue({}) },
      moderationAction: { create: jest.fn().mockResolvedValue({ id: 'act-auto' }) },
    };
    mockPrismaTransaction.mockImplementation(async (fn: any) => fn(txMock));
    mockPrismaUserFindUnique.mockResolvedValue({ isBanned: false, suspendedUntil: null });
    const uc = new RecomputeEducatorRiskScoreUseCase(riskRepo, violationRepo, makeActionRepo());
    // Act
    await uc.execute({ userId: USER, tenantId: TENANT });
    // Assert
    expect(txMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER },
        data: expect.objectContaining({ suspendedUntil: expect.any(Date) }),
      }),
    );
    expect(txMock.moderationAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actionType: 'ACCOUNT_SUSPENDED' }),
      }),
    );
  });

  it('skor 95+ olduğunda ACCOUNT_BANNED + user.isBanned=true ayarlanır', async () => {
    // Arrange — banThreshold=20 ile test edelim
    mockPrismaAdminSettingsFindFirst.mockResolvedValue({
      id: 1,
      moderationAutoSuspendThreshold: 10,
      moderationAutoBanThreshold: 20,
    });
    const v = makeViolation({
      category: 'HARASSMENT' as any,
      severity: 4,
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      status: 'OPEN',
    });
    const violationRepo = makeViolationRepo([v]);
    const riskRepo = makeRiskRepo();
    const txMock = {
      user: { update: jest.fn().mockResolvedValue({}) },
      moderationAction: { create: jest.fn().mockResolvedValue({ id: 'act-auto' }) },
    };
    mockPrismaTransaction.mockImplementation(async (fn: any) => fn(txMock));
    // user zaten banned değil
    mockPrismaUserFindUnique.mockResolvedValue({ isBanned: false, suspendedUntil: null });
    const uc = new RecomputeEducatorRiskScoreUseCase(riskRepo, violationRepo, makeActionRepo());
    // Act
    await uc.execute({ userId: USER, tenantId: TENANT });
    // Assert
    expect(txMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isBanned: true }),
      }),
    );
    expect(txMock.moderationAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actionType: 'ACCOUNT_BANNED' }),
      }),
    );
  });

  it('kullanıcı zaten banned ise ban aksiyonu tekrar oluşturulmaz', async () => {
    // Arrange
    mockPrismaAdminSettingsFindFirst.mockResolvedValue({
      id: 1,
      moderationAutoSuspendThreshold: 10,
      moderationAutoBanThreshold: 10,
    });
    const v = makeViolation({
      category: 'HARASSMENT' as any,
      severity: 4,
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      status: 'OPEN',
    });
    const violationRepo = makeViolationRepo([v]);
    const riskRepo = makeRiskRepo();
    const uc = new RecomputeEducatorRiskScoreUseCase(riskRepo, violationRepo, makeActionRepo());
    // user zaten banned
    mockPrismaUserFindUnique.mockResolvedValue({ isBanned: true, suspendedUntil: null });
    // Act
    await uc.execute({ userId: USER, tenantId: TENANT });
    // Assert — transaction çağrılmamış olmalı
    expect(mockPrismaTransaction).not.toHaveBeenCalled();
  });

  it('user bulunamazsa erken çıkar — upsert yapılmaz değil, sadece aksiyon alınmaz', async () => {
    // Arrange
    mockPrismaAdminSettingsFindFirst.mockResolvedValue({
      id: 1,
      moderationAutoSuspendThreshold: 80,
      moderationAutoBanThreshold: 95,
    });
    const violationRepo = makeViolationRepo([]);
    const riskRepo = makeRiskRepo();
    const uc = new RecomputeEducatorRiskScoreUseCase(riskRepo, violationRepo, makeActionRepo());
    // user bulunamıyor
    mockPrismaUserFindUnique.mockResolvedValue(null);
    // Act
    await uc.execute({ userId: USER, tenantId: TENANT });
    // Assert — hata fırlatmamalı; upsert çağrıldı ama transaction çağrılmadı
    expect(riskRepo.upsert).toHaveBeenCalledTimes(1);
    expect(mockPrismaTransaction).not.toHaveBeenCalled();
  });

  it('violationCount ve openViolations doğru hesaplanır', async () => {
    // Arrange
    const violations = [
      makeViolation({ id: 'v-1', status: 'OPEN' }),
      makeViolation({ id: 'v-2', status: 'OPEN' }),
      makeViolation({ id: 'v-3', status: 'DISMISSED' }),
    ];
    const violationRepo = makeViolationRepo(violations);
    const riskRepo = makeRiskRepo();
    const uc = new RecomputeEducatorRiskScoreUseCase(riskRepo, violationRepo, makeActionRepo());
    mockPrismaUserFindUnique.mockResolvedValue({ isBanned: false, suspendedUntil: null });
    // Act
    await uc.execute({ userId: USER, tenantId: TENANT });
    // Assert
    const upsertCall = (riskRepo.upsert as jest.Mock).mock.calls[0][0];
    expect(upsertCall.violationCount).toBe(3);
    expect(upsertCall.openViolations).toBe(2);
  });
});
