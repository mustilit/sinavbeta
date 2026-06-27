import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { studentAssignments } from "@/api/dalClient";
import { useAppNavigate, buildPageUrl } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, ChevronRight, Send, CheckCircle2, AlertCircle, ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { SchoolTunnelSolver } from "@/components/school/SchoolTunnelSolver";

/** E-Sınıf — Öğrenci ödev çözme. TEST/WRITTEN liste; TUNNEL sıralı (geri yok). Autosave + süre. */
export default function StudentSolve() {
  const [params] = useSearchParams();
  const navigate = useAppNavigate();
  const id = params.get("id");
  const [answers, setAnswers] = useState({}); // questionId -> { selectedOptionId, textAnswer }
  const [idx, setIdx] = useState(0); // TUNNEL için
  const [remaining, setRemaining] = useState(null); // saniye
  const saveTimers = useRef({});
  const started = useRef(false);

  const { data: a, isLoading, isError } = useQuery({ queryKey: ["esinif", "solve", id], queryFn: () => studentAssignments.get(id), enabled: !!id });

  const start = useMutation({ mutationFn: () => studentAssignments.start(id) });
  const save = useMutation({ mutationFn: (body) => studentAssignments.saveAnswer(id, body) });
  const submit = useMutation({
    mutationFn: () => studentAssignments.submit(id),
    onSuccess: () => { toast.success("Ödev teslim edildi"); navigate(buildPageUrl("StudentResult", { id }), { replace: true }); },
    onError: (e) => toast.error(e?.response?.data?.message ?? "Teslim edilemedi"),
  });

  // İlk yükleme: başlat + cevapları doldur + süre başlat
  useEffect(() => {
    if (!a) return;
    if (a.submitted) { navigate(buildPageUrl("StudentResult", { id }), { replace: true }); return; }
    if (!a.open) return;
    if (!started.current) { started.current = true; start.mutate(); }
    const init = {};
    for (const q of a.questions) init[q.id] = { selectedOptionId: q.selectedOptionId ?? null, textAnswer: q.textAnswer ?? "", imageUrls: q.imageUrls ?? [] };
    setAnswers(init);
    if (a.durationMinutes) setRemaining(a.durationMinutes * 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a]);

  // Süre sayacı — bitince otomatik teslim
  useEffect(() => {
    if (remaining == null) return;
    if (remaining <= 0) { if (!submit.isPending) submit.mutate(); return; }
    const t = setTimeout(() => setRemaining((r) => (r == null ? r : r - 1)), 1000);
    return () => clearTimeout(t);
  }, [remaining]); // eslint-disable-line react-hooks/exhaustive-deps

  const uploadFor = async (qid, file) => {
    if (!file) return;
    const cur = answers[qid]?.imageUrls ?? [];
    if (cur.length >= 5) return toast.error("En fazla 5 görsel");
    try {
      const url = await studentAssignments.uploadImage(file);
      if (url) persist(qid, { imageUrls: [...cur, url] });
    } catch { toast.error("Görsel yüklenemedi"); }
  };
  const removeImage = (qid, url) => persist(qid, { imageUrls: (answers[qid]?.imageUrls ?? []).filter((u) => u !== url) });

  const persist = (qid, patch) => {
    setAnswers((prev) => {
      const next = { ...prev, [qid]: { ...prev[qid], ...patch } };
      // Debounce sunucuya kaydet (autosave)
      clearTimeout(saveTimers.current[qid]);
      saveTimers.current[qid] = setTimeout(() => {
        save.mutate({ questionId: qid, selectedOptionId: next[qid].selectedOptionId ?? null, textAnswer: next[qid].textAnswer ?? null, imageUrls: next[qid].imageUrls ?? [] });
      }, 600);
      return next;
    });
  };

  if (isLoading) return <div className="max-w-3xl mx-auto py-20 text-center text-slate-400">Yükleniyor…</div>;
  if (isError || !a) return <div className="max-w-lg mx-auto text-center py-20"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" /><h2 className="text-xl font-semibold text-slate-900">Ödev bulunamadı</h2></div>;
  if (!a.open) return <div className="max-w-lg mx-auto text-center py-20"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-amber-400" /><h2 className="text-xl font-semibold text-slate-900">Ödev çözüme kapalı</h2></div>;

  // TUNNEL → market tüneliyle aynı adaptif çözme (katmanlı, ustalık tabanlı).
  if (a.examType === "TUNNEL" && a.examId) {
    return (
      <div className="max-w-3xl mx-auto">
        <button onClick={() => navigate(buildPageUrl("StudentAssignments"))} className="mb-4 text-sm text-slate-500 hover:text-slate-800">← Ödevlerim</button>
        <SchoolTunnelSolver examId={a.examId} />
      </div>
    );
  }

  const isChoice = a.examType === "TEST" || a.examType === "TUNNEL";
  const isTunnel = a.examType === "TUNNEL";
  const mmss = remaining != null ? `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}` : null;

  const QuestionBody = ({ q, n }) => (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-700 text-sm font-semibold">{n}</span>
          <div className="flex-1">
            <p className="text-slate-900 whitespace-pre-wrap">{q.content}</p>
            {q.mediaUrl && <img src={q.mediaUrl} alt="" className="mt-2 max-h-60 rounded-lg" />}
            <p className="text-xs text-slate-400 mt-1">{q.points} puan</p>
          </div>
        </div>
        {isChoice ? (
          <div className="space-y-2 pl-10">
            {q.options.map((o, j) => {
              const selected = answers[q.id]?.selectedOptionId === o.id;
              return (
                <button key={o.id} type="button" onClick={() => persist(q.id, { selectedOptionId: o.id })}
                  className={`w-full text-left flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${selected ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:bg-slate-50"}`}>
                  <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${selected ? "bg-indigo-600 border-indigo-600 text-white" : "border-slate-300 text-slate-500"}`}>{String.fromCharCode(65 + j)}</span>
                  <span className="text-sm text-slate-800">{o.content}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="pl-10 space-y-2">
            <Textarea value={answers[q.id]?.textAnswer ?? ""} onChange={(e) => persist(q.id, { textAnswer: e.target.value })} rows={4} placeholder="Cevabınız… (yazabilir veya kağıttaki cevabın fotoğrafını yükleyebilirsiniz)" maxLength={8000} />
            <div className="flex flex-wrap items-center gap-2">
              {(answers[q.id]?.imageUrls ?? []).map((u) => (
                <div key={u} className="relative">
                  <img src={u} alt="cevap" className="h-20 w-20 object-cover rounded-lg border border-slate-200" />
                  <button type="button" onClick={() => removeImage(q.id, u)} className="absolute -top-2 -right-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-white" aria-label="Sil"><X className="w-3 h-3" /></button>
                </div>
              ))}
              {(answers[q.id]?.imageUrls ?? []).length < 5 && (
                <label className="inline-flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 text-slate-400 hover:border-indigo-400 hover:text-indigo-500">
                  <ImagePlus className="w-5 h-5" />
                  <span className="text-[10px]">Fotoğraf</span>
                  <input type="file" accept="image/jpeg,image/png" className="hidden" onChange={(e) => { uploadFor(q.id, e.target.files?.[0]); e.target.value = ""; }} />
                </label>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const answeredCount = a.questions.filter((q) => answers[q.id]?.selectedOptionId || (answers[q.id]?.textAnswer ?? "").trim()).length;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="sticky top-0 z-10 -mx-4 px-4 py-3 bg-white/90 backdrop-blur border-b border-slate-100 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-slate-900">{a.title}</h1>
          <p className="text-xs text-slate-500">{answeredCount}/{a.questions.length} cevaplandı{save.isPending ? " · kaydediliyor…" : ""}</p>
        </div>
        {mmss && <Badge className={`gap-1 ${remaining < 60 ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-700"}`}><Clock className="w-3.5 h-3.5" /> {mmss}</Badge>}
      </div>

      {isTunnel ? (
        <div className="space-y-4">
          <QuestionBody q={a.questions[idx]} n={idx + 1} />
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Soru {idx + 1} / {a.questions.length} · Tünelde geri dönüş yok</span>
            {idx < a.questions.length - 1 ? (
              <Button onClick={() => setIdx((i) => i + 1)} className="bg-indigo-600 hover:bg-indigo-700 gap-1">Sonraki <ChevronRight className="w-4 h-4" /></Button>
            ) : (
              <Button onClick={() => { if (confirm("Ödevi teslim et?")) submit.mutate(); }} disabled={submit.isPending} className="bg-emerald-600 hover:bg-emerald-700 gap-1"><Send className="w-4 h-4" /> Teslim Et</Button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {a.questions.map((q, i) => <QuestionBody key={q.id} q={q} n={i + 1} />)}
          <div className="flex justify-end sticky bottom-4">
            <Button onClick={() => { if (confirm("Ödevi teslim et? Teslimden sonra değişiklik yapamazsınız.")) submit.mutate(); }} disabled={submit.isPending} className="bg-emerald-600 hover:bg-emerald-700 gap-2 shadow-lg"><CheckCircle2 className="w-4 h-4" /> {submit.isPending ? "Teslim ediliyor…" : "Teslim Et"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
