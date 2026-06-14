import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Layers, BookOpen, FileText, User, Play, CheckCircle2, ShoppingCart, ArrowLeft, Loader2, Star, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import StarRating from "@/components/ui/StarRating";
import { useAuth } from "@/lib/AuthContext";
import { PaymentModal } from "@/components/ui/PaymentModal";
import { candidateTunnels as api } from "@/api/dalClient";
import { createPageUrl } from "@/utils";

const REVIEWS_PER_PAGE = 5;

/**
 * Tünel detay sayfası — TestDetail ile aynı yapı (hero + 2 sütun: bilgi + sticky
 * satın alma paneli). Satın alma normal paketlerle aynı PaymentModal'ı kullanır.
 */
export default function TunnelDetail() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const id = params.get("id");
  const { user } = useAuth();
  const [buyOpen, setBuyOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewPage, setReviewPage] = useState(1);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  const { data: t, isLoading, isError } = useQuery({
    queryKey: ["tunnelMeta", id],
    queryFn: () => api.meta(id),
    enabled: !!id,
    staleTime: 30_000,
  });

  const { data: reviewData = { avg: null, count: 0, items: [] }, isFetching: reviewsFetching } = useQuery({
    queryKey: ["tunnelReviews", id, reviewPage],
    queryFn: () => api.reviews(id, { limit: REVIEWS_PER_PAGE, offset: (reviewPage - 1) * REVIEWS_PER_PAGE }),
    enabled: !!id,
    keepPreviousData: true,
  });
  const { data: myReview } = useQuery({
    queryKey: ["myTunnelReview", id, user?.id],
    queryFn: () => api.myReview(id),
    enabled: !!id && !!user?.id && !!t?.purchased,
  });

  const totalReviewPages = Math.max(1, Math.ceil((reviewData.count || 0) / REVIEWS_PER_PAGE));
  const openReview = () => { setRating(myReview?.rating ?? 0); setComment(myReview?.comment ?? ""); setReviewOpen(true); };
  const submitReview = async () => {
    if (rating < 1) return;
    try {
      await api.upsertReview(id, { rating, comment });
      queryClient.invalidateQueries({ queryKey: ["tunnelReviews", id] });
      queryClient.invalidateQueries({ queryKey: ["myTunnelReview", id, user?.id] });
      toast.success(myReview ? "Değerlendirmen güncellendi" : "Değerlendirmen kaydedildi");
      setReviewOpen(false);
    } catch (e) {
      toast.error(e?.message || "Değerlendirme kaydedilemedi");
    }
  };

  if (isLoading) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-indigo-500" /></div>;
  }
  if (isError || !t) {
    return <div className="mx-auto max-w-xl px-4 py-16 text-center text-slate-500">Tünel bulunamadı.</div>;
  }

  const priceTL = (t.priceCents ?? 0) / 100;
  const isFree = (t.priceCents ?? 0) === 0;
  const goSolve = () => navigate(createPageUrl("TakeTunnel") + `?id=${t.id}`);

  const features = [
    { icon: BookOpen, label: "Konu", value: t.topicName || "—" },
    { icon: FileText, label: "Soru", value: t.questionCount },
    { icon: Layers, label: "Sınav Türü", value: t.examTypeName || "—" },
    { icon: User, label: "Eğitici", value: t.educatorUsername || "—" },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <button onClick={() => navigate(createPageUrl("Explore"))} className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Geri
      </button>

      {/* Hero */}
      <div className="relative mb-8 h-64 overflow-hidden rounded-2xl" style={{ backgroundColor: t.coverImageUrl ? "transparent" : "#0000CD" }}>
        {t.coverImageUrl ? (
          <img src={t.coverImageUrl} alt={t.title} className="h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center"><Layers className="h-24 w-24 text-white/30" /></div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute left-6 top-6 flex gap-2">
          <Badge className="bg-indigo-600/95 text-white"><Layers className="mr-1 h-3 w-3" /> Tünel</Badge>
          {t.examTypeName && <Badge className="bg-white/90 text-slate-700">{t.examTypeName}</Badge>}
        </div>
        <div className="absolute bottom-6 left-6 right-6">
          <h1 className="text-3xl font-bold text-white">{t.title}</h1>
          {t.topicName && <p className="mt-1 text-white/80">{t.topicName}</p>}
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Ana içerik */}
        <div className="space-y-6 lg:col-span-2">
          {/* Puan özeti — yalnızca ortalama (buton Yorumlar başlığında) */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="mb-1 font-semibold text-slate-900">Puan</h2>
            <div className="flex items-center gap-2">
              <div className="flex">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} className={"h-6 w-6 " + (s <= Math.round(reviewData.avg || 0) ? "fill-amber-400 text-amber-400" : "text-slate-200")} />
                ))}
              </div>
              <span className="text-2xl font-bold text-slate-900">{reviewData.avg ?? "—"}</span>
              <span className="text-sm text-slate-500">/ 5</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {reviewData.count > 0 ? `${reviewData.count} değerlendirme` : "Henüz değerlendirme yok"}
            </p>
          </div>

          {t.description && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="mb-2 font-semibold text-slate-900">Açıklama</h2>
              <p className="whitespace-pre-wrap text-slate-600">{t.description}</p>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 font-semibold text-slate-900">Tünel Bilgileri</h2>
            <div className="grid grid-cols-2 gap-4">
              {features.map((f, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                  <f.icon className="h-5 w-5 flex-shrink-0 text-indigo-600" />
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">{f.label}</p>
                    <p className="truncate font-semibold text-slate-800">{f.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="mb-2 font-semibold text-slate-900">Nasıl çalışır?</h2>
            <p className="text-sm text-slate-600">
              Tünelde her soru aynı anda 5 seçenekle gelir; doğru cevap her zaman içindedir.
              Bir soruyu farklı seçenek dizilişleriyle en az 3 kez doğru cevapladığında "öğrenildi"
              sayılır. Tüm katmanlar öğrenilince tüneli tamamlarsın.
            </p>
          </div>

          {/* Yorumlar — başlıkta Değerlendir/Puanı Güncelle (TestDetail ile aynı) */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-slate-900">
                Yorumlar <span className="text-sm font-normal text-slate-500">({reviewData.count})</span>
              </h2>
              {user && t.purchased && (
                <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={openReview}>
                  <Star className="mr-1.5 h-4 w-4" /> {myReview ? "Puanı Güncelle" : "Değerlendir"}
                </Button>
              )}
            </div>
            {reviewData.items.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400">
                <MessageSquare className="mx-auto mb-2 h-8 w-8 text-slate-200" /> Henüz yorum yok.
              </div>
            ) : (
              <>
                <div className={"space-y-4 " + (reviewsFetching ? "opacity-60" : "")}>
                  {reviewData.items.map((r) => (
                    <div key={r.id} className="border-b border-slate-100 pb-4 last:border-0">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <div className="flex">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star key={s} className={"h-4 w-4 " + (s <= r.rating ? "fill-amber-400 text-amber-400" : "text-slate-200")} />
                          ))}
                        </div>
                        <span className="text-sm font-medium text-slate-700">{Number(r.rating).toFixed(1)}</span>
                        <span className="text-sm text-slate-500">— {r.candidateName}</span>
                      </div>
                      {r.comment && <p className="text-sm text-slate-600">{r.comment}</p>}
                    </div>
                  ))}
                </div>
                {totalReviewPages > 1 && (
                  <div className="mt-6 flex items-center justify-center gap-3 border-t border-slate-100 pt-4">
                    <Button variant="outline" size="sm" disabled={reviewPage <= 1 || reviewsFetching} onClick={() => setReviewPage((p) => Math.max(1, p - 1))}>Önceki</Button>
                    <span className="text-sm text-slate-600">{reviewPage} / {totalReviewPages}</span>
                    <Button variant="outline" size="sm" disabled={reviewPage >= totalReviewPages || reviewsFetching} onClick={() => setReviewPage((p) => Math.min(totalReviewPages, p + 1))}>Sonraki</Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Sticky satın alma / başlama paneli */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 rounded-2xl border border-slate-200 bg-white p-6">
            <div className="mb-6 text-center">
              <p className="text-4xl font-bold text-slate-900">{isFree ? "Ücretsiz" : `₺${priceTL.toFixed(0)}`}</p>
            </div>

            {t.purchased ? (
              <Button
                className={"h-12 w-full text-white " + (t.attemptStatus && t.attemptStatus !== "COMPLETED" ? "bg-amber-500 hover:bg-amber-600" : "bg-indigo-600 hover:bg-indigo-700")}
                onClick={goSolve}
              >
                {t.attemptStatus === "COMPLETED" ? (<><CheckCircle2 className="mr-2 h-5 w-5" /> Tekrar Çöz</>) : (<><Play className="mr-2 h-5 w-5" /> {t.attemptStatus ? "Devam Et" : "Başla"}</>)}
              </Button>
            ) : (
              <Button className="h-12 w-full bg-indigo-600 hover:bg-indigo-700" onClick={() => setBuyOpen(true)}>
                <ShoppingCart className="mr-2 h-5 w-5" /> Satın Al
              </Button>
            )}

            <div className="mt-6 space-y-3 text-sm text-slate-600">
              {t.topicName && <div className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-indigo-600" /> {t.topicName}</div>}
              <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-indigo-600" /> {t.questionCount} soru</div>
              {t.educatorUsername && <div className="flex items-center gap-2"><User className="h-4 w-4 text-indigo-600" /> {t.educatorUsername}</div>}
            </div>
          </div>
        </div>
      </div>

      {/* Değerlendirme modalı (satın alan aday) */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{myReview ? "Değerlendirmeni Güncelle" : "Tüneli Değerlendir"}</DialogTitle>
            <DialogDescription>Deneyimini diğer adaylarla paylaş.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <StarRating value={rating} onChange={setRating} size="lg" />
              {rating > 0 && <span className="text-lg font-medium text-slate-700">{rating}/5</span>}
            </div>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={4} maxLength={2000} placeholder="Yorumun (opsiyonel)" />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setReviewOpen(false)}>Vazgeç</Button>
              <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={submitReview} disabled={rating < 1}>
                {myReview ? "Güncelle" : "Gönder"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PaymentModal
        kind="tunnel"
        isOpen={buyOpen}
        onClose={() => setBuyOpen(false)}
        test={{ id: t.id, title: t.title, price: priceTL }}
        onPurchased={() => {
          toast.success("Tünel satın alındı");
          setBuyOpen(false);
          queryClient.invalidateQueries({ queryKey: ["tunnelMeta", id] });
          queryClient.invalidateQueries({ queryKey: ["candidateTunnels"] });
        }}
      />
    </div>
  );
}
