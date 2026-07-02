/**
 * i18n — react-i18next yapılandırması.
 *
 * Kullanım:
 *   1. main.jsx / App.jsx içinde:
 *        import './lib/i18n';   // side-effect import (init eder)
 *
 *   2. Component'te:
 *        import { useTranslation } from 'react-i18next';
 *        const { t, i18n } = useTranslation();
 *        return <h1>{t('home.welcome')}</h1>;
 *
 *   3. Dil değiştir:
 *        i18n.changeLanguage('en');   // localStorage'a kayıt
 *
 * Çeviri dosyaları: src/locales/<lang>/<namespace>.json
 *
 * İlgili: KALITE-DEGERLENDIRME §3 (Kullanılabilirlik) — i18n hazırlığı.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import trCommon from '../locales/tr/common.json';
import trAuth from '../locales/tr/auth.json';
import trPages from '../locales/tr/pages.json';
import trOnboarding from '../locales/tr/onboarding.json';
import trSchool from '../locales/tr/school.json';
import enCommon from '../locales/en/common.json';
import enAuth from '../locales/en/auth.json';
import enPages from '../locales/en/pages.json';
import enOnboarding from '../locales/en/onboarding.json';
import enSchool from '../locales/en/school.json';
import esCommon from '../locales/es/common.json';
import esAuth from '../locales/es/auth.json';
import esPages from '../locales/es/pages.json';
import esOnboarding from '../locales/es/onboarding.json';
import esSchool from '../locales/es/school.json';
import zhCommon from '../locales/zh/common.json';
import zhAuth from '../locales/zh/auth.json';
import zhPages from '../locales/zh/pages.json';
import zhOnboarding from '../locales/zh/onboarding.json';
import zhSchool from '../locales/zh/school.json';
import deCommon from '../locales/de/common.json';
import deAuth from '../locales/de/auth.json';
import dePages from '../locales/de/pages.json';
import deOnboarding from '../locales/de/onboarding.json';
import deSchool from '../locales/de/school.json';

const resources = {
  tr: { common: trCommon, auth: trAuth, pages: trPages, onboarding: trOnboarding, school: trSchool },
  en: { common: enCommon, auth: enAuth, pages: enPages, onboarding: enOnboarding, school: enSchool },
  es: { common: esCommon, auth: esAuth, pages: esPages, onboarding: esOnboarding, school: esSchool },
  zh: { common: zhCommon, auth: zhAuth, pages: zhPages, onboarding: zhOnboarding, school: zhSchool },
  de: { common: deCommon, auth: deAuth, pages: dePages, onboarding: deOnboarding, school: deSchool },
};

/**
 * Desteklenen diller — LanguageSwitcher bu listeyi okur.
 * `label` her dilin kendi yerel adı (native name) — UI'da dil isimleri
 * yerel okumayı kolaylaştırmak için her zaman kendi dilinde gösterilir
 * (kullanıcı hangi dilde UI gördüğüne bakmaksızın "中文" görür).
 */
export const SUPPORTED_LANGUAGES = [
  { code: 'tr', label: 'Türkçe',  flag: '🇹🇷' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'zh', label: '中文',    flag: '🇨🇳' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'tr',
    defaultNS: 'common',
    ns: ['common', 'auth', 'pages', 'onboarding', 'school'],
    supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
    // Bölge kodlu diller (örn. navigator 'tr-TR') taban dile ('tr') eşlensin.
    // Olmadan: 'tr-TR' supportedLngs'te tam eşleşmediği için elenir, detection
    // htmlTag='en'e düşer → Türkçe tarayıcı İngilizce UI görür (ve a11y Login
    // testi "Giriş Yap" başlığını bulamaz).
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false, // React zaten escape ediyor
      format: (value, format) => {
        if (format === 'currency') return formatCurrency(value);
        if (format === 'date') return new Date(value).toLocaleDateString();
        return value;
      },
    },
    react: {
      useSuspense: false,
    },
  });

// İlk yüklemede ve sonradan dil değişiminde <html lang="..."> attribute'unu
// güncel tut — screen reader telaffuzu ve SEO için.
if (typeof document !== 'undefined') {
  const applyHtmlLang = (lng) => {
    document.documentElement.setAttribute('lang', lng || 'tr');
  };
  applyHtmlLang(i18n.resolvedLanguage);
  i18n.on('languageChanged', applyHtmlLang);
}

export default i18n;

/**
 * Para birimi formatter — locale + currency'ye göre.
 * formatCurrency(1900, 'TRY')  → "₺19,00"
 * formatCurrency(2500, 'USD')  → "$25.00"
 */
export function formatCurrency(amountCents, currency = 'TRY', locale = undefined) {
  const detectedLocale =
    locale ||
    (typeof navigator !== 'undefined' && navigator.language) ||
    'tr-TR';
  try {
    return new Intl.NumberFormat(detectedLocale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(amountCents / 100);
  } catch (e) {
    return `${(amountCents / 100).toFixed(2)} ${currency}`;
  }
}

/**
 * Relative time formatter — "2 saat önce".
 */
export function formatRelativeTime(date, locale = 'tr-TR') {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const seconds = (Date.now() - new Date(date).getTime()) / 1000;
  const ranges = [
    { unit: 'year', sec: 60 * 60 * 24 * 365 },
    { unit: 'month', sec: 60 * 60 * 24 * 30 },
    { unit: 'day', sec: 60 * 60 * 24 },
    { unit: 'hour', sec: 60 * 60 },
    { unit: 'minute', sec: 60 },
    { unit: 'second', sec: 1 },
  ];
  for (const { unit, sec } of ranges) {
    if (Math.abs(seconds) >= sec) {
      return rtf.format(-Math.round(seconds / sec), /** @type {Intl.RelativeTimeFormatUnit} */ (unit));
    }
  }
  return rtf.format(0, 'second');
}
