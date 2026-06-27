import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import QRCode from "react-qr-code";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { school as schoolApi } from "@/api/dalClient";
import { useAppNavigate, buildPageUrl } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, BarChart2, EyeOff, Users, Play, Square, Zap, Copy,
  CheckCircle2, AlertTriangle, List, ZoomIn, X as XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

/** E-Sınıf — Öğretmen canlı oturum yönetimi. Market LiveSessionHost.jsx ile birebir aynı (satın alma/round-2 hariç). */
export default function SchoolLiveHost() {
  const [params] = useSearchParams();
  const navigate = useAppNavigate();
  const queryClient = useQueryClient();
  const sessionId = params.get("id");
  const [copied, setCopied] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState(null);

  const { data: state, isLoading } = useQuery({
    queryKey: ["esinif", "live-host", sessionId],
    queryFn: () => schoolApi.live.host(sessionId),
    enabled: !!sessionId,
    refetchInterval: (q) => (q.state.data?.status === "ACTIVE" ? 3000 : false),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["esinif", "live-host", sessionId] });
  const mut = (fn, extra = {}) => ({
    mutationFn: fn,
    onSuccess: () => { invalidate(); extra.onSuccess?.(); },
    onError: (e) => toast.error(e?.response?.data?.message ?? e?.message ?? "İşlem başarısız"),
  });

  const startMut = useMutation(mut(() => schoolApi.live.start(sessionId)));
  const nextMut = useMutation(mut(() => schoolApi.live.advance(sessionId)));
  const prevMut = useMutation(mut(() => schoolApi.live.prev(sessionId)));
  const statsMut = useMutation(mut(() => schoolApi.live.toggleStats(sessionId)));
  const endMut = useMutation(mut(() => schoolApi.live.end(sessionId), { onSuccess: () => toast.success("Oturum sona erdi") }));

  const joinUrl = `${window.location.origin}${buildPageUrl("StudentLive", { code: state?.joinCode ?? "" })}`;
  const copyCode = () => { navigator.clipboard.writeText(state?.joinCode ?? ""); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  if (isLoading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!state) return <p className="text-center py-20 text-slate-500">Oturum bulunamadı.</p>;

  const q = state.currentQuestion;
  const isDraft = state.status === "DRAFT";
  const isActive = state.status === "ACTIVE";
  const isEnded = state.status === "ENDED";
  const stats = q ? state.stats?.[q.id] : null;
  const isFirst = state.currentQuestionIdx === 0;
  const isLast = state.currentQuestionIdx === state.totalQuestions - 1;

  return (
    <div className="max-w-4xl mx-auto pb-10">
      {/* Üst bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(buildPageUrl("SchoolLive"))} aria-label="Geri"><ChevronLeft className="w-5 h-5" /></Button>
          <Zap className="w-5 h-5 text-amber-500" />
          <div>
            <p className="font-semibold text-slate-900">{state.title}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge className={cn("text-xs", isDraft ? "bg-slate-100 text-slate-600" : isActive ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")}>
                {isDraft ? "Taslak" : isActive ? "Yayında" : "Bitti"}
              </Badge>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
                  <span className="font-semibold text-emerald-700">{state.activeParticipantCount ?? 0}</span>
                  <span>aktif</span>
                </span>
                <span className="text-xs text-slate-400 flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {state.participantCount} toplam</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isDraft && <Button onClick={() => startMut.mutate()} disabled={startMut.isPending} className="bg-blue-600 hover:bg-blue-700 text-white gap-2"><Play className="w-4 h-4 fill-white" /> Başlat</Button>}
          {isActive && <Button variant="outline" className="text-rose-600 border-rose-200 hover:bg-rose-50 gap-2" onClick={() => setEndConfirmOpen(true)} disabled={endMut.isPending}><Square className="w-4 h-4" /> Bitir</Button>}
        </div>
      </div>

      <div className="space-y-5">
        {/* Soru kartı */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="mb-4">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Soru {state.currentQuestionIdx + 1}</span>
            {q?.mediaUrl && (
              <div className="mt-2 w-full rounded-xl overflow-hidden border border-slate-100 bg-slate-50 flex items-center justify-center relative group">
                <img src={q.mediaUrl} alt="Soru görseli" className="max-h-96 max-w-full w-auto h-auto object-contain" />
                <button type="button" onClick={() => setLightboxUrl(q.mediaUrl)} className="absolute bottom-2 right-2 p-1.5 rounded-full bg-slate-900/70 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-900/90 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400" aria-label="Görseli büyüt"><ZoomIn className="w-5 h-5" /></button>
              </div>
            )}
            <p className="text-slate-700 text-lg mt-3 leading-relaxed">{q?.content ?? "—"}</p>
          </div>

          {q && (() => {
            // ENDED: dağılım her zaman gösterilir; ACTIVE: yalnız showStats açıkken.
            const showStats = Array.isArray(stats) && (isEnded || (isActive && state.showStats));
            const statByOpt = new Map();
            if (showStats) {
              const total = stats.reduce((s, o) => s + o.count, 0);
              stats.forEach((s) => statByOpt.set(s.optionId, { count: s.count, pct: total > 0 ? Math.round((s.count / total) * 100) : 0 }));
            }
            return (
              <div className="space-y-3 mb-4">
                {q.options.map((opt, idx) => {
                  const isCorrect = !!opt.isCorrect;
                  const highlight = isEnded && isCorrect;
                  const stat = statByOpt.get(opt.id);
                  return (
                    <div key={opt.id} className={cn("relative w-full p-4 rounded-xl border-2 text-left flex items-center gap-4 transition-all overflow-hidden", highlight ? "border-emerald-600 bg-emerald-50" : "border-slate-200 bg-white")}>
                      {showStats && stat && <div aria-hidden="true" className={cn("absolute inset-y-0 left-0 transition-all duration-500", isCorrect ? "bg-emerald-100" : "bg-indigo-50")} style={{ width: `${stat.pct}%` }} />}
                      <span className={cn("relative w-8 h-8 rounded-lg flex items-center justify-center font-semibold text-sm flex-shrink-0", highlight ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600")}>{LETTERS[idx]}</span>
                      <div className="relative flex-1 flex items-center gap-3 min-w-0">
                        {opt.mediaUrl && (
                          <div className="relative group flex-shrink-0">
                            <img src={opt.mediaUrl} alt="" className="max-h-32 w-auto max-w-xs object-contain rounded-lg border border-slate-200 bg-white" />
                            <button type="button" onClick={(e) => { e.stopPropagation(); setLightboxUrl(opt.mediaUrl); }} className="absolute bottom-1 right-1 p-1 rounded-full bg-slate-900/70 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-900/90 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400" aria-label="Görseli büyüt"><ZoomIn className="w-4 h-4" /></button>
                          </div>
                        )}
                        {opt.content && <span className="text-slate-700">{opt.content}</span>}
                      </div>
                      {showStats && stat && (
                        <span className={cn("relative text-sm font-semibold tabular-nums shrink-0 ml-2", isCorrect ? "text-emerald-700" : "text-slate-700")} title={`${stat.count} kişi`}>
                          %{stat.pct}<span className="text-xs text-slate-400 font-normal ml-1">({stat.count})</span>
                        </span>
                      )}
                      {highlight && !showStats && <CheckCircle2 className="relative w-5 h-5 text-emerald-600 flex-shrink-0" />}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* Kontroller */}
        {(isActive || isEnded) && (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Button variant="outline" onClick={() => prevMut.mutate()} disabled={isFirst || prevMut.isPending}><ChevronLeft className="w-4 h-4 mr-1" /> Önceki</Button>
            <Button variant="outline" onClick={() => statsMut.mutate()} disabled={statsMut.isPending} className={state.showStats ? "bg-indigo-50 text-indigo-700 border-indigo-200" : ""}>
              {state.showStats ? <><EyeOff className="w-4 h-4 mr-1" /> Sonuçları Gizle</> : <><BarChart2 className="w-4 h-4 mr-1" /> Sonuçları Göster</>}
            </Button>
            <Button onClick={() => nextMut.mutate()} disabled={isLast || nextMut.isPending} className="bg-indigo-600 hover:bg-indigo-700">Sonraki <ChevronRight className="w-4 h-4 ml-1" /></Button>
          </div>
        )}

        {isEnded && (
          <div className="space-y-3">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="font-semibold text-emerald-800">Oturum tamamlandı</p>
              <p className="text-sm text-emerald-700 mt-1">{state.participantCount} katılımcı • {state.totalQuestions} soru</p>
            </div>
            <Button variant="outline" className="w-full gap-2" onClick={() => navigate(buildPageUrl("SchoolLive"))}><List className="w-4 h-4" /> Canlı Sınavlara Dön</Button>
          </div>
        )}

        {/* Katılım kodu + QR */}
        {!isEnded && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">Aktif Katılımcılar</span>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /><span className="text-lg font-bold text-emerald-700">{state.activeParticipantCount ?? 0}</span></div>
              </div>
              <div className="flex items-center justify-between text-sm text-slate-500"><span>Toplam katılan</span><span className="font-medium">{state.participantCount}</span></div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">Katılım Kodu</p>
                  <div className="text-2xl font-black tracking-widest text-indigo-700 font-mono break-all">{state.joinCode}</div>
                  <button onClick={copyCode} className="mt-1 text-xs text-slate-500 hover:text-indigo-600 flex items-center gap-1">
                    {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}{copied ? "Kopyalandı" : "Kodu kopyala"}
                  </button>
                  <p className="text-xs text-slate-400 mt-2">Öğrenciler "Canlı Sınava Katıl" → bu kodu girer (veya QR okutur)</p>
                </div>
                <div className="bg-white p-2 rounded-lg border border-slate-100 shrink-0"><QRCode value={joinUrl} size={70} /></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bitirme onayı */}
      <Dialog open={endConfirmOpen} onOpenChange={setEndConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-700"><AlertTriangle className="w-5 h-5" aria-hidden="true" /> Oturumu bitir?</DialogTitle>
            <DialogDescription>Oturum bitince yeni katılım olmaz ve öğrenciler sonuçlarını görür. Bu işlem geri alınamaz.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEndConfirmOpen(false)}>Vazgeç</Button>
            <Button className="bg-rose-600 hover:bg-rose-700 text-white" disabled={endMut.isPending} onClick={() => { setEndConfirmOpen(false); endMut.mutate(); }}>
              <Square className="w-4 h-4 mr-2" />{endMut.isPending ? "Bitiriliyor…" : "Bitir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Görsel büyüteç */}
      <Dialog open={!!lightboxUrl} onOpenChange={(open) => { if (!open) setLightboxUrl(null); }}>
        <DialogContent className="max-w-5xl p-2 bg-transparent border-0 shadow-none">
          <DialogTitle className="sr-only">Görsel</DialogTitle>
          {lightboxUrl && (
            <div className="relative">
              <img src={lightboxUrl} alt="" className="w-full h-auto max-h-[85vh] object-contain rounded-xl bg-white" />
              <button type="button" onClick={() => setLightboxUrl(null)} className="absolute top-2 right-2 p-2 rounded-full bg-slate-900/70 text-white hover:bg-slate-900/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400" aria-label="Kapat"><XIcon className="w-5 h-5" /></button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
