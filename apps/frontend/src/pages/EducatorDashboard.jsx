import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { createPageUrl } from "@/utils";
import { useAuth } from "@/lib/AuthContext";
import api from "@/lib/api/apiClient";
import { tunnels as tunnelApi, writtenTests } from "@/api/dalClient";
import OnboardingTour from "@/components/onboarding/OnboardingTour";
import { useShouldShowTour, useCompleteTour, TOUR_KEYS } from "@/lib/useOnboarding";
import { EDUCATOR_WELCOME_STEPS } from "@/components/onboarding/tourSteps";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StatCard from "@/components/ui/StatCard";
import {
  Plus,
  BookOpen,
  ShoppingBag,
  TrendingUp,
  Users,
  ArrowRight,
  Eye
} from "lucide-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

export default function EducatorDashboard() {
  const { t } = useTranslation(["pages"]);
  const { user } = useAuth();
  const navigate = useNavigate();
  const showWelcomeTour = useShouldShowTour(TOUR_KEYS.EDUCATOR_WELCOME);
  const completeTour = useCompleteTour();

  // Sprint 17: Register wizard artık CV + uzmanlık alanlarını kayıt anında topluyor.
  // EducatorOnboarding yönlendirmesi devre dışı bırakıldı — yeni eğiticiler wizard'dan
  // geldiği için onboarding adımını tamamlamış sayılır. Legacy Google-ile-kayıt
  // eğiticileri (/EducatorOnboarding URL'i hâlâ çalışır, silinmedi).
  // useEffect(() => {
  //   if (!user || (user.role || "").toUpperCase() !== "EDUCATOR") return;
  //   (async () => {
  //     const status = await auth.educatorOnboardingStatus();
  //     if (status && !status.complete) {
  //       navigate(createPageUrl("EducatorOnboarding"), { replace: true });
  //     }
  //   })();
  // }, [user?.id, navigate]);

  const { data: myTests = [], isLoading: loadingTests } = useQuery({
    queryKey: ["myTests", user?.id],
    queryFn: async () => {
      const { data } = await api.get("/educators/me/tests");
      return Array.isArray(data) ? data : (data?.items ?? []);
    },
    enabled: !!user,
  });

  const { data: sales = [], isLoading: loadingSales } = useQuery({
    queryKey: ["mySales", user?.id],
    queryFn: async () => {
      const { data } = await api.get("/educators/me/sales");
      return Array.isArray(data) ? data : (data?.items ?? []);
    },
    enabled: !!user,
  });

  // Tünel + yazılı içerik de toplamlara dahil (DB ile tutarlı — satış/gelir zaten 3 modülü kapsıyor).
  const { data: myTunnels = [] } = useQuery({
    queryKey: ["myTunnels", user?.id],
    queryFn: async () => { try { return (await tunnelApi.mine())?.items ?? []; } catch { return []; } },
    enabled: !!user,
  });
  const { data: myWritten = [] } = useQuery({
    queryKey: ["myWrittenPackages", user?.id],
    queryFn: async () => { try { const r = await writtenTests.listMine(); return Array.isArray(r) ? r : (r?.items ?? []); } catch { return []; } },
    enabled: !!user,
  });

  const totalRevenue = sales.reduce((sum, s) => sum + (s.amountCents ?? 0), 0);
  const publishedTests = myTests.filter(t => t.status === "PUBLISHED" || t.publishedAt).length;
  const publishedTunnels = myTunnels.filter(t => t.status === "PUBLISHED").length;
  const publishedWritten = myWritten.filter(p => !!p.publishedAt).length;
  // Toplam içerik (paket + tünel + yazılı) ve yayında olanlar
  const totalContent = myTests.length + myTunnels.length + myWritten.length;
  const totalPublished = publishedTests + publishedTunnels + publishedWritten;
  const recentSales = sales.slice(0, 5);

  return (
    <div>
      {/* Educator welcome onboarding tour */}
      {showWelcomeTour && (
        <OnboardingTour
          steps={EDUCATOR_WELCOME_STEPS}
          tourKey={TOUR_KEYS.EDUCATOR_WELCOME}
          persona="educator"
          onComplete={() => completeTour(TOUR_KEYS.EDUCATOR_WELCOME)}
          onSkip={() => completeTour(TOUR_KEYS.EDUCATOR_WELCOME)}
        />
      )}

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            {t("pages:titles.educatorDashboard")}
            {(user?.username || user?.full_name) ? ` — ${user?.username ?? user?.full_name?.split(" ")[0]}` : ""}
          </h1>
          <p className="text-slate-500 mt-2">{t("pages:titles.educatorDashboardDesc")}</p>
        </div>
        <Link to={createPageUrl("CreateTest")}>
          <Button className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="w-4 h-4 mr-2" />
            {t("pages:titles.createTest")}
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Toplam İçerik"
          value={totalContent}
          icon={BookOpen}
          bgColor="bg-indigo-500"
        />
        <StatCard
          title="Yayında"
          value={totalPublished}
          icon={Eye}
          bgColor="bg-emerald-500"
        />
        <StatCard
          title="Toplam Satış"
          value={sales.length}
          icon={ShoppingBag}
          bgColor="bg-violet-500"
        />
        <StatCard
          title="Toplam Gelir"
          value={`₺${(totalRevenue / 100).toLocaleString("tr-TR", { minimumFractionDigits: 0 })}`}
          icon={TrendingUp}
          bgColor="bg-amber-500"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Recent Tests */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Son Testlerim</CardTitle>
            <Link to={createPageUrl("MyTestPackages")} className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
              Tümü <ArrowRight className="w-4 h-4" />
            </Link>
          </CardHeader>
          <CardContent>
            {loadingTests ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : myTests.length === 0 ? (
              <div className="text-center py-8">
                <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 mb-4">Henüz test oluşturmadınız</p>
                <Link to={createPageUrl("CreateTest")}>
                  <Button size="sm" variant="outline">İlk Testini Oluştur</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {myTests.slice(0, 5).map((test) => (
                  <Link
                    key={test.id}
                    to={createPageUrl("EditTest") + `?id=${test.id}`}
                    className="flex items-center justify-between p-4 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{test.title}</p>
                      <p className="text-sm text-slate-500">{test.questionCount ?? 0} soru</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-900">
                        {test.priceCents != null
                          ? `₺${(test.priceCents / 100).toLocaleString("tr-TR")}`
                          : "Ücretsiz"}
                      </p>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        test.status === "PUBLISHED" || test.publishedAt
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-200 text-slate-600"
                      }`}>
                        {test.status === "PUBLISHED" || test.publishedAt ? "Yayında" : "Taslak"}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Sales */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Son Satışlar</CardTitle>
            <Link to={createPageUrl("MySales")} className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
              Tümü <ArrowRight className="w-4 h-4" />
            </Link>
          </CardHeader>
          <CardContent>
            {loadingSales ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : sales.length === 0 ? (
              <div className="text-center py-8">
                <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">Henüz satış yok</p>
              </div>
            ) : (
              <div className="space-y-4">
                {recentSales.map((sale) => (
                  <div
                    key={sale.id}
                    className="flex items-center justify-between p-4 rounded-xl bg-slate-50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                        <Users className="w-5 h-5 text-indigo-600" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">
                          {sale.candidateName ?? sale.candidateEmail ?? "Kullanıcı"}
                        </p>
                        <p className="text-sm text-slate-500 truncate max-w-[150px]">
                          {sale.testTitle}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-emerald-600">
                        +₺{((sale.amountCents ?? 0) / 100).toLocaleString("tr-TR")}
                      </p>
                      <p className="text-xs text-slate-500">
                        {sale.createdAt &&
                          format(new Date(sale.createdAt), "d MMM", { locale: tr })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
