import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { school as schoolApi } from "@/api/dalClient";
import { useAppNavigate } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

/** E-Sınıf — Öğretmen yazılı teslim değerlendirme. ?id=submissionId */
export default function SchoolGradeSubmission() {
  const [params] = useSearchParams();
  const navigate = useAppNavigate();
  const submissionId = params.get("id");
  const [grades, setGrades] = useState({}); // questionId -> earnedPoints
  const [feedback, setFeedback] = useState("");

  const { data: s, isLoading, isError } = useQuery({ queryKey: ["esinif", "grading", submissionId], queryFn: () => schoolApi.grading.get(submissionId), enabled: !!submissionId });

  useEffect(() => {
    if (!s) return;
    const init = {};
    for (const q of s.questions) init[q.questionId] = q.earnedPoints ?? "";
    setGrades(init);
    setFeedback(s.feedback ?? "");
  }, [s]);

  const grade = useMutation({
    mutationFn: () => schoolApi.grading.grade(submissionId, {
      grades: s.questions.map((q) => ({ questionId: q.questionId, earnedPoints: Number(grades[q.questionId]) || 0 })),
      feedback,
    }),
    onSuccess: (res) => { toast.success(`Değerlendirildi: ${res.totalScore}/${res.maxScore}`); navigate(-1); },
    onError: (e) => toast.error(e?.response?.data?.message ?? "Kaydedilemedi"),
  });

  if (isLoading) return <div className="max-w-2xl mx-auto py-20 text-center text-slate-400">Yükleniyor…</div>;
  if (isError || !s) return <div className="max-w-lg mx-auto text-center py-20"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" /><h2 className="text-xl font-semibold text-slate-900">Teslim bulunamadı</h2></div>;

  const computedTotal = s.questions.reduce((sum, q) => sum + (Number(grades[q.questionId]) || 0), 0);
  const maxTotal = s.questions.reduce((sum, q) => sum + q.points, 0);

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Geri"><ArrowLeft className="w-5 h-5" /></Button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Değerlendirme</h1>
          <p className="text-sm text-slate-500">{s.assignmentTitle} · <span className="font-mono">{s.student.username}</span>{s.student.name ? ` · ${s.student.name}` : ""}</p>
        </div>
        {s.status === "GRADED" && <Badge className="bg-emerald-100 text-emerald-700 ml-auto">Puanlandı</Badge>}
      </div>

      <div className="space-y-3">
        {s.questions.map((q, i) => (
          <Card key={q.questionId}>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 text-sm font-semibold">{i + 1}</span>
                <div className="flex-1">
                  <p className="text-slate-900 whitespace-pre-wrap">{q.content}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{q.points} puan</p>
                </div>
              </div>
              <div className="pl-10 space-y-3">
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-slate-400 mb-1">Öğrenci cevabı</p>
                  {q.textAnswer ? <p className="text-sm whitespace-pre-wrap">{q.textAnswer}</p> : <p className="text-sm text-slate-400">— metin yok —</p>}
                  {q.imageUrls?.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {q.imageUrls.map((u, k) => (
                        <a key={k} href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt={`cevap ${k + 1}`} className="h-24 w-24 object-cover rounded-lg border border-slate-200" /></a>
                      ))}
                    </div>
                  )}
                </div>
                {q.solutionText && <div className="rounded-lg bg-emerald-50 p-3 text-sm"><p className="text-xs text-emerald-600 mb-1">Çözüm (referans)</p>{q.solutionText}</div>}
                <div className="flex items-center gap-2">
                  <Label className="text-sm text-slate-600">Puan</Label>
                  <Input type="number" min={0} max={q.points} step="0.5" value={grades[q.questionId] ?? ""} onChange={(e) => setGrades((g) => ({ ...g, [q.questionId]: e.target.value }))} className="w-24 h-9" />
                  <span className="text-sm text-slate-400">/ {q.points}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card><CardContent className="p-5 space-y-3">
        <div><Label htmlFor="fb">Genel yorum (opsiyonel)</Label><Textarea id="fb" value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={2} maxLength={4000} /></div>
        <div className="flex items-center justify-between">
          <span className="text-lg font-bold text-slate-900">Toplam: {computedTotal}/{maxTotal}</span>
          <Button onClick={() => grade.mutate()} disabled={grade.isPending} className="bg-emerald-600 hover:bg-emerald-700 gap-2"><CheckCircle2 className="w-4 h-4" /> {grade.isPending ? "Kaydediliyor…" : "Değerlendirmeyi Kaydet"}</Button>
        </div>
      </CardContent></Card>
    </div>
  );
}
