import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { createPageUrl } from "@/utils";
import { entities } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import TestPackageCard from "@/components/ui/TestPackageCard";
import PaginationBar from "@/components/ui/PaginationBar";
import { Search, ShoppingBag, Filter, X } from "lucide-react";

const PAGE_SIZE = 10;

export default function MyTests() {
  const { t } = useTranslation(["pages"]);
  const { user } = useAuth();
  const [selectedExamType, setSelectedExamType] = useState("all");
  const [selectedEducator, setSelectedEducator] = useState("all");
  const [completionFilter, setCompletionFilter] = useState("all");

  const { data: purchases = [], isLoading: loadingPurchases } = useQuery({
    queryKey: ["myPurchases", user?.id],
    queryFn: () => entities.Purchase.filter({}),
    enabled: !!user,
  });

  // Paketleri purchase response'undan türet — backend findByCandidateId artık
  // card'ın ihtiyacı tüm alanları include ediyor (coverImageUrl, educator,
  // difficulty, tests + examType + question count). Eskiden her purchase için
  // ayrı GET /marketplace/packages/:id çağrısı vardı; N+1 idi ve biri fail
  // olunca tüm sayfa boşalıyordu. Şimdi tek query'den hepsi.
  const testPackages = useMemo(() => {
    const seen = new Set();
    const result = [];
    for (const p of purchases) {
      const pkg = p?.package;
      if (!pkg || seen.has(pkg.id)) continue;
      seen.add(pkg.id);
      // Yayımı kalkmış paketleri gizle (eski satın alma korunur ama listede yok)
      if (!pkg.publishedAt) continue;
      const firstTestWithType = (pkg.tests ?? []).find((t) => t.examTypeId != null);
      result.push({
        id: pkg.id,
        title: pkg.title ?? "",
        description: pkg.description ?? "",
        educator_email: pkg.educatorId ?? "",
        educator_name: pkg.educator?.username ?? "",
        exam_type_id: firstTestWithType?.examTypeId ?? null,
        exam_type_name: firstTestWithType?.examType?.name ?? null,
        question_count: (pkg.tests ?? []).reduce(
          (s, t) => s + (t._count?.questions ?? 0),
          0,
        ),
        test_count: (pkg.tests ?? []).length,
        price: pkg.priceCents != null ? pkg.priceCents / 100 : 0,
        priceCents: pkg.priceCents ?? 0,
        difficulty: pkg.difficulty ?? "medium",
        cover_image: pkg.coverImageUrl ?? null,
        is_published: !!pkg.publishedAt,
        is_active: !!pkg.publishedAt,
        average_rating: null,
        rating_count: 0,
        created_date: pkg.publishedAt,
      });
    }
    return result;
  }, [purchases]);

  const { data: results = [] } = useQuery({
    queryKey: ["myResults", user?.id],
    queryFn: () => entities.TestResult.filter({ user_email: user?.email }),
    enabled: !!user,
  });

  const { data: testProgress = [] } = useQuery({
    queryKey: ["testProgress", user?.id],
    queryFn: () => entities.TestProgress.filter({ user_email: user?.email, is_completed: false }),
    enabled: !!user,
  });

  const purchasedTestIds = new Set(purchases.map(p => p.test_package_id));

  // Sınav türü filtresi: tüm aktif türleri değil, yalnızca KULLANICININ satın aldığı
  // paketlerde geçen türleri göster. examTypes endpoint çağrısı yapılmaz —
  // her paketin exam_type_id/exam_type_name alanları zaten purchases response'unda
  // mevcut, dolayısıyla buradan türetilir (deduped + alfabetik sıra).
  const examTypes = useMemo(() => {
    const map = new Map();
    for (const pkg of testPackages) {
      if (!purchasedTestIds.has(pkg.id)) continue;
      if (!pkg.exam_type_id || !pkg.exam_type_name) continue;
      if (!map.has(pkg.exam_type_id)) {
        map.set(pkg.exam_type_id, { id: pkg.exam_type_id, name: pkg.exam_type_name });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "tr"));
    // purchases.length tetikleyici — testPackages içeriği purchases'a bağlı
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testPackages, purchases.length]);

  // testId → attempt map'i: tamamlanan testlerde kullanılan süreyi TestPackageCard'a geçirmek için
  const attemptByTestId = {};
  purchases.forEach((p) => {
    if (p.test_package_id && p.attempt) {
      attemptByTestId[p.test_package_id] = p.attempt;
    }
  });

  const completedTestIds = new Set(results.map(r => r.test_package_id));
  const inProgressTestIds = new Set(testProgress.map(p => p.test_package_id));

  // Paket bazında özet durum — paket içindeki TÜM ExamTest'lerin agrega durumu:
  //   allCompleted: hepsi tamamlanmış (SUBMITTED/TIMEOUT) → "İncele"
  //   noneStarted:  hiçbiri başlamamış                    → "Teste Başla"
  //   hasMixed:     karışık veya en az biri IN_PROGRESS   → "Devam Et"
  // `purchase.package.tests[]` paketin tüm ExamTest id'leri; `purchase.attempts[]` ise
  // tüm attempt durumlarını içerir (status alanıyla birlikte).
  const packageAggregate = {}; // packageId → { allCompleted, noneStarted }
  purchases.forEach((p) => {
    const pkgId = p.package_id ?? p.packageId ?? p.test_package_id;
    if (!pkgId) return;
    const pkgTests = p.package?.tests ?? [];
    if (pkgTests.length === 0) return;
    const attempts = Array.isArray(p.attempts) ? p.attempts : [];
    const statusByTest = new Map();
    for (const a of attempts) {
      if (a?.testId) statusByTest.set(a.testId, a.status);
    }
    let completedCount = 0;
    let startedCount = 0;
    for (const t of pkgTests) {
      const s = statusByTest.get(t.id);
      if (s === "SUBMITTED" || s === "TIMEOUT") completedCount++;
      if (s) startedCount++;
    }
    const allCompleted = completedCount === pkgTests.length;
    const noneStarted = startedCount === 0;
    packageAggregate[pkgId] = { allCompleted, noneStarted };
  });
  
  let purchasedTests = testPackages.filter(t => purchasedTestIds.has(t.id));
  
  // Apply filters
  if (selectedExamType !== "all") {
    purchasedTests = purchasedTests.filter(t => t.exam_type_id === selectedExamType);
  }
  
  if (selectedEducator !== "all") {
    purchasedTests = purchasedTests.filter(t => t.educator_email === selectedEducator);
  }
  
  if (completionFilter === "completed") {
    purchasedTests = purchasedTests.filter(t => completedTestIds.has(t.id));
  } else if (completionFilter === "in_progress") {
    // Devam Eden = en az bir attempt başlamış (IN_PROGRESS/PAUSED) ama henüz tamamlanmamış
    purchasedTests = purchasedTests.filter(
      t => inProgressTestIds.has(t.id) && !completedTestIds.has(t.id),
    );
  } else if (completionFilter === "pending") {
    // Bekleyen = hiç attempt başlamamış (tamamlanmamış VE devam etmiyor)
    purchasedTests = purchasedTests.filter(
      t => !completedTestIds.has(t.id) && !inProgressTestIds.has(t.id),
    );
  }
  
  const pendingTests = purchasedTests.filter(t => !completedTestIds.has(t.id));
  const completedTests = purchasedTests.filter(t => completedTestIds.has(t.id));

  // Sıralama: Devam edilecek → Başlanmamış → Tamamlanan
  // packageAggregate her paketin TestPackageCard CTA mantığıyla aynı:
  //   allCompleted=true → "İncele" (Bitenler — en alt)
  //   noneStarted=true  → "Teste Başla" (Başlanmamış — orta)
  //   diğer            → "Devam Et" (en az bir attempt başlamış — en üst)
  // Aynı tier içinde Array.prototype.sort stable olduğu için orijinal sıra
  // (en yeni satın alma üstte) korunur.
  const tierOf = (pkgId) => {
    const agg = packageAggregate[pkgId];
    if (!agg) return 1; // veri yoksa "Başlanmamış" gibi davran
    if (agg.allCompleted) return 2; // Tamamlanan — en alt
    if (agg.noneStarted) return 1;  // Başlanmamış — orta
    return 0; // Devam edilecek — en üst
  };
  purchasedTests = [...purchasedTests].sort((a, b) => tierOf(a.id) - tierOf(b.id));

  // Paging — 10 paket / sayfa. Filtre değişimlerinde 1. sayfaya dön.
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [selectedExamType, selectedEducator, completionFilter]);
  const totalPages = Math.max(1, Math.ceil(purchasedTests.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedTests = useMemo(
    () => purchasedTests.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    // purchasedTests her render'da yeni referans olduğu için dep listesine eklenmedi;
    // currentPage + filtreler tetikler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentPage, selectedExamType, selectedEducator, completionFilter, purchases.length],
  );

  // Eğitici filtresi: yalnızca aday'ın satın aldığı paketlere ait eğiticiler.
  // testPackages zaten purchases response'undan türetildiği için extra fetch yok.
  // Map ile educator_email (educatorId) üzerinden dedupe + isim alfabetik sıralama.
  const educators = useMemo(() => {
    const map = new Map();
    for (const pkg of testPackages) {
      if (!purchasedTestIds.has(pkg.id)) continue;
      if (!pkg.educator_email) continue;
      if (!map.has(pkg.educator_email)) {
        map.set(pkg.educator_email, {
          email: pkg.educator_email,
          name: pkg.educator_name || pkg.educator_email,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "tr"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testPackages, purchases.length]);

  const hasActiveFilters = selectedExamType !== "all" || selectedEducator !== "all" || completionFilter !== "all";
  
  const clearFilters = () => {
    setSelectedExamType("all");
    setSelectedEducator("all");
    setCompletionFilter("all");
  };

  const isLoading = loadingPurchases;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">{t("pages:myTests.title")}</h1>
        <p className="text-slate-500 mt-2">{t("pages:myTests.subtitle")}</p>
      </div>

      {!isLoading && purchases.length > 0 && (
        <div className="mb-6 bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-5 h-5 text-slate-600" />
            <h2 className="font-semibold text-slate-900">{t("pages:myTests.filter.title")}</h2>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="ml-auto text-indigo-600 hover:text-indigo-700"
              >
                <X className="w-4 h-4 mr-1" />
                {t("pages:myTests.filter.clear")}
              </Button>
            )}
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">{t("pages:myTests.filter.examTypeLabel")}</label>
              <Select value={selectedExamType} onValueChange={setSelectedExamType}>
                <SelectTrigger aria-label={t("pages:myTests.filter.examTypeAria")}>
                  <SelectValue placeholder={t("pages:myTests.filter.all")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("pages:myTests.filter.all")}</SelectItem>
                  {examTypes.map((exam) => (
                    <SelectItem key={exam.id} value={exam.id}>
                      {/* exam.name user-generated — çevrilmez */}
                      {exam.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">{t("pages:myTests.filter.educatorLabel")}</label>
              <Select value={selectedEducator} onValueChange={setSelectedEducator}>
                <SelectTrigger aria-label={t("pages:myTests.filter.educatorAria")}>
                  <SelectValue placeholder={t("pages:myTests.filter.all")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("pages:myTests.filter.all")}</SelectItem>
                  {educators.map((educator) => (
                    <SelectItem key={educator.email} value={educator.email}>
                      {/* educator.name user-generated — çevrilmez */}
                      {educator.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">{t("pages:myTests.filter.completionLabel")}</label>
              <Select value={completionFilter} onValueChange={setCompletionFilter}>
                <SelectTrigger aria-label={t("pages:myTests.filter.completionAria")}>
                  <SelectValue placeholder={t("pages:myTests.filter.all")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("pages:myTests.filter.all")}</SelectItem>
                  <SelectItem value="pending">{t("pages:myTests.filter.pending")}</SelectItem>
                  <SelectItem value="in_progress">{t("pages:myTests.filter.inProgress")}</SelectItem>
                  <SelectItem value="completed">{t("pages:myTests.filter.completed")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 h-80 animate-pulse">
              <div className="h-40 bg-slate-200 rounded-t-2xl" />
              <div className="p-5 space-y-3">
                <div className="h-5 bg-slate-200 rounded w-3/4" />
                <div className="h-4 bg-slate-200 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : purchases.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
          <div className="w-20 h-20 mx-auto bg-slate-100 rounded-full flex items-center justify-center mb-4">
            <ShoppingBag className="w-10 h-10 text-slate-400" />
          </div>
          <h3 className="text-xl font-semibold text-slate-900">{t("pages:myTests.empty.title")}</h3>
          <p className="text-slate-500 mt-2 mb-6">{t("pages:myTests.empty.desc")}</p>
          <Link to={createPageUrl("Explore")}>
            <Button className="bg-indigo-600 hover:bg-indigo-700">
              <Search className="w-4 h-4 mr-2" />
              {t("pages:myTests.empty.cta")}
            </Button>
          </Link>
        </div>
      ) : (
        <>
          {/* Sprint 13 — auto-fill: ekran genişliğine göre 1-6 sütun (min 280px kart).
              Tailwind sm/lg breakpoint'leriyle sabit 3 sütun verince geniş ekranda
              kartlar çok genişliyor ve garip görünüyordu. */}
          <div className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
            {pagedTests.map((test) => {
              const agg = packageAggregate[test.id];
              // Agrega varsa kullan; yoksa eski tek-test mantığına düş (geriye dönük uyum)
              const isCompleted = agg ? agg.allCompleted : completedTestIds.has(test.id);
              const isInProgress = agg
                ? (!agg.allCompleted && !agg.noneStarted)
                : inProgressTestIds.has(test.id);
              return (
                <TestPackageCard
                  key={test.id}
                  test={test}
                  isPurchased={true}
                  isCompleted={isCompleted}
                  isInProgress={isInProgress}
                  showEducator={true}
                  attempt={attemptByTestId[test.id] ?? null}
                />
              );
            })}
          </div>
          <PaginationBar
            page={currentPage}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}