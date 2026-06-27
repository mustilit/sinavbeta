/**
 * Sınav Dili (Exam Language) — marketplace satış birimlerinde (TestPackage/Tunnel/WrittenPackage)
 * soruların hazırlandığı dil. Filtrelenebilir olduğundan kontrollü bir kod listesidir.
 * UI tarafında i18n ile yerel ada çevrilir.
 */
export const EXAM_LANGUAGES = ['tr', 'en', 'de', 'fr', 'es', 'ar'] as const;
export type ExamLanguage = (typeof EXAM_LANGUAGES)[number];

/** Geçersiz/boş değeri varsayılan 'tr'ye düşürür. */
export function normalizeExamLanguage(value: unknown): ExamLanguage {
  return typeof value === 'string' && (EXAM_LANGUAGES as readonly string[]).includes(value)
    ? (value as ExamLanguage)
    : 'tr';
}

/** Filtre için: geçerli kodsa döner, değilse undefined (filtre uygulanmaz). */
export function parseExamLanguageFilter(value: unknown): ExamLanguage | undefined {
  return typeof value === 'string' && (EXAM_LANGUAGES as readonly string[]).includes(value)
    ? (value as ExamLanguage)
    : undefined;
}
