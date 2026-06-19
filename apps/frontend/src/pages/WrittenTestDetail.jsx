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
import { buildPageUrl } from "@/lib/navigation";
import { toast } from "sonner";
import { Loader2, ArrowLeft, FileText, Clock, ShoppingCart, PlayCircle, CheckCircle2, BookOpen, User, Star, TrendingUp, MessageSquare } from "lucide-react";

/**
 * WrittenTestDetail — yazılı (açık uçlu) paket detay/tanıtım ekranı.
 * Diğer test/tünel detayı ile aynı alanlar: tanıtım metni, özellikler, eğitici,
 * puanlama (değerlendirmeler). Satın alınmadıysa PaymentModal; alındıysa testleri çöz.
 * Gezinme herkese açık (login gerekmez); satın alma login ister.
 */
function WrittenTestDetail() {
  const { t } = useTranslation(["pages"]);
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
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

  if (isLoading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-indigo-500" /></div>;
  if (!pkg) return <div className="mx-auto max-w-xl px-4 py-16 text-center text-slate-500">{t("pages:writtenDetail.notFound")}</div>;

  const purchasedEntry = (mine?.items ?? []).find((p) => p.packageId === id);
  const purchased = !!purchasedEntry;
  const priceLabel = pkg.priceCents > 0 ? `${(pkg.priceCents / 100).toFixed(2)} ₺` : t("pages:writtenDetail.free");
  const tests = purchased ? purchasedEntry.tests : (pkg.tests ?? []);
  const diffMap = { easy: t("pages:writtenDetail.diffEasy"), medium: t("pages:writtenDetail.diffMedium"), hard: t("pages:writtenDetail.diffHard") };

  const features = [
    { icon: FileText, label: t("pages:writtenDetail.testsTitle"), value: pkg.testCount ?? tests.length },
    { icon: BookOpen, label: t("pages:writtenDetail.questionsTotal"), value: pkg.totalQuestions ?? 0 },
    { icon: TrendingUp, label: t("pages:writtenDetail.sales"), value: pkg.salesCount ?? 0 },
    { icon: Star, label: t("pages:writtenDetail.difficultyLabel"), value: diffMap[pkg.difficulty] ?? pkg.difficulty },
  ];

  const stateLabel = (st) => {
    if (st === "SUBMITTED" || st === "TIMEOUT") return { label: t("pages:writtenDetail.review"), icon: CheckCircle2 };
    if (st === "IN_PROGRESS") return { label: t("pages:writtenDetail.continue"), icon: PlayCircle };
    return { label: t("pages:writtenDetail.start"), icon: PlayCircle };
  };

  const openReview = () => { setRating(myReview?.rating ?? 0); setComment(myReview?.comment ?? ""); setReviewOpen(true); };
  const submitReview = async () => {
    if (rating < 1) { toast.error(t("pages:writtenDetail.ratingRequired")); return; }
    setSavingReview(true);
    try {
      await candidateWritten.upsertReview(id, { rating, comment });
      queryClient.invalidateQueries({ queryKey: ["candidateWritten", "reviews", id] });
      queryClient.invalidateQueries({ queryKey: ["candidateWritten", "myReview", id, user?.id] });
      toast.success(t("pages:writtenDetail.reviewSaved"));
      setReviewOpen(false);
    } catch (e) { toast.error(e?.message || t("pages:writtenDetail.reviewFailed")); }
    finally { setSavingReview(false); }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4"><ArrowLeft className="mr-1 h-4 w-4" />{t("pages:writtenDetail.back")}</Button>

      {/* Hero */}
      <div className="relative mb-6 h-52 overflow-hidden rounded-2xl" style={{ backgroundColor: pkg.coverImageUrl ? "transparent" : "#0000CD" }}>
        {pkg.coverImageUrl ? <img src={pkg.coverImageUrl} alt={pkg.title} className="h-full w-full object-cover" /> : <div className="absolute inset-0 flex items-center justify-center"><BookOpen className="h-16 w-16 text-white/30" /></div>}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-4 left-4 right-4">
          <Badge className="mb-1 bg-amber-100 text-amber-700"><FileText className="mr-1 h-3 w-3" />{t("pages:writtenDetail.typeBadge")}</Badge>
          <h1 className="truncate text-2xl font-bold text-white">{pkg.title}</h1>
          <div className="mt-1 flex items-center gap-3 text-sm text-white/85">
            {pkg.educatorName && <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" />{pkg.educatorName}</span>}
            {pkg.avgRating != null && <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5 text-amber-300" />{pkg.avgRating} ({pkg.reviewCount})</span>}
          </div>
        </div>
      </div>

      {/* Özellikler */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {features.map((f) => (
          <div key={f.label} className="rounded-xl border border-slate-200 bg-white p-3 text-center dark:border-gray-800 dark:bg-gray-900">
            <f.icon className="mx-auto mb-1 h-4 w-4 text-indigo-600" />
            <div className="text-sm font-bold text-slate-900 dark:text-gray-100">{f.value}</div>
            <div className="text-[11px] text-slate-500">{f.label}</div>
          </div>
        ))}
      </div>

      {/* Tanıtım metni */}
      {pkg.description && (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <p className="whitespace-pre-wrap text-slate-600 dark:text-gray-300">{pkg.description}</p>
        </div>
      )}
      <p className="mb-6 text-xs text-slate-500">{t("pages:writtenDetail.selfEvalNote")}</p>

      {/* Eğitici */}
      {pkg.educatorId && (
        <div className="mb-6 flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-700"><User className="h-5 w-5" /></div>
            <div>
              <div className="text-xs text-slate-500">{t("pages:writtenDetail.educatorTitle")}</div>
              <div className="font-semibold text-slate-900 dark:text-gray-100">{pkg.educatorName ?? "—"}</div>
            </div>
          </div>
          <Link to={`${buildPageUrl("EducatorProfile")}?id=${pkg.educatorId}`}>
            <Button variant="outline" size="sm">{t("pages:writtenDetail.viewEducator")}</Button>
          </Link>
        </div>
      )}

      {/* Satın alma */}
      {!purchased && (
        <div className="mb-6 flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div>
            <div className="text-xs text-slate-500">{t("pages:writtenDetail.priceLabel")}</div>
            <div className="text-xl font-bold text-slate-900 dark:text-gray-100">{priceLabel}</div>
          </div>
          <Button className="bg-indigo-600 text-white hover:bg-indigo-700" onClick={() => (user ? setPayOpen(true) : navigate(buildPageUrl("Login")))}>
            <ShoppingCart className="mr-2 h-4 w-4" />{t("pages:writtenDetail.buy")}
          </Button>
        </div>
      )}

      {/* Testler */}
      <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-gray-100">{t("pages:writtenDetail.testsTitle")}</h2>
      <ul className="space-y-2">
        {tests.map((test) => {
          const sl = stateLabel(test.state);
          const Icon = sl.icon;
          return (
            <li key={test.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
              <div className="min-w-0">
                <div className="truncate font-medium text-slate-900 dark:text-gray-100">{test.title}</div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                  <span>{test.questionCount} {t("pages:writtenDetail.questionsSuffix")}</span>
                  {test.isTimed && test.duration && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{test.duration} dk</span>}
                </div>
              </div>
              {purchased ? (
                <Link to={`${buildPageUrl("TakeWrittenTest")}?testId=${test.id}`}>
                  <Button size="sm" className="bg-indigo-600 text-white hover:bg-indigo-700"><Icon className="mr-1 h-4 w-4" />{sl.label}</Button>
                </Link>
              ) : (
                <Badge className="bg-slate-100 text-slate-500">{t("pages:writtenDetail.locked")}</Badge>
              )}
            </li>
          );
        })}
      </ul>

      {/* Puanlama / Değerlendirmeler */}
      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-gray-100">{t("pages:writtenDetail.reviewsTitle")}</h2>
          <div className="flex items-center gap-2">
            {reviewData.avg != null && (
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-600"><Star className="h-4 w-4" />{reviewData.avg} · {reviewData.count}</span>
            )}
            {purchased && (
              <Button variant="outline" size="sm" onClick={openReview}><MessageSquare className="mr-1 h-4 w-4" />{myReview ? t("pages:writtenDetail.editRate") : t("pages:writtenDetail.rate")}</Button>
            )}
          </div>
        </div>
        {reviewData.items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">{t("pages:writtenDetail.noReviews")}</p>
        ) : (
          <ul className="space-y-2">
            {reviewData.items.map((r) => (
              <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-800 dark:text-gray-200">{r.candidateName}</span>
                  <StarRating value={r.rating} readonly size="sm" />
                </div>
                {r.comment && <p className="mt-1 text-sm text-slate-600 dark:text-gray-400">{r.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <PaymentModal
        isOpen={payOpen}
        onClose={() => setPayOpen(false)}
        kind="written"
        test={{ id: pkg.id, title: pkg.title, price: pkg.priceCents / 100 }}
        onPurchased={() => { setPayOpen(false); refetchMine(); }}
      />

      {/* Değerlendirme modalı */}
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
