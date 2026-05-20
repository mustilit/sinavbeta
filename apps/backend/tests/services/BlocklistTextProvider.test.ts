/**
 * BlocklistTextProvider testleri
 *
 * Doğrulanan davranışlar:
 * - Eşleşme yoksa APPROVED döner
 * - Severity 4+ → REJECTED döner
 * - AUTO_REJECT_CATEGORIES (SELF_HARM, HATE_SPEECH, SEXUAL_CONTENT) → severity düşük olsa bile REJECTED
 * - Düşük severity + normal kategori → SUSPECT döner
 * - pattern doluysa regex ile eşleşir
 * - Geçersiz regex log'lanır ve atlanır (hata fırlatılmaz)
 * - Türkçe normalize ile büyük harf vb. girdiler eşleşir
 */
import { BlocklistTextProvider } from '../../src/application/services/content-safety/providers/BlocklistTextProvider';
import { IBlockedTermRepository, BlockedTermRecord } from '../../src/domain/interfaces/IBlockedTermRepository';

// logger mock — console çıktısını bastır
jest.mock('../../src/infrastructure/logger/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

// ── Yardımcı: repo mock fabrikası ─────────────────────────────────────────────

function makeRepo(terms: Partial<BlockedTermRecord>[] = []): IBlockedTermRepository {
  const defaults: BlockedTermRecord = {
    id: 'term-1',
    tenantId: 'tenant-1',
    term: 'kötü',
    pattern: null,
    category: 'PROFANITY' as any,
    severity: 2,
    isActive: true,
    createdBy: null,
  };

  const records: BlockedTermRecord[] = terms.map((t, i) => ({
    ...defaults,
    id: `term-${i + 1}`,
    ...t,
  }));

  return {
    findActiveByTenant: jest.fn().mockResolvedValue(records),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    invalidateCache: jest.fn(),
  };
}

// ── Testler ────────────────────────────────────────────────────────────────────

describe('BlocklistTextProvider', () => {
  // ── Eşleşme yok → APPROVED ───────────────────────────────────────────────

  it('hiç yasaklı terim yoksa APPROVED döner', async () => {
    // Arrange
    const repo = makeRepo([]);
    const provider = new BlocklistTextProvider(repo);
    // Act
    const result = await provider.analyze('normal bir metin', 'tenant-1');
    // Assert
    expect(result.status).toBe('APPROVED');
    expect(result.matchedTerms).toHaveLength(0);
  });

  it('girdide yasaklı terim bulunmuyorsa APPROVED döner', async () => {
    // Arrange
    const repo = makeRepo([{ term: 'yasak', category: 'PROFANITY' as any, severity: 2 }]);
    const provider = new BlocklistTextProvider(repo);
    // Act
    const result = await provider.analyze('temiz bir soru içeriği', 'tenant-1');
    // Assert
    expect(result.status).toBe('APPROVED');
  });

  // ── Severity eşiği → REJECTED ─────────────────────────────────────────────

  it('severity 4 olan yasaklı terim eşleştiğinde REJECTED döner', async () => {
    // Arrange
    const repo = makeRepo([{ term: 'saldirgan', category: 'HARASSMENT' as any, severity: 4 }]);
    const provider = new BlocklistTextProvider(repo);
    // Act
    const result = await provider.analyze('saldirgan içerik', 'tenant-1');
    // Assert
    expect(result.status).toBe('REJECTED');
    expect(result.maxSeverity).toBe(4);
  });

  it('severity 5 olan yasaklı terim eşleştiğinde REJECTED döner', async () => {
    // Arrange
    const repo = makeRepo([{ term: 'agirkelime', category: 'VIOLENCE' as any, severity: 5 }]);
    const provider = new BlocklistTextProvider(repo);
    // Act
    const result = await provider.analyze('agirkelime var burada', 'tenant-1');
    // Assert
    expect(result.status).toBe('REJECTED');
    expect(result.maxSeverity).toBe(5);
  });

  // ── AUTO_REJECT_CATEGORIES → REJECTED (düşük severity'de bile) ────────────

  it('SELF_HARM kategorisi severity 1 olsa bile REJECTED döner', async () => {
    // Arrange — plan §3.1: SELF_HARM otomatik reject
    const repo = makeRepo([{ term: 'zararliterim', category: 'SELF_HARM' as any, severity: 1 }]);
    const provider = new BlocklistTextProvider(repo);
    // Act
    const result = await provider.analyze('zararliterim içerik', 'tenant-1');
    // Assert
    expect(result.status).toBe('REJECTED');
  });

  it('HATE_SPEECH kategorisi severity 2 olsa bile REJECTED döner', async () => {
    // Arrange
    const repo = makeRepo([{ term: 'nefretkelime', category: 'HATE_SPEECH' as any, severity: 2 }]);
    const provider = new BlocklistTextProvider(repo);
    // Act
    const result = await provider.analyze('nefretkelime burada', 'tenant-1');
    // Assert
    expect(result.status).toBe('REJECTED');
  });

  it('SEXUAL_CONTENT kategorisi severity 1 olsa bile REJECTED döner', async () => {
    // Arrange
    const repo = makeRepo([{ term: 'cinselkelime', category: 'SEXUAL_CONTENT' as any, severity: 1 }]);
    const provider = new BlocklistTextProvider(repo);
    // Act
    const result = await provider.analyze('cinselkelime mevcut', 'tenant-1');
    // Assert
    expect(result.status).toBe('REJECTED');
  });

  // ── Düşük severity + normal kategori → SUSPECT ───────────────────────────

  it('PROFANITY kategorisi severity 1 → SUSPECT döner', async () => {
    // Arrange
    const repo = makeRepo([{ term: 'kufur', category: 'PROFANITY' as any, severity: 1 }]);
    const provider = new BlocklistTextProvider(repo);
    // Act
    const result = await provider.analyze('kufur var', 'tenant-1');
    // Assert
    expect(result.status).toBe('SUSPECT');
    expect(result.maxSeverity).toBe(1);
  });

  it('SPAM kategorisi severity 3 → SUSPECT döner', async () => {
    // Arrange
    const repo = makeRepo([{ term: 'spamkelime', category: 'SPAM' as any, severity: 3 }]);
    const provider = new BlocklistTextProvider(repo);
    // Act
    const result = await provider.analyze('spamkelime bulundu', 'tenant-1');
    // Assert
    expect(result.status).toBe('SUSPECT');
    expect(result.maxSeverity).toBe(3);
  });

  // ── Eşleşen kategoriler ve terimler response'a eklenir ───────────────────

  it('eşleşen terim matchedTerms listesinde görünür', async () => {
    // Arrange
    const repo = makeRepo([{ term: 'yasakli', category: 'PROFANITY' as any, severity: 2 }]);
    const provider = new BlocklistTextProvider(repo);
    // Act
    const result = await provider.analyze('yasakli kelime', 'tenant-1');
    // Assert
    expect(result.matchedTerms).toContain('yasakli');
  });

  it('eşleşen kategori categories listesinde görünür', async () => {
    // Arrange
    const repo = makeRepo([{ term: 'spam123', category: 'SPAM' as any, severity: 2 }]);
    const provider = new BlocklistTextProvider(repo);
    // Act
    const result = await provider.analyze('spam123 içerik', 'tenant-1');
    // Assert
    expect(result.categories).toContain('SPAM');
  });

  // ── Regex pattern eşleşmesi ───────────────────────────────────────────────

  it('pattern doluysa regex eşleşmesi kullanılır', async () => {
    // Arrange — regex: içerik boşluklarla ayrılmış "kotu" ile başlamalı
    const repo = makeRepo([{
      term: 'kotu',
      pattern: '^kotu$',
      category: 'PROFANITY' as any,
      severity: 2,
    }]);
    const provider = new BlocklistTextProvider(repo);
    // Act: normalize edilmiş girdi "kotu" olacak
    const result = await provider.analyze('KÖTÜ', 'tenant-1');
    // Assert
    expect(result.status).toBe('SUSPECT');
    expect(result.matchedTerms).toContain('kotu');
  });

  it('regex pattern eşleşmesi case-insensitive çalışır', async () => {
    // Arrange
    const repo = makeRepo([{
      term: 'kufur',
      pattern: 'KUFUR',
      category: 'PROFANITY' as any,
      severity: 2,
    }]);
    const provider = new BlocklistTextProvider(repo);
    // Act: normalize edilmiş girdi küçük harf olacak, regex i flag ile
    const result = await provider.analyze('kufur', 'tenant-1');
    // Assert
    expect(result.matchedTerms).toContain('kufur');
  });

  it('geçersiz regex pattern log edilir ve atlanır — hata fırlatmaz', async () => {
    // Arrange
    const repo = makeRepo([{
      id: 'bad-regex-term',
      term: 'gecersiz',
      pattern: '[bozuk(regex',  // geçersiz regex
      category: 'PROFANITY' as any,
      severity: 5,
    }]);
    const provider = new BlocklistTextProvider(repo);
    // Act — geçersiz regex skip edilmeli, result APPROVED (eşleşme yok)
    const result = await provider.analyze('gecersiz içerik', 'tenant-1');
    // Assert: hata fırlatmadı; geçersiz regex atlandığı için APPROVED dönebilir
    expect(result).toBeDefined();
    // Logger warn çağrılmış olmalı
    const { logger } = require('../../src/infrastructure/logger/logger');
    expect(logger.warn).toHaveBeenCalled();
  });

  // ── Türkçe normalize entegrasyonu ─────────────────────────────────────────

  it('KÖTÜ girdisi "kotu" terimi ile eşleşir (Türkçe normalize)', async () => {
    // Arrange — term "kotu" olarak kayıtlı, girdi "KÖTÜ" büyük harfli Türkçe
    const repo = makeRepo([{ term: 'kotu', category: 'PROFANITY' as any, severity: 2 }]);
    const provider = new BlocklistTextProvider(repo);
    // Act
    const result = await provider.analyze('KÖTÜ bir soru', 'tenant-1');
    // Assert
    expect(result.status).toBe('SUSPECT');
  });

  it('k.ö.t.ü girdisi "kotu" terimi ile eşleşir (ayırıcı + Türkçe normalize)', async () => {
    // Arrange
    const repo = makeRepo([{ term: 'kotu', category: 'PROFANITY' as any, severity: 2 }]);
    const provider = new BlocklistTextProvider(repo);
    // Act
    const result = await provider.analyze('k.ö.t.ü içerik', 'tenant-1');
    // Assert
    expect(result.status).toBe('SUSPECT');
  });

  it('birden fazla terim eşleştiğinde en yüksek severity maxSeverity olarak döner', async () => {
    // Arrange
    const repo = makeRepo([
      { term: 'dusuk', category: 'PROFANITY' as any, severity: 1 },
      { term: 'yuksek', category: 'SPAM' as any, severity: 3 },
    ]);
    const provider = new BlocklistTextProvider(repo);
    // Act
    const result = await provider.analyze('dusuk ve yuksek var', 'tenant-1');
    // Assert
    expect(result.maxSeverity).toBe(3);
    expect(result.matchedTerms).toHaveLength(2);
  });
});
