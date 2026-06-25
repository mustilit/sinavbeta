import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { school as schoolApi } from "@/api/dalClient";
import { useAppNavigate, buildPageUrl } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Play, ChevronRight, Square, Users, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

/** E-Sınıf — Öğretmen canlı oturum yönetimi (2sn polling). ?id=sessionId */
export default function SchoolLiveHost() {
  const [params] = useSearchParams();
  const navigate = useAppNavigate();
  const qc = useQueryClient();
  const id = params.get("id");

  const { data: s, isLoading, isError } = useQuery({
    queryKey: ["esinif", "live-host", id],
    queryFn: () => schoolApi.live.host(id),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data?.status === "ENDED" ? false : 2000),
  });

  const start = useMutation({ mutationFn: () => schoolApi.live.start(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["esinif", "live-host", id] }), onError: (e) => toast.error(e?.response?.data?.message ?? "Başlatılamadı") });
  const advance = useMutation({ mutationFn: () => schoolApi.live.advance(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["esinif", "live-host", id] }), onError: (e) => toast.error(e?.response?.data?.message ?? "İlerletilemedi") });
  const end = useMutation({ mutationFn: () => schoolApi.live.end(id), onSuccess: () => { toast.success("Oturum bitti"); qc.invalidateQueries({ queryKey: ["esinif", "live-host", id] }); }, onError: (e) => toast.error(e?.response?.data?.message ?? "Bitirilemedi") });

  if (isLoading) return <div className="max-w-2xl mx-auto py-20 text-center text-slate-400">Yükleniyor…</div>;
  if (isError || !s) return <div className="max-w-lg mx-auto text-center py-20"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" /><h2 className="text-xl font-semibold text-slate-900">Oturum bulunamadı</h2></div>;

  const cur = s.questions[s.currentQuestionIdx] ?? null;
  const distMap = new Map((s.currentDistribution ?? []).map((d) => [d.optionId, d.count]));
  const totalAns = (s.currentDistribution ?? []).reduce((a, d) => a + d.count, 0);

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(buildPageUrl("SchoolLive"))} aria-label="Geri"><ArrowLeft className="w-5 h-5" /></Button>
        <div className="flex-1"><h1 className="text-xl font-bold text-slate-900">{s.title}</h1></div>
        <Badge className="bg-slate-100 text-slate-700 gap-1"><Users className="w-3.5 h-3.5" /> {s.participantCount}</Badge>
      </div>

      <Card><CardContent className="p-5 text-center">
        <p className="text-sm text-slate-500">Katılım kodu</p>
        <p className="text-4xl font-bold font-mono tracking-widest text-amber-600">{s.joinCode}</p>
        <p className="text-xs text-slate-400 mt-1">Öğrenciler "Canlı Sınava Katıl" → bu kodu girer</p>
      </CardContent></Card>

      {s.status === "DRAFT" && (
        <Button onClick={() => start.mutate()} disabled={start.isPending} className="w-full bg-emerald-600 hover:bg-emerald-700 gap-2"><Play className="w-4 h-4" /> Oturumu Başlat</Button>
      )}

      {s.status !== "DRAFT" && cur && (
        <Card><CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Soru {s.currentQuestionIdx + 1} / {s.questionCount}</span>
            <span className="text-xs text-slate-500">{totalAns} cevap</span>
          </div>
          <p className="font-medium text-slate-900">{cur.content}</p>
          <div className="space-y-2">
            {cur.options.map((o, j) => {
              const c = distMap.get(o.id) ?? 0;
              const pct = totalAns ? Math.round((c / totalAns) * 100) : 0;
              return (
                <div key={o.id} className={`rounded-lg border p-2.5 ${o.isCorrect ? "border-emerald-300 bg-emerald-50" : "border-slate-200"}`}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2"><span className="font-semibold text-slate-500">{String.fromCharCode(65 + j)}</span> {o.content} {o.isCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}</span>
                    <span className="text-slate-500">{c} (%{pct})</span>
                  </div>
                  <div className="mt-1 h-1.5 bg-slate-100 rounded-full"><div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
          </div>
        </CardContent></Card>
      )}

      {s.status === "ACTIVE" && (
        <div className="flex gap-2">
          {s.currentQuestionIdx < s.questionCount - 1
            ? <Button onClick={() => advance.mutate()} disabled={advance.isPending} className="flex-1 bg-indigo-600 hover:bg-indigo-700 gap-1">Sonraki Soru <ChevronRight className="w-4 h-4" /></Button>
            : <Button onClick={() => { if (confirm("Oturumu bitir?")) end.mutate(); }} disabled={end.isPending} className="flex-1 bg-rose-600 hover:bg-rose-700 gap-1"><Square className="w-4 h-4" /> Oturumu Bitir</Button>}
          {s.currentQuestionIdx < s.questionCount - 1 && <Button variant="outline" onClick={() => { if (confirm("Oturumu bitir?")) end.mutate(); }} className="text-rose-600 border-rose-200 hover:bg-rose-50"><Square className="w-4 h-4" /></Button>}
        </div>
      )}

      {s.status === "ENDED" && <div className="text-center py-4 text-slate-500">Oturum sona erdi.</div>}
    </div>
  );
}
