/**
 * Sınav Dili (Exam Language) — marketplace satış birimlerinde soruların hazırlandığı dil.
 * Kod listesi backend ile birebir (src/common/examLanguages.ts). Görünen ad i18n ile gelir.
 */
export const EXAM_LANGUAGES = ["tr", "en", "de", "fr", "es", "ar"];

// i18n yüklenmeden önce / anahtar eksikse güvenli Türkçe fallback.
const FALLBACK_NAMES = {
  tr: "Türkçe",
  en: "İngilizce",
  de: "Almanca",
  fr: "Fransızca",
  es: "İspanyolca",
  ar: "Arapça",
};

/** Dil kodunun yerel adını döndürür. t verilirse i18n'den (pages:examLanguage.names.<code>). */
export function examLanguageName(code, t) {
  const key = EXAM_LANGUAGES.includes(code) ? code : "tr";
  if (t) {
    const translated = t(`pages:examLanguage.names.${key}`, { defaultValue: FALLBACK_NAMES[key] });
    if (translated) return translated;
  }
  return FALLBACK_NAMES[key];
}
