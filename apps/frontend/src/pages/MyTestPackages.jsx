import { useState, useEffect, useMemo } from "react";
// Sprint 12 #1 — xlsx (429 KB) lazy load: sadece "Excel'e aktar" butonuna basılınca yüklenir.
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { createPageUrl } from "@/utils";
import { entities } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api/apiClient";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Edit2,
  Eye,
  EyeOff,
  BookOpen,
  Search,
  Filter,
  Download,
  X,
  ChevronLeft,
  ChevronRight,
  Star,
} from "lucide-react";

import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function MyTestPackages() {
  const { t } = useTranslation(["pages"]);
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [difficultyFilter, setDifficultyFilter] = useState("all");
  const [examTypeFilter, setExamTypeFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const queryClient = useQueryClient();

  const { data: tests = [], isLoading, isError } = useQuery({
    queryKey: ["myTestPackages", user?.id],
    queryFn: () => entities.TestPackage.filter({ educator_owns: true }),
    enabled: !!user,
  });

  const { data: examTypes = [] } = useQuery({
    queryKey: ["examTypes"],
    queryFn: () => entities.ExamType.filter({ is_active: true }),
    enabled: !!user,
  });

  const testsWithRealCounts = tests;

  // Görüntülenme istatistikleri — paket başına totalViews, uniqueViewers, last7Days.
  // Eğiticinin kendi paketleri için backend'de yetki kontrolü var; admin de aynı endpoint'i çağırabilir.
  // Liste değiştikçe yenilenir (tests.length değiştiğinde).
  const { data: viewStats = [] } = useQuery({
    queryKey: ["myPackageViews", user?.id, tests.length],
    queryFn: () => entities.PackageView.educatorViewStats(),
    enabled: !!user && tests.length > 0,
    staleTime: 30_000,
  });
  const viewStatsById = useMemo(() => {
    const m = new Map();
    for (const s of viewStats) m.set(s.packageId, s);
    return m;
  }, [viewStats]);

  const togglePublishMutation = useMutation({
    mutationFn: ({ id, is_published }) =>
      is_published
        ? api.put(`/packages/${id}/publish`)
        : api.put(`/packages/${id}/unpublish`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myTestPackages"] });
      toast.success(t("pages:myTestPackages.toasts.statusUpdated"));
    },
    onError: (err) => {
      toast.error(err?.message || t("pages:myTestPackages.toasts.actionFailed"));
    },
  });

  const filteredTests = testsWithRealCounts.filter((test) => {
    const matchesSearch =
      test.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (test.description || "")?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "published" && test.is_published) ||
      (statusFilter === "draft" && !test.is_published);
    const matchesDifficulty = difficultyFilter === "all" || test.difficulty === difficultyFilter;
    const matchesExamType = examTypeFilter === "all" || test.exam_type_id === examTypeFilter;

    return matchesSearch && matchesStatus && matchesDifficulty && matchesExamType;
  });

  // Pagination
  const totalPages = Math.ceil(filteredTests.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedTests = filteredTests.slice(startIndex, startIndex + itemsPerPage);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, difficultyFilter, examTypeFilter]);

  const hasActiveFilters = searchQuery || statusFilter !== "all" || difficultyFilter !== "all" || examTypeFilter !== "all";

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setDifficultyFilter("all");
    setExamTypeFilter("all");
    setCurrentPage(1);
  };

  const exportToExcel = async () => {
    // Sprint 12 #1: xlsx (~429 KB) yalnızca burada gerek; sayfa açılışında değil
    const XLSX = await import("xlsx");
    const h = t("pages:myTestPackages.excel.headers", { returnObjects: true });
    const publishedLabel = t("pages:myTestPackages.excel.published");
    const draftLabel = t("pages:myTestPackages.excel.draft");
    const rows = [
      [h.title, h.examType, h.status, h.testCount, h.questionCount, h.price, h.sales, h.rating, h.createdAt],
      ...filteredTests.map(test => [
        test.title,
        test.exam_type_name || "-",
        test.is_published ? publishedLabel : draftLabel,
        (test.tests ?? []).length,
        test.question_count || 0,
        test.price,
        test.total_sales || 0,
        test.average_rating != null ? Number(test.average_rating).toFixed(1) : "-",
        (test.createdAt || test.created_date || "").toString().slice(0, 10),
      ]),
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, t("pages:myTestPackages.excel.sheetName"));
    const filePrefix = t("pages:myTestPackages.excel.filePrefix");
    XLSX.writeFile(wb, `${filePrefix}-${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success(t("pages:myTestPackages.toasts.excelDownloaded"));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{t("pages:titles.myTestPackages")}</h1>
          <p className="text-slate-500 mt-2">{t("pages:titles.myTestPackagesDesc")}</p>
        </div>
        <Link to={createPageUrl("CreateTest")}>
          <Button className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="w-4 h-4 mr-2" />
            {t("pages:titles.createTest")}
          </Button>
        </Link>
      </div>

      {/* Filters */}
      {!isLoading && tests.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder={t("pages:myTestPackages.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full lg:w-40">
                <SelectValue placeholder={t("pages:myTestPackages.filter.statusPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("pages:myTestPackages.filter.allStatuses")}</SelectItem>
                <SelectItem value="published">{t("pages:myTestPackages.filter.published")}</SelectItem>
                <SelectItem value="draft">{t("pages:myTestPackages.filter.draft")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={examTypeFilter} onValueChange={setExamTypeFilter}>
              <SelectTrigger className="w-full lg:w-40">
                <SelectValue placeholder={t("pages:myTestPackages.filter.examTypePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("pages:myTestPackages.filter.allExamTypes")}</SelectItem>
                {examTypes.map((exam) => (
                  /* exam.name user-generated — çevrilmez */
                  <SelectItem key={exam.id} value={exam.id}>{exam.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={exportToExcel}
              className="w-full lg:w-auto"
            >
              <Download className="w-4 h-4 mr-2" />
              {t("pages:myTestPackages.filter.exportExcel")}
            </Button>
            {hasActiveFilters && (
              <Button variant="ghost" onClick={clearFilters} className="w-full lg:w-auto">
                <X className="w-4 h-4 mr-2" />
                {t("pages:myTestPackages.filter.clear")}
              </Button>
            )}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-white rounded-xl border border-slate-200 animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
          <p className="text-slate-500">{t("pages:myTestPackages.empty.errorLoad")}</p>
        </div>
      ) : tests.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
          <BookOpen className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-slate-900">{t("pages:myTestPackages.empty.noTestsTitle")}</h3>
          <p className="text-slate-500 mt-2 mb-6">{t("pages:myTestPackages.empty.noTestsDesc")}</p>
          <Link to={createPageUrl("CreateTest")}>
            <Button className="bg-indigo-600 hover:bg-indigo-700">
              <Plus className="w-4 h-4 mr-2" />
              {t("pages:myTestPackages.empty.createFirst")}
            </Button>
          </Link>
        </div>
      ) : filteredTests.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
          <Filter className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-slate-900">{t("pages:myTestPackages.empty.noResultsTitle")}</h3>
          <p className="text-slate-500 mt-2 mb-6">{t("pages:myTestPackages.empty.noResultsDesc")}</p>
          <Button variant="outline" onClick={clearFilters}>
            <X className="w-4 h-4 mr-2" />
            {t("pages:myTestPackages.empty.clearFilters")}
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {paginatedTests.map((test) => {
            const safePrice = test.price ?? (test.priceCents != null ? test.priceCents / 100 : 0);
            return (
              <div
                key={test.id}
                className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h3 className="font-semibold text-lg text-slate-900">{test.title}</h3>
                      {test.exam_type_name && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-medium">
                          {test.exam_type_name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-6 text-sm text-slate-500">
                      <span>{t("pages:myTestPackages.card.stats", { tests: (test.tests ?? []).length, questions: test.question_count || 0 })}</span>
                      <span className="font-semibold text-slate-900">₺{safePrice}</span>
                      <span>{t("pages:myTestPackages.card.salesCount", { count: test.total_sales || 0 })}</span>
                      {(() => {
                        const stats = viewStatsById.get(test.id);
                        const total = stats?.totalViews ?? 0;
                        const last7 = stats?.last7Days ?? 0;
                        const unique = stats?.uniqueViewers ?? 0;
                        return (
                          <span
                            className="flex items-center gap-1 text-slate-600"
                            aria-label={t("pages:myTestPackages.card.viewsAria", { count: total })}
                            title={t("pages:myTestPackages.card.viewsTooltip", { total, unique, last7 })}
                          >
                            <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>{total}</span>
                            {last7 > 0 && (
                              <span className="text-xs text-emerald-600 ml-1">
                                {t("pages:myTestPackages.card.viewsLast7", { count: last7 })}
                              </span>
                            )}
                          </span>
                        );
                      })()}
                      {test.average_rating != null ? (
                        <span className="flex items-center gap-1">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                          <span className="text-slate-700">{Number(test.average_rating).toFixed(1)}</span>
                          <span className="text-slate-400">({test.rating_count ?? 0})</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">{t("pages:myTestPackages.card.noRating")}</span>
                      )}
                    </div>
                  </div>

                  {/* Satır üstü aksiyonlar */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Link to={createPageUrl("EditTest") + `?id=${test.id}`} title={t("pages:myTestPackages.card.editTitle")}>
                      <Button size="sm" variant="outline" className="w-8 h-8 p-0" aria-label={t("pages:myTestPackages.card.editTitle")}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={togglePublishMutation.isPending}
                      title={test.is_published
                        ? t("pages:myTestPackages.card.unpublishTitle")
                        : t("pages:myTestPackages.card.publishTitle")}
                      aria-label={test.is_published
                        ? t("pages:myTestPackages.card.unpublishTitle")
                        : t("pages:myTestPackages.card.publishTitle")}
                      className={test.is_published
                        ? "w-8 h-8 p-0 border-amber-200 text-amber-700 hover:bg-amber-50"
                        : "w-8 h-8 p-0 border-emerald-200 text-emerald-700 hover:bg-emerald-50"}
                      onClick={() => togglePublishMutation.mutate({
                        id: test.id,
                        is_published: !test.is_published,
                      })}
                    >
                      {test.is_published
                        ? <EyeOff className="w-3.5 h-3.5" />
                        : <Eye className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </div>
              </div>
            );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>

              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                  if (
                    page === 1 ||
                    page === totalPages ||
                    (page >= currentPage - 1 && page <= currentPage + 1)
                  ) {
                    return (
                      <Button
                        key={page}
                        variant={currentPage === page ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCurrentPage(page)}
                        className={currentPage === page ? "bg-indigo-600" : ""}
                      >
                        {page}
                      </Button>
                    );
                  } else if (page === currentPage - 2 || page === currentPage + 2) {
                    return <span key={page} className="px-2 text-slate-400">...</span>;
                  }
                  return null;
                })}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </>
      )}


    </div>
  );
}
