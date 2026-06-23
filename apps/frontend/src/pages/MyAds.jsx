/**
 * MyAds (Reklamlarım) sayfası — eğiticinin reklam satın alımlarını,
 * gösterim istatistiklerini ve yeni reklam satın alma formunu sunar.
 *
 * Sekmeler:
 *   - İstatistikler: toplam gösterim, aktif reklam sayısı, son 30 günlük grafik
 *   - Reklamlarım: satın alınan paketlerin durumu (aktif/süresi dolmuş)
 *   - Yeni Reklam Satın Al: TEST veya EDUCATOR türü seçimi
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api/apiClient";
import { platformPromoCodes as promoApi } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { useServiceStatus } from "@/lib/useServiceStatus";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  TrendingUp,
  Eye,
  Zap,
  ShoppingCart,
  BarChart2,
  CheckCircle,
  Clock,
  User,
  Package,
  Info,
  AlertTriangle,
  FileText,
} from "lucide-react";

export default function MyAds() {
  const { t } = useTranslation(["pages"]);
  const { user } = useAuth();
  // Admin kill-switch: adPurchasesEnabled false ise satın alma formu devre dışı kalır
  const { adPurchasesEnabled } = useServiceStatus();
  // Aktif sekme: 'stats' | 'purchases' | 'buy'
  const [activeTab, setActiveTab] = useState("stats");
  // Yeni reklam formu alanları
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [selectedTestId, setSelectedTestId]       = useState("");
  const [selectedWrittenPackageId, setSelectedWrittenPackageId] = useState("");
  const [targetType, setTargetType]               = useState("TEST");
  // Sprint 15 #4/6 — Admin platform promo kodu (AD_PACKAGE scope)
  const [promoInput, setPromoInput]               = useState("");
  const [appliedAdPromo, setAppliedAdPromo]       = useState(null);
  const [promoError, setPromoError]               = useState(null);
  const [promoLoading, setPromoLoading]           = useState(false);
  const queryClient = useQueryClient();

  // Reklam istatistiklerini yükle
  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ["adStats", user?.id],
    queryFn:  async () => {
      const res = await api.get("/educators/me/ads/stats");
      return res.data;
    },
    enabled: !!user,
    staleTime: 30_000, // 30 saniye — istatistikler fazla sık değişmez
  });

  // Eğiticinin mevcut satın alımlarını yükle
  const { data: purchases = [], isLoading: loadingPurchases } = useQuery({
    queryKey: ["adPurchases", user?.id],
    queryFn:  async () => {
      const res = await api.get("/educators/me/ads");
      return res.data?.purchases ?? res.data ?? [];
    },
    enabled: !!user,
  });

  // Satın alınabilir reklam paketlerini yükle (herkese açık endpoint)
  const { data: packages = [] } = useQuery({
    queryKey: ["adPackages"],
    queryFn:  async () => {
      const res = await api.get("/ad-packages");
      return res.data?.packages ?? res.data ?? [];
    },
    staleTime: 5 * 60_000, // 5 dakika — paketler sık değişmez
  });

  // Eğiticinin testlerini yükle (TEST türü seçiminde kullanılır)
  const { data: myTests = [] } = useQuery({
    queryKey: ["myTests", user?.id],
    queryFn:  async () => {
      const res = await api.get("/educators/me/tests");
      return res.data?.tests ?? res.data ?? [];
    },
    enabled: !!user,
  });

  // Eğiticinin yazılı paketlerini yükle (WRITTEN türü seçiminde kullanılır)
  const { data: myWrittenPackages = [] } = useQuery({
    queryKey: ["myWrittenPackagesForAds", user?.id],
    queryFn:  async () => {
      const res = await api.get("/written-packages/mine");
      return res.data?.items ?? res.data ?? [];
    },
    enabled: !!user,
  });

  // Sprint 15 #4/6 — Platform admin promo kodu (AD_PACKAGE scope) input + validate.
  // Eğitici opsiyonel olarak admin'den aldığı kodu uygular; backend atomik
  // validate + apply + usedCount++ yapar. Fiyat selectedPackageId'nin
  // adPackage.priceCents'ından alınır.
  const selectedPackage = (packages ?? []).find((p) => p.id === selectedPackageId);
  const adBasePriceCents = (selectedPackage?.priceCents ?? selectedPackage?.price_cents ?? 0);
  const adDiscountedCents = appliedAdPromo
    ? Math.max(0, adBasePriceCents - Math.floor((adBasePriceCents * (appliedAdPromo.percentOff ?? 0)) / 100))
    : adBasePriceCents;

  // Yeni reklam satın alma mutation'ı
  const purchaseMutation = useMutation({
    mutationFn: async () => {
      const body = { adPackageId: selectedPackageId, targetType };
      if (targetType === "TEST") body.testId = selectedTestId;
      if (targetType === "WRITTEN") body.writtenPackageId = selectedWrittenPackageId;
      // Sprint 15 #4 — appliedPromo varsa promoCode body'sine eklenir
      if (appliedAdPromo?.code) body.promoCode = appliedAdPromo.code;
      const res = await api.post("/educators/me/ads", body);
      return res.data;
    },
    onSuccess: () => {
      toast.success(t("pages:myAds.toasts.purchased"));
      queryClient.invalidateQueries({ queryKey: ["adStats"] });
      queryClient.invalidateQueries({ queryKey: ["adPurchases"] });
      setSelectedPackageId("");
      setSelectedTestId("");
      setSelectedWrittenPackageId("");
      setActiveTab("stats");
    },
    onError: (err) => {
      const msg = err?.response?.data?.message || err?.message || t("pages:myAds.toasts.purchaseFailed");
      toast.error(msg);
    },
  });

  const handlePurchase = () => {
    if (!selectedPackageId) { toast.error(t("pages:myAds.toasts.selectPackage")); return; }
    if (targetType === "TEST" && !selectedTestId) { toast.error(t("pages:myAds.toasts.selectTest")); return; }
    if (targetType === "WRITTEN" && !selectedWrittenPackageId) { toast.error(t("pages:myAds.toasts.selectWritten")); return; }
    purchaseMutation.mutate();
  };

  // Sprint 15 #6 — Promo kodu doğrulama handler'ı (AD_PACKAGE scope).
  const handleValidatePromo = async () => {
    setPromoError(null);
    const code = (promoInput || "").trim().toUpperCase();
    if (!code) return;
    if (!selectedPackageId) {
      setPromoError("Önce reklam paketi seçin");
      return;
    }
    if (adBasePriceCents === 0) {
      setPromoError("Ücretsiz pakette indirim uygulanamaz");
      return;
    }
    setPromoLoading(true);
    try {
      const result = await promoApi.validate(code, "AD_PACKAGE", adBasePriceCents);
      setAppliedAdPromo(result);
    } catch (err) {
      const errorCode = err?.response?.data?.code || err?.response?.data?.error?.code;
      const map = {
        PROMO_NOT_FOUND: "Promo kodu bulunamadı",
        PROMO_NOT_ACTIVE: "Bu kod pasif",
        PROMO_OUT_OF_WINDOW: "Bu kod artık geçerli değil",
        PROMO_USAGE_EXHAUSTED: "Kullanım hakkı tükendi",
        PROMO_SCOPE_MISMATCH: "Bu kod reklam paketi için geçerli değil",
      };
      setPromoError(map[errorCode] || "Promo kodu doğrulanamadı");
      setAppliedAdPromo(null);
    } finally {
      setPromoLoading(false);
    }
  };
  const handleRemovePromo = () => {
    setAppliedAdPromo(null);
    setPromoInput("");
    setPromoError(null);
  };

  // Yayında olan testleri filtrele (sadece bunlara reklam alınabilir)
  const publishedTests = myTests.filter((t) => t.status === "PUBLISHED" || t.is_published);
  // Yayında olan yazılı paketler (publishedAt dolu + aktif)
  const publishedWritten = myWrittenPackages.filter((p) => !!p.publishedAt && p.isActive !== false);

  // İstatistik özet kartları için hesaplamalar
  const totalDelivered  = stats?.totals?.totalDelivered  ?? 0;
  const totalRemaining  = stats?.totals?.totalRemaining  ?? 0;
  const activePurchases = stats?.totals?.activePurchases ?? 0;
  const dailyData       = stats?.dailyBreakdown ?? [];

  // Son 7 günlük gösterim toplamı (mini trend göstergesi)
  const last7Days = dailyData.slice(-7).reduce((s, d) => s + d.impressions, 0);

  const tabs = [
    { key: "stats",     label: t("pages:myAds.tabs.stats"),     icon: BarChart2 },
    { key: "purchases", label: t("pages:myAds.tabs.purchases"), icon: Package   },
    { key: "buy",       label: t("pages:myAds.tabs.buy"),       icon: ShoppingCart },
  ];

  return (
    <div>
      {/* Sayfa başlığı */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">{t("pages:titles.myAds")}</h1>
        <p className="text-slate-500 mt-2">
          {t("pages:titles.myAdsDesc")}
        </p>
      </div>

      {/* Sekmeler — standart underline tab stili (tabs.jsx ile aynı) */}
      <div className="flex flex-wrap gap-1 mb-6 border-b border-slate-200 dark:border-gray-800">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 min-h-10 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.key
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-slate-600 hover:text-slate-900 dark:text-gray-400 dark:hover:text-gray-100"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── İstatistikler ─── */}
      {activeTab === "stats" && (
        <div className="space-y-8">
          {/* Özet kartlar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-indigo-50 rounded-xl">
                    <Eye className="w-6 h-6 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">{t("pages:myAds.stats.totalImpressions")}</p>
                    {/* Tüm zamanların toplam teslim edilen gösterimleri */}
                    <p className="text-2xl font-bold text-slate-900">{totalDelivered.toLocaleString("tr-TR")}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-emerald-50 rounded-xl">
                    <Zap className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">{t("pages:myAds.stats.activeAds")}</p>
                    <p className="text-2xl font-bold text-slate-900">{activePurchases}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-amber-50 rounded-xl">
                    <TrendingUp className="w-6 h-6 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">{t("pages:myAds.stats.last7Days")}</p>
                    <p className="text-2xl font-bold text-slate-900">{last7Days.toLocaleString("tr-TR")}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Son 30 günlük gösterim grafiği (CSS bar chart) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">{t("pages:myAds.stats.last30Days")}</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingStats ? (
                <div className="h-32 animate-pulse bg-slate-100 rounded" />
              ) : dailyData.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-8">{t("pages:myAds.stats.noData")}</p>
              ) : (
                <div className="flex items-end gap-0.5 h-32">
                  {dailyData.map((d, i) => {
                    // Maksimum değere göre çubuk yüksekliğini normalize et
                    const maxVal = Math.max(...dailyData.map((x) => x.impressions), 1);
                    const pct    = Math.round((d.impressions / maxVal) * 100);
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                        <div
                          className="w-full bg-indigo-400 rounded-t hover:bg-indigo-600 transition-colors"
                          style={{ height: `${Math.max(pct, 2)}%` }}
                        />
                        {/* Tooltip: gün ve değer */}
                        <span className="absolute bottom-full mb-1 hidden group-hover:block bg-slate-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                          {d.date}: {d.impressions}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Satın alım bazlı detay */}
          {stats?.purchases?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">{t("pages:myAds.stats.performanceDetail")}</CardTitle>
              </CardHeader>
              <CardContent className="divide-y divide-slate-100">
                {stats.purchases.map((p) => (
                  <div key={p.id} className="py-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      {/* Hedef türü ikonu */}
                      <div className={`p-2 rounded-lg ${p.targetType === "EDUCATOR" ? "bg-purple-50" : p.targetType === "WRITTEN" ? "bg-amber-50" : "bg-indigo-50"}`}>
                        {p.targetType === "EDUCATOR"
                          ? <User className="w-4 h-4 text-purple-600" />
                          : p.targetType === "WRITTEN"
                            ? <FileText className="w-4 h-4 text-amber-600" />
                            : <Package className="w-4 h-4 text-indigo-600" />
                        }
                      </div>
                      <div>
                        <p className="font-medium text-slate-900 text-sm">
                          {/* p.test/writtenPackage.title user-generated */}
                          {p.targetType === "WRITTEN"
                            ? (p.writtenPackage?.title ?? t("pages:myAds.stats.profileBoost"))
                            : p.test ? p.test.title : t("pages:myAds.stats.profileBoost")}
                        </p>
                        <p className="text-xs text-slate-500">
                          {p.packageName} · {t("pages:myAds.stats.validUntil", { date: format(new Date(p.validUntil), "d MMM yyyy", { locale: tr }) })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      {/* Gösterim ilerleme çubuğu */}
                      <p className="text-sm font-medium text-slate-900">
                        {p.impressionsDelivered} / {p.totalImpressions}
                      </p>
                      <div className="w-24 h-1.5 bg-slate-100 rounded-full mt-1">
                        <div
                          className="h-full bg-indigo-500 rounded-full"
                          style={{ width: `${Math.min((p.impressionsDelivered / p.totalImpressions) * 100, 100)}%` }}
                        />
                      </div>
                      {/* Aktif/pasif badge */}
                      <Badge className={`mt-1 text-xs ${p.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {p.isActive ? t("pages:myAds.stats.active") : t("pages:myAds.stats.completed")}
                      </Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Henüz reklam yoksa bilgilendirme */}
          {!loadingStats && (!stats?.purchases || stats.purchases.length === 0) && (
            <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
              <Eye className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-slate-700 mb-2">{t("pages:myAds.stats.noData")}</h3>
              <p className="text-slate-500 text-sm mb-6">
                {t("pages:myAds.stats.noDataPrompt")}
              </p>
              <Button onClick={() => setActiveTab("buy")} className="bg-indigo-600 hover:bg-indigo-700">
                {t("pages:myAds.stats.buyAd")}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ─── Reklamlarım listesi ─── */}
      {activeTab === "purchases" && (
        <Card>
          <CardContent className="p-0">
            {loadingPurchases ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-slate-100 rounded animate-pulse" />)}
              </div>
            ) : purchases.length === 0 ? (
              <div className="text-center py-16">
                <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">{t("pages:myAds.purchases.noneYet")}</p>
                <Button onClick={() => setActiveTab("buy")} className="mt-4 bg-indigo-600 hover:bg-indigo-700">
                  {t("pages:myAds.purchases.buyFirst")}
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {purchases.map((p) => {
                  // Aktif: süresi dolmamış ve gösterim hakkı kalmış
                  const isActive = new Date(p.validUntil) > new Date() && p.impressionsRemaining > 0;
                  const pct = p.adPackage
                    ? Math.round(((p.adPackage.impressions - p.impressionsRemaining) / p.adPackage.impressions) * 100)
                    : 0;
                  return (
                    <div key={p.id} className="p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${p.targetType === "EDUCATOR" ? "bg-purple-50" : p.targetType === "WRITTEN" ? "bg-amber-50" : "bg-indigo-50"}`}>
                          {p.targetType === "EDUCATOR"
                            ? <User className="w-4 h-4 text-purple-600" />
                            : p.targetType === "WRITTEN"
                              ? <FileText className="w-4 h-4 text-amber-600" />
                              : <Package className="w-4 h-4 text-indigo-600" />
                          }
                        </div>
                        <div>
                          <p className="font-medium text-slate-900 text-sm">
                            {p.targetType === "WRITTEN"
                              ? (p.writtenPackage?.title ?? t("pages:myAds.stats.profileBoost"))
                              : p.test ? p.test.title : t("pages:myAds.stats.profileBoost")}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                            <Clock className="w-3 h-3" />
                            {t("pages:myAds.stats.validUntil", { date: format(new Date(p.validUntil), "d MMM yyyy", { locale: tr }) })}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          {/* Kalan gösterim sayısı */}
                          <p className="text-sm font-medium text-slate-700">
                            {t("pages:myAds.purchases.impressionsRemaining", { count: p.impressionsRemaining ?? 0 })}
                          </p>
                          {/* Tüketim ilerleme çubuğu */}
                          <div className="w-24 h-1.5 bg-slate-100 rounded-full mt-1">
                            <div
                              className="h-full bg-indigo-500 rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                        <Badge className={`${isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                          {isActive ? <><CheckCircle className="w-3 h-3 mr-1 inline" />{t("pages:myAds.stats.active")}</> : t("pages:myAds.stats.completed")}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── Yeni Reklam Satın Al ─── */}
      {activeTab === "buy" && (
        <div className="max-w-xl space-y-6">
          {/* Admin kill-switch aktifse uyarı bandı — form içeriği gizlenir */}
          {!adPurchasesEnabled && (
            <div className="flex items-start gap-3 p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800">
              <AlertTriangle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">{t("pages:myAds.buy.servicesPaused")}</p>
                <p className="text-rose-600 mt-0.5">{t("pages:myAds.buy.servicesPausedDesc")}</p>
              </div>
            </div>
          )}

          {/* Kill-switch kapalıysa satın alma formu gösterilmez */}
          {adPurchasesEnabled && (<>

          {/* Bilgilendirme kutusu */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex gap-3">
            <Info className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-indigo-800">
              <p className="font-medium mb-1">{t("pages:myAds.buy.howItWorks")}</p>
              <ul className="space-y-1 text-indigo-700">
                <li>• <span dangerouslySetInnerHTML={{ __html: t("pages:myAds.buy.howItWorks1") }} /></li>
                <li>• {t("pages:myAds.buy.howItWorks2")}</li>
                <li>• {t("pages:myAds.buy.howItWorks3")}</li>
              </ul>
            </div>
          </div>

          {/* Hedef türü seçimi */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">{t("pages:myAds.buy.targetType")}</label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { val: "TEST",     label: t("pages:myAds.buy.targetTest"),     desc: t("pages:myAds.buy.targetTestDesc"),     Icon: Package },
                { val: "WRITTEN",  label: t("pages:myAds.buy.targetWritten"),  desc: t("pages:myAds.buy.targetWrittenDesc"),  Icon: FileText },
                { val: "EDUCATOR", label: t("pages:myAds.buy.targetEducator"), desc: t("pages:myAds.buy.targetEducatorDesc"), Icon: User    },
              ].map(({ val, label, desc, Icon }) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => { setTargetType(val); setSelectedTestId(""); setSelectedWrittenPackageId(""); }}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    targetType === val
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-slate-200 hover:border-slate-300 bg-white"
                  }`}
                >
                  <Icon className={`w-5 h-5 mb-2 ${targetType === val ? "text-indigo-600" : "text-slate-400"}`} />
                  <p className="font-medium text-sm text-slate-900">{label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* TEST türünde test seçimi */}
          {targetType === "TEST" && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">{t("pages:myAds.buy.whichTest")}</label>
              {publishedTests.length === 0 ? (
                <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">
                  {t("pages:myAds.buy.noPublishedTests")}
                </p>
              ) : (
                <Select value={selectedTestId} onValueChange={setSelectedTestId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("pages:myAds.buy.selectTest")} />
                  </SelectTrigger>
                  <SelectContent>
                    {/* tt.title user-generated */}
                    {publishedTests.map((tt) => (
                      <SelectItem key={tt.id} value={tt.id}>{tt.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* WRITTEN türünde yazılı paket seçimi */}
          {targetType === "WRITTEN" && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">{t("pages:myAds.buy.whichWritten")}</label>
              {publishedWritten.length === 0 ? (
                <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">
                  {t("pages:myAds.buy.noPublishedWritten")}
                </p>
              ) : (
                <Select value={selectedWrittenPackageId} onValueChange={setSelectedWrittenPackageId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("pages:myAds.buy.selectWritten")} />
                  </SelectTrigger>
                  <SelectContent>
                    {/* p.title user-generated */}
                    {publishedWritten.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Paket seçimi */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">{t("pages:myAds.buy.adPackage")}</label>
            {packages.length === 0 ? (
              <p className="text-sm text-slate-500">{t("pages:myAds.buy.noPackages")}</p>
            ) : (
              <div className="space-y-2">
                {packages.map((pkg) => (
                  <button
                    key={pkg.id}
                    type="button"
                    onClick={() => {
                      setSelectedPackageId(pkg.id);
                      // Paket değiştiğinde fiyat farklılaşacağı için
                      // önceden uygulanmış promo kodu sıfırla — yeniden uygulasın.
                      setAppliedAdPromo(null);
                      setPromoInput("");
                      setPromoError(null);
                    }}
                    className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                      selectedPackageId === pkg.id
                        ? "border-indigo-500 bg-indigo-50"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">{pkg.name}</p>
                        <p className="text-sm text-slate-500 mt-0.5">
                          {t("pages:myAds.buy.packageInfo", { impressions: pkg.impressions ?? 0, days: pkg.durationDays })}
                        </p>
                      </div>
                      <p className="text-lg font-bold text-indigo-600">
                        {((pkg.priceCents ?? 0) / 100).toLocaleString("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 0 })}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sprint 15 #6 — Admin platform promo kodu (AD_PACKAGE scope).
              Eğitici opsiyonel olarak admin'den aldığı kodu uygular. Ücretsiz
              paketlerde gizlenir. Backend ValidatePlatformPromoCodeUseCase
              doğrular; satın alma sırasında PurchaseAdUseCase atomik olarak
              usedCount++ ve PlatformPromoCodeUsage kaydı yazar. */}
          {selectedPackageId && adBasePriceCents > 0 && (
            <div className="rounded-lg border border-slate-200 p-3 space-y-2 bg-slate-50">
              {appliedAdPromo ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-emerald-800">
                      <span className="font-semibold">✓ {appliedAdPromo.code}</span>
                      {" — "}
                      <span>%{appliedAdPromo.percentOff} indirim</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemovePromo}
                      className="text-xs text-emerald-700 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded"
                    >
                      Kaldır
                    </button>
                  </div>
                  {/* Önce/sonra fiyat — şeffaflık (TKHK uyumu) */}
                  <div className="text-xs text-slate-600 flex items-center gap-2">
                    <span className="line-through">
                      {(adBasePriceCents / 100).toLocaleString("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 0 })}
                    </span>
                    <span className="font-semibold text-emerald-700">
                      {(adDiscountedCents / 100).toLocaleString("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 0 })}
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  <label htmlFor="ad-promo-code" className="text-xs font-medium text-slate-600">
                    Promo kodun var mı? (Sınav Salonu yöneticisinden)
                  </label>
                  <div className="flex gap-2">
                    <Input
                      id="ad-promo-code"
                      value={promoInput}
                      onChange={(e) => setPromoInput(e.target.value)}
                      placeholder="KOD"
                      className="flex-1 uppercase h-9"
                      aria-invalid={Boolean(promoError)}
                      aria-describedby={promoError ? "ad-promo-error" : undefined}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleValidatePromo}
                      disabled={promoLoading || !promoInput.trim()}
                    >
                      {promoLoading ? "..." : "Uygula"}
                    </Button>
                  </div>
                  {promoError && (
                    <p id="ad-promo-error" role="alert" className="text-xs text-rose-600">
                      {promoError}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Satın alma butonu */}
          <Button
            onClick={handlePurchase}
            disabled={
              purchaseMutation.isPending ||
              !selectedPackageId ||
              (targetType === "TEST" && !selectedTestId) ||
              (targetType === "WRITTEN" && !selectedWrittenPackageId)
            }
            className="w-full bg-indigo-600 hover:bg-indigo-700"
          >
            {purchaseMutation.isPending ? t("pages:myAds.buy.processing") : t("pages:myAds.buy.buyAd")}
          </Button>
          </>)}
        </div>
      )}
    </div>
  );
}
