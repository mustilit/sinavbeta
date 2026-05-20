/**
 * ContentSafetyService testleri
 *
 * Doğrulanan davranışlar:
 * - moderationEnabled=false → APPROVED + skipped=true
 * - Layer1 APPROVED → Layer2 çağrılmaz, APPROVED döner
 * - Layer1 REJECTED → Layer2 çağrılmaz, REJECTED döner
 * - Layer1 SUSPECT + claudeEnabled=true → enqueuedForLayer2=true, status=PENDING_REVIEW
 * - Layer1 SUSPECT + claudeEnabled=false → MANUAL_REVIEW kararı, status=PENDING_REVIEW (şema eşlemesi)
 * - Blocklist hatası → MANUAL_REVIEW döner
 * - İçerik (text/image) yoksa → APPROVED döner
 */
import { ContentSafetyService, ModerationSettings } from '../../src/application/services/content-safety/ContentSafetyService';
import { ModerationInput } from '../../src/application/services/content-safety/types';

// logger mock
jest.mock('../../src/infrastructure/logger/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

// ── Yardımcı: provider mock fabrikaları ───────────────────────────────────────

function makeBlocklistProvider(result: any) {
  return {
    analyze: jest.fn().mockResolvedValue(result),
  };
}

function makeNsfwjsProvider(result: any) {
  return {
    analyze: jest.fn().mockResolvedValue(result),
  };
}

// ── Temel input ve settings fixture'ları ──────────────────────────────────────

function makeInput(overrides: Partial<ModerationInput> = {}): ModerationInput {
  return {
    entityType: 'ExamQuestion',
    entityId: 'q-1',
    userId: 'edu-1',
    tenantId: 'tenant-1',
    text: 'test sorusu içeriği',
    ...overrides,
  };
}

function makeSettings(overrides: Partial<ModerationSettings> = {}): ModerationSettings {
  return {
    moderationEnabled: true,
    moderationClaudeEnabled: true,
    moderationModelText: 'claude-3-haiku',
    moderationModelVision: 'claude-sonnet-4-6',
    ...overrides,
  };
}

// ── Layer1 sonuç fixture'ları ──────────────────────────────────────────────────

const APPROVED_L1 = { status: 'APPROVED', categories: [], matchedTerms: [], maxSeverity: 0 };
const REJECTED_L1 = { status: 'REJECTED', categories: ['HATE_SPEECH'], matchedTerms: ['nefret'], maxSeverity: 4 };
const SUSPECT_L1 = { status: 'SUSPECT', categories: ['PROFANITY'], matchedTerms: ['kufur'], maxSeverity: 2 };

// ── Testler ────────────────────────────────────────────────────────────────────

describe('ContentSafetyService', () => {
  // ── moderationEnabled=false ────────────────────────────────────────────────

  it('moderationEnabled=false olduğunda APPROVED + skipped=true döner', async () => {
    // Arrange
    const blocklist = makeBlocklistProvider(APPROVED_L1);
    const nsfwjs = makeNsfwjsProvider(APPROVED_L1);
    const service = new ContentSafetyService(blocklist as any, nsfwjs as any);
    const settings = makeSettings({ moderationEnabled: false });
    // Act
    const outcome = await service.moderate(makeInput(), settings);
    // Assert
    expect(outcome.skipped).toBe(true);
    expect(outcome.status).toBe('APPROVED');
    expect(outcome.decision).toBe('SKIPPED');
    expect(blocklist.analyze).not.toHaveBeenCalled();
  });

  // ── Layer1 APPROVED ──────────────────────────────────────────────────────

  it('Layer1 APPROVED döndüğünde Layer2 çağrılmaz ve APPROVED döner', async () => {
    // Arrange
    const blocklist = makeBlocklistProvider(APPROVED_L1);
    const nsfwjs = makeNsfwjsProvider(APPROVED_L1);
    const service = new ContentSafetyService(blocklist as any, nsfwjs as any);
    // Act
    const outcome = await service.moderate(makeInput(), makeSettings());
    // Assert
    expect(outcome.status).toBe('APPROVED');
    expect(outcome.enqueuedForLayer2).toBe(false);
    expect(outcome.decision).toBe('APPROVED');
  });

  it('Layer1 APPROVED dondugunde layer1Result response da bulunur', async () => {
    // Arrange
    const blocklist = makeBlocklistProvider(APPROVED_L1);
    const nsfwjs = makeNsfwjsProvider(APPROVED_L1);
    const service = new ContentSafetyService(blocklist as any, nsfwjs as any);
    // Act
    const outcome = await service.moderate(makeInput(), makeSettings());
    // Assert
    expect(outcome.layer1Result).toBeDefined();
    expect(outcome.layer1Result!.status).toBe('APPROVED');
  });

  // ── Layer1 REJECTED ──────────────────────────────────────────────────────

  it('Layer1 REJECTED döndüğünde Layer2 çağrılmaz ve REJECTED döner', async () => {
    // Arrange
    const blocklist = makeBlocklistProvider(REJECTED_L1);
    const nsfwjs = makeNsfwjsProvider(APPROVED_L1);
    const service = new ContentSafetyService(blocklist as any, nsfwjs as any);
    // Act
    const outcome = await service.moderate(makeInput(), makeSettings());
    // Assert
    expect(outcome.status).toBe('REJECTED');
    expect(outcome.enqueuedForLayer2).toBe(false);
    expect(outcome.decision).toBe('REJECTED');
  });

  it('Layer1 REJECTED döndüğünde NSFWjs provider çağrılmaz', async () => {
    // Arrange
    const blocklist = makeBlocklistProvider(REJECTED_L1);
    const nsfwjs = makeNsfwjsProvider(APPROVED_L1);
    const service = new ContentSafetyService(blocklist as any, nsfwjs as any);
    // Act
    await service.moderate(makeInput(), makeSettings());
    // Assert — NSFWjs hem text hem image yolunda devreye girebilir
    // Ama text varken image provider çalışmamalı
    expect(nsfwjs.analyze).not.toHaveBeenCalled();
  });

  // ── Layer1 SUSPECT + claudeEnabled=true ──────────────────────────────────

  it('Layer1 SUSPECT + claudeEnabled=true → enqueuedForLayer2=true + status=PENDING_REVIEW', async () => {
    // Arrange
    const blocklist = makeBlocklistProvider(SUSPECT_L1);
    const nsfwjs = makeNsfwjsProvider(APPROVED_L1);
    const service = new ContentSafetyService(blocklist as any, nsfwjs as any);
    const settings = makeSettings({ moderationClaudeEnabled: true });
    // Act
    const outcome = await service.moderate(makeInput(), settings);
    // Assert
    expect(outcome.enqueuedForLayer2).toBe(true);
    expect(outcome.status).toBe('PENDING_REVIEW');
    expect(outcome.decision).toBe('PENDING_REVIEW');
  });

  // ── Layer1 SUSPECT + claudeEnabled=false ──────────────────────────────────

  it('Layer1 SUSPECT + claudeEnabled=false → MANUAL_REVIEW kararı + status=PENDING_REVIEW (şema eşlemesi)', async () => {
    // Arrange
    const blocklist = makeBlocklistProvider(SUSPECT_L1);
    const nsfwjs = makeNsfwjsProvider(APPROVED_L1);
    const service = new ContentSafetyService(blocklist as any, nsfwjs as any);
    const settings = makeSettings({ moderationClaudeEnabled: false });
    // Act
    const outcome = await service.moderate(makeInput(), settings);
    // Assert
    expect(outcome.decision).toBe('MANUAL_REVIEW');
    // ModerationStatus enum'unda MANUAL_REVIEW yok; PENDING_REVIEW olarak eşlenir
    expect(outcome.status).toBe('PENDING_REVIEW');
    expect(outcome.enqueuedForLayer2).toBe(false);
  });

  // ── Blocklist hatası ──────────────────────────────────────────────────────

  it('blocklist provider hata fırlatırsa MANUAL_REVIEW döner', async () => {
    // Arrange
    const blocklist = { analyze: jest.fn().mockRejectedValue(new Error('DB hatası')) };
    const nsfwjs = makeNsfwjsProvider(APPROVED_L1);
    const service = new ContentSafetyService(blocklist as any, nsfwjs as any);
    // Act
    const outcome = await service.moderate(makeInput(), makeSettings());
    // Assert
    expect(outcome.decision).toBe('MANUAL_REVIEW');
    expect(outcome.status).toBe('PENDING_REVIEW');
  });

  // ── İçerik yoksa ─────────────────────────────────────────────────────────

  it('text ve imageBuffer yoksa APPROVED döner', async () => {
    // Arrange
    const blocklist = makeBlocklistProvider(APPROVED_L1);
    const nsfwjs = makeNsfwjsProvider(APPROVED_L1);
    const service = new ContentSafetyService(blocklist as any, nsfwjs as any);
    const input = makeInput({ text: undefined, imageBuffer: undefined });
    // Act
    const outcome = await service.moderate(input, makeSettings());
    // Assert
    expect(outcome.status).toBe('APPROVED');
    expect(outcome.decision).toBe('APPROVED');
    expect(blocklist.analyze).not.toHaveBeenCalled();
    expect(nsfwjs.analyze).not.toHaveBeenCalled();
  });

  // ── skipped=false normal akışta ───────────────────────────────────────────

  it('moderasyon aktifken skipped=false döner', async () => {
    // Arrange
    const blocklist = makeBlocklistProvider(APPROVED_L1);
    const nsfwjs = makeNsfwjsProvider(APPROVED_L1);
    const service = new ContentSafetyService(blocklist as any, nsfwjs as any);
    // Act
    const outcome = await service.moderate(makeInput(), makeSettings());
    // Assert
    expect(outcome.skipped).toBe(false);
  });
});
