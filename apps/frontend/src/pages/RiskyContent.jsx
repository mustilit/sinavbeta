import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ShieldAlert, AlertTriangle, List, Settings } from 'lucide-react';
import ModerationQueue from './ModerationQueue';
import RiskyEducators from './RiskyEducators';
import BlockedTerms from './BlockedTerms';
import ModerationSettings from './ModerationSettings';

const TABS = [
  { value: 'queue', label: 'İnceleme Kuyruğu', icon: ShieldAlert, Component: ModerationQueue },
  { value: 'educators', label: 'Riskli Eğiticiler', icon: AlertTriangle, Component: RiskyEducators },
  { value: 'terms', label: 'Yasak Kelimeler', icon: List, Component: BlockedTerms },
  { value: 'settings', label: 'Moderasyon Ayarları', icon: Settings, Component: ModerationSettings },
];

/**
 * Riskli İçerik — admin moderasyon konsolidasyon ekranı.
 * 4 ayrı sayfayı (ModerationQueue, RiskyEducators, BlockedTerms,
 * ModerationSettings) sekmeler altında toplar.
 *
 * Deep linking: `?tab=educators` veya `?tab=terms` vb. ile direkt sekme açılır.
 */
export default function RiskyContent() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab');
  const [active, setActive] = useState(
    TABS.some((t) => t.value === initialTab) ? initialTab : 'queue',
  );

  // URL ↔ state senkronu
  useEffect(() => {
    const fromUrl = searchParams.get('tab');
    if (fromUrl && fromUrl !== active && TABS.some((t) => t.value === fromUrl)) {
      setActive(fromUrl);
    }
  }, [searchParams, active]);

  const handleChange = (value) => {
    setActive(value);
    const next = new URLSearchParams(searchParams);
    next.set('tab', value);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-gray-50">
          Riskli İçerik
        </h1>
        <p className="text-sm text-slate-500 dark:text-gray-400 mt-1">
          Moderasyon kuyruğu, riskli eğiticiler, yasak kelimeler ve ayarlar
        </p>
      </header>

      <Tabs value={active} onValueChange={handleChange}>
        <TabsList className="h-auto flex-wrap gap-1 bg-slate-100 dark:bg-gray-800 p-1">
          {TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-900 data-[state=active]:text-indigo-700 dark:data-[state=active]:text-indigo-300"
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.map(({ value, Component }) => (
          <TabsContent key={value} value={value} className="mt-4">
            {/* Sekme içeriği yalnızca aktifken mount olur — her sayfa kendi
                queryClient/useQuery'sini kurar, bu yüzden lazy davranır. */}
            {active === value ? <Component embedded /> : null}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
