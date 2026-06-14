import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Trophy, ArrowLeft, Layers, AlertTriangle, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { candidateTunnels as api } from "@/api/dalClient";
import { createPageUrl } from "@/utils";

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

/**
 * Aday tünel çözme ekranı (adaptif). Katmanları/sırayı GÖREMEZ; tek soru akışı.
 * Her soru aynı anda 5 seçenekle (doğru her zaman içeride) sunulur; aynı soru
 * farklı zamanlarda farklı seçeneklerle tekrar gelir. Üst menü: Hata Bildirimi +
 * Kaydet ve Çık (ilerleme her cevapta otomatik kaydedilir).
 */
export default function TakeTunnel() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const tunnelId = params.get("id");

  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null); // { selectedId, correctId, correct }
  const [answering, setAnswering] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    if (!tunnelId) return;
    let alive = true;
    api
      .start(tunnelId)
      .then((s) => alive && setState(s))
      .catch((e) => toast.error(e?.message || "Tünel başlatılamadı"))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [tunnelId]);

  const handleAnswer = useCallback(
    (optionId) => {
      if (answering || feedback) return;
      setAnswering(true);
      api
        .answer(tunnelId, optionId)
        .then((r) => {
          setFeedback({ selectedId: optionId, correctId: r.correctOptionId, correct: r.correct });
          setTimeout(() => {
            setState(r.state);
            setFeedback(null);
            setAnswering(false);
          }, 1100);
        })
        .catch((e) => {
          toast.error(e?.message || "Cevap gönderilemedi");
          setAnswering(false);
        });
    },
    [answering, feedback, tunnelId],
  );

  const submitReport = () => {
    const reason = reportReason.trim();
    if (!reason) return;
    setReporting(true);
    api
      .report(tunnelId, { questionId: state?.currentQuestion?.id, reason })
      .then(() => {
        toast.success("Hata bildirimi gönderildi");
        setReportOpen(false);
        setReportReason("");
      })
      .catch((e) => toast.error(e?.message || "Bildirim gönderilemedi"))
      .finally(() => setReporting(false));
  };

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-indigo-500" /></div>;
  }
  if (!state) {
    return <div className="mx-auto max-w-xl px-4 py-16 text-center text-slate-500">Tünel yüklenemedi.</div>;
  }

  // Tamamlandı
  if (state.status === "COMPLETED") {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <Trophy className="h-8 w-8 text-emerald-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Tüneli Tamamladın! 🎉</h1>
        <p className="mt-2 text-slate-600">
          "{state.title}" tünelindeki tüm soruları, farklı seçenek dizilişlerine rağmen doğru cevapladın. Bu konuda artık yetkinsin.
        </p>
        <Button className="mt-6 bg-indigo-600 text-white hover:bg-indigo-700" onClick={() => navigate(createPageUrl("Tunnels"))}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Tünellere Dön
        </Button>
      </div>
    );
  }

  const q = state.currentQuestion;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* Üst menü: Hata Bildirimi + Kaydet ve Çık (diğer test çözme ekranıyla aynı) */}
      <div className="mb-3 flex items-center justify-between">
        <Button variant="ghost" size="sm" className="text-amber-600 hover:bg-amber-50 hover:text-amber-700" onClick={() => setReportOpen(true)}>
          <AlertTriangle className="mr-1.5 h-4 w-4" /> Hata Bildirimi
        </Button>
        <Button variant="outline" size="sm" onClick={() => { toast.success("İlerleme kaydedildi"); navigate(createPageUrl("Tunnels")); }}>
          <Save className="mr-1.5 h-4 w-4" /> Kaydet ve Çık
        </Button>
      </div>

      {/* Üst: başlık + ilerleme (KATMAN GÖSTERİLMEZ) */}
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

      {!q ? (
        <div className="py-16 text-center text-slate-500"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>
      ) : (
        <Card>
          <CardContent className="p-5">
            <p className="mb-4 text-base font-medium text-slate-900 whitespace-pre-wrap">{q.content}</p>
            {q.mediaUrl && <img src={q.mediaUrl} alt="" className="mb-4 max-h-64 rounded-lg" />}
            <div className="space-y-2">
              {q.options.map((o, i) => {
                let cls = "border-slate-200 hover:bg-slate-50";
                if (feedback) {
                  if (o.id === feedback.correctId) cls = "border-emerald-400 bg-emerald-50";
                  else if (o.id === feedback.selectedId) cls = "border-rose-400 bg-rose-50";
                  else cls = "border-slate-200 opacity-60";
                }
                return (
                  <button
                    key={o.id}
                    type="button"
                    disabled={!!feedback || answering}
                    onClick={() => handleAnswer(o.id)}
                    className={
                      "flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left text-sm transition-colors disabled:cursor-default " + cls
                    }
                  >
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-600">
                      {LETTERS[i]}
                    </span>
                    {o.mediaUrl && (
                      <img src={o.mediaUrl} alt="" className="h-12 w-12 flex-shrink-0 rounded-md object-cover" />
                    )}
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
          </CardContent>
        </Card>
      )}

      {/* Hata bildirimi modalı */}
      <Dialog open={reportOpen} onOpenChange={(o) => !o && setReportOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" /> Hata Bildirimi
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Bu soruyla ilgili bir sorun mu var? Eğitici/yönetici inceleyecek.</p>
            <Textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Sorunu kısaca açıkla (ör. doğru cevap yanlış, ifade belirsiz)…"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setReportOpen(false)} disabled={reporting}>Vazgeç</Button>
              <Button className="bg-indigo-600 text-white hover:bg-indigo-700" onClick={submitReport} disabled={!reportReason.trim() || reporting}>
                {reporting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <AlertTriangle className="mr-1.5 h-4 w-4" />}
                Gönder
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
