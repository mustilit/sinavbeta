import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { studentReport } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, AlertCircle, ListChecks, FileText, FileDown, Loader2 } from "lucide-react";
import { ComplianceReport } from "@/components/school/ComplianceReport";
import { exportElementToPdf } from "@/lib/reportPdf";
import { toast } from "sonner";

const StudentReportCharts = lazy(() => import("@/components/school/StudentReportCharts"));

const fmtPct = (p) => (p == null ? "—" : `%${p}`);
const RANGES = [
  { value: "all", label: "Tüm zamanlar", days: null },
  { value: "30", label: "Son 30 gün", days: 30 },
  { value: "90", label: "Son 90 gün", days: 90 },
  { value: "180", label: "Son 6 ay", days: 180 },
];
const avgClass = (p) => (p == null ? "text-slate-400" : p >= 70 ? "text-emerald-600" : p >= 50 ? "text-amber-600" : "text-rose-600");
// Test / Yazılı her sınav türünün raporu ayrı sekmede.
const TYPE_TABS = [{ k: "TEST", l: "Test", Icon: ListChecks }, { k: "WRITTEN", l: "Yazılı", Icon: FileText }];

/** E-Sınıf — Öğrenci Raporlarım: tür (Test/Yazılı) + zaman + seviyeye bağlı çözülen soru / başarım. */
export default function StudentReports() {
  const { user } = useAuth();
  const isStudent = user?.school?.schoolRole === "STUDENT";
  const [range, setRange] = useState("all");
  const [examType, setExamType] = useState("TEST");
  const [subject, setSubject] = useState("ALL");
  const [exporting, setExporting] = useState(false);
  const pageRef = useRef(null);

  const from = (() => {
    const r = RANGES.find((x) => x.value === range);
    return r?.days ? new Date(Date.now() - r.days * 86400000).toISOString() : undefined;
  })();

  const { data, isLoading } = useQuery({
    queryKey: ["esinif", "student-report", range, examType, subject],
    queryFn: () => studentReport.get({ from, examType, subject: subject === "ALL" ? undefined : subject }),
    enabled: isStudent,
  });

  // Sınav türü değişince ders seçimini sıfırla — yeni türde o ders olmayabilir.
  useEffect(() => { setSubject("ALL"); }, [examType]);

  const exportPdf = async () => {
    if (!pageRef.current) return;
    setExporting(true);
    try {
      await exportElementToPdf(pageRef.current, { fileName: `raporlarim-${new Date().toISOString().slice(0, 10)}.pdf` });
    } catch (e) {
      console.error("Raporlarım PDF export hatası:", e);
      toast.error("PDF oluşturulamadı");
    } finally {
      setExporting(false);
    }
  };

  if (!isStudent) return <div className="max-w-lg mx-auto text-center py-20"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" /><h2 className="text-xl font-semibold text-slate-900">Erişim yok</h2></div>;

  const summary = data?.summary ?? { submissionCount: 0, avgPercent: null, questionCount: 0 };
  const subjects = data?.subjects ?? [];

  return (
    <div ref={pageRef} className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center"><BarChart3 className="w-5 h-5 text-indigo-600" /></div>
          <div><h1 className="text-2xl font-bold text-slate-900">Raporlarım</h1><p className="text-sm text-slate-500">{data?.level ? `${data.level}. Seviye · ` : ""}Ders ve konu başarımın</p></div>
        </div>
        <div className="flex items-center gap-2 flex-wrap" data-html2canvas-ignore="true">
          <Select value={subject} onValueChange={setSubject}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Ders" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tüm dersler</SelectItem>
              {subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>{RANGES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" className="gap-2" disabled={exporting} onClick={exportPdf}>
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} PDF
          </Button>
        </div>
      </div>

      {/* Ödev uyumu — teslim durumu + süre kontrolü (kendi ödevlerin) */}
      <ComplianceReport />

      {/* Sınav türü sekmeleri — Test / Yazılı ayrı rapor */}
      <div className="flex gap-1 border-b border-slate-200">
        {TYPE_TABS.map((t) => (
          <button key={t.k} type="button" onClick={() => setExamType(t.k)} className={`px-4 py-2.5 min-h-10 text-sm font-medium border-b-2 -mb-px inline-flex items-center gap-1.5 ${examType === t.k ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-600 hover:text-slate-900"}`}>
            <t.Icon className="w-4 h-4" /> {t.l}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { l: "Çözülen soru", v: summary.questionCount ?? 0 },
          { l: "Çözülen sınav", v: summary.submissionCount },
          { l: "Genel ortalama", v: fmtPct(summary.avgPercent), cls: avgClass(summary.avgPercent) },
          { l: "Seviye", v: data?.level ? `${data.level}. Sınıf` : "—" },
        ].map((s) => <Card key={s.l}><CardContent className="p-4"><p className={`text-2xl font-bold ${s.cls ?? "text-slate-900"}`}>{s.v}</p><p className="text-xs text-slate-500">{s.l}</p></CardContent></Card>)}
      </div>

      {isLoading ? (
        <div className="h-64 bg-slate-100 rounded-xl animate-pulse" />
      ) : summary.submissionCount === 0 ? (
        <div className="text-center py-16 text-slate-500"><BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>Bu aralıkta çözülmüş {examType === "WRITTEN" ? "yazılı" : "test"} yok.</p></div>
      ) : (
        <Suspense fallback={<div className="h-64 bg-slate-100 rounded-xl animate-pulse" />}>
          <StudentReportCharts bySubject={data.bySubject} byTopic={data.byTopic} timeseries={data.timeseries} />
        </Suspense>
      )}
    </div>
  );
}
