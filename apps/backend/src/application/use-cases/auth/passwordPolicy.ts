import { AppError } from '../../errors/AppError';

/**
 * Tüm roller için ortak yeni-şifre politikası:
 *   - en az 8 karakter
 *   - en az bir BÜYÜK harf
 *   - en az bir küçük harf
 *   - en az bir rakam
 * Geçersizse WEAK_PASSWORD (400) fırlatır. Register / RegisterEducator /
 * ResetPassword / ChangePassword akışlarında şifre hash'lenmeden ÖNCE çağrılır.
 */
export function assertPasswordPolicy(password: string | undefined | null): void {
  const p = password ?? '';
  if (p.length < 8 || !/[a-z]/.test(p) || !/[A-Z]/.test(p) || !/[0-9]/.test(p)) {
    throw new AppError(
      'WEAK_PASSWORD',
      'Şifre en az 8 karakter olmalı; büyük harf, küçük harf ve rakam içermelidir.',
      400,
    );
  }
}
