import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Trophy, ArrowLeft, Layers, AlertTriangle, Save, Pencil, Eraser, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import QuestionCanvas from "@/components/test/QuestionCanvas";
import { candidateTunnels as api } from "@/api/dalClient";
import { createPageUrl } from "@/utils";

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

/**
 * Aday tünel çözme ekranı (adaptif). Katmanları görmez; her soru 5 seçenekle gelir
 * (doğru her zaman içeride). Cevap sonrası DOĞRU gösterilir + beklenir; aday "Sonraki"
 * ile ilerler, "Önceki" ile geçmiş soruları (salt-okunur) inceler. Araç çubuğu normal
 * test ekranıyla aynı: Hata Bildir + Kalem + Bej + Süre.
 */
export default function TakeTunnel() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const tunnelId = params.get("id");

  const [state, setState] = useState(null);     // canlı sunucu durumu
  const [loading, setLoading] = useState(true);
  const [answered, setAnswered] = useState([]); // [{ q, selectedId, correctId, correct }]
  const [viewIndex, setViewIndex] = useState(0); // answered.length === canlı soru konumu
  const [answering, setAnswering] = useState(false);

  // Araç çubuğu — bej mod, kalem, süre
  const [examTheme, setExamTheme] = useState(() => {
    try { return localStorage.getItem("dal_exam_theme") === "sepia" ? "sepia" : "light"; } catch { return "light"; }
  });
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [hasDrawings, setHasDrawings] = useState(false);
  const canvasRef = useRef(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  // Hata bildirimi
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    try { localStorage.setItem("dal_exam_theme", examTheme); } catch { /* yoksay */ }
    if (examTheme === "sepia") document.body.classList.add("exam-sepia");
    else document.body.classList.remove("exam-sepia");
    return () => document.body.classList.remove("exam-sepia");
  }, [examTheme]);

  useEffect(() => {
    if (!tunnelId) return;
    let alive = true;
    api.start(tunnelId)
      .then((s) => { if (alive) { setState(s); setViewIndex(0); } })
      .catch((e) => toast.error(e?.message || "Tünel başlatılamadı"))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [tunnelId]);

  // Süre sayacı (yukarı doğru; tamamlanınca durur)
  useEffect(() => {
    if (loading || !state || state.status === "COMPLETED") return;
    const id = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [loading, state]);

  const handleAnswer = useCallback(
    (optionId) => {
      if (answering) return;
      setAnswering(true);
      api.answer(tunnelId, optionId)
        .then((r) => {
          // Cevabı geçmişe ekle (doğru gösterilir + beklenir); canlı durumu güncelle.
          setAnswered((prev) => [...prev, { q: state.currentQuestion, selectedId: optionId, correctId: r.correctOptionId, correct: r.correct }]);
          setState(r.state);
          // viewIndex değişmez → az önce cevaplanan soru (doğru işaretli) görünür kalır.
        })
        .catch((e) => toast.error(e?.message || "Cevap gönderilemedi"))
        .finally(() => setAnswering(false));
    },
    [answering, tunnelId, state],
  );

  const submitReport = () => {
    const reason = reportReason.trim();
    if (!reason) return;
    setReporting(true);
    const viewing = viewIndex < answered.length ? answered[viewIndex].q : state?.currentQuestion;
    api.report(tunnelId, { questionId: viewing?.id, reason })
      .then(() => { toast.success("Hata bildirimi gönderildi"); setReportOpen(false); setReportReason(""); })
      .catch((e) => toast.error(e?.message || "Bildirim gönderilemedi"))
      .finally(() => setReporting(false));
  };

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-indigo-500" /></div>;
  }
  if (!state) {
    return <div className="mx-auto max-w-xl px-4 py-16 text-center text-slate-500">Tünel yüklenemedi.</div>;
  }

  const reviewing = viewIndex < answered.length;
  const entry = reviewing ? answered[viewIndex] : null;
  const atLive = viewIndex >= answered.length;
  const completedView = atLive && state.status === "COMPLETED";
  const q = reviewing ? entry.q : state.currentQuestion;
  const feedback = reviewing ? { selectedId: entry.selectedId, correctId: entry.correctId, correct: entry.correct } : null;
  const answerable = atLive && state.status !== "COMPLETED" && !!q && !answering;
  const canPrev = viewIndex > 0;
  const canNext = viewIndex < answered.length; // canlıya kadar ileri gidilebilir

  return (
    <div data-exam-theme={examTheme} className="mx-auto max-w-3xl">
      {/* Araç çubuğu — normal test ekranıyla aynı format */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button variant="ghost" size="sm" className="text-rose-500 hover:bg-rose-50" onClick={() => setReportOpen(true)}>
            <AlertTriangle className="mr-1 h-4 w-4" /> Hata Bildir
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={isDrawingMode ? "bg-indigo-50 text-indigo-600" : "text-slate-400"}
            onClick={() => setIsDrawingMode((v) => !v)}
          >
            <Pencil className="mr-1 h-4 w-4" /> {isDrawingMode ? "Çizim Açık" : "Kalem"}
          </Button>
          {isDrawingMode && hasDrawings && (
            <Button variant="ghost" size="sm" className="text-slate-400" onClick={() => canvasRef.current?.clear()}>
              <Eraser className="mr-1 h-4 w-4" /> Temizle
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-slate-600 hover:bg-slate-100" onClick={() => { toast.success("İlerleme kaydedildi"); navigate(createPageUrl("Tunnels")); }}>
            <Save className="mr-1 h-4 w-4" /> Kaydet ve Çık
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-slate-500">
            <span aria-hidden="true">🌙</span>
            <span className="hidden sm:inline">Bej mod</span>
            <Switch checked={examTheme === "sepia"} onCheckedChange={(v) => setExamTheme(v ? "sepia" : "light")} aria-label="Bej okuma modu" />
          </label>
          <div className="flex items-center gap-1 font-mono font-semibold text-slate-600">
            <Clock className="h-4 w-4" /> {fmt(elapsedSec)}
          </div>
        </div>
      </div>

      {/* Başlık + ilerleme (KATMAN GÖSTERİLMEZ) */}
      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
            <Layers className="h-4 w-4 text-indigo-600" /> {state.title}
          </span>
          <span className="text-sm font-semibold text-indigo-600">%{state.progressPercent}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-2 rounded-full bg-indigo-600 transition-all duration-500" style={{ width: `${state.progressPercent}%` }} />
        </div>
        <p className="mt-1 text-xs text-slate-400">{state.masteredQuestions}/{state.totalQuestions} soru öğrenildi</p>
      </div>

      {completedView ? (
        <div className="py-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <Trophy className="h-8 w-8 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Tüneli Tamamladın! 🎉</h1>
          <p className="mt-2 text-slate-600">"{state.title}" tünelindeki tüm soruları öğrendin. Bu konuda artık yetkinsin.</p>
          <div className="mt-6 flex justify-center gap-2">
            {canPrev && (
              <Button variant="outline" onClick={() => setViewIndex((v) => Math.max(0, v - 1))}>
                <ChevronLeft className="mr-1.5 h-4 w-4" /> Soruları İncele
              </Button>
            )}
            <Button className="bg-indigo-600 text-white hover:bg-indigo-700" onClick={() => navigate(createPageUrl("Tunnels"))}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Tünellere Dön
            </Button>
          </div>
        </div>
      ) : !q ? (
        <div className="py-16 text-center text-slate-500"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>
      ) : (
        <>
          <div className="relative">
            <Card>
              <CardContent className="p-5">
                <p className="mb-4 text-base font-medium text-slate-900 whitespace-pre-wrap">{q.content}</p>
                {q.mediaUrl && <img src={q.mediaUrl} alt="" className="mb-4 max-h-64 rounded-lg" />}
                <div className="space-y-2">
                  {q.options.map((o, i) => {
                    let cls = "border-slate-200";
                    if (feedback) {
                      if (o.id === feedback.correctId) cls = "border-emerald-400 bg-emerald-50";
                      else if (o.id === feedback.selectedId) cls = "border-rose-400 bg-rose-50";
                      else cls = "border-slate-200 opacity-60";
                    } else if (answerable) {
                      cls = "border-slate-200 hover:bg-slate-50";
                    }
                    return (
                      <button
                        key={o.id}
                        type="button"
                        disabled={!answerable}
                        onClick={() => answerable && handleAnswer(o.id)}
                        className={"flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left text-sm transition-colors disabled:cursor-default " + cls}
                      >
                        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-600">{LETTERS[i]}</span>
                        {o.mediaUrl && <img src={o.mediaUrl} alt="" className="h-12 w-12 flex-shrink-0 rounded-md object-cover" />}
                        {o.content && <span className="text-slate-800">{o.content}</span>}
                      </button>
                    );
                  })}
                </div>
                {feedback && (
                  <p className={"mt-3 text-sm font-medium " + (feedback.correct ? "text-emerald-600" : "text-rose-600")}>
                    {feedback.correct ? "Doğru!" : "Yanlış — doğru cevap işaretlendi."}
                  </p>
                )}
                {answerable && <p className="mt-3 text-xs text-slate-400">Bir seçenek işaretle; doğru gösterilecek, sonra "Sonraki" ile ilerle.</p>}
              </CardContent>
            </Card>
            {/* Kalem katmanı — kart üzerine şeffaf çizim */}
            <QuestionCanvas ref={canvasRef} isActive={isDrawingMode} questionId={q.id} onHasDrawings={setHasDrawings} />
          </div>

          {/* Önceki / Sonraki (cevaplarım yok) */}
          <div className="mt-5 flex items-center justify-between">
            <Button variant="outline" size="sm" disabled={!canPrev} onClick={() => setViewIndex((v) => Math.max(0, v - 1))}>
              <ChevronLeft className="mr-1 h-4 w-4" /> Önceki
            </Button>
            <span className="text-xs text-slate-400">
              {reviewing ? `Geçmiş soru (${viewIndex + 1}/${answered.length})` : "Sıradaki soru"}
            </span>
            <Button variant="outline" size="sm" disabled={!canNext} onClick={() => setViewIndex((v) => Math.min(answered.length, v + 1))}>
              Sonraki <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </>
      )}

      {/* Hata bildirimi modalı */}
      <Dialog open={reportOpen} onOpenChange={(o) => !o && setReportOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-600" /> Hata Bildirimi</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Bu soruyla ilgili bir sorun mu var? Eğitici/yönetici inceleyecek.</p>
            <Textarea value={reportReason} onChange={(e) => setReportReason(e.target.value)} rows={3} maxLength={1000} placeholder="Sorunu kısaca açıkla…" />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setReportOpen(false)} disabled={reporting}>Vazgeç</Button>
              <Button className="bg-indigo-600 text-white hover:bg-indigo-700" onClick={submitReport} disabled={!reportReason.trim() || reporting}>
                {reporting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <AlertTriangle className="mr-1.5 h-4 w-4" />} Gönder
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
