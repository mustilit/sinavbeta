/**
 * useServiceStatus — backend'deki kill-switch bayraklarını çeker.
 * Döndürür: { purchasesEnabled, packageCreationEnabled, testPublishingEnabled,
 *             testAttemptsEnabled, adPurchasesEnabled }
 * Yüklenirken veya hata durumunda tümü true döner (fail-open stratejisi).
 */
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api/apiClient';

const DEFAULTS = {
  purchasesEnabled: true,
  packageCreationEnabled: true,
  testPublishingEnabled: true,
  testAttemptsEnabled: true,
  adPurchasesEnabled: true,
  // Minimum paket fiyatı (kuruş) — varsayılan 1 ₺
  minPackagePriceCents: 100,
  // Paket başına en fazla test (admin ayarı) — varsayılan 10
  maxTestsPerPackage: 10,
  // Test başına en fazla soru (admin ayarı) — varsayılan 100
  maxQuestionsPerTest: 100,
};

export function useServiceStatus() {
  const { data } = useQuery({
    queryKey: ['service-status'],
    queryFn: async () => {
      const { data } = await api.get('/site/service-status');
      return data ?? DEFAULTS;
    },
    staleTime: 60 * 1000,      // re-check every 60 s
    gcTime: 2 * 60 * 1000,
    retry: 1,
    // fail-open: if the fetch fails, keep defaults (all enabled)
    placeholderData: DEFAULTS,
  });
  return data ?? DEFAULTS;
}
