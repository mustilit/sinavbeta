/**
 * ModerateTextContentUseCase testleri
 *
 * Generic metin moderasyonu (aday yorumu / eğitici tanıtım metni / canlı test sorusu).
 * Doğrulanan davranışlar:
 * - Boş metin → SKIPPED, allowed=true, contentSafety.moderate ÇAĞRILMAZ
 * - moderationEnabled=false (skipped outcome) → allowed=true, decision SKIPPED
 * - APPROVED → allowed=true, ModerationResult kaydedilir
 * - REJECTED → allowed=FALSE (sert blok), message dolu, moderationViolation.create çağrılır
 * - SUSPECT/PENDING_REVIEW (enqueuedForLayer2) → allowed=true, Layer2 kuyruğuna eklenir
 */

const mockAdminSettingsFindFirst = jest.fn();
const mockTransaction = jest.fn();
const mockEnqueue = jest.fn().mockResolvedValue(undefined);

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    adminSettings: { findFirst: (...args: any[]) => mockAdminSettingsFindFirst(...args) },
    $transaction: (...args: any[]) => mockTransaction(...args),
  },
}));

jest.mock('../../../src/infrastructure/logger/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../src/application/services/content-safety/utils/moderationQueue', () => ({
  enqueueModerationJob: (...args: any[]) => mockEnqueue(...args),
}));

import { ModerateTextContentUseCase } from '../../../src/application/use-cases/moderation/ModerateTextContentUseCase';

const BASE = {
  entityType: 'Review' as const,
  entityId: 'r1',
  userId: 'u1',
  tenantId: 't1',
  text: 'Bu normal bir yorumdur.',
};

function makeContentSafety(outcome: any) {
  return { moderate: jest.fn().mockResolvedValue(outcome) };
}

function makeTx() {
  return {
    moderationResult: { create: jest.fn().mockResolvedValue({ id: 'mr-1' }) },
    moderationViolation: { create: jest.fn().mockResolvedValue({}) },
  };
}

function makeRepos() {
  return {
    resultRepo: { create: jest.fn().mockResolvedValue({ id: 'mr-1' }) },
    violationRepo: {
      create: jest.fn().mockResolvedValue({}),
      findOpenByUser: jest.fn().mockResolvedValue([]),
      countByUser: jest.fn().mockResolvedValue(0),
      findById: jest.fn().mockResolvedValue(null),
    },
    riskRepo: {
      findByUser: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    },
    actionRepo: {
      create: jest.fn().mockResolvedValue({}),
      findById: jest.fn(),
      findByUser: jest.fn().mockResolvedValue([]),
      findActivesuspension: jest.fn(),
    },
  };
}

function makeUseCase(contentSafety: any) {
  const repos = makeRepos();
  return new ModerateTextContentUseCase(
    contentSafety,
    repos.resultRepo as any,
    repos.violationRepo as any,
    repos.riskRepo as any,
    repos.actionRepo as any,
  );
}

describe('ModerateTextContentUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAdminSettingsFindFirst.mockResolvedValue({
      moderationEnabled: true,
      moderationClaudeEnabled: true,
      moderationModelText: 'claude-haiku-4-5',
      moderationModelVision: 'claude-sonnet-4-6',
    });
    const tx = makeTx();
    mockTransaction.mockImplementation(async (cb: any) => cb(tx));
  });

  it('boş metin → SKIPPED, allowed=true, moderate çağrılmaz', async () => {
    const cs = makeContentSafety({ skipped: true });
    const uc = makeUseCase(cs as any);

    const res = await uc.execute({ ...BASE, text: '   ' });

    expect(res.allowed).toBe(true);
    expect(res.decision).toBe('SKIPPED');
    expect(cs.moderate).not.toHaveBeenCalled();
    expect(mockAdminSettingsFindFirst).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('moderationEnabled=false (skipped) → allowed=true, decision SKIPPED', async () => {
    const cs = makeContentSafety({ skipped: true });
    const uc = makeUseCase(cs as any);

    const res = await uc.execute(BASE);

    expect(cs.moderate).toHaveBeenCalledTimes(1);
    expect(res.allowed).toBe(true);
    expect(res.decision).toBe('SKIPPED');
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('APPROVED → allowed=true, ModerationResult kaydedilir', async () => {
    const tx = makeTx();
    mockTransaction.mockImplementation(async (cb: any) => cb(tx));
    const cs = makeContentSafety({
      skipped: false,
      decision: 'APPROVED',
      status: 'APPROVED',
      layer1Result: { status: 'APPROVED', categories: [], matchedTerms: [] },
      enqueuedForLayer2: false,
    });
    const uc = makeUseCase(cs as any);

    const res = await uc.execute(BASE);

    expect(res.allowed).toBe(true);
    expect(res.decision).toBe('APPROVED');
    expect(tx.moderationResult.create).toHaveBeenCalledTimes(1);
    expect(tx.moderationViolation.create).not.toHaveBeenCalled();
  });

  it('REJECTED → allowed=FALSE (sert blok), message dolu, ihlal kaydı oluşur', async () => {
    const tx = makeTx();
    mockTransaction.mockImplementation(async (cb: any) => cb(tx));
    const cs = makeContentSafety({
      skipped: false,
      decision: 'REJECTED',
      status: 'REJECTED',
      layer1Result: { status: 'REJECTED', categories: ['HATE_SPEECH'], maxSeverity: 4, matchedTerms: ['x'] },
      enqueuedForLayer2: false,
    });
    const uc = makeUseCase(cs as any);

    const res = await uc.execute({ ...BASE, text: 'çok kötü bir ifade' });

    expect(res.allowed).toBe(false);
    expect(res.decision).toBe('REJECTED');
    expect(typeof res.message).toBe('string');
    expect(res.message && res.message.length).toBeGreaterThan(0);
    expect(res.categories).toEqual(['HATE_SPEECH']);
    expect(tx.moderationViolation.create).toHaveBeenCalledTimes(1);
    expect(tx.moderationViolation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ category: 'HATE_SPEECH', status: 'OPEN', entityType: 'Review' }),
      }),
    );
  });

  it('SUSPECT/PENDING_REVIEW → allowed=true, Layer2 kuyruğuna eklenir', async () => {
    const tx = makeTx();
    mockTransaction.mockImplementation(async (cb: any) => cb(tx));
    const cs = makeContentSafety({
      skipped: false,
      decision: 'PENDING_REVIEW',
      status: 'PENDING_REVIEW',
      layer1Result: { status: 'SUSPECT', categories: ['OTHER'], maxSeverity: 2, matchedTerms: [] },
      enqueuedForLayer2: true,
    });
    const uc = makeUseCase(cs as any);

    const res = await uc.execute(BASE);

    expect(res.allowed).toBe(true);
    expect(res.decision).toBe('PENDING_REVIEW');
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'text-moderation', entityType: 'Review', resultId: 'mr-1' }),
    );
  });

  it('entityType ve entityId contentSafety.moderate çağrısına geçer', async () => {
    const cs = makeContentSafety({ skipped: true });
    const uc = makeUseCase(cs as any);

    await uc.execute({ ...BASE, entityType: 'EducatorProfile', entityId: 'edu-9', isEducatorContent: true });

    expect(cs.moderate).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'EducatorProfile', entityId: 'edu-9', userId: 'u1' }),
      expect.objectContaining({ moderationEnabled: true }),
    );
  });
});
