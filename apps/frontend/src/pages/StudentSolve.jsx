import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { studentAssignments, studentPractice } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { useAppNavigate, buildPageUrl } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TestWatermark } from "@/components/test/TestWatermark";
import QuestionCanvas from "@/components/test/QuestionCanvas";
import { SchoolTunnelSolver } from "@/components/school/SchoolTunnelSolver";
import { NoteWidget } from "@/components/notes/NoteWidget";
import {
  ArrowLeft, Clock, Sun, Pencil, Eraser, AlertTriangle, ChevronLeft, ChevronRight,
  X, CheckCircle2, AlertCircle, LogOut, Loader2, Save,
} from "lucide-react";
import { toast } from "sonner";

const fmt = (sec) => (sec == null ? null : `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`);

/** dataURL → File (kalem çizimini /upload/image'a göndermek için). */
async function dataUrlToFile(dataUrl, name = "cizim.png") {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], name, { type: blob.type || "image/png" });
}

/**
 * E-Sınıf — Öğrenci soru çözme. Aday (market) çözme deneyimiyle BİREBİR:
 * filigran (TestWatermark) + süre sayacı + bej (sepia) okuma modu + kalem/çizim
 * (QuestionCanvas) + soru-soru gezinme + hata bildirimi + teslim onayı.
 *  - TEST: şıklı.
 *  - TUNNEL: adaptif → SchoolTunnelSolver (market tüneliyle aynı).
 *  - WRITTEN: metin + kalem çizimi + fotoğraf; teslimden sonra StudentResult'ta öz-değerlendirme.
 */
