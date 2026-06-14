import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Check, X, Eye } from "lucide-react";
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

  const closeReview = () => { setReviewId(null); setRejectMode(false); setReason(""); };

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
                {detail.examType?.name} · {detail.topic?.name} · {detail.layerCount} katman · {detail.optionsPerQuestion} seçenek
              </div>
              {detail.layers.map((l) => (
                <div key={l.index} className="rounded-lg border border-slate-100 p-3">
                  <div className="mb-2 text-sm font-semibold text-indigo-600">Katman {l.index} ({l.questions.length} soru)</div>
                  <ul className="space-y-2">
                    {l.questions.map((q, qi) => (
                      <li key={q.id} className="text-sm">
                        <div className="font-medium text-slate-800">{qi + 1}. {q.content}</div>
                        {q.mediaUrl && <img src={q.mediaUrl} alt="" className="mt-1 max-h-40 rounded-md object-contain" />}
                        <ul className="mt-1 grid grid-cols-1 gap-0.5 sm:grid-cols-2">
                          {q.options.map((o) => (
                            <li key={o.id} className={"flex items-center gap-1.5 text-xs " + (o.isCorrect ? "font-semibold text-emerald-600" : "text-slate-500")}>
                              <span>{o.isCorrect ? "✓ " : "• "}{o.content}</span>
                              {o.mediaUrl && <img src={o.mediaUrl} alt="" className="h-8 w-8 rounded object-cover" />}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

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
