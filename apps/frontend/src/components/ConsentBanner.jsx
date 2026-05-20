/**
 * ConsentBanner — KVKK / GDPR consent banner'ı.
 *
 * Kullanım: Layout.jsx içinde footer'dan önce render et.
 *   <ConsentBanner />
 *
 * Davranış:
 *   - localStorage'da `analytics_consent` yoksa banner görünür.
 *   - "Kabul et" → grantConsent() + banner gizlenir.
 *   - "Reddet" → revokeConsent() + banner gizlenir.
 *   - "Sadece zorunlu" === reject.
 *
 * Daha sonra ayar sayfasından tercih güncellenebilmeli (TODO).
 *
 * İlgili: apps/frontend/src/lib/analytics.js (consent API)
 *         KALITE-DEGERLENDIRME §7 (KVKK) + §13 (Müşteri analitiği)
 */
import { useState, useEffect } from 'react';
import { grantConsent, revokeConsent } from '@/lib/analytics';
import { Button } from '@/components/ui/button';

export function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('analytics_consent');
      setVisible(stored === null); // tercih henüz alınmadıysa göster
    } catch (e) {
      setVisible(false); // SSR/privacy mode → hiç gösterme
    }
  }, []);

  if (!visible) return null;

  const handleAccept = () => {
    grantConsent();
    setVisible(false);
  };

  const handleReject = () => {
    try {
      localStorage.setItem('analytics_consent', 'rejected');
    } catch (e) {
      // ignore
    }
    revokeConsent();
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-labelledby="consent-title"
      aria-describedby="consent-desc"
      className="fixed bottom-0 left-0 right-0 z-50
                 border-t border-gray-200 bg-white p-4 shadow-lg
                 dark:border-gray-700 dark:bg-gray-900"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1">
          <h2 id="consent-title" className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Çerez ve Analitik Tercihleri
          </h2>
          <p id="consent-desc" className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            Hizmeti iyileştirmek için anonim kullanım istatistiği topluyoruz (sayfa görüntüleme,
            buton tıklama). Kişisel verileriniz pazarlama için kullanılmaz.{' '}
            <a
              href="/Privacy"
              className="underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              Detaylı bilgi
            </a>
          </p>
        </div>
        <div className="flex flex-shrink-0 gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleReject}
            aria-label="Sadece zorunlu çerezlere izin ver"
          >
            Sadece zorunlu
          </Button>
          <Button
            type="button"
            onClick={handleAccept}
            aria-label="Analitik dahil tüm çerezlere izin ver"
          >
            Kabul et
          </Button>
        </div>
      </div>
    </div>
  );
}
