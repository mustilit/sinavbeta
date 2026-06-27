/**
 * SchoolTunnelSolver — E-Sınıf öğrenci tünel adaptif çözme (market TakeTunnel deseni).
 * Her soru 1 doğru + çeldiricilerle gelir; doğru şık yeri değişir. Doğru cevap sonrası
 * kısa geri bildirim + sıradaki soru. İlerleme = öğrenilen soru oranı. Tamamlanınca kutlama.
 */
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { schoolTunnel } from "@/api/dalClient";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, XCircle, Loader2, Trophy, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const LETTER_BG = ["bg-rose-500", "bg-blue-500", "bg-amber-500", "bg-emerald-500", "bg-violet-500"];
const LETTERS = ["A", "B", "C", "D", "E"];

export function SchoolTunnelSolver({ examId }) {
  const [state, setState] = useState(null);
  const [feedback, setFeedback] = useState(null); // { selectedId, correctId, correct }

  const { data: started, isLoading, isError } = useQuery({
    queryKey: ["esinif", "tunnel-start", examId],
    queryFn: () => schoolTunnel.start(examId),
    enabled: !!examId,
  });
  useEffect(() => { if (started) setState(started); }, [started]);

  const answer = useMutation({
    mutationFn: (optionId) => schoolTunnel.answer(examId, optionId),
    onSuccess: (res, optionId) => {
      setFeedback({ selectedId: optionId, correctId: res.correctOptionId, correct: res.correct });
      // Kısa geri bildirim sonra sıradaki soruya geç
      setTimeout(() => { setFeedback(null); setState(res.state); }, 900);
    },
    onError: (e) => toast.error(e?.response?.data?.message ?? "Cevap gönderilemedi"),
  });

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;
  if (isError || !state) return <div className="max-w-lg mx-auto text-center py-20"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" /><h2 className="text-xl font-semibold text-slate-900">Tünel açılamadı</h2></div>;

  if (state.status === "COMPLETED" || !state.currentQuestion) {
    return (
      <div className="max-w-sm mx-auto py-16 text-center space-y-3">
        <Trophy className="w-14 h-14 mx-auto text-amber-500" />
        <h1 className="text-2xl font-bold text-slate-900">Tüneli tamamladın! 🎉</h1>
        <p className="text-slate-500">{state.totalQuestions} sorunun tümünü öğrendin.</p>
      </div>
    );
  }

  const q = state.currentQuestion;
  return (
    <div className="max-w-lg mx-auto py-8 space-y-5">
      <div>
        <div className="flex items-center justify-between text-sm text-slate-500 mb-1">
          <span className="font-semibold text-slate-700">{state.title}</span>
          <span>%{state.progressPercent}</span>
        </div>
        <Progress value={state.progressPercent} className="h-1.5" />
        <p className="text-xs text-slate-400 mt-1">{state.masteredQuestions}/{state.totalQuestions} soru öğrenildi</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        {q.mediaUrl && <div className="mb-4 rounded-xl overflow-hidden border border-slate-100 max-h-60"><img src={q.mediaUrl} alt="soru" className="w-full h-full object-contain" /></div>}
        <p className="text-lg font-semibold text-slate-900 leading-snug">{q.content}</p>
      </div>

      <div className="space-y-3">
        {q.options.map((opt, idx) => {
          const isSel = feedback?.selectedId === opt.id;
          const isCorrect = feedback && feedback.correctId === opt.id;
          let cls = "border-slate-200 bg-white hover:bg-slate-50";
          if (feedback) {
            if (isCorrect) cls = "border-emerald-500 bg-emerald-50";
            else if (isSel) cls = "border-rose-500 bg-rose-50";
            else cls = "border-slate-200 bg-white opacity-60";
          }
          return (
            <button key={opt.id} type="button" disabled={answer.isPending || !!feedback} onClick={() => answer.mutate(opt.id)}
              className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all ${cls}`}>
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0 ${LETTER_BG[idx % LETTER_BG.length]}`}>{LETTERS[idx] ?? idx + 1}</span>
              <div className="flex-1 flex items-center gap-3 min-w-0">
                {opt.mediaUrl && <img src={opt.mediaUrl} alt="" className="max-h-20 w-auto max-w-[8rem] object-contain rounded-lg border border-slate-200 bg-white" />}
                {opt.content && <span className="text-slate-800">{opt.content}</span>}
              </div>
              {isCorrect && <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />}
              {feedback && isSel && !feedback.correct && <XCircle className="w-5 h-5 shrink-0 text-rose-500" />}
            </button>
          );
        })}
      </div>

      {feedback && (
        <p className={`text-center text-sm font-medium ${feedback.correct ? "text-emerald-600" : "text-rose-500"}`}>
          {feedback.correct ? "Doğru! 👏" : "Yanlış — doğru şık yeşil. Bu soru tekrar gelecek."}
        </p>
      )}
    </div>
  );
}
