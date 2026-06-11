import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { createPageUrl } from "@/utils";
import { entities } from "@/api/dalClient";
import api from "@/lib/api/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PaymentModal } from "@/components/ui/PaymentModal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import StarRating from "@/components/ui/StarRating";
import {
  BookOpen,
  MessageSquare,
  TrendingUp,
  Star,
  User,
  CheckCircle,
  Award,
  ShoppingCart,
  ArrowLeft,
  Play,
  Eye,
  Bell,
  BellOff,
  RotateCcw,
  XCircle,
  Minus
} from "lucide-react";
import { toast } from "sonner";
import { useAppNavigate, useLoginRedirect } from "@/lib/navigation";
import { useServiceStatus } from "@/lib/useServiceStatus";

/**
 * TestDetail
 *
 * NOT: test.title, test.description, test.educator_name, test.exam_type_name,
 * review.comment, review.reviewer_name vb. user-generated alanlar
 * çevrilmez — sadece sabit UI metinleri i18n'lenir.
 */
export default function TestDetail() {
  const { t } = useTranslation(["pages"]);
  const [searchParams] = useSearchParams();
  const testId = searchParams.get("id");
  const queryClient = useQueryClient();

  const { user } = useAuth();
  const navigate = useAppNavigate();
  const loginUrl = useLoginRedirect();
  const { purchasesEnabled } = useServiceStatus();
  const [testRating, setTestRating] = useState(0);
  const [testComment, setTestComment] = useState("");
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  // Paket review modal'ı — yalnızca aday "Değerlendir" butonuna basınca açılır
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  // Reviews listesi paging — sayfa başına 10 yorum (1-bazlı)
  const REVIEWS_PER_PAGE = 10;
  const [reviewPage, setReviewPage] = useState(1);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [reportTest, setReportTest] = useState(null);

  const { data: purchases = [] } = useQuery({
    queryKey: ["purchases", user?.id, testId],
    queryFn: () => entities.Purchase.filter({ test_package_id: testId }),
    enabled: !!user && !!testId,
  });

  // Paket görüntülenmesini logla (fire-and-forget). Backend rate-limit ile
  // korunur; anonim oturumu eşleştirmek için localStorage'da kalıcı UUID.
  // Yalnızca testId varken ve sayfa ilk açıldığında 1 kez tetiklenir.
  useEffect(() => {
    if (!testId) return;
    let sessionId = null;
    try {
      sessionId = localStorage.getItem("ss_view_session");
      if (!sessionId) {
        sessionId = (crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
        localStorage.setItem("ss_view_session", sessionId);
      }
    } catch {
      // localStorage erişilmiyorsa sessionId null olarak gönderilir; backend yine viewerId ya da ipHash kullanır.
    }
    entities.PackageView.track(testId, sessionId);
  }, [testId]);

  const isPurchased = purchases.length > 0;

  const { data: test, isLoading, isError: isTestError } = useQuery({
    queryKey: ["test", testId],
    queryFn: async () => {
      const tests = await entities.TestPackage.filter({ id: testId });
      return tests[0] ?? null;
    },
    enabled: !!testId,
    staleTime: 60 * 1000,
    retry: 2,
  });

  // Eğitici kartı özet istatistikleri (test sayısı, satış, puan) — EducatorProfile ile aynı kaynak.
  // educator_email aslında eğitici id'si (UUID); /educators/:id stats döner. limit=1 ile payload minimal.
  const { data: educatorStats } = useQuery({
    queryKey: ["educatorStats", test?.educator_email],
    queryFn: async () => {
      const res = await api.get(`/educators/${encodeURIComponent(test.educator_email)}?limit=1`);
      return (res?.data ?? res)?.stats ?? null;
    },
    enabled: !!test?.educator_email,
    staleTime: 5 * 60 * 1000,
  });

  const { data: questions = [] } = useQuery({
    queryKey: ["questions", testId],
    queryFn: () => entities.Question.filter({ test_package_id: testId }),
    enabled: !!testId,
  });

  const { data: tests = [] } = useQuery({
    queryKey: ["tests_in_pkg", testId],
    queryFn: () => entities.Test.filter({ test_package_id: testId }, "order_index"),
    enabled: !!testId,
  });

  const realQuestionCount = questions.length;

  const { data: allTestResults = [] } = useQuery({
    queryKey: ["allTestResults", user?.id, testId],
    queryFn: () => entities.TestResult.filter({ user_email: user?.email, test_package_id: testId }),
    enabled: !!user && !!testId,
  });

  const { data: allTestProgress = [] } = useQuery({
    queryKey: ["allTestProgress", user?.id, testId],
    queryFn: () => entities.TestProgress.filter({ user_email: user?.email, test_package_id: testId, is_completed: false }),
    enabled: !!user && !!testId,
  });

  // hasCompletedTest artık kullanılmıyor (paket review butonu artık SUBMITTED şartına bağlı
  // değil — aday paketi aldıysa istediği an puanlayabilir; backend yine de en az bir
  // SUBMITTED attempt kontrolünü yapar ve değilse hata döner).
  // void allTestResults — query referansını koru, ileride başka yerde kullanılabilir
  void allTestResults;

  // Çok-denemeli durum: her test için Başla/Devam/İncele + kıyas (toplam skor).
  // Backend "bu tur" mantığını uygular (Purchase.attemptsResetAt sonrası başlayanlar).
  const { data: attemptStateData } = useQuery({
    queryKey: ["attemptState", testId, user?.id],
    queryFn: () => api.get(`/packages/${testId}/attempt-state`).then((r) => r?.data ?? r),
    enabled: isPurchased && !!user?.id && !!testId,
  });
  const stateByTest = new Map(((attemptStateData?.tests) || []).map((s) => [s.testId, s]));
  // Bu turda başlanmış/çözülmüş test yoksa "Paketi Yeniden Çöz" anlamsız (boş kayıt) — pasif.
  const hasResettableActivity = ((attemptStateData?.tests) || []).some(
    (s) => s.state === "IN_PROGRESS" || s.state === "COMPLETED",
  );

  // Paket-seviyesi "Yeniden Çöz": açık denemeleri finalize eder + tüm testleri sıfırlar.
  const resetMutation = useMutation({
    mutationFn: () => api.post(`/packages/${testId}/reset-attempts`),
    onSuccess: () => {
      toast.success(t("pages:testDetail.reset.done"));
      queryClient.invalidateQueries({ queryKey: ["attemptState", testId] });
      queryClient.invalidateQueries({ queryKey: ["allTestResults"] });
      queryClient.invalidateQueries({ queryKey: ["allTestProgress"] });
      // Home "Devam Et" + satın alma türevli listeler reset'i hemen yansıtsın
      // (aksi halde paket hard-refresh'e kadar listede kalıyordu).
      queryClient.invalidateQueries({ queryKey: ["home-owned-packages"] });
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      setResetConfirmOpen(false);
    },
    onError: () => {
      toast.error(t("pages:testDetail.reset.error"));
    },
  });

  // Aday paket için kendi review'u (yeni model: tek kayıt)
  const { data: myPackageReview } = useQuery({
    queryKey: ["myPackageReview", testId, user?.id],
    queryFn: () => entities.Review.myPackageReview(testId),
    enabled: !!user?.id && !!testId,
  });

  // Not: Form artık modal açılırken `openReviewModal()` ile pre-fill ediliyor.
  // Bu sayfa yüklenir yüklenmez form state'inin değiştirilmesine gerek yok.

  // Paket review listesi + ortalama — paginated (sayfa başına 10, prev/next).
  // Backend `count` alanı toplam adayı (offset'ten bağımsız) döner.
  // `keepPreviousData` ile sayfa geçişinde flicker olmaz.
  const { data: packageReviewData = { avg: null, count: 0, items: [] }, isFetching: isFetchingReviews } = useQuery({
    queryKey: ["packageReviews", testId, reviewPage, REVIEWS_PER_PAGE],
    queryFn: () =>
      entities.Review.packageReviews(testId, {
        limit: REVIEWS_PER_PAGE,
        offset: (reviewPage - 1) * REVIEWS_PER_PAGE,
      }),
    enabled: !!testId,
    keepPreviousData: true,
  });
  const reviews = packageReviewData.items.map((r) => ({
    id: r.candidateId,
    rating: r.rating,
    comment: r.comment,
    reviewer_name: r.candidateName,
    candidate_name: r.candidateName,
    created_date: r.createdAt,
    reviewer_email: r.candidateId,
  }));
  const avgRating = packageReviewData.avg != null
    ? Number(packageReviewData.avg).toFixed(1)
    : 0;
  const totalReviewPages = Math.max(1, Math.ceil((packageReviewData.count ?? 0) / REVIEWS_PER_PAGE));

  const { data: follows = [] } = useQuery({
    queryKey: ["follows", user?.id, test?.educator_email],
    queryFn: () => entities.Follow.filter({ educator_email: test.educator_email }),
    enabled: !!user && !!test?.educator_email,
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
          educator_email: test.educator_email,
          educator_name: test.educator_name,
          notifications_enabled: true
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["follows"] });
      toast.success(isFollowing ? t("pages:testDetail.educator.unfollowed") : t("pages:testDetail.educator.followed"));
    }
  });

  const handlePurchase = () => {
    if (!user) {
      navigate(loginUrl(), { replace: true });
      return;
    }
    if (!purchasesEnabled) {
      toast.warning(t("pages:testDetail.purchase.servicesPausedToast"));
      return;
    }
    setIsPaymentModalOpen(true);
  };

  const handleSubmitTestReview = async () => {
    if (testRating === 0 || !testId) return;
    try {
      await entities.Review.upsertPackageReview(testId, {
        rating: testRating,
        comment: testComment,
      });
      queryClient.invalidateQueries({ queryKey: ["myPackageReview", testId, user?.id] });
      queryClient.invalidateQueries({ queryKey: ["packageReviews", testId] });
      toast.success(myPackageReview
        ? t("pages:testDetail.rate.successUpdated")
        : t("pages:testDetail.rate.successSaved"));
      // Submit başarılı: modal'ı kapat
      setIsReviewModalOpen(false);
    } catch {
      toast.error(t("pages:testDetail.rate.errorGeneric"));
    }
  };

  // Modal açılış handler'ı — mevcut review varsa form pre-fill edilir (useEffect bunu zaten yapıyor)
  const openReviewModal = () => {
    if (myPackageReview?.rating != null) {
      setTestRating(myPackageReview.rating);
      setTestComment(myPackageReview.comment ?? "");
    } else {
      setTestRating(0);
      setTestComment("");
    }
    setIsReviewModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto animate-pulse">
        <div className="h-64 bg-slate-200 rounded-2xl mb-8" />
        <div className="h-8 bg-slate-200 rounded w-3/4 mb-4" />
        <div className="h-4 bg-slate-200 rounded w-1/2" />
      </div>
    );
  }

  if (!test) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold text-slate-900">
          {isTestError ? t("pages:testDetail.errorLoading") : t("pages:testDetail.notFound")}
        </h2>
        <p className="text-slate-500 mt-2 text-sm">
          {isTestError ? t("pages:testDetail.errorLoadingDesc") : t("pages:testDetail.notFoundDesc")}
        </p>
        <div className="flex gap-3 justify-center mt-4">
          {isTestError && (
            <button
              onClick={() => window.location.reload()}
              className="text-indigo-600 underline text-sm"
            >
              {t("pages:testDetail.reload")}
            </button>
          )}
          <Link to={createPageUrl("Explore")} className="text-indigo-600 inline-block text-sm">
            {t("pages:testDetail.backToTests")}
          </Link>
        </div>
      </div>
    );
  }

  const difficultyKey = test.difficulty || "medium";
  const difficultyColorClass = {
    easy: "bg-emerald-100 text-emerald-700",
    medium: "bg-amber-100 text-amber-700",
    hard: "bg-rose-100 text-rose-700",
  }[difficultyKey] || "bg-amber-100 text-amber-700";
  const difficultyLabel = t(`pages:testCard.difficulty.${difficultyKey}`);

  return (
    <div className="max-w-4xl mx-auto">
      <Link
        to={createPageUrl("Explore")}
        className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        {t("pages:testDetail.backToTests")}
      </Link>

      {/* Hero */}
      <div className="relative h-64 rounded-2xl overflow-hidden mb-8" style={{backgroundColor: test.cover_image ? 'transparent' : '#0000CD'}}>
        {test.cover_image ? (
          <img src={test.cover_image} alt={test.title} className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <BookOpen className="w-24 h-24 text-white/30" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute top-6 left-6">
          {/* test.exam_type_name user-generated — çevrilmez */}
          <Badge className="bg-white/90 text-slate-700">{test.exam_type_name || t("pages:testCard.examTypeFallback")}</Badge>
        </div>
        <div className="absolute bottom-6 right-6">
          <Badge className={`bg-white/90 ${difficultyColorClass}`}>
            {difficultyLabel}{test.has_solutions ? t("pages:testCard.solutionsSuffix") : ""}
          </Badge>
        </div>
        <div className="absolute bottom-6 left-6">
          {/* test.title user-generated — çevrilmez */}
          <h1 className="text-3xl font-bold text-white">{test.title}</h1>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-8">
          {/* Paket Genel Puanı — herkese görünür: avg + aday sayısı.
              Aday paketi aldıysa "Değerlendir / Puanı Güncelle" butonu da görünür;
              butona basınca modal açılır. */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 mb-1">
                  {t("pages:testDetail.packageRating.title")}
                </h2>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`w-6 h-6 ${
                          s <= Math.round(Number(avgRating))
                            ? "fill-amber-400 text-amber-400"
                            : "text-slate-200"
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-2xl font-bold text-slate-900">
                    {avgRating > 0 ? avgRating : "—"}
                  </span>
                  <span className="text-sm text-slate-500">
                    {t("pages:testDetail.packageRating.outOf")}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {packageReviewData.count > 0
                    ? t("pages:testDetail.packageRating.reviewerCount", { count: packageReviewData.count })
                    : t("pages:testDetail.packageRating.noReviews")}
                </p>
              </div>
              {/* Değerlendir butonu artık aşağıdaki "Yorumlar" başlık satırında (sağda) —
                  EducatorProfile ile aynı konum. */}
            </div>
          </div>

          {/* Description */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">{t("pages:testDetail.about.title")}</h2>
            <p className="text-slate-600 leading-relaxed">
              {/* test.description user-generated — çevrilmez, sadece yokken fallback i18n */}
              {test.description || t("pages:testDetail.about.noDescription")}
            </p>
          </div>

          {/* Educator */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">{t("pages:testDetail.educator.title")}</h2>
            <div className="flex items-center justify-between">
              <Link
                to={createPageUrl("EducatorProfile") + `?email=${encodeURIComponent(test.educator_email)}`}
                className="flex items-center gap-4 hover:opacity-80 transition-opacity"
              >
                <div className="w-14 h-14 bg-gradient-to-br from-indigo-100 to-violet-100 rounded-full flex items-center justify-center">
                  <User className="w-7 h-7 text-indigo-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900 hover:text-indigo-600 transition-colors">
                    {/* test.educator_name user-generated — çevrilmez */}
                    {test.educator_name || t("pages:testDetail.educator.fallbackName")}
                  </p>
                </div>
              </Link>
              {user && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => followMutation.mutate()}
                  disabled={followMutation.isPending}
                >
                  {isFollowing ? (
                    <><BellOff className="w-4 h-4 mr-1" /> {t("pages:testDetail.educator.following")}</>
                  ) : (
                    <><Bell className="w-4 h-4 mr-1" /> {t("pages:testDetail.educator.follow")}</>
                  )}
                </Button>
              )}
            </div>
            {/* Eğitici özet istatistikleri — test sayısı · satış · puan (Home/EducatorProfile kartıyla aynı) */}
            {educatorStats && (
              <div className="flex items-center flex-wrap gap-3 mt-4 text-sm text-slate-500">
                <span className="flex items-center gap-1">
                  <BookOpen className="w-4 h-4" aria-hidden="true" />
                  {t("pages:card.testsCount", { count: educatorStats.totalPublishedTests ?? 0 })}
                </span>
                {(educatorStats.totalPurchases ?? 0) > 0 && (
                  <span className="flex items-center gap-1">
                    <TrendingUp className="w-4 h-4 text-emerald-500" aria-hidden="true" />
                    {t("pages:card.salesCount", { count: educatorStats.totalPurchases })}
                  </span>
                )}
                {educatorStats.ratingAvg != null && Number(educatorStats.ratingAvg) > 0 && (
                  <span className="flex items-center gap-1 font-medium text-amber-600">
                    <Star className="w-4 h-4 fill-amber-400 text-amber-400" aria-hidden="true" />
                    {Number(educatorStats.ratingAvg).toFixed(1)}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Features */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">{t("pages:testDetail.features.title")}</h2>
            <div className="grid grid-cols-2 gap-4">
              {test.test_count > 0 && (
                <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl">
                  <BookOpen className="w-5 h-5 text-indigo-600" />
                  <div>
                    <p className="text-sm text-slate-500">{t("pages:testDetail.features.testCount")}</p>
                    <p className="font-semibold text-slate-900">{test.test_count}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl">
                <BookOpen className="w-5 h-5 text-indigo-600" />
                <div>
                  <p className="text-sm text-slate-500">{t("pages:testDetail.features.questionCount")}</p>
                  {/* Paket toplam soru sayısı (tüm testlerin toplamı) — tek testin değil.
                      test.question_count adapter'da paketin tüm testlerinin toplamıdır. */}
                  <p className="font-semibold text-slate-900">{test.question_count ?? realQuestionCount}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl">
                <Award className="w-5 h-5 text-indigo-600" />
                <div>
                  <p className="text-sm text-slate-500">{t("pages:testDetail.features.difficulty")}</p>
                  <p className="font-semibold text-slate-900">{difficultyLabel}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl">
                <Star className="w-5 h-5 text-amber-500" />
                <div>
                  <p className="text-sm text-slate-500">{t("pages:testDetail.features.rating")}</p>
                  <p className="font-semibold text-slate-900">
                    {avgRating > 0 ? avgRating : "-"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar - Purchase Card */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sticky top-24">
            {!isPurchased && (
              <div className="text-center mb-6">
                <p className="text-4xl font-bold text-slate-900">
                  {test.price === 0 ? t("pages:testCard.free") : `₺${test.price || 0}`}
                </p>
                {test.total_sales > 0 && (
                  <p className="text-sm text-slate-500 mt-2">
                    {t("pages:testDetail.purchase.totalSales", { count: test.total_sales })}
                  </p>
                )}
              </div>
            )}

            {isPurchased ? (
              <div className="space-y-3">
                <h3 className="font-semibold text-slate-900 mb-3">{t("pages:testDetail.purchase.testsListTitle")}</h3>
                {tests.map((testItem) => {
                  const testQuestionsCount =
                    testItem.question_count ??
                    questions.filter((q) => q.test_id === testItem.id).length;
                  const testResult = allTestResults.find(r => r.test_id === testItem.id);
                  const testProgress = allTestProgress.find(p => p.test_id === testItem.id);

                  // Çok-denemeli: backend "bu tur" durumunu verir; yoksa eski mantığa düş.
                  const st = stateByTest.get(testItem.id);
                  const state = st?.state || (testResult ? 'COMPLETED' : testProgress ? 'IN_PROGRESS' : 'NEW');
                  const isCompleted = state === 'COMPLETED';
                  const isInProgress = state === 'IN_PROGRESS';

                  let buttonStyle = { backgroundColor: '#0000CD' };
                  if (isCompleted) buttonStyle = { backgroundColor: '#64748b' };
                  else if (isInProgress) buttonStyle = { backgroundColor: '#f59e0b' };

                  const buttonInner = (
                    <>
                      <div className="text-left">
                        {/* testItem.title user-generated — çevrilmez */}
                        <p className="font-medium">{testItem.title}</p>
                        <p className="text-xs opacity-90 mt-0.5">
                         {t("pages:testDetail.purchase.testMeta", {
                           questions: testQuestionsCount,
                           minutes: testItem.duration_minutes || 60,
                         })}
                        </p>
                      </div>
                      {isCompleted ? (
                        <div className="flex items-center gap-1">
                          <Eye className="w-4 h-4" />
                          <span className="text-xs">{t("pages:testCard.review")}</span>
                        </div>
                      ) : isInProgress ? (
                        <div className="flex items-center gap-1">
                          <Play className="w-4 h-4" />
                          <span className="text-xs">{t("pages:testCard.continue")}</span>
                        </div>
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </>
                  );

                  // Tamamlanmış test → "İncele" doğrudan götürmez; önce deneme
                  // raporu popup'ı açılır (kıyas + tarih), oradan "Çözümleri İncele".
                  if (isCompleted) {
                    return (
                      <Button
                        key={testItem.id}
                        style={buttonStyle}
                        onClick={() => setReportTest({ item: testItem, st })}
                        className="w-full justify-between h-auto py-3 hover:opacity-90 text-white border-2 border-white shadow-sm"
                      >
                        {buttonInner}
                      </Button>
                    );
                  }

                  // NEW/IN_PROGRESS: ana buton Başla/Devam. Geçmiş tur(lar) varsa yanına
                  // "geçmiş incele" butonu — bu turda tamamlanmasa bile önceki turların
                  // raporu/çözümü açılabilsin (reset sonrası 1. tur incelemesi).
                  const hasPastAttempts = Array.isArray(st?.attempts) && st.attempts.length > 0;
                  return (
                    <div key={testItem.id} className="flex items-stretch gap-2">
                      <Link
                        to={createPageUrl("TakeTest") + `?id=${testItem.id}`}
                        className="flex-1 min-w-0"
                      >
                        <Button
                          style={buttonStyle}
                          className="w-full justify-between h-auto py-3 hover:opacity-90 text-white border-2 border-white shadow-sm"
                        >
                          {buttonInner}
                        </Button>
                      </Link>
                      {hasPastAttempts && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setReportTest({ item: testItem, st })}
                          title={t("pages:testDetail.attempts.pastReview")}
                          aria-label={t("pages:testDetail.attempts.pastReview")}
                          className="flex-shrink-0 h-auto px-3 border-2 border-slate-200 text-slate-600 hover:border-indigo-400 hover:text-indigo-700"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  );
                })}

                {/* "11. test gibi" — test listesinin altında paket-seviyesi yeniden çöz */}
                <button
                  type="button"
                  onClick={() => setResetConfirmOpen(true)}
                  disabled={!hasResettableActivity}
                  title={!hasResettableActivity ? t("pages:testDetail.reset.disabledHint") : undefined}
                  className="w-full rounded-xl border-2 border-dashed border-slate-300 text-slate-600 py-3 flex items-center justify-center gap-2 text-sm font-medium min-h-12 enabled:hover:border-indigo-400 enabled:hover:bg-indigo-50/50 enabled:hover:text-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RotateCcw className="w-4 h-4" />
                  {t("pages:testDetail.reset.button")}
                </button>

                <Dialog open={!!reportTest} onOpenChange={(o) => !o && setReportTest(null)}>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>{t("pages:testDetail.attempts.title")}</DialogTitle>
                      {/* test başlığı user-generated — çevrilmez */}
                      <DialogDescription>{reportTest?.item?.title}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 mt-1">
                      {(reportTest?.st?.attempts || []).length > 0 ? (
                        (reportTest?.st?.attempts || []).map((a) => (
                          // Her satır → O DENEMENİN çözümleri (attemptId ile review).
                          <Link
                            key={a.attemptId}
                            to={reportTest ? createPageUrl("TakeTest") + `?id=${reportTest.item.id}&review=true&attemptId=${a.attemptId}` : "#"}
                            onClick={() => setReportTest(null)}
                            className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 text-sm hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors group min-h-12"
                          >
                            <span className="flex items-center gap-3 min-w-0">
                              <span className="font-medium text-slate-700 group-hover:text-indigo-700 whitespace-nowrap">
                                {t("pages:testDetail.attempts.item", { n: a.attemptNumber })}
                              </span>
                              {/* Doğru / Boş / Yanlış — "Cevaplarım" gösterimi */}
                              <span
                                className="flex items-center gap-2 text-xs font-medium"
                                aria-label={t("pages:testDetail.attempts.counts", {
                                  correct: a.correct ?? 0,
                                  empty: a.empty ?? 0,
                                  wrong: a.wrong ?? 0,
                                })}
                              >
                                <span className="inline-flex items-center gap-0.5 text-emerald-600" aria-hidden="true">
                                  <CheckCircle className="w-3.5 h-3.5" />{a.correct ?? 0}
                                </span>
                                <span className="inline-flex items-center gap-0.5 text-slate-400" aria-hidden="true">
                                  <Minus className="w-3.5 h-3.5" />{a.empty ?? 0}
                                </span>
                                <span className="inline-flex items-center gap-0.5 text-rose-500" aria-hidden="true">
                                  <XCircle className="w-3.5 h-3.5" />{a.wrong ?? 0}
                                </span>
                              </span>
                            </span>
                            <span className="flex items-center gap-2 flex-shrink-0">
                              {a.submittedAt && (
                                <span className="text-xs text-slate-400 hidden sm:inline">
                                  {new Date(a.submittedAt).toLocaleDateString()}
                                </span>
                              )}
                              <Eye className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" />
                            </span>
                          </Link>
                        ))
                      ) : (
                        <p className="text-sm text-slate-500">{t("pages:testDetail.attempts.empty")}</p>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-2">{t("pages:testDetail.attempts.reviewHint")}</p>
                  </DialogContent>
                </Dialog>

                <Dialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>{t("pages:testDetail.reset.confirmTitle")}</DialogTitle>
                      <DialogDescription>{t("pages:testDetail.reset.confirmDesc")}</DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end gap-2 mt-2">
                      <Button
                        variant="outline"
                        onClick={() => setResetConfirmOpen(false)}
                        disabled={resetMutation.isPending}
                      >
                        {t("pages:testDetail.reset.cancel")}
                      </Button>
                      <Button
                        className="bg-rose-600 hover:bg-rose-700 text-white"
                        onClick={() => resetMutation.mutate()}
                        disabled={resetMutation.isPending}
                      >
                        {resetMutation.isPending ? "…" : t("pages:testDetail.reset.confirmCta")}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            ) : (
              !purchasesEnabled ? (
                <div className="w-full rounded-xl border-2 border-amber-200 bg-amber-50 px-4 py-3 text-center">
                  <p className="text-sm font-semibold text-amber-800">{t("pages:testDetail.purchase.servicesPaused")}</p>
                  <p className="text-xs text-amber-600 mt-1">{t("pages:testDetail.purchase.servicesPausedDesc")}</p>
                </div>
              ) : (
                <Button
                  className="w-full h-12 bg-indigo-600 hover:bg-indigo-700"
                  onClick={handlePurchase}
                >
                  <ShoppingCart className="w-5 h-5 mr-2" />
                  {t("pages:testCard.buy")}
                </Button>
              )
            )}

            <div className="mt-6 space-y-3">
              {[
                t("pages:testDetail.purchase.features.unlimitedAccess"),
                t("pages:testDetail.purchase.features.detailedSolutions"),
                t("pages:testDetail.purchase.features.performanceAnalysis"),
                t("pages:testDetail.purchase.features.mobileFriendly"),
              ].map((feature, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm text-slate-600">
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                  {feature}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Reviews — sayfa en altında, tam genişlik, kendi içinde paging (sayfa başına 10) */}
      {/* Yorumlar — paket yorum/puanları; EducatorProfile ile aynı yapı (her zaman görünür).
          Değerlendir/Puanı Güncelle butonu başlık satırında sağda — aday paketi aldıysa. */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 mt-8">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-lg font-semibold text-slate-900">
              {t("pages:testDetail.reviews.title")}
              <span className="ml-2 text-sm font-normal text-slate-500">
                ({packageReviewData.count})
              </span>
            </h2>
            <div className="flex items-center gap-3">
              {totalReviewPages > 1 && (
                <p className="text-sm text-slate-500">
                  {t("pages:testDetail.reviews.pageOf", { current: reviewPage, total: totalReviewPages })}
                </p>
              )}
              {user && isPurchased && (
                <Button
                  onClick={openReviewModal}
                  size="sm"
                  className="flex-shrink-0 bg-indigo-600 hover:bg-indigo-700"
                >
                  <Star className="w-4 h-4 mr-1.5" aria-hidden="true" />
                  {myPackageReview
                    ? t("pages:testDetail.packageRating.updateButton")
                    : t("pages:testDetail.packageRating.rateButton")}
                </Button>
              )}
            </div>
          </div>
          {reviews.length === 0 ? (
            <div className="text-center py-10">
              <MessageSquare className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">{t("pages:testDetail.packageRating.noReviews")}</p>
            </div>
          ) : (
          <>
          <div className={`space-y-4 ${isFetchingReviews ? "opacity-60" : ""}`}>
            {reviews.map((review) => (
              <div key={review.id} className="pb-4 border-b border-slate-100 last:border-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`w-4 h-4 ${
                          s <= Math.round(review.rating)
                            ? "fill-amber-400 text-amber-400"
                            : "text-slate-200"
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-sm font-medium text-slate-700">
                    {Number(review.rating).toFixed(1)}
                  </span>
                  {/* review.reviewer_name user-generated — çevrilmez */}
                  <span className="text-sm text-slate-500">
                    — {review.reviewer_name || t("pages:testDetail.reviews.unknownCandidate")}
                  </span>
                </div>
                {/* review.comment user-generated — çevrilmez */}
                {review.comment && (
                  <p className="text-sm text-slate-600">{review.comment}</p>
                )}
              </div>
            ))}
          </div>

          {/* Paging kontrolü — prev / pageinfo / next */}
          {totalReviewPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6 pt-4 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReviewPage((p) => Math.max(1, p - 1))}
                disabled={reviewPage <= 1 || isFetchingReviews}
              >
                {t("pages:testDetail.reviews.prev")}
              </Button>
              <span className="text-sm text-slate-600 mx-3">
                {t("pages:testDetail.reviews.pageOf", { current: reviewPage, total: totalReviewPages })}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReviewPage((p) => Math.min(totalReviewPages, p + 1))}
                disabled={reviewPage >= totalReviewPages || isFetchingReviews}
              >
                {t("pages:testDetail.reviews.next")}
              </Button>
            </div>
          )}
          </>
          )}
        </div>

      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        test={test}
      />

      {/* Paket Puanlama Modal — sadece aday "Değerlendir" / "Puanı Güncelle" butonuna basınca açılır.
          Submit başarılı olduğunda handleSubmitTestReview içinden kapatılır. */}
      <Dialog open={isReviewModalOpen} onOpenChange={setIsReviewModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {myPackageReview
                ? t("pages:testDetail.rate.titleUpdate")
                : t("pages:testDetail.rate.title")}
            </DialogTitle>
            <DialogDescription>
              {myPackageReview
                ? t("pages:testDetail.rate.updateAvailable")
                : t("pages:testDetail.rate.shareExperience")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <StarRating value={testRating} onChange={setTestRating} size="lg" />
              {testRating > 0 && (
                <span className="text-lg font-medium text-slate-700">{testRating}/5</span>
              )}
            </div>
            <Textarea
              placeholder={t("pages:testDetail.rate.commentPlaceholder")}
              value={testComment}
              onChange={(e) => setTestComment(e.target.value)}
              rows={4}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setIsReviewModalOpen(false)}
              >
                {t("pages:testDetail.rate.cancel")}
              </Button>
              <Button
                onClick={handleSubmitTestReview}
                disabled={testRating === 0 || !testId}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {myPackageReview
                  ? t("pages:testDetail.rate.submitUpdate")
                  : t("pages:testDetail.rate.submitNew")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