export default function StudentSolve() {
  const [params] = useSearchParams();
  const navigate = useAppNavigate();
  const { user } = useAuth();
  // Ödev modu (?id=assignmentId) veya serbest alıştırma modu (?practice=examId).
  const practiceId = params.get("practice");
  const isPractice = !!practiceId;
  const apiNs = isPractice ? studentPractice : studentAssignments;
  const id = practiceId || params.get("id");
  const resultParam = isPractice ? { practice: id } : { id };

  const [answers, setAnswers] = useState({}); // qid -> { selectedOptionId, textAnswer, imageUrls }
  const [drawings, setDrawings] = useState({}); // qid -> çizim url'i (imageUrls içinde de tutulur)
  const [current, setCurrent] = useState(0);
  const [remaining, setRemaining] = useState(null);
  const [examTheme, setExamTheme] = useState(() => {
    try { return localStorage.getItem("dal_exam_theme") === "sepia" ? "sepia" : "light"; } catch { return "light"; }
  });
  const [isDrawing, setIsDrawing] = useState(false);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const saveTimers = useRef({});
  const pendingRef = useRef({}); // qid -> bekleyen autosave payload (kapanışta flush)
  const started = useRef(false);
  const canvasRef = useRef(null);

  const { data: a, isLoading, isError } = useQuery({ queryKey: ["esinif", "solve", isPractice ? "practice" : "assignment", id], queryFn: () => apiNs.get(id), enabled: !!id });

  const start = useMutation({ mutationFn: () => apiNs.start(id) });
  const save = useMutation({ mutationFn: (body) => apiNs.saveAnswer(id, body) });
  const submitM = useMutation({
    mutationFn: () => apiNs.submit(id),
    onSuccess: () => { toast.success(isPractice ? "Alıştırma teslim edildi" : "Ödev teslim edildi"); navigate(buildPageUrl("StudentResult", resultParam), { replace: true }); },
    onError: (e) => toast.error(e?.response?.data?.message ?? "Teslim edilemedi"),
  });

  // İlk yükleme: başlat + cevapları doldur + süre başlat
  useEffect(() => {
    if (!a) return;
    if (a.submitted) { navigate(buildPageUrl("StudentResult", resultParam), { replace: true }); return; }
    if (!a.open) return;
    if (!started.current) { started.current = true; start.mutate(); }
    const init = {};
    for (const q of a.questions) {
      init[q.id] = { selectedOptionId: q.selectedOptionId ?? null, textAnswer: q.textAnswer ?? "", imageUrls: q.imageUrls ?? [] };
    }
    setAnswers(init); setDrawings({});
    if (a.durationMinutes) setRemaining(a.durationMinutes * 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a]);

  // Bej (sepia) okuma modu — market ile aynı body class'ı
  useEffect(() => {
    try { localStorage.setItem("dal_exam_theme", examTheme); } catch { /* yoksay */ }
    if (examTheme === "sepia") document.body.classList.add("exam-sepia");
    else document.body.classList.remove("exam-sepia");
    return () => document.body.classList.remove("exam-sepia");
  }, [examTheme]);

  // Süre sayacı — bitince otomatik teslim
  useEffect(() => {
    if (remaining == null) return;
    if (remaining <= 0) { if (!submitM.isPending) submitM.mutate(); return; }
    const t = setTimeout(() => setRemaining((r) => (r == null ? r : r - 1)), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining]);

  const persist = useCallback((qid, patch) => {
    setAnswers((prev) => {
      const next = { ...prev, [qid]: { ...prev[qid], ...patch } };
      const payload = { questionId: qid, selectedOptionId: next[qid].selectedOptionId ?? null, textAnswer: next[qid].textAnswer ?? null, imageUrls: next[qid].imageUrls ?? [] };
      pendingRef.current[qid] = payload; // beforeunload flush için bekleyen kayıt
      clearTimeout(saveTimers.current[qid]);
      saveTimers.current[qid] = setTimeout(() => { delete pendingRef.current[qid]; save.mutate(payload); }, 600);
      return next;
    });
  }, [save]);

  // Veri kaybı önleme: ekran kapanırken/sekme gizlenirken bekleyen autosave'leri hemen gönder.
  useEffect(() => {
    const flush = () => {
      const pend = pendingRef.current;
      pendingRef.current = {};
      Object.values(saveTimers.current).forEach((tmr) => clearTimeout(tmr));
      Object.values(pend).forEach((payload) => { try { save.mutate(payload); } catch { /* yoksay */ } });
    };
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => { window.removeEventListener("pagehide", flush); document.removeEventListener("visibilitychange", onHide); };
  }, [save]);

  const removeImage = (qid, url) => {
    setDrawings((d) => { const n = { ...d }; if (n[qid] === url) delete n[qid]; return n; });
    persist(qid, { imageUrls: (answers[qid]?.imageUrls ?? []).filter((u) => u !== url) });
  };

  // Kalem çizimini yakala → yükle → cevabın imageUrls'ine ekle (eski çizimi değiştirir).
  const captureDrawing = useCallback(async (qid) => {
    if (!qid) return;
    let dataUrl = null;
    try { dataUrl = canvasRef.current?.toDataURL?.(); } catch { dataUrl = null; }
    if (!dataUrl) return;
    try {
      const file = await dataUrlToFile(dataUrl);
      const url = await apiNs.uploadImage(file);
      if (!url) return;
      const old = drawings[qid];
      const imgs = (answers[qid]?.imageUrls ?? []).filter((u) => u !== old).concat(url);
      setDrawings((d) => ({ ...d, [qid]: url }));
      persist(qid, { imageUrls: imgs });
      canvasRef.current?.clear?.();
    } catch { toast.error("Çizim kaydedilemedi"); }
  }, [answers, drawings, persist, apiNs]);

  if (isLoading) return <div className="max-w-3xl mx-auto py-20 text-center text-slate-400">Yükleniyor…</div>;
  if (isError || !a) return <div className="max-w-lg mx-auto text-center py-20"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" /><h2 className="text-xl font-semibold text-slate-900">Ödev bulunamadı</h2></div>;
  if (!a.open) return <div className="max-w-lg mx-auto text-center py-20"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-amber-400" /><h2 className="text-xl font-semibold text-slate-900">Ödev çözüme kapalı</h2></div>;

  // TUNNEL → market tüneliyle aynı adaptif çözme (katmanlı, ustalık tabanlı).
  if (a.examType === "TUNNEL" && a.examId) {
    // Tünel ilerlemesi her cevapta sunucuya yazılır; "Kaydet ve Çık" = güvenli, sürdürülebilir çıkış (market tüneli paritesi).
    const tunnelExit = () => { toast.success("İlerleme kaydedildi — daha sonra devam edebilirsin"); navigate(buildPageUrl(isPractice ? "StudentExplore" : "StudentAssignments")); };
    return (
      <div className="max-w-3xl mx-auto">
        <div className="mb-4 flex items-center justify-between gap-2">
          <button onClick={tunnelExit} className="text-sm text-slate-500 hover:text-slate-800">← {isPractice ? "Keşfet" : "Ödevlerim"}</button>
          <Button variant="outline" size="sm" onClick={tunnelExit} className="gap-2"><Save className="h-4 w-4" /> Kaydet ve Çık</Button>
        </div>
        <SchoolTunnelSolver examId={a.examId} />
      </div>
    );
  }

  const isChoice = a.examType === "TEST";
  const questions = a.questions;
  const q = questions[current];
  const mmss = fmt(remaining);
  const isDone = (x) => answers[x?.id]?.selectedOptionId || (answers[x?.id]?.textAnswer ?? "").trim() || (answers[x?.id]?.imageUrls ?? []).length;
  const answeredCount = questions.filter(isDone).length;

  const goTo = async (idx) => { if (!isChoice) await captureDrawing(q.id); setCurrent(idx); };
  const doSubmit = async () => { setShowFinishConfirm(false); if (!isChoice) await captureDrawing(q.id); submitM.mutate(); };

  // Kaydet ve Çık: teslim ETMEZ (IN_PROGRESS kalır) — bekleyen autosave'leri gönderip listeye döner.
  const saveAndExit = async () => {
    if (!isChoice) await captureDrawing(q.id);
    Object.values(saveTimers.current).forEach((t) => clearTimeout(t));
    const pend = pendingRef.current;
    pendingRef.current = {};
    try { await Promise.allSettled(Object.values(pend).map((p) => save.mutateAsync(p))); } catch { /* yoksay */ }
    toast.success("Kaydedildi — daha sonra devam edebilirsin");
    navigate(buildPageUrl(isPractice ? "StudentExplore" : "StudentAssignments"));
  };

  return (
    <div className="relative min-h-screen" data-exam-theme={examTheme}>
      <div className="max-w-3xl mx-auto px-1 py-4 space-y-4">
        {/* Üst bar — market çözme ekranıyla aynı eylemler */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(buildPageUrl(isPractice ? "StudentExplore" : "StudentAssignments"))}><ArrowLeft className="mr-1 h-4 w-4" /> {isPractice ? "Keşfet" : "Ödevlerim"}</Button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-slate-900 truncate">{a.title}</h1>
            <p className="text-xs text-slate-500">{answeredCount}/{questions.length} cevaplandı{save.isPending ? " · kaydediliyor…" : ""}</p>
          </div>
          {mmss && <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold ${remaining < 60 ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-700"}`}><Clock className="h-4 w-4" /> {mmss}</span>}
          <Button variant="ghost" size="icon" className={examTheme === "sepia" ? "bg-amber-50 text-amber-600" : "text-slate-400"} onClick={() => setExamTheme(examTheme === "sepia" ? "light" : "sepia")} aria-pressed={examTheme === "sepia"} aria-label="Bej okuma modu"><Sun className="h-4 w-4" /></Button>
          {!isChoice && <Button variant="ghost" size="icon" className={isDrawing ? "bg-indigo-50 text-indigo-600" : "text-slate-400"} onClick={() => setIsDrawing((d) => !d)} aria-pressed={isDrawing} aria-label="Kalem"><Pencil className="h-4 w-4" /></Button>}
          {!isChoice && isDrawing && <Button variant="ghost" size="sm" className="text-rose-500 hover:bg-rose-50" onClick={() => canvasRef.current?.clear?.()}><Eraser className="mr-1 h-4 w-4" /> Temizle</Button>}
        </div>

        {/* Soru kartı — filigran + (yazılıda) çizim katmanı */}
        <div className="relative rounded-2xl border border-slate-200 bg-white p-5 select-none" onContextMenu={(e) => e.preventDefault()} onCopy={(e) => e.preventDefault()}>
          <TestWatermark identity={{ name: user?.full_name || user?.username || user?.email, email: user?.email }} />
          {!isChoice && <QuestionCanvas ref={canvasRef} isActive={isDrawing} questionId={q.id} onHasDrawings={() => {}} />}
          <div className="mb-2 text-xs font-semibold text-indigo-600">Soru {current + 1} / {questions.length}</div>
          <p className="text-slate-900 whitespace-pre-wrap">{q.content}</p>
          {q.mediaUrl && <img src={q.mediaUrl} alt="" className="mt-3 max-h-72 rounded-lg object-contain" />}
          <p className="text-xs text-slate-400 mt-1">{q.points} puan</p>

          {isChoice ? (
            <div className="mt-4 space-y-2">
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
            <div className="mt-4 space-y-2">
              <label className="text-sm font-semibold text-slate-700">Cevabınız</label>
              {/* E-Sınıf: cevap yalnız METİN veya KALEM çizimidir — fotoğraf yükleme yok. */}
              <Textarea value={answers[q.id]?.textAnswer ?? ""} onChange={(e) => persist(q.id, { textAnswer: e.target.value })} rows={6} placeholder="Cevabınız… (yazabilir veya üstteki kalemle çizebilirsiniz)" maxLength={8000} />
              {(answers[q.id]?.imageUrls ?? []).length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {(answers[q.id]?.imageUrls ?? []).map((u) => (
                    <div key={u} className="relative">
                      <img src={u} alt="çizim" className="h-20 w-20 object-cover rounded-lg border border-slate-200" />
                      <button type="button" onClick={() => removeImage(q.id, u)} className="absolute -top-2 -right-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-white" aria-label="Çizimi sil"><X className="w-3 h-3" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Soru-soru gezinme — market ile aynı (prev/next + numaralı ızgara) */}
        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" disabled={current === 0} onClick={() => goTo(Math.max(0, current - 1))}><ChevronLeft className="h-4 w-4" /> Önceki</Button>
          <div className="flex flex-wrap justify-center gap-1">
            {questions.map((qq, i) => (
              <button key={qq.id} type="button" onClick={() => goTo(i)}
                className={`h-8 w-8 rounded-md text-xs font-semibold ${i === current ? "bg-indigo-600 text-white" : isDone(qq) ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{i + 1}</button>
            ))}
          </div>
          <Button variant="outline" size="sm" disabled={current === questions.length - 1} onClick={() => goTo(Math.min(questions.length - 1, current + 1))}>Sonraki <ChevronRight className="h-4 w-4" /></Button>
        </div>

        {/* Teslim / Kaydet ve Çık */}
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 flex-wrap">
          <span className="text-sm text-slate-600">{answeredCount}/{questions.length} cevaplandı</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={saveAndExit} disabled={submitM.isPending} className="gap-2">
              <Save className="h-4 w-4" /> Kaydet ve Çık
            </Button>
            <Button onClick={() => setShowFinishConfirm(true)} disabled={submitM.isPending} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
              {submitM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Teslim Et
            </Button>
          </div>
        </div>
      </div>

      {/* Teslim onayı — market ile aynı (cevaplanan/boş) */}
      <Dialog open={showFinishConfirm} onOpenChange={setShowFinishConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-rose-700"><AlertTriangle className="h-5 w-5" /> Ödevi teslim et</DialogTitle></DialogHeader>
          <div className="space-y-4 text-sm text-slate-700">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center"><p className="text-2xl font-bold text-emerald-700">{answeredCount}</p><p className="text-xs text-emerald-700/80">Cevaplanan</p></div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center"><p className="text-2xl font-bold text-amber-700">{questions.length - answeredCount}</p><p className="text-xs text-amber-700/80">Boş</p></div>
            </div>
            <p>Teslimden sonra cevaplarınızı değiştiremezsiniz.</p>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setShowFinishConfirm(false)} disabled={submitM.isPending}>Vazgeç</Button>
              <Button className="bg-rose-600 text-white hover:bg-rose-700" onClick={doSubmit} disabled={submitM.isPending}>
                {submitM.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <LogOut className="mr-1.5 h-4 w-4" />} Teslim Et
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Not alma — market deseni (soru/genel). E-Sınıf source ile exam-scoped adres. */}
      <NoteWidget source="SCHOOL" contextId={a.examId} contextQuestionId={q?.id} questionOrder={current + 1} testTitle={a.title} />
    </div>
  );
}
