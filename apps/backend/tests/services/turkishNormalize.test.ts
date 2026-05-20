/**
 * turkishNormalize utility testleri
 *
 * Doğrulanan davranışlar:
 * - Türkçe karakterler ASCII karşılığına çevrilir
 * - Büyük harf küçüğe çevrilir
 * - Leetspeak rakam/sembol dönüşümleri uygulanır
 * - Ayırıcı karakterler (., _, -, *, boşluk) temizlenir
 * - Kombinasyon girdileri doğru normalize edilir
 * - tokenizeAndNormalize her token'ı ayrı normalize eder
 */
import { turkishNormalize, tokenizeAndNormalize } from '../../src/application/services/content-safety/utils/turkishNormalize';

describe('turkishNormalize', () => {
  // ── Türkçe karakter dönüşümleri ────────────────────────────────────────────

  it('KÖTÜ girdisi kotu çıktısı üretir', () => {
    // Arrange
    const input = 'KÖTÜ';
    // Act
    const result = turkishNormalize(input);
    // Assert
    expect(result).toBe('kotu');
  });

  it('şehir girdisi sehir çıktısı üretir (ş→s)', () => {
    const result = turkishNormalize('şehir');
    expect(result).toBe('sehir');
  });

  it('güneş girdisi gunes çıktısı üretir (ğ→g, ş→s)', () => {
    const result = turkishNormalize('güneş');
    expect(result).toBe('gunes');
  });

  it('çiğdem girdisi cigdem çıktısı üretir (ç→c, ğ→g)', () => {
    const result = turkishNormalize('çiğdem');
    expect(result).toBe('cigdem');
  });

  it('ılık girdisi ilik çıktısı üretir (ı→i)', () => {
    const result = turkishNormalize('ılık');
    expect(result).toBe('ilik');
  });

  it('üzüm girdisi uzum çıktısı üretir (ü→u)', () => {
    const result = turkishNormalize('üzüm');
    expect(result).toBe('uzum');
  });

  // ── Leetspeak dönüşümleri ────────────────────────────────────────────────

  it('k0tü girdisi kotu döner (0→o, ü→u)', () => {
    const result = turkishNormalize('k0tü');
    expect(result).toBe('kotu');
  });

  it('s3x girdisi sex döner (3→e)', () => {
    const result = turkishNormalize('s3x');
    expect(result).toBe('sex');
  });

  it('$ex girdisi sex döner ($→s)', () => {
    const result = turkishNormalize('$ex');
    expect(result).toBe('sex');
  });

  it('@hm@k girdisi ahmak döner (@→a)', () => {
    const result = turkishNormalize('@hm@k');
    expect(result).toBe('ahmak');
  });

  it('5pam girdisi spam döner (5→s)', () => {
    const result = turkishNormalize('5pam');
    expect(result).toBe('spam');
  });

  it('7eror girdisi teror döner (7→t)', () => {
    const result = turkishNormalize('7eror');
    expect(result).toBe('teror');
  });

  it('1d1ot girdisi idiot döner (1→i)', () => {
    const result = turkishNormalize('1d1ot');
    expect(result).toBe('idiot');
  });

  // ── Ayırıcı karakter temizleme ────────────────────────────────────────────

  it('k.ö.t.ü girdisi kotu döner (nokta ayırıcı + Türkçe karakter)', () => {
    const result = turkishNormalize('k.ö.t.ü');
    expect(result).toBe('kotu');
  });

  it('KO_TU girdisi kotu döner (alt çizgi ayırıcı)', () => {
    const result = turkishNormalize('KO_TU');
    expect(result).toBe('kotu');
  });

  it('k-o-t-u girdisi kotu döner (tire ayırıcı)', () => {
    const result = turkishNormalize('k-o-t-u');
    expect(result).toBe('kotu');
  });

  it('k*o*t*u girdisi kotu döner (yıldız ayırıcı)', () => {
    const result = turkishNormalize('k*o*t*u');
    expect(result).toBe('kotu');
  });

  it('boşluklu girdi boşluksuz döner', () => {
    const result = turkishNormalize('k o t u');
    expect(result).toBe('kotu');
  });

  // ── Kombinasyon testleri ──────────────────────────────────────────────────

  it('g@yri girdisi gayri döner (@→a)', () => {
    const result = turkishNormalize('g@yri');
    expect(result).toBe('gayri');
  });

  it('g@yr1 girdisi gayri döner (@→a, 1→i)', () => {
    const result = turkishNormalize('g@yr1');
    expect(result).toBe('gayri');
  });

  it('büyük harf ve Türkçe karakter kombinasyonu doğru normalize edilir', () => {
    // "İSTANBUL" → ı olmadığı için İ, i dönüşümüne dikkat
    // ama 'İ' toLowerCase ile 'i' olur, Türkçe dönüşüm sonrası 'i' kalır
    const result = turkishNormalize('ŞANS');
    expect(result).toBe('sans');
  });

  it('boş string girildiğinde boş string döner', () => {
    const result = turkishNormalize('');
    expect(result).toBe('');
  });

  it('sadece ayırıcılardan oluşan girdi boş string döner', () => {
    const result = turkishNormalize('...__--');
    expect(result).toBe('');
  });
});

// ── tokenizeAndNormalize testleri ────────────────────────────────────────────

describe('tokenizeAndNormalize', () => {
  it('birden fazla token her biri ayrı normalize edilir', () => {
    // Arrange
    const input = 'KÖTÜ söz';
    // Act
    const tokens = tokenizeAndNormalize(input);
    // Assert
    expect(tokens).toEqual(['kotu', 'soz']);
  });

  it('boş string boş dizi döner', () => {
    const tokens = tokenizeAndNormalize('');
    expect(tokens).toEqual([]);
  });

  it('tek kelime tek elemanlı dizi döner', () => {
    const tokens = tokenizeAndNormalize('şiddet');
    expect(tokens).toEqual(['siddet']);
  });

  it("fazla boslukllu girdi dogru tokenlara ayrilir", () => {
    const tokens = tokenizeAndNormalize('  küfür  ');
    expect(tokens).toEqual(['kufur']);
  });
});
