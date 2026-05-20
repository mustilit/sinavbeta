/**
 * Pricing — Plan seçim sayfası (Educator tier'ları için).
 *
 * /v1/billing/checkout endpoint'i (StartCheckoutUseCase) henüz hazır değilse
 * backend 404/500 döndürür; UI burada try/catch ile yakalar ve kullanıcıya
 * "ödeme akışı başlatılamadı" mesajı verir. ENTERPRISE → mailto.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import dalClient from '../api/dalClient';

const TIERS = [
  {
    id: 'FREE',
    name: 'Free',
    priceMonthly: 0,
    features: ['3 test', '20 soru/test', 'Topluluk desteği'],
  },
  {
    id: 'PRO',
    name: 'Pro',
    priceMonthly: 19,
    features: ['50 test', '10 canlı sınav/ay', 'Öncelikli destek'],
  },
  {
    id: 'BUSINESS',
    name: 'Business',
    priceMonthly: 79,
    features: ['500 test', '100 canlı sınav/ay', 'White-label', 'API'],
  },
  {
    id: 'ENTERPRISE',
    name: 'Enterprise',
    priceMonthly: null,
    features: ['Sınırsız', 'SSO', 'Özel anlaşma'],
  },
];

export default function Pricing() {
  const [period, setPeriod] = useState('monthly');
  const [loading, setLoading] = useState(null);

  const handleSelect = async (tier) => {
    if (tier === 'FREE') return;
    if (tier === 'ENTERPRISE') {
      window.location.href = 'mailto:satis@sinavsalonu.example';
      return;
    }
    setLoading(tier);
    try {
      // /v1/billing/checkout — backend StartCheckoutUseCase
      const { data } = await dalClient.post('/v1/billing/checkout', {
        tier,
        period,
        kind: 'EDUCATOR',
      });
      if (data?.url) {
        window.location.href = data.url;
      } else {
        alert('Ödeme bağlantısı alınamadı. Lütfen tekrar deneyin.');
      }
    } catch (e) {
      console.error('[pricing] checkout error', e);
      alert('Ödeme akışı başlatılamadı. Lütfen tekrar deneyin.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="container mx-auto py-12 px-4">
      <h1 className="text-3xl font-bold mb-2">Planlar</h1>
      <p className="text-gray-600 dark:text-gray-300 mb-8">
        İhtiyacınıza uygun planı seçin. İstediğiniz zaman yükseltebilir veya iptal
        edebilirsiniz.
      </p>

      <div className="flex gap-2 mb-8" role="group" aria-label="Faturalama dönemi">
        <Button
          variant={period === 'monthly' ? 'default' : 'outline'}
          onClick={() => setPeriod('monthly')}
          aria-pressed={period === 'monthly'}
        >
          Aylık
        </Button>
        <Button
          variant={period === 'yearly' ? 'default' : 'outline'}
          onClick={() => setPeriod('yearly')}
          aria-pressed={period === 'yearly'}
        >
          Yıllık <span className="ml-2 text-xs opacity-70">-%17</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {TIERS.map((tier) => (
          <div
            key={tier.id}
            className="border rounded-lg p-6 flex flex-col bg-white dark:bg-gray-900 dark:border-gray-700"
          >
            <h2 className="text-xl font-semibold">{tier.name}</h2>
            <div className="my-4">
              {tier.priceMonthly === null ? (
                <span className="text-2xl">İletişim</span>
              ) : tier.priceMonthly === 0 ? (
                <span className="text-2xl">Ücretsiz</span>
              ) : (
                <>
                  <span className="text-3xl font-bold">
                    $
                    {period === 'yearly'
                      ? Math.round(tier.priceMonthly * 10)
                      : tier.priceMonthly}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {' '}
                    / {period === 'yearly' ? 'yıl' : 'ay'}
                  </span>
                </>
              )}
            </div>
            <ul className="space-y-2 mb-6 flex-1">
              {tier.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <span aria-hidden="true">✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Button
              onClick={() => handleSelect(tier.id)}
              disabled={loading === tier.id || tier.id === 'FREE'}
              aria-label={`${tier.name} planını seç`}
            >
              {loading === tier.id
                ? 'Yönlendiriliyor…'
                : tier.id === 'FREE'
                ? 'Mevcut planın'
                : tier.id === 'ENTERPRISE'
                ? 'İletişime geç'
                : 'Seç'}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
