import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { studentLive } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Radio, CheckCircle2, Clock, Trophy, AlertCircle } from "lucide-react";
import { toast } from "sonner";

/** E-Sınıf — Öğrenci canlı sınava katılım (kod + cevap, 2sn polling). */
export default function StudentLive() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isStudent = user?.school?.schoolRole === "STUDENT";
  const [code, setCode] = useState("");
  const [sessionId, setSessionId] = useState(null);

  const join = useMutation({
    mutationFn: () => studentLive.join(code.trim()),
    onSuccess: (res) => { setSessionId(res.sessionId); toast.success("Katıldınız"); },
    onError: (e) => toast.error(e?.response?.data?.message ?? "Katılınamadı"),
  });

  const { data: st } = useQuery({
    queryKey: ["esinif", "live-state", sessionId],
    queryFn: () => studentLive.state(sessionId),
    enabled: !!sessionId,
    refetchInterval: (q) => (q.state.data?.status === "ENDED" ? false : 2000),
  });

  const answer = useMutation({
    mutationFn: (optionId) => studentLive.answer(sessionId, { questionId: st.question.id, optionId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["esinif", "live-state", sessionId] }),
    onError: (e) => toast.error(e?.response?.data?.message ?? "Gönderilemedi"),
  });

  if (!isStudent) return <div className="max-w-lg mx-auto text-center py-20"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" /><h2 className="text-xl font-semibold text-slate-900">Erişim yok</h2></div>;

  // Katılım ekranı
  if (!sessionId) {
    return (
      <div className="max-w-sm mx-auto py-16 space-y-4 text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-50 flex items-center justify-center"><Radio className="w-7 h-7 text-amber-600" /></div>
        <h1 className="text-2xl font-bold text-slate-900">Canlı Sınava Katıl</h1>
        <p className="text-sm text-slate-500">Öğretmeninizin verdiği 6 haneli kodu girin.</p>
        <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" className="text-center text-2xl tracking-widest font-mono h-14" inputMode="numeric" />
        <Button onClick={() => join.mutate()} disabled={join.isPending || code.length < 6} className="w-full bg-amber-500 hover:bg-amber-600">{join.isPending ? "Katılınıyor…" : "Katıl"}</Button>
      </div>
    );
  }

  // Sonuç
  if (st?.status === "ENDED") {
    return (
      <div className="max-w-sm mx-auto py-16 text-center space-y-3">
        <Trophy className="w-14 h-14 mx-auto text-amber-500" />
        <h1 className="text-2xl font-bold text-slate-900">Oturum bitti</h1>
        <p className="text-4xl font-bold text-slate-900">{st.score}<span className="text-xl text-slate-400">/{st.total}</span></p>
        <p className="text-sm text-slate-500">doğru cevap</p>
        <Button variant="outline" onClick={() => { setSessionId(null); setCode(""); }}>Kapat</Button>
      </div>
    );
  }

  // Bekleme (DRAFT)
  if (!st || st.status === "DRAFT") {
    return (
      <div className="max-w-sm mx-auto py-20 text-center space-y-3">
        <Clock className="w-12 h-12 mx-auto text-slate-300 animate-pulse" />
        <h2 className="text-lg font-semibold text-slate-900">Başlaması bekleniyor…</h2>
        <p className="text-sm text-slate-500">Öğretmeniniz sınavı başlattığında soru görünecek.</p>
      </div>
    );
  }

  // Aktif soru
  const q = st.question;
  return (
    <div className="max-w-md mx-auto py-8 space-y-4">
      <div className="flex items-center justify-between"><Badge>Soru {st.currentQuestionIdx + 1}/{st.questionCount}</Badge></div>
      {q ? (
        <Card><CardContent className="p-5 space-y-3">
          <p className="font-medium text-slate-900 text-lg">{q.content}</p>
          <div className="space-y-2">
            {q.options.map((o, j) => {
              const selected = st.myOptionId === o.id;
              return (
                <button key={o.id} type="button" onClick={() => answer.mutate(o.id)} disabled={answer.isPending}
                  className={`w-full text-left flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${selected ? "border-amber-500 bg-amber-50" : "border-slate-200 hover:bg-slate-50"}`}>
                  <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${selected ? "bg-amber-500 border-amber-500 text-white" : "border-slate-300 text-slate-500"}`}>{String.fromCharCode(65 + j)}</span>
                  <span className="text-slate-800">{o.content}</span>
                  {selected && <CheckCircle2 className="w-5 h-5 text-amber-600 ml-auto" />}
                </button>
              );
            })}
          </div>
          {st.myOptionId && <p className="text-xs text-emerald-600 text-center">Cevabınız kaydedildi · değiştirebilirsiniz</p>}
        </CardContent></Card>
      ) : (
        <div className="text-center py-10 text-slate-400">Soru bekleniyor…</div>
      )}
    </div>
  );
}
