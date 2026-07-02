import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
// Sprint 12 #1 — html2canvas (~250 KB) lazy: handleShare içinde dynamic import.
import { entities, candidateTunnels, candidateWritten } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { buildPageUrl } from "@/lib/navigation";
import { Layers, CheckCircle2, FileText, PlayCircle } from "lucide-react";
import { format, startOfWeek, endOfWeek, subWeeks } from "date-fns";
import { tr } from "date-fns/locale";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import StatCard from "@/components/ui/StatCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import PaginationBar from "@/components/ui/PaginationBar";
import {
  BarChart3,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  Award,
  Filter,
  AlertTriangle,
  Share2,
  Download,
} from "lucide-react";

const PAGE_SIZE = 15;

/** Filtrelenmiş sonuçları XLSX olarak indirir */
async function exportToXLSX(rows, safeFormatDate, t) {
  const XLSX = await import("xlsx");
  const col = {
    test: t("pages:myResults.xlsxColumns.test"),
    score: t("pages:myResults.xlsxColumns.score"),
    correct: t("pages:myResults.xlsxColumns.correct"),
    wrong: t("pages:myResults.xlsxColumns.wrong"),
    blank: t("pages:myResults.xlsxColumns.blank"),
    totalQ: t("pages:myResults.xlsxColumns.totalQ"),
    durationMin: t("pages:myResults.xlsxColumns.durationMin"),
    date: t("pages:myResults.xlsxColumns.date"),
    delaySec: t("pages:myResults.xlsxColumns.delaySec"),
    status: t("pages:myResults.xlsxColumns.status"),
  };
  const statusFor = (score) =>
    score >= 80 ? t("pages:myResults.scoreBadge.excellent")
    : score >= 60 ? t("pages:myResults.scoreBadge.good")
    : score >= 40 ? t("pages:myResults.scoreBadge.average")
    : t("pages:myResults.scoreBadge.needsWork");
  const testFallback = t("pages:myResults.empty.testFallback");
  const data = rows.map((r) => ({
    [col.test]: r.test_package_title || r.test_title || testFallback,
    [col.score]: r.score ?? 0,
    [col.correct]: r.correct_count ?? 0,
    [col.wrong]: r.wrong_count ?? 0,
    [col.blank]: r.empty_count ?? 0,
    [col.totalQ]: r.question_count ?? "",
    [col.durationMin]: r.time_spent_seconds ? Math.floor(r.time_spent_seconds / 60) : "",
    [col.date]: safeFormatDate(r.created_date),
    [col.delaySec]: r.overtime_seconds ?? 0,
    [col.status]: statusFor(r.score ?? 0),
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, t("pages:myResults.sheetName"));
  XLSX.writeFile(wb, `sinav-salonu-sonuclar-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export default function MyResults() {
  const { t } = useTranslation(["pages"]);
  const { user } = useAuth();
  const shareRef = useRef(null);
  const [isSharing, setIsSharing] = useState(false);

  const handleShare = useCallback(async () => {
    if (!shareRef.current || isSharing) return;
    setIsSharing(true);
    try {
      // Sprint 12 #1: html2canvas dynamic import — sayfa ilk yüklenirken indirilmez.
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(shareRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        logging: false,
      });

      // "Sınav Salonu" imzası — sadece paylaşılan görselde
      const ctx = canvas.getContext("2d");
      const scale = 2;
      const stripH = 40 * scale;
      ctx.fillStyle = "rgba(99,102,241,0.08)";
      ctx.fillRect(0, canvas.height - stripH, canvas.width, stripH);
      ctx.font = `600 ${13 * scale}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = "#6366f1";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText("Sınav Salonu", canvas.width - 20 * scale, canvas.height - stripH / 2);

      canvas.toBlob(async (blob) => {
        const file = new File([blob], "sinav-salonu-rapor.png", { type: "image/png" });
        if (navigator.share && navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: t("pages:myResults.shareTitle") });
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "sinav-salonu-rapor.png";
          a.click();
          URL.revokeObjectURL(url);
        }
      }, "image/png");
    } catch {
      // sessizce geç
    } finally {
      setIsSharing(false);
    }
  }, [isSharing, t]);

  const [filterTest, setFilterTest] = useState("all");
  const [filterTimeRange, setFilterTimeRange] = useState("all");
  const [filterExamType, setFilterExamType] = useState("all");
  const [chartType, setChartType] = useState("performance");
  const [page, setPage] = useState(1);
  const [contentTab, setContentTab] = useState("tests"); // "tests" | "tunnels"
  const contentTabBtn = (key) =>
    "inline-flex items-center gap-2 whitespace-nowrap border-b-2 -mb-px px-4 py-2.5 min-h-10 text-sm font-medium transition-colors " +
    (contentTab === key ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-600 hover:text-slate-900");

  const { data: examTypes = [] } = useQuery({
    queryKey: ["examTypes"],
    queryFn: () => entities.ExamType.filter({ is_active: true }),
  });
  const examTypeMap = Object.fromEntries(examTypes.map(e => [e.id, e.name]));

  const { data: rawResults, isLoading, isError } = useQuery({
    queryKey: ["myResults", user?.id],
    queryFn: () => entities.TestResult.filter({ user_email: user?.email }),
    enabled: !!user,
  });

  // API bazen { data: [...] } dönebilir; her zaman dizi kullan
  const results = Array.isArray(rawResults)
    ? rawResults
    : (Array.isArray(rawResults?.data) ? rawResults.data : []);

  // Sonuçlardan benzersiz sınav türleri — isim examTypeMap'ten çözülür
  const uniqueExamTypes = [...new Map(
    results.filter(r => r.exam_type_id).map(r => [
      r.exam_type_id,
      { id: r.exam_type_id, name: examTypeMap[r.exam_type_id] || r.exam_type_name || r.exam_type_id }
    ])
  ).values()];

  // Filter results (güvenli tarih ve id erişimi)
  const filteredResults = results.filter((r) => {
    if (filterTest !== "all" && r.test_package_id !== filterTest) return false;
    if (filterExamType !== "all" && r.exam_type_id !== filterExamType) return false;
    if (filterTimeRange !== "all" && r.created_date) {
      const createdDate = new Date(r.created_date);
      if (Number.isNaN(createdDate.getTime())) return true;
      const now = new Date();
      if (filterTimeRange === "week" && createdDate < subWeeks(now, 1)) return false;
      if (filterTimeRange === "month" && createdDate < subWeeks(now, 4)) return false;
      if (filterTimeRange === "3months" && createdDate < subWeeks(now, 12)) return false;
    }
    return true;
  });

  // Sayfalama: 15 satır/sayfa. Filtre değişimlerinde 1. sayfaya dön ki aday
  // 8. sayfada filtre değiştirip "boş sonuç" görmesin. totalPages'a clamp
  // ediyoruz çünkü liste küçülünce currentPage geçersiz olabilir.
  const totalPages = Math.max(1, Math.ceil(filteredResults.length / PAGE_SIZE));
  useEffect(() => { setPage(1); }, [filterTest, filterExamType, filterTimeRange]);
  const currentPage = Math.min(page, totalPages);
  const pagedResults = useMemo(
    () => filteredResults.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    // filteredResults her render'da yeni referans; filtre/page tetikler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentPage, filterTest, filterExamType, filterTimeRange, results.length],
  );

  const stats = {
    totalTests: filteredResults.length,
    avgScore: filteredResults.length > 0
      ? Math.round(filteredResults.reduce((sum, r) => sum + (r.score ?? 0), 0) / filteredResults.length)
      : 0,
    totalCorrect: filteredResults.reduce((sum, r) => sum + (r.correct_count ?? 0), 0),
    totalWrong: filteredResults.reduce((sum, r) => sum + (r.wrong_count ?? 0), 0),
  };

  // Weekly performance data
  const weeklyData = [];
  for (let i = 6; i >= 0; i--) {
    const weekStart = startOfWeek(subWeeks(new Date(), i), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    const weekResults = results.filter((r) => {
      if (!r.created_date) return false;
      const d = new Date(r.created_date);
      return !Number.isNaN(d.getTime()) && d >= weekStart && d <= weekEnd;
    });
    const avgScore = weekResults.length > 0
      ? Math.round(weekResults.reduce((sum, r) => sum + r.score, 0) / weekResults.length)
      : 0;
    const totalQuestions = weekResults.reduce((sum, r) => sum + (r.correct_count + r.wrong_count + (r.empty_count || 0)), 0);
    const totalTimeMinutes = Math.round(weekResults.reduce((sum, r) => sum + (r.time_spent_seconds || 0), 0) / 60);
    
    weeklyData.push({
      week: format(weekStart, "d MMM", { locale: tr }),
      score: avgScore,
      count: weekResults.length,
      questions: totalQuestions,
      timeMinutes: totalTimeMinutes
    });
  }

  // Get unique test packages for filter (undefined id kullanma - Select hatası önlenir)
  const uniquePackages = [...new Set(results.map(r => r.test_package_id).filter(Boolean))].map(id => {
    const result = results.find(r => r.test_package_id === id);
    return { id: String(id), title: result?.test_package_title || "Test" };
  });

  // Get test title helper — fallback i18n'lendi; test_package_title user-generated, çevrilmez
  const getTestTitle = (result) =>
    result?.test_package_title || result?.test_title || t("pages:myResults.empty.testFallback");

  const safeFormatDate = (dateVal) => {
    if (!dateVal) return "-";
    const d = new Date(dateVal);
    return Number.isNaN(d.getTime()) ? "-" : format(d, "d MMM yyyy", { locale: tr });
  };

  const getScoreBadge = (score) => {
    if (score >= 80) return <Badge className="bg-emerald-100 text-emerald-700">{t("pages:myResults.scoreBadge.excellent")}</Badge>;
    if (score >= 60) return <Badge className="bg-blue-100 text-blue-700">{t("pages:myResults.scoreBadge.good")}</Badge>;
    if (score >= 40) return <Badge className="bg-amber-100 text-amber-700">{t("pages:myResults.scoreBadge.average")}</Badge>;
    return <Badge className="bg-rose-100 text-rose-700">{t("pages:myResults.scoreBadge.needsWork")}</Badge>;
  };

  // Gecikmeli teslim edilen testleri filtrele — "gelişime açık" bölümü için
  const overtimeResults = filteredResults.filter((r) => r.overtime_seconds > 0);

  // Süre aşımını okunabilir göster (örn: "2 dk 15 sn")
  const formatOvertime = (seconds) => {
    if (!seconds) return "-";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m === 0) return t("pages:myResults.duration.sec", { s });
    if (s === 0) return t("pages:myResults.duration.min", { m });
    return t("pages:myResults.duration.minSec", { m, s });
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center py-20 min-h-[200px]">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">{t("pages:myResults.errorLoad")}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900">{t("pages:titles.myResults")}</h1>
        <p className="text-slate-500 mt-2">{t("pages:titles.myResultsDesc")}</p>
      </div>

      {/* Rapor sekmeleri: Testler | Tüneller (site standardı alt-çizgi stili) */}
      <div className="mb-6 flex flex-wrap gap-1 border-b border-slate-200">
        <button type="button" onClick={() => setContentTab("tests")} className={contentTabBtn("tests")}>Testler</button>
        <button type="button" onClick={() => setContentTab("tunnels")} className={contentTabBtn("tunnels")}>Tüneller</button>
        <button type="button" onClick={() => setContentTab("written")} className={contentTabBtn("written")}>{t("pages:writtenGrid.tab")}</button>
      </div>

      {contentTab === "written" ? (
        <WrittenResultsTab />
      ) : contentTab === "tunnels" ? (
        <TunnelReportsTab />
      ) : (
      <>
      {/* Filters */}
      <div className="mb-6 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-4 flex-wrap">
            <Filter className="w-5 h-5 text-slate-500" />
            <Select value={filterTest} onValueChange={setFilterTest}>
              <SelectTrigger aria-label={t("pages:myResults.filters.packageAria")} className="w-64">
                <SelectValue placeholder={t("pages:myResults.filters.allPackages")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("pages:myResults.filters.allPackages")}</SelectItem>
                {uniquePackages.map((pkg) => (
                  /* pkg.title user-generated — çevrilmez */
                  <SelectItem key={pkg.id} value={pkg.id}>{pkg.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterExamType} onValueChange={setFilterExamType}>
              <SelectTrigger aria-label={t("pages:myResults.filters.examTypeAria")} className="w-48">
                <SelectValue placeholder={t("pages:myResults.filters.allExamTypes")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("pages:myResults.filters.allExamTypes")}</SelectItem>
                {uniqueExamTypes.map((et) => (
                  <SelectItem key={et.id} value={et.id}>{et.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterTimeRange} onValueChange={setFilterTimeRange}>
              <SelectTrigger aria-label={t("pages:myResults.filters.timeAria")} className="w-48">
                <SelectValue placeholder={t("pages:myResults.filters.allTime")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("pages:myResults.filters.allTime")}</SelectItem>
                <SelectItem value="week">{t("pages:myResults.filters.lastWeek")}</SelectItem>
                <SelectItem value="month">{t("pages:myResults.filters.lastMonth")}</SelectItem>
                <SelectItem value="3months">{t("pages:myResults.filters.last3Months")}</SelectItem>
              </SelectContent>
            </Select>
            {(filterTest !== "all" || filterExamType !== "all" || filterTimeRange !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilterTest("all");
                  setFilterExamType("all");
                  setFilterTimeRange("all");
                  setPage(1);
                }}
              >
                {t("pages:myResults.filters.clear")}
              </Button>
            )}
          </div>
      </div>

      {/* Paylaş butonu — paylaşılabilir alanın sağ üstünde, dışında */}
      <div className="flex justify-end mb-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleShare}
          disabled={isSharing}
          className="text-indigo-600 hover:text-indigo-700"
        >
          <Share2 className="w-4 h-4 mr-1.5" />
          {isSharing ? t("pages:myResults.sharePreparing") : t("pages:myResults.shareButton")}
        </Button>
      </div>

      {/* Stats + Grafik paylaşılabilir alan */}
      <div ref={shareRef} className="bg-white rounded-xl p-4 -mx-4">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title={t("pages:myResults.stats.totalTests")}
          value={stats.totalTests}
          icon={BarChart3}
          iconColor="text-indigo-500"
        />
        <StatCard
          title={t("pages:myResults.stats.avgScore")}
          value={stats.avgScore}
          icon={TrendingUp}
          iconColor="text-violet-500"
        />
        <StatCard
          title={t("pages:myResults.stats.totalCorrect")}
          value={stats.totalCorrect}
          icon={CheckCircle}
          iconColor="text-emerald-500"
        />
        <StatCard
          title={t("pages:myResults.stats.totalWrong")}
          value={stats.totalWrong}
          icon={XCircle}
          iconColor="text-rose-500"
        />
      </div>

      {/* Performance Chart */}
      {results.length > 0 && (
        <div className="mb-6 pb-6 border-b border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-800">{t("pages:myResults.progress")}</h2>
            <div data-html2canvas-ignore="true">
              <Select value={chartType} onValueChange={setChartType}>
                <SelectTrigger aria-label={t("pages:myResults.chartTypeAria")} className="w-40 shrink-0">
                  <span className="truncate text-sm">
                    {chartType === "performance" ? t("pages:myResults.chartType.performance") : chartType === "questions" ? t("pages:myResults.chartType.questions") : t("pages:myResults.chartType.time")}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="performance">{t("pages:myResults.chartType.performance")}</SelectItem>
                  <SelectItem value="questions">{t("pages:myResults.chartType.questions")}</SelectItem>
                  <SelectItem value="time">{t("pages:myResults.chartType.time")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            </div>
          <ResponsiveContainer width="100%" height={300}>
              {chartType === "performance" ? (
                <LineChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-white p-3 rounded-lg shadow-lg border border-slate-200">
                            <p className="font-semibold">{payload[0].payload.week}</p>
                            <p className="text-indigo-600">{t("pages:myResults.tooltip.avg", { value: payload[0].value })}</p>
                            <p className="text-slate-500 text-sm">{t("pages:myResults.tooltip.testCount", { count: payload[0].payload.count })}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="score" 
                    stroke="#4f46e5" 
                    strokeWidth={3}
                    dot={{ fill: "#4f46e5", r: 4 }}
                  />
                </LineChart>
              ) : chartType === "questions" ? (
                <LineChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week" />
                  <YAxis />
                  <Tooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-white p-3 rounded-lg shadow-lg border border-slate-200">
                            <p className="font-semibold">{payload[0].payload.week}</p>
                            <p className="text-emerald-600">{t("pages:myResults.tooltip.questionCount", { count: Number(payload[0].value) })}</p>
                            <p className="text-slate-500 text-sm">{t("pages:myResults.tooltip.testCount", { count: payload[0].payload.count })}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="questions" 
                    stroke="#10b981" 
                    strokeWidth={3}
                    dot={{ fill: "#10b981", r: 4 }}
                  />
                </LineChart>
              ) : (
                <LineChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week" />
                  <YAxis />
                  <Tooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const hours = Math.floor(Number(payload[0].value) / 60);
                        const minutes = Number(payload[0].value) % 60;
                        const timeLabel = `${hours > 0 ? `${hours}h ` : ''}${minutes}m`;
                        return (
                          <div className="bg-white p-3 rounded-lg shadow-lg border border-slate-200">
                            <p className="font-semibold">{payload[0].payload.week}</p>
                            <p className="text-violet-600">
                              {t("pages:myResults.tooltip.time", { label: timeLabel })}
                            </p>
                            <p className="text-slate-500 text-sm">{t("pages:myResults.tooltip.testCount", { count: payload[0].payload.count })}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="timeMinutes" 
                    stroke="#7c3aed" 
                    strokeWidth={3}
                    dot={{ fill: "#7c3aed", r: 4 }}
                  />
                </LineChart>
              )}
            </ResponsiveContainer>
        </div>
      )}

      </div>{/* /shareRef */}

      {/* Results Table */}
      <div className="pb-6 border-b border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-800">
            {t("pages:myResults.history")}
            {filteredResults.length > 0 && (
              <span className="ml-2 text-sm font-normal text-slate-500">({filteredResults.length})</span>
            )}
          </h2>
          {filteredResults.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => exportToXLSX(filteredResults, safeFormatDate, t)}
              className="text-slate-500 hover:text-slate-700"
            >
              <Download className="w-4 h-4 mr-1.5" />
              {t("pages:myResults.exportXlsx")}
            </Button>
          )}
        </div>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : filteredResults.length === 0 ? (
            <div className="text-center py-12">
              <Award className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">
                {results.length === 0 ? t("pages:myResults.empty.noResults") : t("pages:myResults.empty.noFilterMatch")}
              </p>
            </div>
          ) : (
            <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("pages:myResults.table.test")}</TableHead>
                    <TableHead className="text-center">{t("pages:myResults.table.score")}</TableHead>
                    <TableHead className="text-center">{t("pages:myResults.table.dyb")}</TableHead>
                    <TableHead className="text-center">{t("pages:myResults.table.time")}</TableHead>
                    <TableHead>{t("pages:myResults.table.date")}</TableHead>
                    <TableHead className="text-center">{t("pages:myResults.table.overtime")}</TableHead>
                    <TableHead>{t("pages:myResults.table.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedResults.map((result, idx) => {
                    const answeredSum = (result.correct_count ?? 0) + (result.wrong_count ?? 0) + (result.empty_count ?? 0);
                    const total = result.question_count ?? (answeredSum > 0 ? answeredSum : null);
                    const mins = result.time_spent_seconds ? Math.floor(result.time_spent_seconds / 60) : null;
                    const secs = result.time_spent_seconds ? result.time_spent_seconds % 60 : null;
                    return (
                    <TableRow key={result?.id ? String(result.id) : "row-" + idx}>
                      <TableCell className="font-medium">
                        {/* getTestTitle dönüşü user-generated içerik içerebilir — fallback i18n'li */}
                        {getTestTitle(result)}
                        {total && <span className="ml-1 text-xs text-slate-500">({t("pages:myResults.table.questions", { count: total })})</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-bold text-lg">{result.score}</span>
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        <span className="text-emerald-600 font-medium">{result.correct_count ?? 0}</span>
                        <span className="text-slate-400 mx-1">/</span>
                        <span className="text-rose-500 font-medium">{result.wrong_count ?? 0}</span>
                        <span className="text-slate-400 mx-1">/</span>
                        <span className="text-slate-500">{result.empty_count ?? 0}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        {mins !== null ? (
                          <div className="flex items-center justify-center gap-1 text-slate-500 text-sm">
                            <Clock className="w-3.5 h-3.5" />
                            {mins >= 60
                              ? `${Math.floor(mins / 60)}sa ${mins % 60}dk`
                              : `${mins}dk ${secs}s`}
                          </div>
                        ) : <span className="text-slate-400">—</span>}
                      </TableCell>
                      <TableCell className="text-slate-500 text-sm">
                        {safeFormatDate(result.created_date)}
                      </TableCell>
                      <TableCell className="text-center">
                        {result.overtime_seconds > 0 ? (
                          <Badge className="bg-amber-100 text-amber-700 gap-1">
                            <Clock className="w-3 h-3" />
                            +{formatOvertime(result.overtime_seconds)}
                          </Badge>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {getScoreBadge(result.score ?? 0)}
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <PaginationBar
              page={currentPage}
              totalPages={totalPages}
              onPageChange={setPage}
            />
            {totalPages > 1 && (
              <p className="text-center text-xs text-slate-500 mt-2">
                {t("pages:myResults.pageInfo", {
                  defaultValue: "{{from}}–{{to}} / {{total}} sonuç",
                  from: (currentPage - 1) * PAGE_SIZE + 1,
                  to: Math.min(currentPage * PAGE_SIZE, filteredResults.length),
                  total: filteredResults.length,
                })}
              </p>
            )}
            </>
          )}
      </div>

      {/* ─── Gelişime Açık Yönler — süre aşımı olan testler ─── */}
      {overtimeResults.length > 0 && (
        <div className="mt-6 pt-6 border-t border-amber-200">
          <h2 className="flex items-center gap-2 text-amber-800 text-base font-semibold mb-3">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            {t("pages:myResults.overtime.title")}
          </h2>
            <p className="text-sm text-amber-700 mb-4">
              {t("pages:myResults.overtime.desc", { count: overtimeResults.length })}
            </p>
            <div className="space-y-2">
              {overtimeResults.map((result, idx) => (
                <div
                  key={result?.id ? String(result.id) : "ot-" + idx}
                  className="flex items-center justify-between bg-white border border-amber-200 rounded-xl px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">{getTestTitle(result)}</p>
                    <p className="text-xs text-slate-500">{safeFormatDate(result.created_date)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-xs text-slate-500">{t("pages:myResults.overtime.delay")}</p>
                      <p className="text-sm font-bold text-amber-700">
                        +{formatOvertime(result.overtime_seconds)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">{t("pages:myResults.overtime.score")}</p>
                      <p className="text-sm font-bold text-slate-700">{result.score}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-amber-600 mt-4 italic">
              {t("pages:myResults.overtime.tip", { seconds: Math.round((filteredResults[0]?.time_spent_seconds ?? 0) / Math.max(1, (filteredResults[0]?.correct_count ?? 0) + (filteredResults[0]?.wrong_count ?? 0))) || "?" })}
            </p>
        </div>
      )}
      </>
      )}
    </div>
  );
}

/** Tünel raporları sekmesi — satın alınan tünellerde ilerleme + durum (hafif). */
/** Yazılı test raporu — satın alınan yazılı paketler + test deneme durumu (puansız). */
function WrittenResultsTab() {
  const { t } = useTranslation(["pages"]);
  const { data, isLoading } = useQuery({
    queryKey: ["candidateWritten", "mine"],
    queryFn: () => candidateWritten.myPackages(),
    staleTime: 30_000,
  });
  const items = data?.items ?? [];

  if (isLoading) {
    return <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (items.length === 0) {
    return <p className="py-16 text-center text-sm text-slate-500">{t("pages:writtenGrid.emptyMine")}</p>;
  }

  const stateBadge = (st) => {
    if (st === "SUBMITTED" || st === "TIMEOUT") return <Badge className="bg-emerald-100 text-emerald-700"><CheckCircle2 className="mr-1 h-3 w-3" />{t("pages:writtenResults.completed")}</Badge>;
    if (st === "IN_PROGRESS") return <Badge className="bg-amber-100 text-amber-700">{t("pages:writtenResults.inProgress")}</Badge>;
    return <Badge className="bg-slate-100 text-slate-600">{t("pages:writtenResults.notStarted")}</Badge>;
  };

  return (
    <ul className="space-y-3">
      {items.map((p) => (
        <li key={p.packageId} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-2 flex items-center gap-2">
            <FileText className="h-4 w-4 flex-shrink-0 text-indigo-600" />
            <span className="font-semibold text-slate-900 dark:text-gray-100">{p.title}</span>
          </div>
          <ul className="space-y-1.5">
            {p.tests.map((test) => (
              <li key={test.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-gray-800">
                <span className="min-w-0 truncate text-slate-700 dark:text-gray-200">{test.title}</span>
                <div className="flex items-center gap-2">
                  {stateBadge(test.state)}
                  <Link to={`${buildPageUrl("TakeWrittenTest")}?testId=${test.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700">
                    <PlayCircle className="h-3.5 w-3.5" />
                    {test.state === "SUBMITTED" || test.state === "TIMEOUT" ? t("pages:writtenDetail.review") : test.state === "IN_PROGRESS" ? t("pages:writtenDetail.continue") : t("pages:writtenDetail.start")}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function TunnelReportsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["candidateTunnelReports"],
    queryFn: () => candidateTunnels.reports(),
    staleTime: 30_000,
  });
  const items = data?.items ?? [];

  if (isLoading) {
    return <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (items.length === 0) {
    return <p className="py-16 text-center text-sm text-slate-500">Henüz satın aldığın tünel yok.</p>;
  }

  const statusBadge = (it) => {
    if (it.status === "COMPLETED") return <Badge className="bg-emerald-100 text-emerald-700"><CheckCircle2 className="mr-1 h-3 w-3" /> Tamamlandı</Badge>;
    if (it.status === "IN_PROGRESS") return <Badge className="bg-amber-100 text-amber-700">Devam Ediyor</Badge>;
    return <Badge className="bg-slate-100 text-slate-600">Başlanmadı</Badge>;
  };

  return (
    <ul className="space-y-3">
      {items.map((it) => (
        <li key={it.tunnelId} className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 flex-shrink-0 text-indigo-600" />
                <span className="font-semibold text-slate-900">{it.title}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                {it.examTypeName && <span>{it.examTypeName}</span>}
                {it.topicName && <span>· {it.topicName}</span>}
                <span>· {it.masteredQuestions}/{it.totalQuestions} soru öğrenildi</span>
              </div>
            </div>
            {statusBadge(it)}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-indigo-600 transition-all" style={{ width: `${it.progressPercent}%` }} />
            </div>
            <span className="w-10 text-right text-sm font-semibold text-indigo-600">%{it.progressPercent}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}