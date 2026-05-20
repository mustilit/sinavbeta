import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Mail, PowerOff, Server, FileText, FileCode, ShieldX } from 'lucide-react';
import EmailDashboard from './EmailDashboard';
import EmailKillSwitches from './EmailKillSwitches';
import EmailProviders from './EmailProviders';
import EmailLogs from './EmailLogs';
import EmailTemplates from './EmailTemplates';
import EmailSuppressions from './EmailSuppressions';

const TABS = [
  { value: 'panel', label: 'Panel', icon: Mail, Component: EmailDashboard },
  { value: 'kontrol', label: 'Kontrol & Durdur', icon: PowerOff, Component: EmailKillSwitches },
  { value: 'saglayicilar', label: 'Sağlayıcılar', icon: Server, Component: EmailProviders },
  { value: 'loglar', label: 'Loglar', icon: FileText, Component: EmailLogs },
  { value: 'sablonlar', label: 'Şablonlar', icon: FileCode, Component: EmailTemplates },
  { value: 'engellenmis', label: 'Engellenmiş Adresler', icon: ShieldX, Component: EmailSuppressions },
];

const DEFAULT_TAB = 'panel';

export default function EmailManagement() {
  const [params, setParams] = useSearchParams();
  const initialTab = params.get('tab') && TABS.some((t) => t.value === params.get('tab'))
    ? params.get('tab')
    : DEFAULT_TAB;
  const [active, setActive] = useState(initialTab);

  // URL'i sekme değişiminde senkronize et (deep-link + back/forward)
  useEffect(() => {
    if (params.get('tab') !== active) {
      const next = new URLSearchParams(params);
      next.set('tab', active);
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
          <Mail className="w-5 h-5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Mail Yönetimi</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Tüm mail trafiği — panel, kontrol, sağlayıcılar, loglar, şablonlar ve engellenmiş adresler
          </p>
        </div>
      </div>

      <Tabs value={active} onValueChange={setActive}>
        <TabsList
          className="flex h-auto flex-wrap gap-1 bg-gray-100 dark:bg-gray-800 p-1 w-full justify-start"
          aria-label="Mail yönetimi sekmeleri"
        >
          {TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700"
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              <span>{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.map(({ value, Component }) => (
          <TabsContent key={value} value={value} className="mt-4" forceMount={undefined}>
            {active === value ? <Component /> : null}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
