/**
 * Email adresi normalize: trim + lowercase.
 * Plus-addressing (foo+x@bar.com) korunur — kullanıcı isteyerek kullanıyor olabilir.
 */
export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

/**
 * Geçerli e-posta formatı kontrolü (yüzeysel).
 * Tam RFC 5322 değil — sunucu tarafı reddetme için yeterli.
 */
export function isValidEmail(input: string): boolean {
  if (!input || input.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
}
