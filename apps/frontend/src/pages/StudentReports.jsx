import { useState, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { studentReport } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, AlertCircle } from "lucide-react";

const StudentReportCharts = lazy(() => import("@/components/school/StudentReportCharts"));

const fmtPct = (p) => (p == null ? "—" : `%${p}`);
const RANGES = [
  { value: "all", label: "Tüm zamanlar", days: null },
  { value: "30", label: "Son 30 gün", days: 30 },
  { value: "90", label: "Son 90 gün", days: 90 },
  { value: "180", label: "Son 6 ay", days: 180 },
];
const avgClass = (p) => (p == null ? "text-slate-400" : p >= 70 ? "text-emerald-600" : p >= 50 ? "text-amber-600" : "text-rose-600");

/** E-Sınıf — Öğrenci Raporlarım: zamana ve seviyeye bağlı ders + konu başarımı. */
export default function StudentReports() {
  const { user } = useAuth();
  const isStudent = user?.school?.schoolRole === "STUDENT";
  const [range, setRange] = useState("all");

  const from = (() => {
    const r = RANGES.find((x) => x.value === range);
    return r?.days ? new Date(Date.now() - r.days * 86400000).toISOString() : undefined;
  })();

  const { data, isLoading } = useQuery({
    queryKey: ["esinif", "student-report", range],
    queryFn: () => studentReport.get({ from }),
    enabled: isStudent,
  });

  if (!isStudent) return <div className="max-w-lg mx-auto text-center py-20"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" /><h2 className="text-xl font-semibold text-slate-900">Erişim yok</h2></div>;

  const summary = data?.summary ?? { submissionCount: 0, avgPercent: null, questionCount: 0 };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center"><BarChart3 className="w-5 h-5 text-indigo-600" /></div>
          <div><h1 className="text-2xl font-bold text-slate-900">Raporlarım</h1><p className="text-sm text-slate-500">{data?.level ? `${data.level}. Seviye · ` : ""}Ders ve konu başarımın</p></div>
        </div>
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>{RANGES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
        </Select>
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
        <div className="text-center py-16 text-slate-500"><BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>Bu aralıkta çözülmüş sınav yok.</p></div>
      ) : (
        <Suspense fallback={<div className="h-64 bg-slate-100 rounded-xl animate-pulse" />}>
          <StudentReportCharts bySubject={data.bySubject} byTopic={data.byTopic} timeseries={data.timeseries} />
        </Suspense>
      )}
    </div>
  );
}
