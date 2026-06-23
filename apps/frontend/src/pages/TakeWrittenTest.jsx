import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, ArrowLeft, AlertTriangle, Pencil, Clock, ChevronLeft, ChevronRight, Sun, CheckCircle2, BookOpen, LogOut, Save, Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ReportQuestionModal from "@/components/test/ReportQuestionModal";
import QuestionCanvas from "@/components/test/QuestionCanvas";
import { TestWatermark } from "@/components/test/TestWatermark";
import { NoteWidget } from "@/components/notes/NoteWidget";
import { useAuth } from "@/lib/AuthContext";
import { candidateWritten as api } from "@/api/dalClient";

function fmt(sec) {
  if (sec == null) return null;
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * TakeWrittenTest — yazılı (açık uçlu) test çözme ekranı.
 * Aday her soruya METİN cevap yazar (şık YOK, PUAN YOK). Teslim sonrası kendi
 * cevabını çözümle kıyaslar (öz-değerlendirme). Korunan özellikler: kopya koruması
 * (watermark), tema (bej), kalem, süre, hata bildirimi, çözümü gör.
 */
function TakeWrittenTest() {
  const { t } = useTranslation(["pages"]);
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const testId = sp.get("testId");

  const [loading, setLoading] = useState(true);
  const [state, setState] = useState(null);
  const [attemptId, setAttemptId] = useState(null);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({}); // questionId -> text (local mirror)
  const [solutions, setSolutions] = useState({}); // questionId -> {solutionText, solutionMediaUrl}
  const [showSolution, setShowSolution] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [remaining, setRemaining] = useState(null);
  const [examTheme, setExamTheme] = useState(() => {
    try { return localStorage.getItem("dal_exam_theme") === "sepia" ? "sepia" : "light"; } catch { return "light"; }
  });
  const [isDrawing, setIsDrawing] = useState(false);
  const [, setHasDrawings] = useState(false);
  const [drawings, setDrawings] = useState({}); // questionId -> drawingUrl
  const canvasRef = useRef(null);
  const saveTimers = useRef({});
  const drawingDirty = useRef(false);

  const handleHasDrawings = (v) => { setHasDrawings(v); if (v) drawingDirty.current = true; };

  useEffect(() => {
    try { localStorage.setItem("dal_exam_theme", examTheme); } catch { /* yoksay */ }
    if (examTheme === "sepia") document.body.classList.add("exam-sepia");
    else document.body.classList.remove("exam-sepia");
    return () => document.body.classList.remove("exam-sepia");
  }, [examTheme]);

  const loadState = useCallback(async (aid) => {
    const st = await api.getState(aid);
    setState(st);
    const a = {};
    const dr = {};
    for (const q of st.questions) {
      a[q.id] = q.textAnswer ?? "";
      if (q.drawingUrl) dr[q.id] = q.drawingUrl;
    }
    setAnswers(a);
    setDrawings(dr);
    setRemaining(st.timing?.remainingSeconds ?? null);
    return st;
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!testId) { setLoading(false); return; }
      try {
        const { attemptId: aid } = await api.start(testId);
        if (!alive) return;
        setAttemptId(aid);
        await loadState(aid);
      } catch (e) {
        toast.error(e?.message || t("pages:takeWritten.loadError"));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [testId, loadState, t]);

  const submitted = state?.attempt?.status === "SUBMITTED" || state?.attempt?.status === "TIMEOUT";

  // Yazılı bitince: kalem kapanır, çözümler inceleme için otomatik açılır.
  useEffect(() => {
    if (submitted) {
      setIsDrawing(false);
      setShowSolution(true);
    }
  }, [submitted]);

  // Süre sayacı
  useEffect(() => {
    if (submitted || remaining == null) return;
    if (remaining <= 0) { handleTimeout(); return; }
    const id = setTimeout(() => setRemaining((r) => (r == null ? r : r - 1)), 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, submitted]);

  const handleTimeout = async () => {
    if (!attemptId || submitted) return;
    try { await api.timeout(attemptId); toast.info(t("pages:takeWritten.timeUp")); await loadState(attemptId); }
    catch { /* yoksay */ }
  };

  const questions = state?.questions ?? [];
  const q = questions[current];

  const onAnswerChange = (qid, val) => {
    setAnswers((prev) => ({ ...prev, [qid]: val }));
    clearTimeout(saveTimers.current[qid]);
    saveTimers.current[qid] = setTimeout(() => {
      // drawingUrl korunur (yoksa null → metin-only)
      api.submitAnswer(attemptId, { questionId: qid, textAnswer: val, drawingUrl: drawings[qid] }).catch(() =>
        toast.error(t("pages:takeWritten.saveError")),
      );
    }, 800);
  };

  // Çizimi temizle — aday kalemle çizdiklerini iptal eder. Canvas + kayıtlı drawingUrl silinir.
  const handleClearDrawing = useCallback(() => {
    if (submitted || !q) return;
    canvasRef.current?.clear?.();
    drawingDirty.current = false;
    setHasDrawings(false);
    setDrawings((prev) => {
      if (!(q.id in prev)) return prev;
      const next = { ...prev };
      delete next[q.id];
      return next;
    });
    // Sunucudan da kaldır (mevcut metin cevabı korunur, drawingUrl null).
    if (attemptId) {
      api.submitAnswer(attemptId, { questionId: q.id, textAnswer: answers[q.id] ?? "", drawingUrl: null }).catch(() => {});
    }
  }, [submitted, q, attemptId, answers]);

  // Kalem çizimini yakala → yükle → cevaba drawingUrl olarak kaydet.
  // ROBUST: dirty bayrağına GÜVENME (clear/soru-değişimi efektleri sıfırlayabiliyor).
  // Canvas boş değilse her zaman yakala. toDataURL boşsa null döner. Dönüş: yeni URL veya null.
  const captureCurrentDrawing = useCallback(async () => {
    if (submitted || !attemptId || !q) return null;
    let dataUrl = null;
    try { dataUrl = canvasRef.current?.toDataURL?.(); } catch { dataUrl = null; }
    drawingDirty.current = false;
    if (!dataUrl) return null; // boş çizim — kayıt yok
    try {
      const { url } = await api.uploadDrawing(dataUrl);
      if (!url) return null;
      setDrawings((prev) => ({ ...prev, [q.id]: url }));
      await api.submitAnswer(attemptId, { questionId: q.id, textAnswer: answers[q.id] ?? "", drawingUrl: url });
      return url;
    } catch {
      toast.error(t("pages:takeWritten.saveError"));
      return null;
    }
  }, [submitted, attemptId, q, answers, t]);

  // Soru değiştir: önce mevcut çizimi yakala (yalnız çözerken), sonra geç.
  // İnceleme modunda (submitted) çözüm açık kalır.
  const goTo = async (idx) => {
    await captureCurrentDrawing();
    setShowSolution(submitted);
    setCurrent(idx);
  };

  // Soru değişince kayıtlı çizimi geri yükle — ÇÖZERKEN de İNCELERKEN de göster.
  // (canvas questionId değişiminde kendi içinde temizlenir → burada yalnız yükleriz;
  // taze çizimi silmemek için 'drawings' dep'i YOK, soru/durum değişiminde tetiklenir.)
  useEffect(() => {
    if (!q || submitted) return; // incelemede canvas yok; çizim <img> ile gösterilir
    const url = drawings[q.id];
    drawingDirty.current = false;
    const id = setTimeout(() => {
      if (url && canvasRef.current?.loadDataUrl) canvasRef.current.loadDataUrl(url);
    }, 80);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, attemptId, submitted]);

  const toggleSolution = async () => {
    if (!showSolution && q && !submitted && !solutions[q.id]) {
      try {
        const sol = await api.getSolution(attemptId, q.id);
        setSolutions((prev) => ({ ...prev, [q.id]: sol }));
      } catch (e) { toast.error(e?.message || t("pages:takeWritten.genericError")); return; }
    }
    setShowSolution((s) => !s);
  };

  const submitReport = (data) => {
    const reason = (data?.description || "").trim() || `Hata türü: ${data?.report_type || "diğer"}`;
    api.report(testId, { questionId: q?.id, reason })
      .then(() => { toast.success(t("pages:takeWritten.reportSent")); setReportOpen(false); })
      .catch((e) => toast.error(e?.message || t("pages:takeWritten.reportFailed")));
  };

  const handleSubmit = async () => {
    if (!attemptId) return;
    setShowFinishConfirm(false);
    setSubmitting(true);
    try {
      // bekleyen autosave'leri zorla + mevcut çizimi yakala
      Object.values(saveTimers.current).forEach(clearTimeout);
      const capturedUrl = await captureCurrentDrawing();
      const localDrawings = { ...drawings, ...(capturedUrl && q ? { [q.id]: capturedUrl } : {}) };
      await Promise.all(
        questions.map((qq) =>
          api.submitAnswer(attemptId, { questionId: qq.id, textAnswer: answers[qq.id] ?? "", drawingUrl: localDrawings[qq.id] }).catch(() => {}),
        ),
      );
      await api.finish(attemptId);
      await loadState(attemptId);
      setShowSolution(false);
      setCurrent(0);
    } catch (e) {
      toast.error(e?.message || t("pages:takeWritten.genericError"));
    } finally {
      setSubmitting(false);
    }
  };

  // Kaydet ve Çık — mevcut cevapları kaydeder, yazılıyı BİTİRMEZ (IN_PROGRESS kalır, sürdürülebilir).
  const saveAndExit = async () => {
    if (!attemptId) { navigate("/MyTests?tab=written"); return; }
    setSubmitting(true);
    try {
      Object.values(saveTimers.current).forEach(clearTimeout);
      const capturedUrl = await captureCurrentDrawing();
      const localDrawings = { ...drawings, ...(capturedUrl && q ? { [q.id]: capturedUrl } : {}) };
      await Promise.all(
        questions.map((qq) =>
          api.submitAnswer(attemptId, { questionId: qq.id, textAnswer: answers[qq.id] ?? "", drawingUrl: localDrawings[qq.id] }).catch(() => {}),
        ),
      );
      toast.success(t("pages:takeWritten.savedExit", { defaultValue: "İlerlemeniz kaydedildi" }));
      setTimeout(() => navigate("/MyTests?tab=written"), 600);
    } catch (e) {
      toast.error(e?.message || t("pages:takeWritten.genericError"));
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-indigo-500" /></div>;
  if (!state || !q) return <div className="mx-auto max-w-xl px-4 py-16 text-center text-slate-500">{t("pages:takeWritten.notFound")}</div>;

  const sol = submitted ? { solutionText: q.solutionText, solutionMediaUrl: q.solutionMediaUrl } : solutions[q.id];
  const answeredCount = questions.filter((x) => (answers[x.id] ?? "").trim().length > 0).length;

  return (
    <div className="relative min-h-screen bg-slate-50 dark:bg-gray-950" data-exam-theme={examTheme}>
      <div className="mx-auto max-w-3xl px-4 py-4">
        {/* Üst bar */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft className="mr-1 h-4 w-4" />{t("pages:takeWritten.back")}</Button>
          <span className="flex-1" />
          {state.timing?.durationMinutes && !submitted && (
            <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold ${remaining != null && remaining < 60 ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-700"}`}>
              <Clock className="h-4 w-4" /> {fmt(remaining)}
            </span>
          )}
          <Button variant="ghost" size="icon" className={examTheme === "sepia" ? "bg-amber-50 text-amber-600" : "text-slate-400"} onClick={() => setExamTheme(examTheme === "sepia" ? "light" : "sepia")} aria-pressed={examTheme === "sepia"} aria-label={t("pages:takeWritten.themeToggle")}><Sun className="h-4 w-4" /></Button>
          {!submitted && (
            <Button variant="ghost" size="icon" className={isDrawing ? "bg-indigo-50 text-indigo-600" : "text-slate-400"} onClick={() => setIsDrawing((d) => !d)} aria-pressed={isDrawing} aria-label={t("pages:takeWritten.penToggle")}><Pencil className="h-4 w-4" /></Button>
          )}
          {!submitted && isDrawing && (
            <Button variant="ghost" size="sm" className="text-rose-500 hover:bg-rose-50" onClick={handleClearDrawing}>
              <Eraser className="mr-1 h-4 w-4" />{t("pages:takeWritten.clearDrawing", { defaultValue: "Temizle" })}
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-rose-500 hover:bg-rose-50" onClick={() => setReportOpen(true)}><AlertTriangle className="mr-1 h-4 w-4" />{t("pages:takeWritten.report")}</Button>
        </div>

        {/* Teslim bandı (öz-değerlendirme) */}
        {submitted ? (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0" />
            <div><div className="font-semibold">{t("pages:takeWritten.submittedBanner")}</div><div className="text-emerald-700/80">{t("pages:takeWritten.selfEvalNote")}</div></div>
          </div>
        ) : (
          <p className="mb-3 text-xs text-slate-500">{t("pages:takeWritten.selfEvalNote")}</p>
        )}

        {/* Soru kartı */}
        <div className="relative rounded-2xl border border-slate-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <TestWatermark identity={{ name: user?.full_name || user?.username || user?.email, email: user?.email }} />
          {/* Çizim katmanı yalnız çözerken — incelemede çizim "Senin Cevabın" kutusunda <img> olarak gösterilir (çift gösterim engeli) */}
          {!submitted && <QuestionCanvas ref={canvasRef} isActive={isDrawing} questionId={q.id} onHasDrawings={handleHasDrawings} />}
          <div className="mb-2 text-xs font-semibold text-indigo-600">{t("pages:takeWritten.questionNav", { n: current + 1 })} / {questions.length}</div>
          {q.content && <p className="whitespace-pre-wrap text-slate-900 dark:text-gray-100">{q.content}</p>}
          {q.mediaUrl && <img src={q.mediaUrl} alt="" className="mt-3 max-h-72 rounded-lg object-contain" />}

          {/* Cevap alanı (metin) — yalnız çözerken. İncelemede cevap "Senin Cevabın" kutusunda gösterilir. */}
          {!submitted && (
            <div className="mt-4 space-y-1.5">
              <label className="text-sm font-semibold text-slate-700 dark:text-gray-200">{t("pages:takeWritten.answerLabel")}</label>
              <Textarea
                value={answers[q.id] ?? ""}
                onChange={(e) => onAnswerChange(q.id, e.target.value)}
                placeholder={t("pages:takeWritten.answerPlaceholder")}
                rows={7}
              />
            </div>
          )}

          {/* Çözüm (öz-kıyas) */}
          <div className="mt-4">
            <Button variant="outline" size="sm" onClick={toggleSolution}>
              <BookOpen className="mr-1.5 h-4 w-4" />{showSolution ? t("pages:takeWritten.hideSolution") : t("pages:takeWritten.showSolution")}
            </Button>
            {showSolution && (
              <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-900 dark:bg-indigo-950/30">
                {submitted && (
                  <div className="mb-3 rounded-lg bg-white p-3 text-sm dark:bg-gray-900">
                    <div className="mb-1 text-xs font-semibold text-slate-500">{t("pages:takeWritten.yourAnswer")}</div>
                    {(answers[q.id] ?? "").trim() || drawings[q.id] ? (
                      <>
                        {(answers[q.id] ?? "").trim() && <div className="whitespace-pre-wrap text-slate-800 dark:text-gray-100">{answers[q.id]}</div>}
                        {drawings[q.id] && <img src={drawings[q.id]} alt={t("pages:takeWritten.yourDrawing")} className="mt-2 max-h-72 rounded border border-slate-200 object-contain" />}
                      </>
                    ) : (
                      <span className="italic text-slate-400">{t("pages:takeWritten.noAnswer")}</span>
                    )}
                  </div>
                )}
                <div className="text-xs font-semibold text-indigo-700">{t("pages:takeWritten.solutionTitle")}</div>
                {sol?.solutionText && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800 dark:text-gray-100">{sol.solutionText}</p>}
                {sol?.solutionMediaUrl && <img src={sol.solutionMediaUrl} alt="" className="mt-2 max-h-72 rounded-lg object-contain" />}
              </div>
            )}
          </div>
        </div>

        {/* Navigasyon */}
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" disabled={current === 0} onClick={() => goTo(Math.max(0, current - 1))}><ChevronLeft className="h-4 w-4" />{t("pages:takeWritten.prev")}</Button>
          <div className="flex flex-wrap justify-center gap-1">
            {questions.map((qq, i) => (
              <button key={qq.id} type="button" onClick={() => goTo(i)}
                className={`h-8 w-8 rounded-md text-xs font-semibold ${i === current ? "bg-indigo-600 text-white" : ((answers[qq.id] ?? "").trim() || drawings[qq.id]) ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                {i + 1}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" disabled={current === questions.length - 1} onClick={() => goTo(Math.min(questions.length - 1, current + 1))}>{t("pages:takeWritten.next")}<ChevronRight className="h-4 w-4" /></Button>
        </div>

        {/* Teslim — konum/görselleştirme test çözüm ekranı ile aynı:
            sol eylem butonları (Yazılıyı Bitir + Kaydet ve Çık), sağ ilerleme. */}
        {!submitted && (
          <div className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center gap-3 flex-wrap">
              <Button variant="ghost" className="text-rose-600 hover:bg-rose-50" onClick={() => setShowFinishConfirm(true)} disabled={submitting}>
                {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <LogOut className="mr-1.5 h-4 w-4" />}
                {t("pages:takeWritten.submit")}
              </Button>
              <Button variant="ghost" className="text-slate-600 hover:bg-slate-100" onClick={saveAndExit} disabled={submitting}>
                <Save className="mr-1.5 h-4 w-4" />
                {t("pages:takeWritten.saveExit", { defaultValue: "Kaydet ve Çık" })}
              </Button>
            </div>
            <span className="text-sm text-slate-600 dark:text-gray-300">{answeredCount}/{questions.length}</span>
          </div>
        )}
      </div>

      {/* Yazılıyı Bitir onay dialog'u — test çözüm ekranındaki onay ile aynı tasarım.
          Cevaplanan/boş soru sayısı + Kaydet ve Çık alternatifi. */}
      <Dialog open={showFinishConfirm} onOpenChange={setShowFinishConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-700">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              {t("pages:takeWritten.finishTitle")}
            </DialogTitle>
          </DialogHeader>
          {(() => {
            const ans = questions.filter((x) => (answers[x.id] ?? "").trim().length > 0 || drawings[x.id]).length;
            const blank = questions.length - ans;
            return (
              <div className="space-y-4 text-sm text-slate-700 dark:text-gray-200">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center dark:border-emerald-900 dark:bg-emerald-950/30">
                    <p className="text-2xl font-bold text-emerald-700">{ans}</p>
                    <p className="text-xs text-emerald-700/80">{t("pages:takeWritten.answered")}</p>
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center dark:border-amber-900 dark:bg-amber-950/30">
                    <p className="text-2xl font-bold text-amber-700">{blank}</p>
                    <p className="text-xs text-amber-700/80">{t("pages:takeWritten.blank")}</p>
                  </div>
                </div>
                <p>{t("pages:takeWritten.finishBody")}</p>
                <p className="text-slate-600 dark:text-gray-300">{t("pages:takeWritten.finishSaveHint")}</p>
                <div className="flex flex-wrap justify-end gap-2 pt-1">
                  <Button variant="outline" onClick={() => setShowFinishConfirm(false)} disabled={submitting}>
                    {t("pages:takeWritten.cancel")}
                  </Button>
                  <Button variant="outline" className="text-slate-700 dark:text-gray-200" onClick={() => { setShowFinishConfirm(false); saveAndExit(); }} disabled={submitting}>
                    <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {t("pages:takeWritten.saveExit")}
                  </Button>
                  <Button className="bg-rose-600 text-white hover:bg-rose-700" onClick={handleSubmit} disabled={submitting}>
                    {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <LogOut className="mr-1.5 h-4 w-4" aria-hidden="true" />}
                    {t("pages:takeWritten.confirmFinish")}
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <ReportQuestionModal open={reportOpen} onClose={() => setReportOpen(false)} onSubmit={submitReport} questionNumber={current + 1} />

      {/* Aday not alma — test ekranıyla aynı widget; yazılı kaynağına adreslenir. */}
      <NoteWidget
        source="WRITTEN"
        contextId={testId}
        contextQuestionId={q?.id}
        questionOrder={current + 1}
        testTitle={state?.test?.title}
      />
    </div>
  );
}

export default TakeWrittenTest;
export { TakeWrittenTest };
