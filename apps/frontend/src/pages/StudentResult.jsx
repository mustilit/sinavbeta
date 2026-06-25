import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { studentAssignments } from "@/api/dalClient";
import { useAppNavigate, buildPageUrl } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, CheckCircle2, XCircle, Clock, AlertCircle } from "lucide-react";

const REASON = { SUBMIT: "teslimden sonra", DUE_DATE: "son tarihten sonra", TEACHER_RELEASE: "öğretmen yayımlayınca" };

/** E-Sınıf — Öğrenci sonuç ekranı (showResultAfter kuralına göre). */
export default function StudentResult() {
  const [params] = useSearchParams();
  const navigate = useAppNavigate();
  const id = params.get("id");
  const { data: r, isLoading, isError } = useQuery({ queryKey: ["esinif", "student-result", id], queryFn: () => studentAssignments.result(id), enabled: !!id });

  if (isLoading) return <div className="max-w-2xl mx-auto py-20 text-center text-slate-400">Yükleniyor…</div>;
  if (isError || !r) return <div className="max-w-lg mx-auto text-center py-20"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" /><h2 className="text-xl font-semibold text-slate-900">Sonuç bulunamadı</h2></div>;

  const back = <Button variant="ghost" size="icon" onClick={() => navigate(buildPageUrl("StudentAssignments"))} aria-label="Geri"><ArrowLeft className="w-5 h-5" /></Button>;

  if (!r.visible) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-3">
        <div className="flex justify-start">{back}</div>
        <Clock className="w-12 h-12 mx-auto text-amber-400" />
        <h2 className="text-xl font-semibold text-slate-900">Sonuç henüz görünmüyor</h2>
        <p className="text-slate-500">Bu ödevin sonucu {REASON[r.reason] ?? "ileride"} görüntülenebilecek. {r.status === "SUBMITTED" ? "Yazılı cevaplarınız öğretmen değerlendirmesini bekliyor." : ""}</p>
      </div>
    );
  }

  const isChoice = r.examType === "TEST" || r.examType === "TUNNEL";
  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">{back}<h1 className="text-xl font-bold text-slate-900">Sonuç</h1></div>

      {isChoice ? (
        <Card><CardContent className="p-6 text-center">
          <p className="text-4xl font-bold text-slate-900">{r.totalScore}<span className="text-xl text-slate-400">/{r.maxScore}</span></p>
          <p className="text-sm text-slate-500 mt-1">{r.maxScore ? Math.round((r.totalScore / r.maxScore) * 100) : 0}% başarı</p>
        </CardContent></Card>
      ) : (
        <Card><CardContent className="p-5">
          <p className="font-medium text-slate-900">{r.status === "GRADED" ? `Puan: ${r.totalScore ?? "—"}/${r.maxScore}` : "Yazılı cevaplarınız değerlendiriliyor"}</p>
          {r.feedback && <p className="text-sm text-slate-600 mt-2 italic">"{r.feedback}"</p>}
        </CardContent></Card>
      )}

      <div className="space-y-3">
        {r.questions.map((q, i) => (
          <Card key={q.id}>
            <CardContent className="p-5 space-y-2">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 text-sm font-semibold">{i + 1}</span>
                <div className="flex-1">
                  <p className="text-slate-900 whitespace-pre-wrap">{q.content}</p>
                  {isChoice ? (
                    <div className="mt-2 space-y-1.5">
                      {q.options.map((o, j) => {
                        const chosen = q.selectedOptionId === o.id;
                        const tone = o.isCorrect ? "border-emerald-300 bg-emerald-50" : chosen ? "border-rose-300 bg-rose-50" : "border-slate-200";
                        return (
                          <div key={o.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${tone}`}>
                            <span className="font-semibold text-slate-500">{String.fromCharCode(65 + j)}</span>
                            <span className="text-slate-800">{o.content}</span>
                            {o.isCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-600 ml-auto" />}
                            {chosen && !o.isCorrect && <XCircle className="w-4 h-4 text-rose-600 ml-auto" />}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-2 space-y-2">
                      <div className="rounded-lg bg-slate-50 p-3 text-sm">
                        <p className="text-xs text-slate-400 mb-1">Cevabınız</p>
                        {q.textAnswer || (!q.imageUrls?.length && <span className="text-slate-400">—</span>)}
                        {q.imageUrls?.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {q.imageUrls.map((u, k) => <a key={k} href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt={`cevap ${k + 1}`} className="h-20 w-20 object-cover rounded-lg border border-slate-200" /></a>)}
                          </div>
                        )}
                      </div>
                      {q.solutionText && <div className="rounded-lg bg-emerald-50 p-3 text-sm"><p className="text-xs text-emerald-600 mb-1">Çözüm</p>{q.solutionText}</div>}
                      {q.earnedPoints != null && <p className="text-xs text-slate-500">Puan: {q.earnedPoints}/{q.points}</p>}
                    </div>
                  )}
                  {isChoice && q.solutionText && <p className="text-xs text-slate-500 mt-2">Açıklama: {q.solutionText}</p>}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
