import { useState, useDeferredValue } from "react";
import { useTranslation } from "react-i18next";
import { entities } from "@/api/dalClient";
import api from "@/lib/api/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import TestPackageCard from "@/components/ui/TestPackageCard";
import { TunnelGrid } from "@/components/tunnel/TunnelGrid";
import { Search, SlidersHorizontal, X, Star, ArrowUpDown } from "lucide-react";
import { buildPageUrl, useAppNavigate } from "@/lib/navigation";

export default function Explore() {
  const { t } = useTranslation(["pages"]);
  const urlParams = new URLSearchParams(window.location.search);
  const initialQuery = urlParams.get("q") || "";
  const initialExamType = urlParams.get("exam_type") || "";

  const { user } = useAuth();
  const navigate = useAppNavigate();
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [selectedExamType, setSelectedExamType] = useState(initialExamType);
  const [selectedDifficulty, setSelectedDifficulty] = useState("");
  const [priceRange, setPriceRange] = useState("");
  const [minRating, setMinRating] = useState(0);
  const [selectedEducator, setSelectedEducator] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  // Sıralama — filtreden bağımsız: "recommended" (varsayılan) / "rating" / "popular"
  const [sortBy, setSortBy] = useState("recommended");
  const [contentTab, setContentTab] = useState("tests"); // "tests" | "tunnels"
  const contentTabBtn = (key) =>
    "inline-flex items-center gap-2 whitespace-nowrap border-b-2 -mb-px px-4 py-2.5 min-h-10 text-sm font-medium transition-colors " +
    (contentTab === key ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-600 hover:text-slate-900");

  // useDeferredValue: kullanıcı yazarken UI bloklanmaz; 2+ karakter sunucuya gider
  const deferredSearch = useDeferredValue(searchQuery);
  const serverQuery = deferredSearch.trim().length >= 2 ? deferredSearch.trim() : "";

  const { data: examTypes = [] } = useQuery({
    queryKey: ["examTypes"],
    queryFn: () => entities.ExamType.filter({ is_active: true }),
  });

  // serverQuery veya examType değiştiğinde sunucuya yeni istek at
  const { data: allTests = [], isLoading } = useQuery({
    queryKey: ["tests", serverQuery, selectedExamType],
    queryFn: () => entities.TestPackage.filter({
      is_published: true,
      is_active: true,
      ...(serverQuery && { q: serverQuery }),
      ...(selectedExamType && { exam_type_id: selectedExamType }),
    }, "-created_date", 100),
    staleTime: 30_000,
  });

  const { data: purchases = [] } = useQuery({
    queryKey: ["purchases", user?.id],
    queryFn: () => entities.Purchase.filter({}),
    enabled: !!user,
  });

  const { data: results = [] } = useQuery({
    queryKey: ["results", user?.email],
    queryFn: () => user ? entities.TestResult.filter({ user_email: user.email }) : [],
    enabled: !!user,
  });

  const { data: testProgress = [] } = useQuery({
    queryKey: ["testProgress", user?.id],
    queryFn: () => entities.TestProgress.filter({ user_email: user?.email, is_completed: false }),
    enabled: !!user,
  });

  // Aday'ın takip ettiği sınav türleri — Keşfet sıralamasında bunlar öne çekilir.
  // /follows?followType=EXAM_TYPE ham listesi; backend yoksa boş döner.
  const { data: examTypeFollows = [] } = useQuery({
    queryKey: ["examTypeFollows", user?.id],
    queryFn: async () => {
      try {
        const { data } = await api.get("/follows", { params: { followType: "EXAM_TYPE" } });
        return Array.isArray(data) ? data : (data?.items ?? []);
      } catch { return []; }
    },
    enabled: !!user,
    staleTime: 60_000,
  });
  const followedExamTypeIds = new Set(
    examTypeFollows.map((f) => f.examTypeId ?? f.examType?.id).filter(Boolean)
  );

  const purchasedIds = new Set(purchases.map(p => p.test_package_id));
  const completedIds = new Set(results.map(r => r.test_package_id));
  const inProgressIds = new Set(testProgress.map(p => p.test_package_id));
  // Paket bazında agrega durum — paketin TÜM testlerine göre Başla/Devam Et/İncele kararı
  const packageAggregate = {};
  purchases.forEach((p) => {
    const pkgId = p.package_id ?? p.packageId ?? p.test_package_id;
    const pkgTests = p.package?.tests ?? [];
    if (!pkgId || pkgTests.length === 0) return;
    const attempts = Array.isArray(p.attempts) ? p.attempts : [];
    const statusByTest = new Map();
    for (const a of attempts) if (a?.testId) statusByTest.set(a.testId, a.status);
    let completedCount = 0;
    let startedCount = 0;
    for (const t of pkgTests) {
      const s = statusByTest.get(t.id);
      if (s === "SUBMITTED" || s === "TIMEOUT") completedCount++;
      if (s) startedCount++;
    }
    packageAggregate[pkgId] = {
      allCompleted: completedCount === pkgTests.length,
      noneStarted: startedCount === 0,
    };
  });
  const attemptByTestId = {};
  purchases.forEach((p) => {
    if (p.test_package_id && p.attempt) attemptByTestId[p.test_package_id] = p.attempt;
  });

  // Metin araması + examType sunucuda yapılıyor;
  // difficulty, price, rating, educator client-side kalan hafif filtreler.
  // Aday Keşfet sayfasında zaten satın aldığı paketleri görmemeli — onları
  // 'Satın Alınan Testler' sayfasında görüyor. Burada potansiyel yeni alımlar
  // ve ilgi alanına uyan öneriler listelenir.
  const filteredTests = allTests.filter((test) => {
    // Satın alınmış paketleri Keşfet'ten gizle
    if (purchasedIds.has(test.id)) return false;

    const matchesDifficulty = !selectedDifficulty || test.difficulty === selectedDifficulty;
    const matchesRating = !minRating || (test.average_rating || 0) >= minRating;
    // Eğitici filtresi text search'e dönüştürüldü — sistemdeki tüm eğiticileri
    // dropdown'a yığmak (binlerce) UX açısından mümkün değil. İsim VEYA email
    // alanında case-insensitive substring araması yapılır.
    const educatorQuery = selectedEducator.trim().toLowerCase();
    const matchesEducator = !educatorQuery
      || (test.educator_name || "").toLowerCase().includes(educatorQuery)
      || (test.educator_email || "").toLowerCase().includes(educatorQuery);

    let matchesPrice = true;
    if (priceRange === "100to250") matchesPrice = test.price >= 100 && test.price <= 250;
    else if (priceRange === "251to500") matchesPrice = test.price >= 251 && test.price <= 500;
    else if (priceRange === "501to1000") matchesPrice = test.price >= 501 && test.price <= 1000;
    else if (priceRange === "over1000") matchesPrice = test.price > 1000;

    return matchesDifficulty && matchesPrice && matchesRating && matchesEducator;
  });

  // İlgi alanı (takip edilen sınav türü) bazlı ranking: aday'ın takip ettiği
  // sınav türündeki paketler listenin başına çekilir. Diğerleri API'nin
  // döndüğü sıra (yayım tarihi DESC) korunur. Hiç takip yoksa sıralama
  // değişmez. View history bazlı puanlama backend desteği gerektirir; sonra.
  // Sıralama: kullanıcı seçimi (Puana göre / Popüler) filtreden bağımsız uygulanır.
  // "recommended" (varsayılan) → takip edilen sınav türleri öne çekilir (mevcut davranış).
  let sortedTests;
  if (sortBy === "rating") {
    sortedTests = [...filteredTests].sort(
      (a, b) => (b.average_rating || 0) - (a.average_rating || 0) || (b.total_sales || 0) - (a.total_sales || 0),
    );
  } else if (sortBy === "popular") {
    sortedTests = [...filteredTests].sort(
      (a, b) => (b.total_sales || 0) - (a.total_sales || 0) || (b.average_rating || 0) - (a.average_rating || 0),
    );
  } else if (sortBy === "new") {
    sortedTests = [...filteredTests].sort(
      (a, b) => new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime(),
    );
  } else if (followedExamTypeIds.size > 0) {
    sortedTests = [...filteredTests].sort((a, b) => {
      const aMatch = followedExamTypeIds.has(a.exam_type_id) ? 1 : 0;
      const bMatch = followedExamTypeIds.has(b.exam_type_id) ? 1 : 0;
      return bMatch - aMatch; // takip edilenler önce
    });
  } else {
    sortedTests = filteredTests;
  }

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedExamType("");
    setSelectedDifficulty("");
    setPriceRange("");
    setMinRating(0);
    setSelectedEducator("");
  };

  const hasActiveFilters = searchQuery || selectedExamType || selectedDifficulty || priceRange || minRating > 0 || selectedEducator;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900">{t("pages:explore.title")}</h1>
        <p className="text-slate-500 mt-2">{t("pages:explore.subtitle")}</p>
      </div>

      {/* İçerik sekmeleri: Testler | Tüneller (site standardı alt-çizgi stili) */}
      <div className="mb-6 flex flex-wrap gap-1 border-b border-slate-200">
        <button type="button" onClick={() => setContentTab("tests")} className={contentTabBtn("tests")}>Testler</button>
        <button type="button" onClick={() => setContentTab("tunnels")} className={contentTabBtn("tunnels")}>Tüneller</button>
      </div>

      {contentTab === "tunnels" ? (
        <TunnelGrid mode="discover" />
      ) : (
      <>
      {/* Search & Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-8">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              placeholder={t("pages:explore.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 h-12 border-slate-200"
            />
          </div>
          <Button
            variant="outline"
            className="lg:hidden"
            onClick={() => setShowFilters(!showFilters)}
          >
            <SlidersHorizontal className="w-4 h-4 mr-2" />
            {t("pages:explore.filtersButton")}
          </Button>
          <div className={`flex flex-col lg:flex-row gap-4 ${showFilters ? "block" : "hidden lg:flex"}`}>
            <Select value={selectedExamType} onValueChange={setSelectedExamType}>
              <SelectTrigger aria-label={t("pages:explore.filter.examTypeAria")} className="w-full lg:w-44 h-12">
                <SelectValue placeholder={t("pages:explore.filter.examType")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>{t("pages:explore.filter.all")}</SelectItem>
                {examTypes.map((exam) => (
                  /* exam.name user-generated — çevrilmez */
                  <SelectItem key={exam.id} value={exam.id}>{exam.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedDifficulty} onValueChange={setSelectedDifficulty}>
              <SelectTrigger aria-label={t("pages:explore.filter.difficultyAria")} className="w-full lg:w-36 h-12">
                <SelectValue placeholder={t("pages:explore.filter.difficulty")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>{t("pages:explore.filter.all")}</SelectItem>
                <SelectItem value="easy">{t("pages:testCard.difficulty.easy")}</SelectItem>
                <SelectItem value="medium">{t("pages:testCard.difficulty.medium")}</SelectItem>
                <SelectItem value="hard">{t("pages:testCard.difficulty.hard")}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={priceRange} onValueChange={setPriceRange}>
              <SelectTrigger aria-label={t("pages:explore.filter.priceAria")} className="w-full lg:w-36 h-12">
                <SelectValue placeholder={t("pages:explore.filter.price")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>{t("pages:explore.filter.all")}</SelectItem>
                <SelectItem value="100to250">{t("pages:explore.filter.price100to250")}</SelectItem>
                <SelectItem value="251to500">{t("pages:explore.filter.price251to500")}</SelectItem>
                <SelectItem value="501to1000">{t("pages:explore.filter.price501to1000")}</SelectItem>
                <SelectItem value="over1000">{t("pages:explore.filter.priceOver1000")}</SelectItem>
              </SelectContent>
            </Select>

            {/* Eğitici filtresi — text input. Marketplace'te potansiyel binlerce
                eğitici olabileceği için dropdown ölçeklenmez. Aday eğitici adının
                bir kısmını yazar, client-side filter case-insensitive eşler. */}
            <Input
              aria-label={t("pages:explore.filter.educatorAria")}
              placeholder={t("pages:explore.filter.educator")}
              value={selectedEducator}
              onChange={(e) => setSelectedEducator(e.target.value)}
              className="w-full lg:w-44 h-12"
            />

            <div className="flex items-center gap-2 px-3 h-12 bg-white border rounded-md min-w-[140px]">
              <Star className="w-4 h-4 text-amber-500" />
              <span className="text-sm text-slate-600 w-6">{minRating}+</span>
              <Slider
                value={[minRating]}
                onValueChange={([v]) => setMinRating(v)}
                max={5}
                step={1}
                className="w-16"
                aria-label={t("pages:explore.filter.ratingAria")}
              />
            </div>
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100">
            <span className="text-sm text-slate-500">{t("pages:explore.filter.active")}</span>
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-rose-600 hover:text-rose-700">
              <X className="w-4 h-4 mr-1" />
              {t("pages:explore.filter.clear")}
            </Button>
          </div>
        )}
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 h-80 animate-pulse">
              <div className="h-40 bg-slate-200 rounded-t-2xl" />
              <div className="p-5 space-y-3">
                <div className="h-5 bg-slate-200 rounded w-3/4" />
                <div className="h-4 bg-slate-200 rounded w-1/2" />
                <div className="h-10 bg-slate-200 rounded mt-6" />
              </div>
            </div>
          ))}
        </div>
      ) : sortedTests.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-20 h-20 mx-auto bg-slate-100 rounded-full flex items-center justify-center mb-4">
            <Search className="w-10 h-10 text-slate-400" />
          </div>
          <h3 className="text-xl font-semibold text-slate-900">{t("pages:explore.empty.title")}</h3>
          <p className="text-slate-500 mt-2">{t("pages:explore.empty.description")}</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-4 mb-6">
            <p className="text-sm text-slate-500">{t("pages:explore.countFound", { count: sortedTests.length })}</p>
            <div className="flex items-center gap-2 shrink-0">
              <ArrowUpDown className="w-4 h-4 text-slate-400" aria-hidden="true" />
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger aria-label={t("pages:sort.label")} className="w-40 h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recommended">{t("pages:sort.recommended")}</SelectItem>
                  <SelectItem value="new">{t("pages:sort.new")}</SelectItem>
                  <SelectItem value="popular">{t("pages:sort.popular")}</SelectItem>
                  <SelectItem value="rating">{t("pages:sort.rating")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
            {sortedTests.map((test) => {
              const agg = packageAggregate[test.id];
              const isCompleted = agg ? agg.allCompleted : completedIds.has(test.id);
              const isInProgress = agg
                ? (!agg.allCompleted && !agg.noneStarted)
                : inProgressIds.has(test.id);
              return (
                <TestPackageCard
                  key={test.id}
                  test={test}
                  isPurchased={purchasedIds.has(test.id)}
                  isCompleted={isCompleted}
                  isInProgress={isInProgress}
                  attempt={attemptByTestId[test.id] ?? null}
                  onBuy={() => navigate(buildPageUrl("TestDetail", { id: test.id }))}
                />
              );
            })}
          </div>
        </>
      )}
      </>
      )}
    </div>
  );
}