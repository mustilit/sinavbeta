import { useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { candidateWritten } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import StarRating from "@/components/ui/StarRating";
import { PaymentModal } from "@/components/ui/PaymentModal";
import { buildPageUrl, useLoginRedirect } from "@/lib/navigation";
import { toast } from "sonner";
import { Loader2, BookOpen, FileText, Star, User, Award, TrendingUp, ShoppingCart, CheckCircle, Play, Eye } from "lucide-react";

/**
 * WrittenTestDetail — yazılı (açık uçlu) paket detay.
 * Yerleşim TestDetail ile birebir aynı: hero → lg:grid-cols-3 (sol: puan/hakkında/
 * eğitici/özellikler · sağ sticky: fiyat+test listesi+satın al) → altta değerlendirmeler.
 * Linkler WrittenTestDetail/TakeWrittenTest'e; satın alma PaymentModal kind=written.
 * Gezinme herkese açık; satın alma login ister.
 */
function WrittenTestDetail() {
  const { t } = useTranslation(["pages"]);
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const loginUrl = useLoginRedirect();
  const queryClient = useQueryClient();
  const id = sp.get("id");
  const [payOpen, setPayOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [savingReview, setSavingReview] = useState(false);

  const { data: pkg, isLoading } = useQuery({
    queryKey: ["candidateWritten", "detail", id],
    queryFn: () => candidateWritten.getPackage(id),
    enabled: !!id,
  });
  const { data: mine, refetch: refetchMine } = useQuery({
    queryKey: ["candidateWritten", "mine"],
    queryFn: () => candidateWritten.myPackages(),
    enabled: !!user?.id,
  });
  const { data: reviewData = { avg: null, count: 0, items: [] } } = useQuery({
    queryKey: ["candidateWritten", "reviews", id],
    queryFn: () => candidateWritten.reviews(id, { limit: 10 }),
    enabled: !!id,
  });
  const { data: myReview } = useQuery({
    queryKey: ["candidateWritten", "myReview", id, user?.id],
    queryFn: () => candidateWritten.myReview(id),
    enabled: !!id && !!user?.id,
  });

  if (isLoading) return <div className="max-w-6xl mx-auto px-4 py-8"><div className="h-64 bg-slate-200 rounded-2xl mb-8 animate-pulse" /></div>;
  if (!pkg) return <div className="mx-auto max-w-xl px-4 py-16 text-center text-slate-500">{t("pages:writtenDetail.notFound")}</div>;

  const purchasedEntry = (mine?.items ?? []).find((p) => p.packageId === id);
  const isPurchased = !!purchasedEntry;
  const tests = isPurchased ? purchasedEntry.tests : (pkg.tests ?? []);
  const priceTL = (pkg.priceCents ?? 0) / 100;
  const avgRating = pkg.avgRating ?? reviewData.avg ?? 0;
  const reviewCount = pkg.reviewCount ?? reviewData.count ?? 0;

  const difficultyColorClass = {
    easy: "bg-emerald-100 text-emerald-700",
    medium: "bg-amber-100 text-amber-700",
    hard: "bg-rose-100 text-rose-700",
  }[pkg.difficulty] || "bg-amber-100 text-amber-700";
  const difficultyLabel = t(`pages:testCard.difficulty.${pkg.difficulty || "medium"}`);

  const openReview = () => { setRating(myReview?.rating ?? 0); setComment(myReview?.comment ?? ""); setReviewOpen(true); };
  const submitReview = async () => {
    if (rating < 1) { toast.error(t("pages:writtenDetail.ratingRequired")); return; }
    setSavingReview(true);
    try {
      await candidateWritten.upsertReview(id, { rating, comment });
      queryClient.invalidateQueries({ queryKey: ["candidateWritten", "reviews", id] });
      queryClient.invalidateQueries({ queryKey: ["candidateWritten", "myReview", id, user?.id] });
      queryClient.invalidateQueries({ queryKey: ["candidateWritten", "detail", id] });
      toast.success(t("pages:writtenDetail.reviewSaved"));
      setReviewOpen(false);
    } catch (e) { toast.error(e?.message || t("pages:writtenDetail.reviewFailed")); }
    finally { setSavingReview(false); }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Hero */}
      <div className="relative h-64 rounded-2xl overflow-hidden mb-8" style={{ backgroundColor: pkg.coverImageUrl ? "transparent" : "#0000CD" }}>
        {pkg.coverImageUrl ? (
          <img src={pkg.coverImageUrl} alt={pkg.title} className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center"><BookOpen className="w-24 h-24 text-white/30" /></div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute top-6 left-6"><Badge className="bg-white/90 text-amber-700"><FileText className="w-3 h-3 mr-1" />{t("pages:writtenDetail.typeBadge")}</Badge></div>
        <div className="absolute bottom-6 right-6"><Badge className={`bg-white/90 ${difficultyColorClass}`}>{difficultyLabel}</Badge></div>
        <div className="absolute bottom-6 left-6"><h1 className="text-3xl font-bold text-white">{pkg.title}</h1></div>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Sol — ana içerik */}
        <div className="lg:col-span-2 space-y-8">
          {/* Paket genel puanı */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-1">{t("pages:testDetail.packageRating.title")}</h2>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} className={`w-6 h-6 ${s <= Math.round(Number(avgRating)) ? "fill-amber-400 text-amber-400" : "text-slate-200"}`} />
                ))}
              </div>
              <span className="text-2xl font-bold text-slate-900">{avgRating > 0 ? avgRating : "—"}</span>
              <span className="text-sm text-slate-500">{t("pages:testDetail.packageRating.outOf")}</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {reviewCount > 0 ? t("pages:testDetail.packageRating.reviewerCount", { count: reviewCount }) : t("pages:testDetail.packageRating.noReviews")}
            </p>
          </div>

          {/* Hakkında */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">{t("pages:writtenDetail.aboutTitle", { defaultValue: "Yazılı Hakkında" })}</h2>
            <p className="text-slate-600 leading-relaxed">{pkg.description || t("pages:writtenDetail.aboutNoDescription", { defaultValue: "" })}</p>
            <p className="mt-3 text-xs text-slate-400">{t("pages:writtenDetail.selfEvalNote")}</p>
          </div>

          {/* Eğitici */}
          {pkg.educatorId && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">{t("pages:testDetail.educator.title")}</h2>
              <div className="flex items-center justify-between">
                <Link to={`${buildPageUrl("EducatorProfile")}?id=${pkg.educatorId}`} className="flex items-center gap-4 hover:opacity-80 transition-opacity">
                  <div className="w-14 h-14 bg-gradient-to-br from-indigo-100 to-violet-100 rounded-full flex items-center justify-center">
                    <User className="w-7 h-7 text-indigo-600" />
                  </div>
                  <p className="font-semibold text-slate-900 hover:text-indigo-600 transition-colors">{pkg.educatorName || t("pages:testDetail.educator.fallbackName")}</p>
                </Link>
                <Link to={`${buildPageUrl("EducatorProfile")}?id=${pkg.educatorId}`}>
                  <Button variant="outline" size="sm">{t("pages:writtenDetail.viewEducator")}</Button>
                </Link>
              </div>
            </div>
          )}

          {/* Özellikler */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">{t("pages:testDetail.features.title")}</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl">
                <BookOpen className="w-5 h-5 text-indigo-600" />
                <div><p className="text-sm text-slate-500">{t("pages:writtenDetail.featuresCount")}</p><p className="font-semibold text-slate-900">{pkg.testCount ?? tests.length}</p></div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl">
                <FileText className="w-5 h-5 text-indigo-600" />
                <div><p className="text-sm text-slate-500">{t("pages:testDetail.features.questionCount")}</p><p className="font-semibold text-slate-900">{pkg.totalQuestions ?? 0}</p></div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl">
                <Award className="w-5 h-5 text-indigo-600" />
                <div><p className="text-sm text-slate-500">{t("pages:testDetail.features.difficulty")}</p><p className="font-semibold text-slate-900">{difficultyLabel}</p></div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl">
                <TrendingUp className="w-5 h-5 text-emerald-500" />
                <div><p className="text-sm text-slate-500">{t("pages:testDetail.features.salesCount")}</p><p className="font-semibold text-slate-900">{pkg.salesCount ?? 0}</p></div>
              </div>
            </div>
          </div>
        </div>

        {/* Sağ — sticky satın alma / test listesi */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sticky top-24">
            {!isPurchased && (
              <div className="text-center mb-6">
                <p className="text-4xl font-bold text-slate-900">{priceTL === 0 ? t("pages:testCard.free") : `₺${priceTL.toFixed(0)}`}</p>
                {(pkg.salesCount ?? 0) > 0 && <p className="text-sm text-slate-500 mt-2">{t("pages:testDetail.purchase.totalSales", { count: pkg.salesCount })}</p>}
              </div>
            )}

            {isPurchased ? (
              <div className="space-y-3">
                <h3 className="font-semibold text-slate-900 mb-3">{t("pages:writtenDetail.testsListTitle")}</h3>
                {tests.map((testItem) => {
                  const completed = testItem.state === "SUBMITTED" || testItem.state === "TIMEOUT";
                  const inProgress = testItem.state === "IN_PROGRESS";
                  const style = { backgroundColor: completed ? "#64748b" : inProgress ? "#f59e0b" : "#0000CD" };
                  return (
                    <Link key={testItem.id} to={`${buildPageUrl("TakeWrittenTest")}?testId=${testItem.id}`} className="block">
                      <Button style={style} className="w-full justify-between h-auto py-3 hover:opacity-90 text-white border-2 border-white shadow-sm">
                        <div className="text-left">
                          <p className="font-medium">{testItem.title}</p>
                          <p className="text-xs opacity-90 mt-0.5">{testItem.questionCount} {t("pages:writtenDetail.questionsSuffix")}{testItem.isTimed && testItem.duration ? ` · ${testItem.duration} dk` : ""}</p>
                        </div>
                        {completed ? <Eye className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </Button>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <Button className="w-full h-12 bg-indigo-600 hover:bg-indigo-700" onClick={() => (user ? setPayOpen(true) : navigate(loginUrl(), { replace: true }))}>
                <ShoppingCart className="w-5 h-5 mr-2" />{t("pages:testCard.buy")}
              </Button>
            )}

            <div className="mt-6 space-y-3">
              {[
                t("pages:testDetail.purchase.features.unlimitedAccess"),
                t("pages:testDetail.purchase.features.detailedSolutions"),
                t("pages:testDetail.purchase.features.mobileFriendly"),
              ].map((feature, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm text-slate-600"><CheckCircle className="w-4 h-4 text-emerald-500" />{feature}</div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Değerlendirmeler — tam genişlik */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 mt-8">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-lg font-semibold text-slate-900">{t("pages:testDetail.reviews.title")}<span className="ml-2 text-sm font-normal text-slate-500">({reviewData.count})</span></h2>
          {isPurchased && (
            <Button variant="outline" size="sm" onClick={openReview}>{myReview ? t("pages:writtenDetail.editRate") : t("pages:writtenDetail.rate")}</Button>
          )}
        </div>
        {reviewData.items.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">{t("pages:writtenDetail.noReviews")}</p>
        ) : (
          <div className="space-y-4">
            {reviewData.items.map((r) => (
              <div key={r.id} className="border-b border-slate-100 pb-4 last:border-0">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-800">{r.candidateName}</span>
                  <StarRating value={r.rating} readonly size="sm" />
                </div>
                {r.comment && <p className="mt-1 text-sm text-slate-600">{r.comment}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      <PaymentModal
        isOpen={payOpen}
        onClose={() => setPayOpen(false)}
        kind="written"
        test={{ id: pkg.id, title: pkg.title, price: priceTL }}
        onPurchased={() => { setPayOpen(false); refetchMine(); }}
      />

      <Dialog open={reviewOpen} onOpenChange={(o) => !o && setReviewOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{myReview ? t("pages:writtenDetail.editRate") : t("pages:writtenDetail.rate")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <StarRating value={rating} onChange={setRating} size="lg" />
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t("pages:writtenDetail.commentPlaceholder")} rows={4} maxLength={2000} />
            <div className="flex justify-end">
              <Button className="bg-indigo-600 text-white hover:bg-indigo-700" onClick={submitReview} disabled={savingReview || rating < 1}>
                {savingReview ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}{t("pages:writtenDetail.submitReview")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default WrittenTestDetail;
export { WrittenTestDetail };
