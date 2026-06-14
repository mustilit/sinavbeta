import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Check, X, Eye, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { tunnels as tunnelApi } from "@/api/dalClient";

/** Admin tünel onayı — bekleyenler + inceleme + onayla/reddet. */
export default function AdminTunnels() {
  const queryClient = useQueryClient();
  const [reviewId, setReviewId] = useState(null);
  const [rejectMode, setRejectMode] = useState(false);
  const [reason, setReason] = useState("");
  const [qIndex, setQIndex] = useState(0); // inceleme: aktif soru

  const { data, isLoading } = useQuery({
    queryKey: ["pendingTunnels"],
    queryFn: () => tunnelApi.adminPending(),
    staleTime: 10_000,
  });
  const items = data?.items ?? [];

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["adminTunnel", reviewId],
    queryFn: () => tunnelApi.adminGet(reviewId),
    enabled: !!reviewId,
  });

  const closeReview = () => { setReviewId(null); setRejectMode(false); setReason(""); setQIndex(0); };

  // Tüm katmanların soruları tek sıralı listeye düzleştirilir (soru-soru gezinme).
  const flatQuestions = useMemo(() => {
    const out = [];
    (detail?.layers ?? []).forEach((l) => (l.questions ?? []).forEach((q) => out.push({ layerIndex: l.index, q })));
    return out;
  }, [detail]);
  const total = flatQuestions.length;
  const safeIndex = Math.min(qIndex, Math.max(0, total - 1));
  const cur = flatQuestions[safeIndex];

  // Yeni tünel açıldığında ilk soruya dön
  useEffect(() => { setQIndex(0); }, [reviewId]);

  const approveMut = useMutation({
    mutationFn: (id) => tunnelApi.adminApprove(id),
    onSuccess: () => {
      toast.success("Tünel onaylandı ve yayınlandı");
      queryClient.invalidateQueries({ queryKey: ["pendingTunnels"] });
      closeReview();
    },
    onError: (e) => toast.error(e?.message || "Onaylanamadı"),
  });
  const rejectMut = useMutation({
    mutationFn: ({ id, reason }) => tunnelApi.adminReject(id, reason),
    onSuccess: () => {
      toast.success("Tünel reddedildi");
      queryClient.invalidateQueries({ queryKey: ["pendingTunnels"] });
      closeReview();
    },
    onError: (e) => toast.error(e?.message || "Reddedilemedi"),
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold text-slate-900">
        <ShieldCheck className="h-6 w-6 text-indigo-600" /> Tünel Onayları
      </h1>
      <p className="mb-6 text-sm text-slate-500">Onay bekleyen tüneller — inceleyip onayla veya reddet</p>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      ) : items.length === 0 ? (
        <p className="py-16 text-center text-sm text-slate-500">Onay bekleyen tünel yok.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((t) => (
            <li key={t.id}>
              <Card>
                <CardContent className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <span className="font-semibold text-slate-900">{t.title}</span>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
                      <span>{t.educatorUsername}</span>
                      {t.examTypeName && <span>· {t.examTypeName}</span>}
                      {t.topicName && <span>· {t.topicName}</span>}
                      <span>· {t.layerCount} katman</span>
                      <span>· {t.questionCount} soru</span>
                    </div>
                  </div>
                  <Button size="sm" className="bg-indigo-600 text-white hover:bg-indigo-700" onClick={() => setReviewId(t.id)}>
                    <Eye className="mr-1.5 h-4 w-4" /> İncele
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {/* İnceleme dialog'u */}
      <Dialog open={!!reviewId} onOpenChange={(o) => !o && closeReview()}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detail?.title || "Tünel İnceleme"}</DialogTitle>
          </DialogHeader>
          {detailLoading || !detail ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
          ) : (
            <div className="space-y-4">
              {detail.coverImageUrl && (
                <img src={detail.coverImageUrl} alt="" className="h-32 w-full rounded-lg object-cover" />
              )}
              <div className="text-xs text-slate-500">
                {detail.examType?.name} · {detail.topic?.name} · {detail.layerCount} katman · {detail.optionsPerQuestion} seçenek · {total} soru
              </div>

              {total === 0 || !cur ? (
                <p className="py-8 text-center text-sm text-slate-400">Bu tünelde soru yok.</p>
              ) : (
                <>
                  {/* Soru başlığı + ilerleme */}
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-600">Katman {cur.layerIndex}</span>
                    <span className="text-xs font-medium text-slate-500">Soru {safeIndex + 1} / {total}</span>
                  </div>

                  {/* Tek soru — tüm şıklar */}
                  <div className="rounded-lg border border-slate-200 p-4">
                    <div className="whitespace-pre-wrap text-base font-medium text-slate-900">{cur.q.content}</div>
                    {cur.q.mediaUrl && <img src={cur.q.mediaUrl} alt="" className="mt-3 max-h-56 rounded-md object-contain" />}
                    <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {cur.q.options.map((o, oi) => (
                        <li
                          key={o.id}
                          className={
                            "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm " +
                            (o.isCorrect ? "border-emerald-300 bg-emerald-50 font-semibold text-emerald-700" : "border-slate-200 text-slate-600")
                          }
                        >
                          <span className="w-4 flex-shrink-0 text-xs font-semibold text-slate-400">{LETTERS[oi]}</span>
                          {o.isCorrect
                            ? <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-600" />
                            : <span className="h-4 w-4 flex-shrink-0" />}
                          {o.mediaUrl && <img src={o.mediaUrl} alt="" className="h-9 w-9 flex-shrink-0 rounded object-cover" />}
                          {o.content && <span>{o.content}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Soru gezinme */}
                  <div className="flex items-center justify-between">
                    <Button variant="outline" size="sm" disabled={safeIndex === 0} onClick={() => setQIndex((i) => Math.max(0, i - 1))}>
                      <ChevronLeft className="mr-1 h-4 w-4" /> Önceki
                    </Button>
                    <span className="text-xs text-slate-400">{safeIndex + 1} / {total}</span>
                    <Button variant="outline" size="sm" disabled={safeIndex >= total - 1} onClick={() => setQIndex((i) => Math.min(total - 1, i + 1))}>
                      Sonraki <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}

              {rejectMode ? (
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Red sebebi (eğiticiye gösterilir)" maxLength={1000} />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setRejectMode(false)}>Vazgeç</Button>
                    <Button size="sm" className="bg-rose-600 hover:bg-rose-700" onClick={() => rejectMut.mutate({ id: reviewId, reason: reason.trim() })} disabled={!reason.trim() || rejectMut.isPending}>
                      {rejectMut.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <X className="mr-1.5 h-4 w-4" />} Reddet
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                  <Button variant="outline" size="sm" className="text-rose-600" onClick={() => setRejectMode(true)}>
                    <X className="mr-1.5 h-4 w-4" /> Reddet
                  </Button>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => approveMut.mutate(reviewId)} disabled={approveMut.isPending}>
                    {approveMut.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />} Onayla & Yayınla
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
