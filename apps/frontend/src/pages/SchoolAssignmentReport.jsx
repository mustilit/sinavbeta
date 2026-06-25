import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { school as schoolApi } from "@/api/dalClient";
import { useAppNavigate, buildPageUrl } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

const SUB_STATUS = {
  IN_PROGRESS: { label: "Devam ediyor", color: "text-amber-600" },
  SUBMITTED: { label: "Teslim (puanlanacak)", color: "text-blue-600" },
  GRADED: { label: "Puanlandı", color: "text-emerald-600" },
  OVERDUE: { label: "Süresi geçti", color: "text-rose-600" },
};

/** E-Sınıf — Ödev raporu (teslim oranı, ortalama, öğrenci listesi). */
export default function SchoolAssignmentReport() {
  const [params] = useSearchParams();
  const navigate = useAppNavigate();
  const id = params.get("id");
  const { data: r, isLoading, isError } = useQuery({ queryKey: ["esinif", "assignment-report", id], queryFn: () => schoolApi.assignments.report(id), enabled: !!id });

  if (isLoading) return <div className="max-w-4xl mx-auto py-20 text-center text-slate-400">Yükleniyor…</div>;
  if (isError || !r) return <div className="max-w-lg mx-auto text-center py-20"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" /><h2 className="text-xl font-semibold text-slate-900">Rapor bulunamadı</h2></div>;

  const stat = r.stats;
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(buildPageUrl("SchoolAssignments"))} aria-label="Geri"><ArrowLeft className="w-5 h-5" /></Button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{r.title}</h1>
          <p className="text-sm text-slate-500">{r.examTitle} · {r.examType} · {r.classroomName} · maks {r.maxPoints} puan</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Teslim oranı", value: `%${stat.submissionRate}`, sub: `${stat.submittedCount}/${stat.totalStudents}` },
          { label: "Ortalama", value: stat.avgScore ?? "—", sub: `/${r.maxPoints}` },
          { label: "En yüksek", value: stat.maxScore ?? "—" },
          { label: "En düşük", value: stat.minScore ?? "—" },
        ].map((s) => (
          <Card key={s.label}><CardContent className="p-4"><p className="text-2xl font-bold text-slate-900">{s.value}</p><p className="text-xs text-slate-500">{s.label}{s.sub ? ` · ${s.sub}` : ""}</p></CardContent></Card>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs">
            <tr><th className="px-3 py-2 text-left">Öğrenci</th><th className="px-3 py-2 text-left">Durum</th><th className="px-3 py-2 text-right">Puan</th><th className="px-3 py-2 text-left">Teslim</th>{r.examType === "WRITTEN" && <th className="px-3 py-2 text-right">İşlem</th>}</tr>
          </thead>
          <tbody>
            {r.submissions.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-400">Henüz teslim yok.</td></tr>
            ) : r.submissions.map((s) => {
              const st = SUB_STATUS[s.status] ?? SUB_STATUS.IN_PROGRESS;
              return (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="px-3 py-2"><span className="font-mono text-slate-800">{s.studentUsername}</span>{s.studentName ? <span className="text-slate-500 text-xs ml-2">{s.studentName}</span> : null}</td>
                  <td className="px-3 py-2"><span className={`text-xs font-medium ${st.color}`}>{st.label}</span></td>
                  <td className="px-3 py-2 text-right font-medium text-slate-900">{s.totalScore != null ? `${s.totalScore}/${s.maxScore ?? r.maxPoints}` : "—"}</td>
                  <td className="px-3 py-2 text-slate-500 text-xs">{s.submittedAt ? format(new Date(s.submittedAt), "d MMM HH:mm", { locale: tr }) : "—"}</td>
                  {r.examType === "WRITTEN" && (
                    <td className="px-3 py-2 text-right">
                      {(s.status === "SUBMITTED" || s.status === "GRADED") && (
                        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => navigate(buildPageUrl("SchoolGradeSubmission", { id: s.id }))}>{s.status === "GRADED" ? "Düzenle" : "Değerlendir"}</Button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {r.showResultAfter === "TEACHER_RELEASE" && (
        <p className="text-xs text-slate-400">Sonuç görünürlüğü: öğretmen yayımlayınca {r.resultsReleased ? "(yayımlandı)" : "(henüz yayımlanmadı)"}.</p>
      )}
    </div>
  );
}
