import { useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import { Layers, BookOpen, FileText, User, Play, CheckCircle2, ShoppingCart, ArrowLeft, Loader2, Star, MessageSquare, Bell, BellOff, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import StarRating from "@/components/ui/StarRating";
import { useAuth } from "@/lib/AuthContext";
import { PaymentModal } from "@/components/ui/PaymentModal";
import { candidateTunnels as api, entities } from "@/api/dalClient";
import http from "@/lib/api/apiClient";
import { createPageUrl } from "@/utils";
import { useLoginRedirect } from "@/lib/navigation";
import { examLanguageName } from "@/lib/examLanguages";

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
  const loginUrl = useLoginRedirect();
  const [buyOpen, setBuyOpen] = useState(false);
  // Test paketi deseni: giriş yoksa Satın Al → login'e yönlendir (ödeme açılmaz).
  const handleBuy = () => {
    if (!user) { navigate(loginUrl(), { replace: true }); return; }
    setBuyOpen(true);
  };
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
    placeholderData: keepPreviousData, // v5: v4 keepPreviousData:true karşılığı
  });
  const { data: myReview } = useQuery({
    queryKey: ["myTunnelReview", id, user?.id],
    queryFn: () => api.myReview(id),
    enabled: !!id && !!user?.id && !!t?.purchased,
  });

  // Eğitici takip durumu + özet istatistikleri (TestDetail ile aynı kaynak; educatorId = eğitici UUID)
  const { data: follows = [] } = useQuery({
    queryKey: ["follows", user?.id, t?.educatorId],
    queryFn: () => entities.Follow.filter({ educator_email: t.educatorId }),
    enabled: !!user && !!t?.educatorId,
  });
  const isFollowing = follows.length > 0;
  const followMutation = useMutation({
    mutationFn: async () => {
      if (isFollowing) {
        await entities.Follow.delete(follows[0].educatorId ?? follows[0].id);
      } else {
        await entities.Follow.create({
          follower_email: user.email,
          follow_type: "educator",
          educator_email: t.educatorId,
          educator_name: t.educatorUsername,
          notifications_enabled: true,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["follows", user?.id, t?.educatorId] });
      toast.success(isFollowing ? "Takipten çıkıldı" : "Takip ediliyor");
    },
    onError: (e) => toast.error(e?.message || "İşlem başarısız"),
  });
  const { data: educatorStats } = useQuery({
    queryKey: ["educatorStats", t?.educatorId],
    queryFn: async () => {
      const res = await http.get(`/educators/${encodeURIComponent(t.educatorId)}?limit=1`);
      return (res?.data ?? res)?.stats ?? null;
    },
    enabled: !!t?.educatorId,
    staleTime: 5 * 60 * 1000,
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
    { icon: FileText, label: "Soru Sayısı", value: t.questionCount },
    { icon: BookOpen, label: "Konu", value: t.topicName || "—" },
    { icon: Layers, label: "Sınav Türü", value: t.examTypeName || "—" },
    { icon: TrendingUp, label: "Satış Adedi", value: t.salesCount ?? 0 },
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
              <h2 className="mb-2 text-lg font-semibold text-slate-900">Tünel Hakkında</h2>
              <p className="whitespace-pre-wrap text-slate-600">{t.description}</p>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-600">{`Bu sınavın dili ${examLanguageName(t.language)}'dir.`}</p>
          </div>

          {/* Eğitici — TestDetail ile aynı (avatar + Takip Et + özet istatistik) */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Eğitici</h2>
            <div className="flex items-center justify-between">
              <Link
                to={createPageUrl("EducatorProfile") + `?email=${encodeURIComponent(t.educatorId || "")}`}
                className="flex items-center gap-4 transition-opacity hover:opacity-80"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-100 to-violet-100">
                  <User className="h-7 w-7 text-indigo-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900 transition-colors hover:text-indigo-600">
                    {t.educatorUsername || "Eğitici"}
                  </p>
                </div>
              </Link>
              {user && t.educatorId && (
                <Button variant="outline" size="sm" onClick={() => followMutation.mutate()} disabled={followMutation.isPending}>
                  {isFollowing ? (<><BellOff className="mr-1 h-4 w-4" /> Takiptesin</>) : (<><Bell className="mr-1 h-4 w-4" /> Takip Et</>)}
                </Button>
              )}
            </div>
            {educatorStats && (
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                <span className="flex items-center gap-1">
                  <BookOpen className="h-4 w-4" aria-hidden="true" />
                  {educatorStats.totalPublishedTests ?? 0} test
                </span>
                {(educatorStats.totalPurchases ?? 0) > 0 && (
                  <span className="flex items-center gap-1">
                    <TrendingUp className="h-4 w-4 text-emerald-500" aria-hidden="true" />
                    {educatorStats.totalPurchases} satış
                  </span>
                )}
                {educatorStats.ratingAvg != null && Number(educatorStats.ratingAvg) > 0 && (
                  <span className="flex items-center gap-1 font-medium text-amber-600">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />
                    {Number(educatorStats.ratingAvg).toFixed(1)}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Özellikler</h2>
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
              <Button className="h-12 w-full bg-indigo-600 hover:bg-indigo-700" onClick={handleBuy}>
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

      {/* Yorumlar — sayfa altında tam genişlik (TestDetail ile aynı yapı) */}
      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">
            Yorumlar <span className="ml-2 text-sm font-normal text-slate-500">({reviewData.count})</span>
          </h2>
          {user && t.purchased && (
            <Button size="sm" className="flex-shrink-0 bg-indigo-600 hover:bg-indigo-700" onClick={openReview}>
              <Star className="mr-1.5 h-4 w-4" /> {myReview ? "Puanı Güncelle" : "Değerlendir"}
            </Button>
          )}
        </div>
        {reviewData.items.length === 0 ? (
          <div className="py-10 text-center">
            <MessageSquare className="mx-auto mb-3 h-10 w-10 text-slate-200" />
            <p className="text-sm text-slate-400">Henüz değerlendirme yok.</p>
          </div>
        ) : (
          <>
            <div className={"space-y-4 " + (reviewsFetching ? "opacity-60" : "")}>
              {reviewData.items.map((r) => (
                <div key={r.id} className="border-b border-slate-100 pb-4 last:border-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <div className="flex">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star key={s} className={"h-4 w-4 " + (s <= Math.round(r.rating) ? "fill-amber-400 text-amber-400" : "text-slate-200")} />
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
              <div className="mt-6 flex items-center justify-center gap-2 border-t border-slate-100 pt-4">
                <Button variant="outline" size="sm" disabled={reviewPage <= 1 || reviewsFetching} onClick={() => setReviewPage((p) => Math.max(1, p - 1))}>Önceki</Button>
                <span className="mx-3 text-sm text-slate-600">{reviewPage} / {totalReviewPages}</span>
                <Button variant="outline" size="sm" disabled={reviewPage >= totalReviewPages || reviewsFetching} onClick={() => setReviewPage((p) => Math.min(totalReviewPages, p + 1))}>Sonraki</Button>
              </div>
            )}
          </>
        )}
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
