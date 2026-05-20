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
import enCommon from '../locales/en/common.json';
import enAuth from '../locales/en/auth.json';
// marketplace namespace'leri henüz yok — gelince eklenecek

const resources = {
  tr: { common: trCommon, auth: trAuth },
  en: { common: enCommon, auth: enAuth },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'tr',
    defaultNS: 'common',
    ns: ['common', 'auth'],
    supportedLngs: ['tr', 'en'],
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
      return rtf.format(-Math.round(seconds / sec), unit);
    }
  }
  return rtf.format(0, 'second');
}
