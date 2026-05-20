/**
 * TierUpgradePrompt — 402 yakalandığında plan yükseltme dialogu.
 *
 * `tier-upgrade-required` CustomEvent'ini dinler (apiClient 402'de dispatch eder),
 * kullanıcıya hangi planın gerektiğini söyler ve /Pricing sayfasına yönlendirir.
 *
 * Detail payload (backend'e bağlı): { requiredTier?, currentTier?, feature? }
 */
import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

const TIER_FEATURES = {
  PRO: ['50 test', '10 canlı sınav/ay', 'Öncelikli destek', '%15 komisyon'],
  BUSINESS: ['500 test', '100 canlı sınav/ay', 'White-label', 'API erişimi', '%10 komisyon'],
  ENTERPRISE: ['Sınırsız test', 'SSO', 'Özel anlaşma', '%7.5 komisyon'],
};

export function TierUpgradePrompt() {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e) => {
      setDetail(e.detail ?? {});
      setOpen(true);
    };
    window.addEventListener('tier-upgrade-required', handler);
    return () => window.removeEventListener('tier-upgrade-required', handler);
  }, []);

  const requiredTier = detail?.requiredTier ?? 'PRO';
  const currentTier = detail?.currentTier ?? 'FREE';
  const features = TIER_FEATURES[requiredTier] ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{requiredTier} planına yükselt</DialogTitle>
          <DialogDescription>
            Bu özellik için aktif <strong>{requiredTier}</strong> aboneliği gerekiyor.
            Şu an <strong>{currentTier}</strong> planındasın.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-1 my-4">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm">
              <span aria-hidden="true">✓</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Daha sonra
          </Button>
          <Button
            onClick={() => {
              setOpen(false);
              navigate('/Pricing');
            }}
          >
            Planları gör
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
