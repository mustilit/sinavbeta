import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import api from "@/lib/api/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { Pagination } from "@/components/ui/Pagination";
import {
  AlertTriangle,
  Clock,
  CheckCircle,
  ShieldCheck,
  Search,
  X,
  Eye,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { tr } from "date-fns/locale";

// status etiketleri artık i18n key — render anında t() ile çözülür.
const statusConfig = {
  OPEN:      { labelKey: "pages:questionReports.statusConfig.OPEN",      color: "bg-amber-100 text-amber-700" },
  ANSWERED:  { labelKey: "pages:questionReports.statusConfig.ANSWERED",  color: "bg-emerald-100 text-emerald-700" },
  ESCALATED: { labelKey: "pages:questionReports.statusConfig.ESCALATED", color: "bg-violet-100 text-violet-700" },
  RESOLVED:  { labelKey: "pages:questionReports.statusConfig.RESOLVED",  color: "bg-emerald-100 text-emerald-700" },
};

/**
 * Filtre çubuğu — paylaşılan: pending ve resolved tab'larında aynı yapı.
 * Filtre seçenekleri o sekmenin kendi listesinden türetilir, böylece kullanıcı
 * "boş sonuç gösteren" seçenekle karşılaşmaz.
 */
function FilterBar({
  source,
  testFilter, setTestFilter,
  reporterFilter, setReporterFilter,
  reasonSearch, setReasonSearch,
  statusFilter, setStatusFilter,
  showStatusFilter = false,
  totalFiltered, totalAll,
  onClear,
}) {
  const { t } = useTranslation(["pages"]);
  const uniqueTests = useMemo(() => {
    const m = new Map();
    for (const o of source) if (o.testId) m.set(o.testId, { id: o.testId, title: o.testTitle || t("pages:questionReports.filterBar.unnamed") });
    return [...m.values()].sort((a, b) => a.title.localeCompare(b.title, "tr"));
  }, [source, t]);

  const uniqueReporters = useMemo(() => {
    const m = new Map();
    for (const o of source) if (o.reporterId) m.set(o.reporterId, { id: o.reporterId, name: o.reporterName || t("pages:questionReports.filterBar.unknown") });
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }, [source, t]);

  const hasActive =
    testFilter !== "ALL" ||
    reporterFilter !== "ALL" ||
    reasonSearch.trim().length > 0 ||
    (showStatusFilter && statusFilter !== "ALL");

  const cols = showStatusFilter ? "lg:grid-cols-4" : "lg:grid-cols-3";

  return (
    <Card className="mb-4">
      <CardContent className="p-4">
        <div className={`grid grid-cols-1 sm:grid-cols-2 ${cols} gap-3`}>
          {showStatusFilter && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">{t("pages:questionReports.filterBar.status")}</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t("pages:questionReports.filterBar.allStatuses")}</SelectItem>
                  <SelectItem value="ANSWERED">{t("pages:questionReports.statusConfig.ANSWERED")}</SelectItem>
                  <SelectItem value="ESCALATED">{t("pages:questionReports.statusConfig.ESCALATED")}</SelectItem>
                  <SelectItem value="RESOLVED">{t("pages:questionReports.statusConfig.RESOLVED")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t("pages:questionReports.filterBar.test")}</label>
            <SearchableSelect
              value={testFilter}
              onChange={setTestFilter}
              options={uniqueTests.map((tt) => ({ value: tt.id, label: tt.title }))}
              allLabel={t("pages:questionReports.filterBar.allTests")}
              placeholder={t("pages:questionReports.filterBar.selectTest")}
              searchPlaceholder={t("pages:questionReports.filterBar.searchTest")}
              emptyText={t("pages:questionReports.filterBar.noResult")}
              ariaLabel={t("pages:questionReports.filterBar.testFilterAria")}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t("pages:questionReports.filterBar.reporter")}</label>
            <SearchableSelect
              value={reporterFilter}
              onChange={setReporterFilter}
              options={uniqueReporters.map((r) => ({ value: r.id, label: r.name }))}
              allLabel={t("pages:questionReports.filterBar.allReporters")}
              placeholder={t("pages:questionReports.filterBar.selectReporter")}
              searchPlaceholder={t("pages:questionReports.filterBar.searchReporter")}
              emptyText={t("pages:questionReports.filterBar.noResult")}
              ariaLabel={t("pages:questionReports.filterBar.reporterFilterAria")}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t("pages:questionReports.filterBar.reason")}</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" aria-hidden="true" />
              <Input
                type="text"
                placeholder={t("pages:questionReports.filterBar.reasonPlaceholder")}
                value={reasonSearch}
                onChange={(e) => setReasonSearch(e.target.value)}
                className="h-9 pl-8"
                aria-label={t("pages:questionReports.filterBar.reasonAria")}
              />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 mt-3">
          <span className="text-sm text-slate-500">{t("pages:questionReports.filterBar.count", { filtered: totalFiltered, total: totalAll })}</span>
          {hasActive && (
            <Button variant="ghost" size="sm" onClick={onClear} className="h-8 text-xs">
              <X className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
              {t("pages:questionReports.filterBar.clear")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function applyFilters(list, { testFilter, reporterFilter, reasonSearch, statusFilter }) {
  const q = reasonSearch.trim().toLowerCase();
  return list.filter((o) => {
    if (testFilter !== "ALL" && o.testId !== testFilter) return false;
    if (reporterFilter !== "ALL" && o.reporterId !== reporterFilter) return false;
    if (statusFilter && statusFilter !== "ALL" && o.status !== statusFilter) return false;
    if (q) {
      const hay = `${o.reason ?? ""} ${o.questionContent ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export default function QuestionReports() {
  const { t } = useTranslation(["pages"]);
  const { user } = useAuth();
  const [selectedReport, setSelectedReport] = useState(null);
  const [response, setResponse] = useState("");
  const queryClient = useQueryClient();

  // Bekleyen sekmesi filtreleri
  const [pTestFilter, setPTestFilter] = useState("ALL");
  const [pReporterFilter, setPReporterFilter] = useState("ALL");
  const [pReasonSearch, setPReasonSearch] = useState("");
  const [pPage, setPPage] = useState(1);
  const [pPageSize, setPPageSize] = useState(10);

  // Sonuçlanan sekmesi filtreleri
  const [rStatusFilter, setRStatusFilter] = useState("ALL");
  const [rTestFilter, setRTestFilter] = useState("ALL");
  const [rReporterFilter, setRReporterFilter] = useState("ALL");
  const [rReasonSearch, setRReasonSearch] = useState("");
  const [rPage, setRPage] = useState(1);
  const [rPageSize, setRPageSize] = useState(10);

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["educatorObjections"],
    queryFn: async () => {
      const { data } = await api.get("/educators/me/objections");
      return Array.isArray(data) ? data : [];
    },
    enabled: !!user,
  });

  const answerMutation = useMutation({
    mutationFn: ({ id, answerText, kind }) =>
      kind
        ? api.post(`/educators/me/objections/content/${kind}/${id}/answer`, { answerText })
        : api.post(`/educators/me/objections/${id}/answer`, { answerText }),
    onSuccess: () => {
      toast.success(t("pages:questionReports.toasts.sent"));
      queryClient.invalidateQueries({ queryKey: ["educatorObjections"] });
      setSelectedReport(null);
      setResponse("");
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message ?? t("pages:questionReports.toasts.sendFailed"));
    },
  });

  const handleAnswer = () => {
    if (!response.trim() || response.trim().length < 5) {
      toast.error(t("pages:questionReports.toasts.min5Chars"));
      return;
    }
    answerMutation.mutate({ id: selectedReport.id, answerText: response.trim(), kind: selectedReport.kind });
  };

  const pending  = useMemo(() => reports.filter((r) => r.status === "OPEN"), [reports]);
  const resolved = useMemo(() => reports.filter((r) => r.status !== "OPEN"), [reports]);

  const pendingFiltered = useMemo(
    () => applyFilters(pending, { testFilter: pTestFilter, reporterFilter: pReporterFilter, reasonSearch: pReasonSearch }),
    [pending, pTestFilter, pReporterFilter, pReasonSearch],
  );
  const resolvedFiltered = useMemo(
    () => applyFilters(resolved, { testFilter: rTestFilter, reporterFilter: rReporterFilter, reasonSearch: rReasonSearch, statusFilter: rStatusFilter }),
    [resolved, rTestFilter, rReporterFilter, rReasonSearch, rStatusFilter],
  );

  // Sayfa toplam değişince mevcut sayfa numarası taşmasın
  const pendingPageItems  = pendingFiltered.slice((pPage - 1) * pPageSize, pPage * pPageSize);
  const resolvedPageItems = resolvedFiltered.slice((rPage - 1) * rPageSize, rPage * rPageSize);

  const clearPending = () => {
    setPTestFilter("ALL");
    setPReporterFilter("ALL");
    setPReasonSearch("");
    setPPage(1);
  };
  const clearResolved = () => {
    setRStatusFilter("ALL");
    setRTestFilter("ALL");
    setRReporterFilter("ALL");
    setRReasonSearch("");
    setRPage(1);
  };

  // Tab değişiminde de sayfa 1'e dön
  const onTabChange = (v) => {
    if (v === "pending") setPPage(1);
    else if (v === "resolved") setRPage(1);
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">{t("pages:titles.questionReports")}</h1>
        <p className="text-slate-500 mt-2">{t("pages:titles.questionReportsDesc")}</p>
      </div>

      <Tabs defaultValue="pending" className="space-y-6" onValueChange={onTabChange}>
        <TabsList>
          <TabsTrigger value="pending">{t("pages:questionReports.tabs.pending")} ({pending.length})</TabsTrigger>
          <TabsTrigger value="resolved">{t("pages:questionReports.tabs.resolved")} ({resolved.length})</TabsTrigger>
        </TabsList>

        {/* ── Bekleyen ── */}
        <TabsContent value="pending">
          <FilterBar
            source={pending}
            testFilter={pTestFilter} setTestFilter={(v) => { setPTestFilter(v); setPPage(1); }}
            reporterFilter={pReporterFilter} setReporterFilter={(v) => { setPReporterFilter(v); setPPage(1); }}
            reasonSearch={pReasonSearch} setReasonSearch={(v) => { setPReasonSearch(v); setPPage(1); }}
            totalFiltered={pendingFiltered.length} totalAll={pending.length}
            onClear={clearPending}
          />
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-slate-100 rounded-lg animate-pulse" />)}
            </div>
          ) : pendingFiltered.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                {pending.length === 0 ? (
                  <>
                    <CheckCircle className="w-12 h-12 text-emerald-300 mx-auto mb-3" />
                    <p className="text-slate-500">{t("pages:questionReports.empty.noPending")}</p>
                  </>
                ) : (
                  <p className="text-slate-400">{t("pages:questionReports.empty.noResults")}</p>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="space-y-4">
                {pendingPageItems.map((report) => {
                  const daysLeft = report.deadlineAt
                    ? differenceInDays(new Date(report.deadlineAt), new Date())
                    : 10;
                  const urgent = daysLeft <= 2;
                  return (
                    <Card key={report.id} className={urgent ? "border-rose-200" : ""}>
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-4 flex-1 min-w-0">
                            <div className={`p-3 rounded-xl shrink-0 ${urgent ? "bg-rose-100" : "bg-amber-100"}`}>
                              <AlertTriangle className={`w-5 h-5 ${urgent ? "text-rose-600" : "text-amber-600"}`} />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <Badge className={statusConfig[report.status]?.color ?? "bg-slate-100 text-slate-700"}>
                                  {statusConfig[report.status]?.labelKey ? t(statusConfig[report.status].labelKey) : report.status}
                                </Badge>
                                {report.kind === "tunnel" && <Badge className="bg-indigo-100 text-indigo-700">{t("pages:questionReports.kindBadge.tunnel")}</Badge>}
                                {report.kind === "written" && <Badge className="bg-sky-100 text-sky-700">{t("pages:questionReports.kindBadge.written")}</Badge>}
                                <span className="text-sm font-medium text-slate-800 truncate">
                                  {/* report.testTitle user-generated */}
                                  {report.testTitle}
                                </span>
                              </div>
                              {report.questionContent && (
                                <p className="text-sm text-slate-500 italic line-clamp-2 mb-1">
                                  "{report.questionContent}"
                                </p>
                              )}
                              <p className="text-sm text-slate-700">{report.reason}</p>
                              {report.adminAnswerText && (
                                <div className="mt-2 p-3 bg-indigo-50 rounded border border-indigo-100">
                                  <p className="text-xs font-semibold text-indigo-700 mb-1 flex items-center gap-1">
                                    <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                                    {t("pages:questionReports.card.adminNote")}{report.adminAnswererName ? ` (${report.adminAnswererName})` : ""}:
                                  </p>
                                  <p className="text-sm text-slate-700">{report.adminAnswerText}</p>
                                </div>
                              )}
                              <div className="flex items-center gap-4 mt-2 text-xs text-slate-400 flex-wrap">
                                <span>{t("pages:questionReports.card.reporter", { name: report.reporterName })}</span>
                                {/* SLA/yanıt akışı yalnız test itirazlarında; tünel/yazılı bildirimleri salt görüntü */}
                                {!report.kind && (
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3.5 h-3.5" />
                                    {daysLeft > 0 ? t("pages:questionReports.card.daysLeft", { count: daysLeft }) : t("pages:questionReports.card.deadlineExpired")}
                                  </span>
                                )}
                                <span>{format(new Date(report.createdAt), "d MMM yyyy", { locale: tr })}</span>
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { setSelectedReport(report); setResponse(report.answerText ?? ""); }}
                            className="shrink-0"
                          >
                            <Eye className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                            {t("pages:questionReports.card.viewDetail")}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              <Pagination
                page={pPage}
                pageSize={pPageSize}
                total={pendingFiltered.length}
                onPageChange={setPPage}
                onPageSizeChange={(s) => { setPPageSize(s); setPPage(1); }}
              />
            </>
          )}
        </TabsContent>

        {/* ── Sonuçlanan ── */}
        <TabsContent value="resolved">
          <FilterBar
            source={resolved}
            statusFilter={rStatusFilter} setStatusFilter={(v) => { setRStatusFilter(v); setRPage(1); }}
            showStatusFilter
            testFilter={rTestFilter} setTestFilter={(v) => { setRTestFilter(v); setRPage(1); }}
            reporterFilter={rReporterFilter} setReporterFilter={(v) => { setRReporterFilter(v); setRPage(1); }}
            reasonSearch={rReasonSearch} setReasonSearch={(v) => { setRReasonSearch(v); setRPage(1); }}
            totalFiltered={resolvedFiltered.length} totalAll={resolved.length}
            onClear={clearResolved}
          />
          {resolvedFiltered.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <p className="text-slate-500">
                  {resolved.length === 0 ? t("pages:questionReports.empty.noResolved") : t("pages:questionReports.empty.noResults")}
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="space-y-4">
                {resolvedPageItems.map((report) => (
                  <Card key={report.id}>
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <div className="p-2 rounded-xl bg-slate-100 shrink-0">
                          <ShieldCheck className="w-5 h-5 text-slate-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Badge className={statusConfig[report.status]?.color ?? "bg-slate-100 text-slate-700"}>
                              {statusConfig[report.status]?.labelKey ? t(statusConfig[report.status].labelKey) : report.status}
                            </Badge>
                            {report.kind === "tunnel" && <Badge className="bg-indigo-100 text-indigo-700">{t("pages:questionReports.kindBadge.tunnel")}</Badge>}
                            {report.kind === "written" && <Badge className="bg-sky-100 text-sky-700">{t("pages:questionReports.kindBadge.written")}</Badge>}
                            <span className="text-sm font-medium text-slate-800">{report.testTitle}</span>
                          </div>
                          {report.questionContent && (
                            <p className="text-sm text-slate-500 italic line-clamp-1">
                              "{report.questionContent}"
                            </p>
                          )}
                          <p className="text-sm text-slate-700 mt-1">{report.reason}</p>
                          {report.answerText && (
                            <div className="mt-3 p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                              <p className="text-xs font-semibold text-emerald-700 mb-1">{t("pages:questionReports.card.yourAnswer")}</p>
                              <p className="text-sm text-slate-700">{report.answerText}</p>
                            </div>
                          )}
                          {report.adminAnswerText && (
                            <div className="mt-2 p-3 bg-indigo-50 rounded border border-indigo-100">
                              <p className="text-xs font-semibold text-indigo-700 mb-1 flex items-center gap-1">
                                <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                                {t("pages:questionReports.card.adminNote")}{report.adminAnswererName ? ` (${report.adminAnswererName})` : ""}:
                              </p>
                              <p className="text-sm text-slate-700">{report.adminAnswerText}</p>
                            </div>
                          )}
                          <div className="flex items-center gap-4 mt-2 text-xs text-slate-400 flex-wrap">
                            <span>{t("pages:questionReports.card.reporter", { name: report.reporterName })}</span>
                            {report.answeredAt && (
                              <span>
                                {t("pages:questionReports.card.respondedAt", { date: format(new Date(report.answeredAt), "d MMM yyyy", { locale: tr }) })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Pagination
                page={rPage}
                pageSize={rPageSize}
                total={resolvedFiltered.length}
                onPageChange={setRPage}
                onPageSizeChange={(s) => { setRPageSize(s); setRPage(1); }}
              />
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Yanıt Dialog ── */}
      <Dialog open={!!selectedReport} onOpenChange={() => setSelectedReport(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("pages:questionReports.dialog.title")}</DialogTitle>
          </DialogHeader>
          {selectedReport && (
            <div className="space-y-4 mt-2">
              <div className="p-4 bg-slate-50 rounded-lg space-y-2">
                <div>
                  <p className="text-xs text-slate-400 font-medium">{t("pages:questionReports.dialog.testLabel")}</p>
                  <p className="text-sm font-semibold text-slate-800">{selectedReport.testTitle}</p>
                </div>
                {selectedReport.questionContent && (
                  <div>
                    <p className="text-xs text-slate-400 font-medium">{t("pages:questionReports.dialog.questionLabel")}</p>
                    <p className="text-sm text-slate-600 italic">"{selectedReport.questionContent}"</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-slate-400 font-medium">{t("pages:questionReports.dialog.reportLabel")}</p>
                  <p className="text-sm text-slate-700">{selectedReport.reason}</p>
                </div>
              </div>
              <Textarea
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                placeholder={t("pages:questionReports.dialog.responsePlaceholder")}
                rows={4}
              />
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setSelectedReport(null)}>{t("pages:questionReports.dialog.cancel")}</Button>
                <Button
                  onClick={handleAnswer}
                  disabled={answerMutation.isPending}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  {answerMutation.isPending ? t("pages:questionReports.dialog.submitting") : t("pages:questionReports.dialog.submit")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
