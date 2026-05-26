import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "react-i18next";
import { Zap, Megaphone } from "lucide-react";

// Var olan iki sayfa tab içeriği olarak kullanılır — tekrar kod yazılmaz.
const ManageLiveTiers = lazy(() => import("./ManageLiveTiers"));
const AdminAdPackages = lazy(() => import("./AdminAdPackages"));

const TABS = [
  { value: "canli",  labelKey: "sidebar.admin.liveTiers",  icon: Zap,       Component: ManageLiveTiers },
  { value: "reklam", labelKey: "sidebar.admin.adPackages", icon: Megaphone, Component: AdminAdPackages },
];

function TabFallback() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-20 bg-slate-100 rounded-lg animate-pulse" />
      ))}
    </div>
  );
}

/**
 * ManagePackages — "Paket Yönetimi" birleşik admin sayfası.
 * Canlı Test Paketleri + Reklam Paketleri tek sayfada iki sekme.
 * URL deep-link: `?tab=canli` (varsayılan) veya `?tab=reklam`.
 * Eski /ManageLiveTiers ve /AdminAdPackages route'ları çalışmaya devam eder
 * (backward compatibility — bookmark/deep-link kırılmasın).
 */
export default function ManagePackages() {
  const { t } = useTranslation(["common"]);
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab");
  const active = TABS.find((tab) => tab.value === requested)?.value ?? TABS[0].value;

  const onTabChange = (v) => {
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (v === TABS[0].value) p.delete("tab");
      else p.set("tab", v);
      return p;
    });
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900">
          {t("common:sidebar.admin.packagesManagement", { defaultValue: "Paket Yönetimi" })}
        </h1>
        <p className="text-slate-500 mt-2">
          {t("common:sidebar.admin.packagesManagementDesc", {
            defaultValue: "Canlı test kapasite paketleri ve eğitici reklam paketleri",
          })}
        </p>
      </div>

      <Tabs value={active} onValueChange={onTabChange} className="space-y-4">
        <TabsList>
          {TABS.map(({ value, labelKey, icon: Icon }) => (
            <TabsTrigger key={value} value={value}>
              <Icon className="w-4 h-4 mr-1.5" aria-hidden="true" />
              {t(`common:${labelKey}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map(({ value, Component }) => (
          <TabsContent key={value} value={value}>
            <Suspense fallback={<TabFallback />}>
              <Component />
            </Suspense>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
