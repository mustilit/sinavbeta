import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Trophy, ArrowLeft, Layers, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { candidateTunnels as api } from "@/api/dalClient";
import { createPageUrl } from "@/utils";

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

/**
 * Aday tünel çözme ekranı (adaptif). Katmanları/sırayı göremez; tek soru akışı.
 * Cevap sonrası doğru/yanlış geri bildirim + otomatik sonraki soru. İlerleme yüzdesi.
 */
export default function TakeTunnel() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const tunnelId = params.get("id");

  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null); // { selectedId, correctId, correct }
  const [answering, setAnswering] = useState(false);
  // Bej okuma modu — yalnız bu ekrana scope'lu (data-exam-theme), kalıcı.
  const [examTheme, setExamTheme] = useState(() => {
    try { return localStorage.getItem("dal_exam_theme") === "sepia" ? "sepia" : "light"; } catch { return "light"; }
  });
  useEffect(() => {
    try { localStorage.setItem("dal_exam_theme", examTheme); } catch { /* yoksay */ }
  }, [examTheme]);

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
        <Button className="mt-6" onClick={() => navigate(createPageUrl("Tunnels"))}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Tünellere Dön
        </Button>
      </div>
    );
  }

  const q = state.currentQuestion;

  return (
    <div data-exam-theme={examTheme} className={"mx-auto max-w-2xl px-4 py-6" + (examTheme === "sepia" ? " rounded-2xl" : "")}>
      {/* Üst aksiyon barı: çıkış + bej mod */}
      <div className="mb-3 flex items-center justify-between">
        <Button variant="ghost" size="sm" className="text-slate-500" onClick={() => navigate(createPageUrl("Tunnels"))}>
          <LogOut className="mr-1.5 h-4 w-4" /> Çıkış
        </Button>
        <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-slate-500">
          <span aria-hidden="true">🌙</span>
          <span className="hidden sm:inline">Bej mod</span>
          <Switch checked={examTheme === "sepia"} onCheckedChange={(v) => setExamTheme(v ? "sepia" : "light")} aria-label="Bej okuma modu" />
        </label>
      </div>
      {/* Üst: başlık + ilerleme */}
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
                    <span className="text-slate-800">{o.content}</span>
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
    </div>
  );
}
