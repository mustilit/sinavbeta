import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "react-i18next";
import { Award, BookOpen, Layers } from "lucide-react";

// Var olan sayfalar tab içeriği olarak kullanılır — kod tekrarı yok.
const ManageExamTypes = lazy(() => import("./ManageExamTypes"));
const ManageGradeLevels = lazy(() => import("./ManageGradeLevels"));
const ManageTopics = lazy(() => import("./ManageTopics"));

const TABS = [
  { value: "sinav-turleri", labelKey: "sidebar.admin.examTypes",   icon: Award,    Component: ManageExamTypes },
  { value: "siniflar",      labelKey: "sidebar.admin.gradeLevels", icon: Layers,   Component: ManageGradeLevels },
  { value: "konular",       labelKey: "sidebar.admin.topics",      icon: BookOpen, Component: ManageTopics },
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
 * ContentManagement — "İçerik Yönetimi" birleşik admin sayfası.
 * Sınav Türleri + Soru Konuları tek sayfada iki sekme.
 * URL deep-link: `?tab=sinav-turleri` (varsayılan) veya `?tab=konular`.
 * Eski /ManageExamTypes ve /ManageTopics route'ları çalışmaya devam eder
 * (backward compatibility — bookmark/deep-link kırılmasın).
 */
export default function ContentManagement() {
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
          {t("common:sidebar.admin.contentManagement", { defaultValue: "İçerik Yönetimi" })}
        </h1>
        <p className="text-slate-500 mt-2">
          {t("common:sidebar.admin.contentManagementDesc", {
            defaultValue: "Sınav türleri ve soru konularını tek yerden yönetin",
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
