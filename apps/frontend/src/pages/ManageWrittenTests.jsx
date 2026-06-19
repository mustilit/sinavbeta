import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { writtenTests } from "@/api/dalClient";
import { entities } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { buildPageUrl } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Plus, Search, Edit2, Eye, EyeOff, BookOpen,
  FileText, ChevronLeft, ChevronRight, X, AlertTriangle,
} from "lucide-react";

const ITEMS_PER_PAGE = 10;

function ManageWrittenTests() {
  const { t } = useTranslation(["pages", "common"]);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [examTypeFilter, setExamTypeFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);

  const { data: packages = [], isLoading, isError } = useQuery({
    queryKey: ["writtenPackagesMine", user?.id],
    // Endpoint { items: [...] } döner — diziye indir.
    queryFn: async () => {
      const res = await writtenTests.listMine();
      return Array.isArray(res) ? res : res?.items ?? [];
    },
    enabled: !!user,
  });

  const { data: examTypes = [] } = useQuery({
    queryKey: ["examTypes"],
    queryFn: () => entities.ExamType.filter({ is_active: true }),
    enabled: !!user,
    staleTime: 300_000,
  });

  const togglePublishMutation = useMutation({
    mutationFn: ({ id, publish }) =>
      publish ? writtenTests.publishPackage(id) : writtenTests.unpublishPackage(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["writtenPackagesMine"] });
      toast.success(t("pages:manageWrittenTests.toasts.statusUpdated"));
    },
    onError: (err) => {
      toast.error(err?.message || t("pages:manageWrittenTests.toasts.actionFailed"));
    },
  });

  // Filtreleme
  const filtered = useMemo(() => {
    return packages.filter((pkg) => {
      const matchSearch =
        (pkg.title ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (pkg.description ?? "").toLowerCase().includes(searchQuery.toLowerCase());
      const isPublished = !!pkg.publishedAt;
      const matchStatus =
        statusFilter === "all" ||
        (statusFilter === "published" && isPublished) ||
        (statusFilter === "draft" && !isPublished);
      const matchExamType = examTypeFilter === "all" || pkg.examTypeId === examTypeFilter;
      return matchSearch && matchStatus && matchExamType;
    });
  }, [packages, searchQuery, statusFilter, examTypeFilter]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  useEffect(() => { setCurrentPage(1); }, [searchQuery, statusFilter, examTypeFilter]);

  const hasFilters = searchQuery || statusFilter !== "all" || examTypeFilter !== "all";
  const clearFilters = () => { setSearchQuery(""); setStatusFilter("all"); setExamTypeFilter("all"); };

  // Yukleniyor
  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-12 w-full" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <p className="text-slate-600 dark:text-slate-400">{t("pages:manageWrittenTests.loadError")}</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Baslik */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {t("pages:manageWrittenTests.title")}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t("pages:manageWrittenTests.subtitle")}
          </p>
        </div>
        <Link to={buildPageUrl("CreateWrittenTest")}>
          <Button className="bg-indigo-600 text-white hover:bg-indigo-700">
            <Plus className="w-4 h-4 mr-2" />
            {t("pages:manageWrittenTests.createNew")}
          </Button>
        </Link>
      </div>

      {/* Filtreler */}
      {packages.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-700 p-4 mb-6">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder={t("pages:manageWrittenTests.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full lg:w-40">
                <SelectValue placeholder={t("pages:manageWrittenTests.filter.statusPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("pages:manageWrittenTests.filter.allStatuses")}</SelectItem>
                <SelectItem value="published">{t("pages:manageWrittenTests.filter.published")}</SelectItem>
                <SelectItem value="draft">{t("pages:manageWrittenTests.filter.draft")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={examTypeFilter} onValueChange={setExamTypeFilter}>
              <SelectTrigger className="w-full lg:w-40">
                <SelectValue placeholder={t("pages:manageWrittenTests.filter.examTypePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("pages:manageWrittenTests.filter.allExamTypes")}</SelectItem>
                {examTypes.map((et) => (
                  <SelectItem key={et.id} value={et.id}>{et.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasFilters && (
              <Button variant="ghost" onClick={clearFilters} className="shrink-0">
                <X className="w-4 h-4 mr-1" />{t("pages:manageWrittenTests.filter.clear")}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Bos durum */}
      {packages.length === 0 && (
        <div className="text-center py-16">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">
            {t("pages:manageWrittenTests.empty.title")}
          </h3>
          <p className="text-slate-500 dark:text-slate-400 mb-6">
            {t("pages:manageWrittenTests.empty.desc")}
          </p>
          <Link to={buildPageUrl("CreateWrittenTest")}>
            <Button className="bg-indigo-600 text-white hover:bg-indigo-700">
              <Plus className="w-4 h-4 mr-2" />{t("pages:manageWrittenTests.createNew")}
            </Button>
          </Link>
        </div>
      )}

      {/* Filtre sonucu bos */}
      {packages.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12">
          <Search className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 dark:text-slate-400">{t("pages:manageWrittenTests.noFilterResults")}</p>
          <Button variant="outline" onClick={clearFilters} className="mt-3">
            {t("pages:manageWrittenTests.filter.clear")}
          </Button>
        </div>
      )}

      {/* Liste */}
      {paginated.length > 0 && (
        <div className="space-y-3">
          {paginated.map((pkg) => {
            const isPublished = !!pkg.publishedAt;
            const testCount = pkg.tests?.length ?? pkg.testCount ?? 0;
            const questionCount = pkg.tests?.reduce((s, tt) => s + (tt.questions?.length ?? tt.questionCount ?? 0), 0) ?? pkg.questionCount ?? 0;
            return (
              <div
                key={pkg.id}
                className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-700 p-4 flex flex-col sm:flex-row sm:items-center gap-4 transition-shadow hover:shadow-sm"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-semibold text-slate-900 dark:text-white truncate">{pkg.title}</h3>
                    {isPublished ? (
                      <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">
                        {t("pages:manageWrittenTests.badge.published")}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        {t("pages:manageWrittenTests.badge.draft")}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <BookOpen className="w-3.5 h-3.5" />
                      {testCount} {t("pages:manageWrittenTests.testsSuffix")}
                    </span>
                    <span>{questionCount} {t("pages:manageWrittenTests.questionsSuffix")}</span>
                    {pkg.priceCents != null && (
                      <span>
                        {pkg.priceCents > 0 ? `${(pkg.priceCents / 100).toFixed(0)} TL` : t("pages:manageWrittenTests.free")}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-10 w-10"
                    onClick={() =>
                      togglePublishMutation.mutate({ id: pkg.id, publish: !isPublished })
                    }
                    disabled={togglePublishMutation.isPending}
                    aria-label={isPublished
                      ? t("pages:manageWrittenTests.actions.unpublish")
                      : t("pages:manageWrittenTests.actions.publish")}
                  >
                    {isPublished ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                  <Link to={`${buildPageUrl("EditWrittenTest")}?id=${pkg.id}`}>
                    <Button size="icon" variant="ghost" className="h-10 w-10" aria-label={t("pages:manageWrittenTests.actions.edit")}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Sayfalama */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <Button
            size="icon"
            variant="outline"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="h-10 w-10"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-slate-600 dark:text-slate-400">
            {t("common:pagination.pageOf", { current: currentPage, total: totalPages })}
          </span>
          <Button
            size="icon"
            variant="outline"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className="h-10 w-10"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

export default ManageWrittenTests;
export { ManageWrittenTests };
