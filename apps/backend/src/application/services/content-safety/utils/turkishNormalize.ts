/**
 * Türkçe metin normalizasyonu — blocklist eşleştirme için.
 *
 * Adımlar:
 * 1. Küçük harfe çevir
 * 2. Türkçe karakterleri ASCII karşılıklarıyla değiştir (ş→s, ğ→g, ç→c, ı→i, ö→o, ü→u)
 * 3. Leetspeak dönüşümü (0→o, 1→i, 3→e, 5→s, 7→t, $→s, @→a)
 * 4. Ayırıcı karakterleri kaldır (., _, -, *, boşluk ve diğerleri)
 */
export function turkishNormalize(text: string): string {
  return text
    .toLowerCase()
    // Türkçe karakter haritası
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ç/g, 'c')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    // Leetspeak
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/\$/g, 's')
    .replace(/@/g, 'a')
    // Ayırıcı karakterleri kaldır
    .replace(/[._\-*\s]+/g, '');
}

/**
 * Token-bazlı normalizasyon: her kelimeyi ayrı ayrı normalize et.
 * Tüm metni tek bir string'e indirgemek yerine token listesi döner.
 */
export function tokenizeAndNormalize(text: string): string[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => turkishNormalize(token));
}
