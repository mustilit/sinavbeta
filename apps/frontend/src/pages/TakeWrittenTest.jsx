import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, ArrowLeft, AlertTriangle, Pencil, Clock, ChevronLeft, ChevronRight, Sun, CheckCircle2, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import ReportQuestionModal from "@/components/test/ReportQuestionModal";
import QuestionCanvas from "@/components/test/QuestionCanvas";
import { TestWatermark } from "@/components/test/TestWatermark";
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
  const [remaining, setRemaining] = useState(null);
  const [examTheme, setExamTheme] = useState(() => {
    try { return localStorage.getItem("dal_exam_theme") === "sepia" ? "sepia" : "light"; } catch { return "light"; }
  });
  const [isDrawing, setIsDrawing] = useState(false);
  const [, setHasDrawings] = useState(false);
  const canvasRef = useRef(null);
  const saveTimers = useRef({});

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
    for (const q of st.questions) a[q.id] = q.textAnswer ?? "";
    setAnswers(a);
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
      api.submitAnswer(attemptId, { questionId: qid, textAnswer: val }).catch(() =>
        toast.error(t("pages:takeWritten.saveError")),
      );
    }, 800);
  };

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
    if (!window.confirm(t("pages:takeWritten.submitConfirm"))) return;
    setSubmitting(true);
    try {
      // bekleyen autosave'leri zorla
      Object.values(saveTimers.current).forEach(clearTimeout);
      await Promise.all(
        questions.map((qq) => api.submitAnswer(attemptId, { questionId: qq.id, textAnswer: answers[qq.id] ?? "" }).catch(() => {})),
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
          <QuestionCanvas ref={canvasRef} isActive={isDrawing} questionId={q.id} onHasDrawings={setHasDrawings} />
          <div className="mb-2 text-xs font-semibold text-indigo-600">{t("pages:takeWritten.questionNav", { n: current + 1 })} / {questions.length}</div>
          {q.content && <p className="whitespace-pre-wrap text-slate-900 dark:text-gray-100">{q.content}</p>}
          {q.mediaUrl && <img src={q.mediaUrl} alt="" className="mt-3 max-h-72 rounded-lg object-contain" />}

          {/* Cevap alanı (metin) */}
          <div className="mt-4 space-y-1.5">
            <label className="text-sm font-semibold text-slate-700 dark:text-gray-200">{t("pages:takeWritten.answerLabel")}</label>
            <Textarea
              value={answers[q.id] ?? ""}
              onChange={(e) => onAnswerChange(q.id, e.target.value)}
              placeholder={t("pages:takeWritten.answerPlaceholder")}
              rows={7}
              disabled={submitted}
            />
          </div>

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
                    <div className="whitespace-pre-wrap text-slate-800 dark:text-gray-100">{(answers[q.id] ?? "").trim() || <span className="italic text-slate-400">{t("pages:takeWritten.noAnswer")}</span>}</div>
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
          <Button variant="outline" size="sm" disabled={current === 0} onClick={() => { setCurrent((c) => Math.max(0, c - 1)); setShowSolution(false); }}><ChevronLeft className="h-4 w-4" />{t("pages:takeWritten.prev")}</Button>
          <div className="flex flex-wrap justify-center gap-1">
            {questions.map((qq, i) => (
              <button key={qq.id} type="button" onClick={() => { setCurrent(i); setShowSolution(false); }}
                className={`h-8 w-8 rounded-md text-xs font-semibold ${i === current ? "bg-indigo-600 text-white" : (answers[qq.id] ?? "").trim() ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                {i + 1}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" disabled={current === questions.length - 1} onClick={() => { setCurrent((c) => Math.min(questions.length - 1, c + 1)); setShowSolution(false); }}>{t("pages:takeWritten.next")}<ChevronRight className="h-4 w-4" /></Button>
        </div>

        {/* Teslim */}
        {!submitted && (
          <div className="mt-6 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <span className="text-sm text-slate-600 dark:text-gray-300">{answeredCount}/{questions.length}</span>
            <Button className="bg-indigo-600 text-white hover:bg-indigo-700" onClick={handleSubmit} disabled={submitting}>
              {submitting ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />{t("pages:takeWritten.submitting")}</> : t("pages:takeWritten.submit")}
            </Button>
          </div>
        )}
      </div>

      <ReportQuestionModal open={reportOpen} onClose={() => setReportOpen(false)} onSubmit={submitReport} questionNumber={current + 1} />
    </div>
  );
}

export default TakeWrittenTest;
export { TakeWrittenTest };
