/**
 * Ortak yeni-şifre politikası (backend assertPasswordPolicy ile birebir):
 * en az 8 karakter + büyük harf + küçük harf + rakam.
 */
export const PASSWORD_HINT =
  "En az 8 karakter olmalı; büyük harf, küçük harf ve rakam içermelidir.";

/** Geçerliyse null, değilse kullanıcıya gösterilecek hata mesajı döner. */
export function passwordPolicyError(pw) {
  const p = pw ?? "";
  if (p.length < 8 || !/[a-z]/.test(p) || !/[A-Z]/.test(p) || !/[0-9]/.test(p)) {
    return PASSWORD_HINT;
  }
  return null;
}
