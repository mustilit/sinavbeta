import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { entities } from "@/api/dalClient";
import api from "@/lib/api/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Clock,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Flag,
  AlertCircle,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Lightbulb,
  Grid3x3,
  Trash2,
  Pencil,
  Eraser,
  Save,
  LogOut,
  Rocket,
  FastForward,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import ReportQuestionModal from "@/components/test/ReportQuestionModal";
import StarRating from "@/components/ui/StarRating";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ZoomableImage from "@/components/ZoomableImage";
import { buildPageUrl, useAppNavigate, useLoginRedirect } from "@/lib/navigation";
import { useServiceStatus } from "@/lib/useServiceStatus";
import OnboardingTour from "@/components/onboarding/OnboardingTour";
import { useShouldShowTour, useCompleteTour, TOUR_KEYS } from "@/lib/useOnboarding";
import { CANDIDATE_TEST_STEPS } from "@/components/onboarding/tourSteps";
// Offline koruma: bağlantı koptuğunda otomatik kaydet ve çık
import { useOffline } from "@/lib/useOffline";
// Cevap kuyruğu: offline iken cevapları localStorage'da beklet
import { useAnswerQueue } from "@/lib/useAnswerQueue";
// Proctoring: anti-leak / anti-cheat eventleri yakala ve sunucuya raporla
import { useTestProctoring } from "@/lib/useTestProctoring";
import { TestWatermark } from "@/components/test/TestWatermark";
// Offline overlay bileşeni
import OfflineBanner from "@/components/ui/OfflineBanner";
import QuestionCanvas from "@/components/test/QuestionCanvas";

// Map Dal question/options to Sınav Salonu format.
// `stateQuestions`: GetAttemptStateUseCase response. Snapshot-based içerik
// burada gelir — eğitici sonradan soruyu güncellese bile kullanıcı satın alma
// anındaki versiyonu görür. isCorrect yalnızca attempt SUBMITTED/TIMEOUT
// durumdayken backend tarafından açılır; IN_PROGRESS sırasında undefined.
function toUIStyle(stateQuestions) {
  const letters = ["A", "B", "C", "D", "E"];
  return (stateQuestions || []).map((q) => {
    const options = (q.options || []).map((o) => ({
      id: o.id,
      content: o.content ?? "",
      mediaUrl: o.mediaUrl ?? null,
      isCorrect: o.isCorrect ?? o.is_correct, // submit sonrası açık olur
    }));
    const correctIdx = options.findIndex((o) => o.isCorrect);
    const correctLetter = correctIdx >= 0 ? letters[correctIdx] : null;
    const optMap = {};
    letters.forEach((l, i) => {
      if (options[i]) {
        optMap[`option_${l.toLowerCase()}`] = options[i].content;
      }
    });
    const selectedOptionId = q.selectedOptionId ?? null;
    const selectedLetter = selectedOptionId
      ? letters[options.findIndex((o) => o.id === selectedOptionId)]
      : null;
    return {
      id: q.id,
      question_text: q.content ?? "",
      mediaUrl: q.mediaUrl ?? null,
      correct_answer: correctLetter,
      ...optMap,
      options,
      selectedOptionId,
      selected_answer: selectedLetter,
      explanation: q.solutionText || null,
      solutionMediaUrl: q.solutionMediaUrl || null,
    };
  });
}

export default function TakeTest() {
  const urlParams = new URLSearchParams(window.location.search);
  const testId = urlParams.get("id");
  const attemptIdParam = urlParams.get("attemptId");
  const isReviewMode = urlParams.get("review") === "true";

  const { user } = useAuth();
  const navigate = useAppNavigate();
  const loginUrl = useLoginRedirect();
  const showTestTour = useShouldShowTour(TOUR_KEYS.CANDIDATE_TEST);
  const completeTour = useCompleteTour();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [flagged, setFlagged] = useState(new Set());
  const [timeLeft, setTimeLeft] = useState(null);
  const [testStarted, setTestStarted] = useState(false);
  const [testFinished, setTestFinished] = useState(false);
  const [result, setResult] = useState(null);
  const [startTime, setStartTime] = useState(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [showAnswerSheet, setShowAnswerSheet] = useState(false);
  const [activeAttemptId, setActiveAttemptId] = useState(attemptIdParam);
  const [testRating, setTestRating] = useState(0);
  // Eğitici puanı şu an UI'da gösterilmiyor (yeni model: paket başına tek review)
  const [testComment, setTestComment] = useState("");
  // Test çözme modu: 'normal' (aday navigasyonu kendi yapar) veya 'serial'
  // (cevap verdikçe otomatik bir sonraki soruya geçer). Pre-start ekranında
  // seçilir; aktif session boyunca sabit kalır. localStorage'a yedeklenir ki
  // resume'da kullanıcı seçtiği modda devam edebilsin.
  const [testMode, setTestMode] = useState(() => {
    if (typeof window === 'undefined') return 'normal';
    return localStorage.getItem('testMode_default') === 'serial' ? 'serial' : 'normal';
  });
  // Süre aşımı modu: timer sıfıra geldiğinde true, test hâlâ çözülebilir
  const [isOvertime, setIsOvertime] = useState(false);
  // Süre aşımı sayacı (saniye cinsinden, timer'ın üstüne eklenir)
  const [overtimeElapsed, setOvertimeElapsed] = useState(0);
  // Süresiz test için geçen süre (saniye) — localStorage ile persist edilir
  const [elapsedSec, setElapsedSec] = useState(0);
  // Çizim modu
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [hasDrawings, setHasDrawings] = useState(false);
  const canvasRef = useRef(null);
  const navScrollRef = useRef(null);
  const answerSheetScrollRef = useRef(null);
  // Proctoring container — UX engelleri bu DOM altında uygulanır
  const proctorContainerRef = useRef(null);
  const [showExitWarning, setShowExitWarning] = useState(false);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  // Her 3 cevapta bir DB checkpoint tetiklemek için sayaç
  const checkpointCountRef = useRef(0);
  const [navAtTop, setNavAtTop] = useState(true);
  const [navAtBottom, setNavAtBottom] = useState(false);

  // Soru değişince çizim modunu kapat (canvas kendi çizgilerini zaten sıfırlar)
  useEffect(() => {
    setIsDrawingMode(false);
    setHasDrawings(false);
  }, [currentIndex]);

  const { data: purchases = [], isLoading: loadingPurchases } = useQuery({
    queryKey: ["purchases", user?.id, testId],
    queryFn: () => entities.Purchase.filter({ test_package_id: testId }),
    enabled: !!user && !!testId,
  });

  const purchase = purchases[0];
  // ÖNEMLİ: Paket satın alımında purchase.attempt, paketin testId alanıyla eşleşen
  // tek bir testin attempt'ıdır. Paket içindeki BAŞKA bir teste açtığımızda bu
  // attempt YANLIŞTIR. Bu yüzden:
  //   1) Önce purchase.attempts[] (paketteki tüm testlerin attempt'ları) içinden
  //      şu anki testId ile eşleşen attempt'ı ara,
  //   2) yoksa purchase.attempt'ı sadece testId eşleşiyorsa kullan.
  const attemptFromPackage = Array.isArray(purchase?.attempts)
    ? purchase.attempts.find((a) => a?.testId === testId) ?? null
    : null;
  const attemptFromPurchase =
    attemptFromPackage ??
    (purchase?.test?.id === testId || purchase?.testId === testId
      ? purchase?.attempt
      : null);
  const resolvedAttemptId = activeAttemptId || attemptFromPurchase?.id;

  useEffect(() => {
    if (attemptFromPurchase?.id && !activeAttemptId) {
      setActiveAttemptId(attemptFromPurchase.id);
    }
  }, [attemptFromPurchase?.id, activeAttemptId]);

  const { data: attemptState } = useQuery({
    queryKey: ["attemptState", resolvedAttemptId],
    queryFn: () => entities.Attempt.getState(resolvedAttemptId),
    enabled: !!resolvedAttemptId && !!user,
  });

  // Test meta verisini her zaman yükle (pre-start ekranı + attempt başlatma için)
  const { data: testDetail } = useQuery({
    queryKey: ["testDetail", testId],
    queryFn: async () => {
      const { data } = await api.get(`/tests/${testId}`);
      return data;
    },
    enabled: !!testId,
  });

  // Erişim belirlendi mi? — /me/purchases zaten hem testId hem packageId ile eşleşiyor
  const accessDetermined = !!testDetail && !loadingPurchases;
  const hasAccess = purchases.length > 0;

  // useMemo: questions her render'da yeni referans almasın (useEffect döngüsünü kırar).
  // İçerik tamamen attemptState (snapshot) üzerinden gelir — eğitici güncellemeleri
  // mevcut adaylara sızmaz.
  const questions = useMemo(
    () => attemptState ? toUIStyle(attemptState.questions || []) : [],
    [attemptState]
  );
  const isLoading = !!resolvedAttemptId && !!user && !attemptState;

  const test = testDetail
    ? {
        id: testDetail.id,
        title: testDetail.title,
        is_timed: testDetail.isTimed,
        duration_minutes: testDetail.duration,
        has_solutions: testDetail.hasSolutions,
      }
    : null;

  const testPackage = testDetail
    ? {
        id: testDetail.id,
        title: testDetail.title,
        educator_email: testDetail.educatorId,
        educator_name: testDetail.educator?.username || "",
      }
    : null;

  const previousResult = attemptState?.attempt?.status === "SUBMITTED" || attemptState?.attempt?.status === "TIMEOUT"
    ? attemptState
    : null;

  const { data: resultData } = useQuery({
    queryKey: ["attemptResult", resolvedAttemptId],
    queryFn: () => entities.Attempt.getResult(resolvedAttemptId),
    enabled: !!resolvedAttemptId && !!user && testFinished,
  });

  // Paket context: packageId, paketteki test sayısı (bu testin paketinin tüm üyeleri).
  // Yeni model: review per-package — son test bitince modal paket puanını sorar.
  const packageId = testDetail?.packageId ?? null;

  const { data: packageTests = [] } = useQuery({
    queryKey: ["package_tests_count", packageId],
    queryFn: () => entities.Test.filter({ test_package_id: packageId }),
    enabled: !!packageId,
  });

  const { data: allResults = [] } = useQuery({
    queryKey: ["packageResults", packageId, user?.id],
    queryFn: () => entities.TestResult.filter({ user_email: user?.email, test_package_id: packageId }),
    enabled: !!packageId && !!user && testFinished,
  });

  // Paket için mevcut review (yeni model — tek kayıt)
  const { data: existingPackageReview } = useQuery({
    queryKey: ["myPackageReview", packageId, user?.id],
    queryFn: () => entities.Review.myPackageReview(packageId),
    enabled: !!user?.email && !!packageId && testFinished,
  });

  // Bu test paketin SON TAMAMLANAN testi mi? → review modal'ı sadece o zaman çıkar.
  // Sayım: paketteki test sayısı === adayın paket için SUBMITTED attempt sayısı.
  const isLastTestInPackage =
    packageTests.length > 0 && allResults.length >= packageTests.length;

  // Pre-fill: paket için mevcut puan varsa formu doldur
  useEffect(() => {
    if (existingPackageReview?.rating != null) {
      setTestRating(existingPackageReview.rating);
      if (typeof existingPackageReview.comment === "string") {
        setTestComment(existingPackageReview.comment);
      }
    }
  }, [existingPackageReview]);

  useEffect(() => {
    if (isReviewMode && previousResult && questions.length > 0) {
      const answersMap = {};
      questions.forEach((q) => {
        if (q.selected_answer) answersMap[q.id] = q.selected_answer;
      });
      setAnswers(answersMap);
      setTestStarted(true);
    }
  }, [isReviewMode, previousResult, questions.length]);

  // Cevap restoration — PAUSED + IN_PROGRESS her ikisinde de tetiklenir.
  // Önceki versiyonda yalnızca IN_PROGRESS koşulu vardı; bu durumda kullanıcı
  // PAUSED bir test'i açtığında (Teste Başla'dan önce ve sonra) bir RACE
  // yaşanıyordu: refetch IN_PROGRESS'e dönmeden render olursa setAnswers
  // çalışmıyor, bazı cevaplar grid'de görünmüyordu (örnek: ilk dönüşte Q4
  // boş, ikinci dönüşte cevaplı). PAUSED state'te de setAnswers fire ederek
  // state hızla yüklenir, sonra IN_PROGRESS geçişi sadece timer'ı başlatır.
  useEffect(() => {
    if (!attemptState || questions.length === 0 || isReviewMode) return;
    const status = attemptState.attempt?.status;
    if (status !== "IN_PROGRESS" && status !== "PAUSED") return;

    const answersMap = {};
    questions.forEach((q) => {
      if (q.selected_answer) answersMap[q.id] = q.selected_answer;
    });
    setAnswers(answersMap);

    // UI state recovery (flagged + currentIndex) her iki durumda da
    try {
      const uiRaw = localStorage.getItem(`takeTestUi_${resolvedAttemptId}`);
      if (uiRaw) {
        const ui = JSON.parse(uiRaw);
        if (Array.isArray(ui.flagged)) {
          setFlagged(new Set(ui.flagged.filter((id) => questions.some((q) => q.id === id))));
        }
        if (typeof ui.currentIndex === "number" && ui.currentIndex >= 0 && ui.currentIndex < questions.length) {
          setCurrentIndex(ui.currentIndex);
        }
      }
    } catch { /* sessiz */ }

    // Yalnızca IN_PROGRESS'te: timer + testStarted ve elapsed setup
    if (status === "IN_PROGRESS") {
      if (typeof attemptState.attempt?.remainingSeconds === "number") {
        setTimeLeft(attemptState.attempt.remainingSeconds);
      }
      if (!testDetail?.isTimed && resolvedAttemptId) {
        const fromStorage = parseInt(localStorage.getItem(`elapsed_${resolvedAttemptId}`) || '0', 10);
        const fromDb = attemptState.attempt?.savedElapsedSeconds ?? 0;
        const elapsed = (fromStorage > 0) ? fromStorage : fromDb;
        setElapsedSec(isNaN(elapsed) ? 0 : elapsed);
      }
      setTestStarted(true);
      const started = attemptState.attempt?.startedAt ? new Date(attemptState.attempt.startedAt).getTime() : Date.now();
      setStartTime(started);
    }
  }, [attemptState, questions, isReviewMode, resolvedAttemptId, testDetail?.isTimed]);

  // UI state persist — flagged ve currentIndex localStorage'a yazılır.
  // Tarayıcı kapansa bile aday tam kaldığı yere dönebilir.
  useEffect(() => {
    if (!resolvedAttemptId || !testStarted || isReviewMode) return;
    try {
      localStorage.setItem(
        `takeTestUi_${resolvedAttemptId}`,
        JSON.stringify({
          flagged: Array.from(flagged),
          currentIndex,
          savedAt: Date.now(),
        }),
      );
    } catch { /* sessiz */ }
  }, [flagged, currentIndex, resolvedAttemptId, testStarted, isReviewMode]);

  // Reset solution panel when navigating between questions
  useEffect(() => {
    setShowSolution(false);
  }, [currentIndex]);

  const reportQuestionMutation = useMutation({
    mutationFn: (data) =>
      entities.Objection.create({
        attempt_id: resolvedAttemptId,
        question_id: questions[currentIndex]?.id,
        reason: (data.reason || data.description || '').trim() || `Hata türü: ${data.report_type || 'diğer'}`,
      }),
    onSuccess: () => {
      toast.success("Hata bildirimi gönderildi");
      setShowReportModal(false);
    },
  });

  // Backend hatalarından anlamlı mesaj çıkar — Nest filtre çıktısı veya plain Axios
  // hatasını uyumlu okur. Bilinmiyorsa generic mesaj döner.
  const extractErrorMessage = (err, fallback) => {
    const d = err?.response?.data;
    return (
      d?.error?.message ||
      d?.message ||
      d?.error?.code ||
      d?.code ||
      err?.message ||
      fallback
    );
  };

  // Paket review submit — yeni domain: 1 aday × 1 paket = 1 review (test bazında değil)
  const handleSubmitTestReview = async () => {
    if (testRating === 0 || !packageId) return;
    try {
      await entities.Review.upsertPackageReview(packageId, {
        rating: testRating,
        comment: testComment,
      });
      queryClient.invalidateQueries({ queryKey: ["myPackageReview", packageId, user?.id] });
      queryClient.invalidateQueries({ queryKey: ["packageReviews", packageId] });
      toast.success(
        existingPackageReview
          ? "Paket puanınız güncellendi!"
          : "Paket puanınız kaydedildi!",
      );
    } catch (err) {
      const msg = extractErrorMessage(err, "Paket puanı kaydedilemedi");
      console.error("[TakeTest] handleSubmitTestReview failed:", err);
      toast.error(msg);
    }
  };

  const queryClient = useQueryClient();

  // ─── Offline & cevap kuyruğu ─────────────────────────────────────────────

  // saveAndExit tanımı — offline auto-exit callback'i için önceden tanımla
  const handleSaveAndExit = useCallback(async () => {
    toast.info("Bağlantı kesildi — ilerlemeniz kaydedildi, çıkılıyor...");
    // Offline'sa pause çağrısı muhtemelen başarısız ama deneriz
    if (activeAttemptId || attemptFromPurchase?.id) {
      try {
        await api.post(`/attempts/${activeAttemptId ?? attemptFromPurchase?.id}/pause`);
      } catch {}
    }
    setTimeout(() => {
      navigate(createPageUrl("MyTests"), { replace: true });
    }, 1500);
  }, [navigate, activeAttemptId, attemptFromPurchase]);

  // Bağlantı kesintisi yönetimi: 30 saniye bağlanamazsa otomatik çık
  const { isOffline, remainingSeconds } = useOffline({
    // Test aktifken (başladıktan sonra, bitmeden önce) offline koruması çalışsın
    enabled: testStarted && !testFinished && !isReviewMode,
    onAutoExit: handleSaveAndExit,
    autoExitSeconds: 30,
  });

  // localStorage destekli cevap kuyruğu
  const { submitAnswer: queuedSubmitAnswer, pendingCount, isFlushing, clearQueue, flush: flushQueue } = useAnswerQueue(
    resolvedAttemptId ?? null,
  );

  // Attempt oluştur/başlat: POST /tests/:id/start
  const startAttemptMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/tests/${testId}/start`);
      return data; // { attemptId, remainingSec }
    },
    onSuccess: async (data) => {
      setActiveAttemptId(data.attemptId);
      setTestStarted(true);
      // Aday test başlatınca fullscreen iste — kullanıcı izin vermezse
      // exit sayacı zaten devreye girer ve eğitici bunu raporda görür.
      setTimeout(() => enterFullscreen(), 100);
      const now = Date.now();
      setStartTime(now);
      if (test?.is_timed && data.remainingSec) {
        setTimeLeft(data.remainingSec);
      } else if (test?.is_timed && test?.duration_minutes) {
        setTimeLeft(test.duration_minutes * 60);
      }
      // KRİTİK SIRA: önce queue'yu flush (geçen oturumdan kuyrukta kalmış
      // cevapları DB'ye yaz), SONRA attemptState'i invalidate et. Aksi takdirde
      // refetch flush'tan önce biter ve state response cevapları görmez —
      // kullanıcı ilk girişte 'cevap yok' görür, ikinci girişte (DB'de olduğu
      // için) görür. Sıralama bug'ını giderir.
      try {
        await flushQueue();
      } catch { /* sessiz */ }
      queryClient.invalidateQueries({ queryKey: ["attemptState", data.attemptId] });
    },
    onError: (err) => {
      const code = err?.response?.data?.code ?? err?.code;
      if (code === 'NO_PURCHASE') {
        toast.error("Bu test için satın alma kaydınız bulunamadı.");
      } else if (code === 'INVALID_DURATION') {
        toast.error("Testin süresi yapılandırılmamış. Eğiticinizle iletişime geçin.");
      } else if (code === 'NO_QUESTIONS') {
        toast.error("Bu test henüz soru içermiyor.");
      } else {
        toast.error("Test başlatılamadı. Lütfen tekrar deneyin.");
      }
    },
  });

  const finishMutation = useMutation({
    mutationFn: () => entities.Attempt.finish(resolvedAttemptId),
    onSuccess: (data) => {
      // Geçen süreyi localStorage'a kaydet (MyTests sayfasında göstermek için)
      if (resolvedAttemptId) {
        localStorage.setItem(`elapsed_${resolvedAttemptId}`, String(elapsedSec));
      }
      setResult(data);
      // Test bitti — localStorage cevap kuyruğunu + UI state'i temizle
      clearQueue();
      try { localStorage.removeItem(`takeTestUi_${resolvedAttemptId}`); } catch { /* sessiz */ }
      queryClient.invalidateQueries({ queryKey: ["attemptState", resolvedAttemptId] });
      queryClient.invalidateQueries({ queryKey: ["myResults", user?.email] });
      queryClient.invalidateQueries({ queryKey: ["purchases", user?.id, testId] });
      queryClient.invalidateQueries({ queryKey: ["allTestResults", user?.id, testId] });
      queryClient.invalidateQueries({ queryKey: ["allTestProgress", user?.id, testId] });
      toast.success("Test tamamlandı!");
    },
    onError: () => {
      setTestFinished(false);
      toast.error("Test kaydedilemedi, lütfen tekrar deneyin");
    },
  });

  const handleFinish = useCallback(async () => {
    if (testFinished || finishMutation.isPending) return;
    setTestFinished(true);
    // CRITICAL: pending cevap kuyruğunu flush etmeden finish çağrılamaz.
    // Aksi takdirde aday hızlı cevap işaretleyip Testi Bitir'e basarsa kuyrukta
    // bekleyen cevaplar backend'e gitmeden test SUBMITTED durumuna geçiyor
    // ve bu cevaplar kalıcı olarak kayboluyor. saveAndExit ve start akışında
    // zaten yapılan flush disiplinin aynısı burada da uygulanmalı.
    try {
      await flushQueue();
    } catch (e) {
      console.warn('finish: flushQueue failed', e?.message ?? e);
    }
    finishMutation.mutate();
  }, [testFinished, finishMutation, flushQueue]);

  // Proctoring: aday IN_PROGRESS attempt'i çözerken sağ tık / copy / klavye
  // kısayolları engellenir, tab switch + fullscreen exit sayılır. exitLimit'e
  // ulaşılınca test otomatik teslim edilir (sebep audit log'lara düşer).
  const { exitCount, enterFullscreen } = useTestProctoring({
    attemptId: resolvedAttemptId,
    enabled: testStarted && !testFinished && !isReviewMode,
    exitLimit: 3,
    containerRef: proctorContainerRef,
    onViolationLimit: ({ count, reason }) => {
      toast.error(`Çoklu sekme/pencere çıkışı (${count}). Test otomatik teslim ediliyor.`);
      // best-effort log, normal handleFinish akışı çalışır
      try {
        api.post(`/attempts/${resolvedAttemptId}/anomaly`, {
          type: 'OTHER',
          payload: { reason: 'auto-submit-after-exit-limit', exitReason: reason, count },
        }).catch(() => {});
      } catch { /* sessiz */ }
      handleFinish();
    },
  });

  // Çıkış sayısı 1 olduğunda uyarı banner'ı (1 ve 2 için uyarı, 3'te submit)
  useEffect(() => {
    if (exitCount > 0 && exitCount < 3 && testStarted && !testFinished && !isReviewMode) {
      setShowExitWarning(true);
    }
  }, [exitCount, testStarted, testFinished, isReviewMode]);

  useEffect(() => {
    if (!testStarted || testFinished || isReviewMode) return;
    if (!test?.is_timed || !test?.duration_minutes) return;
    // Zaten overtime modundaysa bu timer'ı çalıştırma (ayrı overtime timer var)
    if (isOvertime) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // Süre bitti: timeout() ÇAĞRILMIYOR — aday teste devam edebilir
          // Overtime modu aktifleştirilir ve ayrı sayaç başlar
          setIsOvertime(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [testStarted, testFinished, test, isReviewMode, resolvedAttemptId, isOvertime]);

  // Overtime sayacı — süre dolduktan sonra kaç saniye geçtiğini gösterir
  useEffect(() => {
    if (!isOvertime || testFinished || isReviewMode) return;

    const overtimeTimer = setInterval(() => {
      setOvertimeElapsed((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(overtimeTimer);
  }, [isOvertime, testFinished, isReviewMode]);

  // Süresiz test elapsed sayacı — her saniye güncellenir
  useEffect(() => {
    if (!testStarted || testFinished || isReviewMode) return;
    if (test?.is_timed) return;
    const timer = setInterval(() => setElapsedSec((prev) => prev + 1), 1000);
    return () => clearInterval(timer);
  }, [testStarted, testFinished, isReviewMode, test?.is_timed]);

  // Navigasyon paneli: başlangıç scroll durumunu hesapla
  useEffect(() => {
    const el = navScrollRef.current;
    if (!el) return;
    setNavAtBottom(el.scrollHeight <= el.clientHeight);
  }, [questions]);

  // Aktif soruyu sağ panelin ortasına getir
  useEffect(() => {
    const el = navScrollRef.current;
    if (!el) return;
    const btn = el.querySelector(`[data-nav-idx="${currentIndex}"]`);
    if (!btn) return;
    const target = btn.offsetTop - el.clientHeight / 2 + btn.offsetHeight / 2;
    el.scrollTo({ top: target, behavior: "smooth" });
  }, [currentIndex]);

  // Cevaplarım dialogu açıldığında aktif satırı ortaya getir
  useEffect(() => {
    if (!showAnswerSheet) return;
    // Dialog animasyonunun (Radix ~150ms) bitmesini bekle
    const t = setTimeout(() => {
      const el = answerSheetScrollRef.current;
      if (!el) return;
      const btn = el.querySelector(`[data-sheet-idx="${currentIndex}"]`);
      if (!btn) return;
      const btnTop    = btn.offsetTop;
      const btnHeight = btn.offsetHeight;
      const elHeight  = el.clientHeight;
      el.scrollTop = btnTop - elHeight / 2 + btnHeight / 2;
    }, 160);
    return () => clearTimeout(t);
  }, [showAnswerSheet, currentIndex]);

  // answerMutation yerine useAnswerQueue kullanılıyor — localStorage yedekli, retry'lı

  const { testAttemptsEnabled } = useServiceStatus();

  const startTest = (mode = 'normal') => {
    if (!testAttemptsEnabled) {
      toast.warning("Test başlatma geçici olarak durdurulmuştur. Lütfen daha sonra tekrar deneyin.");
      return;
    }
    setTestMode(mode);
    try { localStorage.setItem('testMode_default', mode); } catch { /* sessiz */ }
    // Her durumda backend'e POST /attempts/start çağrılır:
    //   - Mevcut attempt yoksa: yeni oluşturur (IN_PROGRESS)
    //   - PAUSED varsa: resume edip IN_PROGRESS'e geçirir + lastResumedAt set eder
    //   - Zaten IN_PROGRESS: aynı kalır
    // Eski erken-return optimizasyonu PAUSED attempt'ı resume etmeyi atlıyordu
    // → attemptState IN_PROGRESS olmadan kalıyordu → useEffect cevapları yüklemiyordu.
    startAttemptMutation.mutate();
  };

  const saveAndExit = async () => {
    // Süresiz testte geçen süreyi localStorage'a kaydet
    if (resolvedAttemptId && !test?.is_timed) {
      localStorage.setItem(`elapsed_${resolvedAttemptId}`, String(elapsedSec));
    }
    // KRİTİK: pause'dan ÖNCE bekleyen cevap kuyruğunu flush et.
    // Backend SubmitAnswerUseCase, attempt PAUSED iken cevapları reddeder
    // (ATTEMPT_NOT_IN_PROGRESS). Race: handleAnswer fire-and-forget API call
    // pause endpoint'i arar, pause önce ulaşırsa cevap reject olur ve queue'da
    // kalır → tekrar girişte cevap görünmez. Flush ile garantili sıralama.
    if (resolvedAttemptId) {
      try {
        await flushQueue();
      } catch (e) {
        console.warn('[TakeTest] queue flush failed before pause:', e?.message ?? e);
      }
    }
    // Süreli teste DURAKLAT — backend lastResumedAt'ten itibaren geçen süreyi
    // remainingSec'ten düşer ve attempt'ı PAUSED yapar. Aksi takdirde kullanıcı
    // çıkışta ve geri dönerken zaman kaybeder (toast + navigate + load süresi
    // hâlâ "elapsed" olarak sayılır).
    if (resolvedAttemptId && test?.is_timed) {
      try {
        await api.post(`/attempts/${resolvedAttemptId}/pause`);
      } catch (e) {
        // Pause başarısız olursa kullanıcı yine de çıksın — ama uyaralım
        console.warn('[TakeTest] pause failed:', e?.message ?? e);
      }
    }
    toast.success("İlerlemeniz kaydedildi");
    setTimeout(() => {
      navigate(createPageUrl("MyTests"), { replace: true });
    }, 1000);
  };

  const handleAnswer = (optionId) => {
    if (isReviewMode) return;
    const q = questions[currentIndex];
    if (!q) return;
    const letter = q.options?.find((o) => o.id === optionId)
      ? ["A", "B", "C", "D", "E"][q.options.findIndex((o) => o.id === optionId)]
      : null;
    // Önce React state güncelle (anlık UI geri bildirimi)
    setAnswers((prev) => ({ ...prev, [q.id]: letter }));
    // Kuyruğa ekle + API'ye gönder (offline ise kuyrukta bekler)
    queuedSubmitAnswer(q.id, optionId);
    // Her 3 cevapta elapsed time'ı DB'ye kaydet
    checkpointCountRef.current += 1;
    if (checkpointCountRef.current >= 3) {
      checkpointCountRef.current = 0;
      if (resolvedAttemptId) {
        api.patch(`/attempts/${resolvedAttemptId}/checkpoint`, { elapsedSeconds: elapsedSec }).catch(() => {});
      }
    }
    // Seri Mod: cevap verildikten sonra otomatik BİR SONRAKİ BOŞ soruya geç.
    // Linear ilerletme (idx+1) yeterli değil; aday geri dönüp eski bir
    // cevabını değiştirdiğinde sıradaki cevaplanmış soruya geçer ve seri
    // odaklı tekrarda kötü UX oluşur. Bunun yerine current+1'den itibaren
    // ilk boş soru bulunur; sona kadar boş yoksa baştan tarar; hiç boş
    // yoksa hareketsiz kalır (aday Testi Bitir butonunu görür).
    if (testMode === 'serial') {
      const answeredIds = new Set(
        Object.entries(answers).filter(([, v]) => v).map(([id]) => id),
      );
      answeredIds.add(q.id); // az önce cevaplanan soru
      let nextIdx = -1;
      for (let i = currentIndex + 1; i < questions.length; i++) {
        if (!answeredIds.has(questions[i].id)) { nextIdx = i; break; }
      }
      if (nextIdx === -1) {
        for (let i = 0; i < currentIndex; i++) {
          if (!answeredIds.has(questions[i].id)) { nextIdx = i; break; }
        }
      }
      if (nextIdx !== -1) {
        // Küçük gecikme: aday seçtiği şıkkın vurgulanmasını görsün (UX)
        setTimeout(() => setCurrentIndex(nextIdx), 250);
      }
    }
  };

  const clearAnswer = () => {
    if (isReviewMode) return;
    const q = questions[currentIndex];
    if (!q) return;
    setAnswers((prev) => {
      const next = { ...prev };
      delete next[q.id];
      return next;
    });
    // Boş bırakma — optionId undefined olarak kuyruğa ekle
    queuedSubmitAnswer(q.id, undefined);
  };

  const toggleFlag = () => {
    const qId = questions[currentIndex]?.id;
    if (!qId) return;
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(qId)) next.delete(qId);
      else next.add(qId);
      return next;
    });
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <p className="text-slate-600 mb-4">Teste başlamak için giriş yapın</p>
        <Link to={loginUrl()}>
          <Button className="bg-indigo-600 hover:bg-indigo-700">Giriş Yap</Button>
        </Link>
      </div>
    );
  }

  // Erişim kontrol edilirken yükleniyor göster
  if (testId && user && !accessDetermined) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (testId && accessDetermined && !hasAccess) {
    const detailId = testDetail?.packageId ?? testId;
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <p className="text-slate-600 mb-4">Bu testi henüz satın almadınız</p>
        <Link to={createPageUrl("TestDetail") + `?id=${detailId}`}>
          <Button className="bg-indigo-600 hover:bg-indigo-700">Teste Git</Button>
        </Link>
      </div>
    );
  }

  if (isReviewMode && !previousResult) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <AlertCircle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Sonuç Bulunamadı</h1>
          <p className="text-slate-500 mb-6">Bu test için henüz tamamlanmış bir sonuç bulunamadı.</p>
          <Link to={createPageUrl("MyTests")}>
            <Button className="bg-indigo-600 hover:bg-indigo-700">Testlerime Dön</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const displayResult = resultData || result;
  const score = displayResult?.summary?.percentage ?? displayResult?.attempt?.score ?? 0;
  const correctCount = displayResult?.summary?.correct ?? 0;
  const wrongCount = displayResult?.summary?.wrong ?? 0;
  const blankCount = displayResult?.summary?.blank ?? 0;

  if (testFinished && displayResult && !isReviewMode) {
    const avgScore =
      allResults.length > 0
        ? Math.round(allResults.reduce((sum, r) => sum + (r.score || 0), 0) / allResults.length)
        : 0;

    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <div
            className={cn(
              "w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-6",
              score >= 70 ? "bg-emerald-100" : score >= 50 ? "bg-amber-100" : "bg-rose-100"
            )}
          >
            {score >= 70 ? (
              <CheckCircle className="w-10 h-10 text-emerald-600" />
            ) : (
              <AlertCircle className="w-10 h-10 text-amber-600" />
            )}
          </div>

          <h1 className="text-2xl font-bold text-slate-900 mb-2">Test Tamamlandı!</h1>
          <p className="text-slate-500 mb-2">{test?.title}</p>
          <p className="text-sm text-slate-400 mb-8">{testPackage?.title}</p>

          <div className="text-6xl font-bold text-slate-900 mb-2">{score}</div>
          <p className="text-slate-500 mb-2">100 üzerinden</p>

          {allResults.length > 1 && (
            <p className="text-sm text-slate-500 mb-8">
              Diğer adayların ortalaması: <span className="font-semibold">{avgScore}</span>
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-emerald-50 rounded-xl p-4">
              <p className="text-2xl font-bold text-emerald-600">{correctCount}</p>
              <p className="text-sm text-emerald-700">Doğru</p>
            </div>
            <div className="bg-rose-50 rounded-xl p-4">
              <p className="text-2xl font-bold text-rose-600">{wrongCount}</p>
              <p className="text-sm text-rose-700">Yanlış</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-2xl font-bold text-slate-600">{blankCount}</p>
              <p className="text-sm text-slate-700">Boş</p>
            </div>
          </div>

          {/* Süre aşımı uyarısı — gecikmeli teslim bilgisi */}
          {displayResult?.attempt?.overtimeSeconds > 0 && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6 text-left">
              <Clock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  {Math.ceil(displayResult.attempt.overtimeSeconds / 60)} dakika{" "}
                  {displayResult.attempt.overtimeSeconds % 60 > 0
                    ? `${displayResult.attempt.overtimeSeconds % 60} saniye `
                    : ""}
                  gecikmeli teslim edildi
                </p>
                <p className="text-xs text-amber-600 mt-0.5">
                  Süre yönetimi sınav performansının önemli bir parçasıdır. Gelişim raporlarında bu bilgiyi takip edebilirsin.
                </p>
              </div>
            </div>
          )}

          {/* Paket Puanlama — yalnızca SON test tamamlanınca çıkar (paketin tüm testleri SUBMITTED) */}
          {isLastTestInPackage && (
            <div className="mt-8 bg-amber-50 border border-amber-200 rounded-2xl p-6">
              <h3 className="font-semibold text-slate-900 mb-2">Paketi değerlendir</h3>
              {/* testPackage.title user-generated — çevrilmez */}
              <p className="text-sm text-slate-600 mb-1">{testPackage?.title}</p>
              {existingPackageReview ? (
                <p className="text-xs text-amber-700 mb-4">
                  Bu paket için daha önce puan vermiştiniz — istediğinizde güncelleyebilirsiniz.
                </p>
              ) : (
                <p className="text-xs text-slate-500 mb-4">
                  Paketin tüm testlerini tamamladın. Paketi puanlayarak deneyimini paylaş.
                </p>
              )}
              <div className="flex items-center gap-4 mb-3">
                <StarRating value={testRating} onChange={setTestRating} size="lg" />
                {testRating > 0 && (
                  <span className="text-sm text-slate-600">{testRating}/5</span>
                )}
              </div>
              <Textarea
                placeholder="Yorumunuz (opsiyonel)"
                value={testComment}
                onChange={(e) => setTestComment(e.target.value)}
                className="mb-3"
                rows={2}
              />
              <Button
                onClick={handleSubmitTestReview}
                disabled={testRating === 0 || !packageId}
                size="sm"
                className="bg-amber-600 hover:bg-amber-700"
              >
                {existingPackageReview ? "Puanı Güncelle" : "Paketi Puanla"}
              </Button>
            </div>
          )}

          <div className="mt-6 flex gap-3 justify-center flex-wrap">
            <Button
              variant="outline"
              onClick={() => {
                navigate(buildPageUrl("TakeTest", { id: testId, review: true }), { replace: true });
              }}
            >
              İncele
            </Button>
            <Link to={createPageUrl("MyTests")}>
              <Button className="bg-indigo-600 hover:bg-indigo-700">Testlerime Dön</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!testStarted && !isReviewMode) {
    return (
      <div className="max-w-2xl mx-auto">
        {/* Test-taking onboarding tour — shown before first test attempt */}
        {showTestTour && (
          <OnboardingTour
            steps={CANDIDATE_TEST_STEPS}
            tourKey={TOUR_KEYS.CANDIDATE_TEST}
            persona="candidate"
            onComplete={() => completeTour(TOUR_KEYS.CANDIDATE_TEST)}
            onSkip={() => completeTour(TOUR_KEYS.CANDIDATE_TEST)}
          />
        )}

        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">{test?.title}</h1>
          <p className="text-slate-500 mb-2">{testPackage?.title}</p>
          <p className="text-slate-500 mb-8">Teste başlamaya hazır mısın?</p>

          <div className="grid grid-cols-2 gap-4 mb-8 max-w-sm mx-auto">
            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-2xl font-bold text-slate-900">
                {testDetail?.questions?.length ?? testDetail?.questionCount ?? 0}
              </p>
              <p className="text-sm text-slate-500">Soru</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-2xl font-bold text-slate-900">
                {test?.is_timed && test?.duration_minutes ? test.duration_minutes : "∞"}
              </p>
              <p className="text-sm text-slate-500">Dakika</p>
            </div>
          </div>

          {!testAttemptsEnabled ? (
            <div className="w-full max-w-xs rounded-xl border-2 border-amber-200 bg-amber-50 px-4 py-3 text-center mx-auto">
              <p className="text-sm font-semibold text-amber-800">🔧 Test başlatma bakımdadır</p>
              <p className="text-xs text-amber-600 mt-1">Lütfen daha sonra tekrar deneyin.</p>
            </div>
          ) : (() => {
            const preStartQCount = testDetail?.questions?.length ?? testDetail?.questionCount ?? 0;
            if (preStartQCount === 0) {
              return (
                <div className="w-full max-w-xs rounded-xl border-2 border-rose-200 bg-rose-50 px-4 py-3 text-center mx-auto">
                  <p className="text-sm font-semibold text-rose-800">⚠️ Bu test henüz soru içermiyor</p>
                  <p className="text-xs text-rose-600 mt-1">Eğitici soruları ekleyene kadar başlatamazsınız.</p>
                </div>
              );
            }
            // İki modlu başlatma: aday kendi navigasyonu / otomatik ilerleme tercih eder.
            // testMode useState localStorage'a son seçimi yedekler — bir sonraki testte
            // aynı mod default seçili gelir (UX kolaylığı).
            const isStarting = startAttemptMutation.isPending;
            return (
              <div className="grid sm:grid-cols-2 gap-3 max-w-md mx-auto">
                <button
                  type="button"
                  onClick={() => startTest('normal')}
                  disabled={isStarting}
                  className="group rounded-2xl border-2 border-indigo-200 bg-white hover:border-indigo-500 hover:bg-indigo-50 transition-colors p-4 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center"
                  aria-label="Normal Mod ile teste başla"
                >
                  <Lightbulb className="w-5 h-5 text-indigo-600 group-hover:text-indigo-700 mb-1" aria-hidden="true" />
                  <p className="text-base font-semibold text-indigo-700 group-hover:text-indigo-800">
                    Normal Mod
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    Soruları kendin ilerletirsin
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => startTest('serial')}
                  disabled={isStarting}
                  className="group rounded-2xl border-2 border-amber-200 bg-white hover:border-amber-500 hover:bg-amber-50 transition-colors p-4 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center"
                  aria-label="Seri Mod ile teste başla"
                >
                  <Rocket className="w-5 h-5 text-amber-600 group-hover:text-amber-700 mb-1" aria-hidden="true" />
                  <p className="text-base font-semibold text-amber-700 group-hover:text-amber-800">
                    Seri Mod
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    Cevap verdikçe otomatik ilerleme
                  </p>
                </button>
                {isStarting && (
                  <p className="col-span-full text-xs text-slate-500 text-center mt-2">
                    Başlatılıyor…
                  </p>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  const progress = questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0;

  const letters = ["A", "B", "C", "D", "E"];
  const optionsForCurrent = currentQuestion?.options || [];

  return (
    <div
      ref={proctorContainerRef}
      className="max-w-4xl lg:max-w-6xl mx-auto"
      // CSS tarafı UX engelleri — devtools'tan stil silinebilir; bu yüzden
      // event handler'lar (useTestProctoring) gerçek savunma
      style={
        testStarted && !isReviewMode && !testFinished
          ? { userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }
          : undefined
      }
    >
      {/* Çoklu sekme/pencere çıkışı uyarısı — 1. ve 2. çıkışta gösterilir.
          3.'de useTestProctoring onViolationLimit ile auto-submit eder. */}
      <Dialog open={showExitWarning} onOpenChange={setShowExitWarning}>
        <DialogContent className="max-w-md" container={proctorContainerRef.current}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <AlertCircle className="w-5 h-5" />
              Sınav dışına çıktınız ({exitCount}/3)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-slate-700">
            <p>
              Sınav sırasında başka sekmeye geçmek veya tam ekrandan çıkmak yasaktır.
              3. çıkışta sınavınız otomatik olarak teslim edilir.
            </p>
            <p className="text-slate-500 text-xs">
              Bu olay sunucuya kaydedildi ve eğiticiniz tarafından görülebilir.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                onClick={() => { enterFullscreen(); setShowExitWarning(false); }}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                Tam ekrana dön
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Testi Bitir onay dialog'u — final submit geri alınamaz.
          Cevaplanan/boş soru sayısı ve Kaydet ve Çık alternatifi gösterilir. */}
      <Dialog open={showFinishConfirm} onOpenChange={setShowFinishConfirm}>
        <DialogContent className="max-w-md" container={proctorContainerRef.current}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-700">
              <AlertCircle className="w-5 h-5" aria-hidden="true" />
              Testi bitirmek istediğine emin misin?
            </DialogTitle>
          </DialogHeader>
          {(() => {
            const answeredCount = questions.filter((q) => answers[q.id]).length;
            const blankCount = questions.length - answeredCount;
            return (
              <div className="space-y-4 text-sm text-slate-700">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-center">
                    <p className="text-2xl font-bold text-emerald-700">{answeredCount}</p>
                    <p className="text-xs text-emerald-700/80">cevaplandı</p>
                  </div>
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-center">
                    <p className="text-2xl font-bold text-amber-700">{blankCount}</p>
                    <p className="text-xs text-amber-700/80">boş bırakıldı</p>
                  </div>
                </div>
                <p>
                  <strong>Testi Bitir</strong> seçeneği sınavı sonlandırır ve sonuç kaydedilir.
                  <br />
                  Bu işlem <span className="font-semibold text-rose-700">geri alınamaz</span>.
                </p>
                <p className="text-slate-600">
                  Eğer cevaplamaya devam etmek istiyorsan <strong>Kaydet ve Çık</strong> demen
                  yeterli. İlerlemen kaydedilir, kaldığın yerden devam edebilirsin.
                </p>
                <div className="flex justify-end gap-2 pt-1 flex-wrap">
                  <Button variant="outline" onClick={() => setShowFinishConfirm(false)}>
                    İptal
                  </Button>
                  <Button
                    variant="outline"
                    className="text-slate-700"
                    onClick={() => {
                      setShowFinishConfirm(false);
                      saveAndExit();
                    }}
                  >
                    <Save className="w-4 h-4 mr-1.5" aria-hidden="true" />
                    Kaydet ve Çık
                  </Button>
                  <Button
                    className="bg-rose-600 hover:bg-rose-700 text-white"
                    onClick={() => {
                      setShowFinishConfirm(false);
                      handleFinish();
                    }}
                  >
                    <LogOut className="w-4 h-4 mr-1.5" aria-hidden="true" />
                    Evet, bitir
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Offline overlay — bağlantı koptuğunda tüm test arayüzünü kapatır */}
      <OfflineBanner
        isOffline={isOffline}
        remainingSeconds={remainingSeconds}
        pendingCount={pendingCount}
        isFlushing={isFlushing}
        onManualExit={saveAndExit}
      />

      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-6 flex items-center justify-between flex-wrap gap-4 sticky top-0 z-30 shadow-sm lg:static lg:shadow-none">
        {/* Sol: eylem butonları */}
        <div className="flex items-center gap-3 flex-wrap">
          {isReviewMode ? (
            <>
              <Badge className="bg-indigo-100 text-indigo-700">İnceleme Modu</Badge>
              <Link to={createPageUrl("MyTests")}>
                <Button variant="ghost" className="text-slate-600">Testlerime Dön</Button>
              </Link>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                className="text-rose-600 hover:bg-rose-50"
                onClick={() => setShowFinishConfirm(true)}
              >
                <LogOut className="w-4 h-4 mr-1.5" />
                Testi Bitir
              </Button>
              <Button variant="ghost" className="text-slate-600 hover:bg-slate-100" onClick={saveAndExit}>
                <Save className="w-4 h-4 mr-1.5" />
                Kaydet ve Çık
              </Button>
            </>
          )}
        </div>

        {/* Sağ: ilerleme + süre */}
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-sm text-slate-500">
            {currentIndex + 1} / {questions.length}
          </span>
          <Progress value={progress} className="w-32 h-2" />

          {!isReviewMode && testStarted && (
            test?.is_timed && timeLeft !== null ? (
              isOvertime ? (
                <div className="flex items-center gap-1 text-rose-600 animate-pulse">
                  <Clock className="w-4 h-4" />
                  <span className="font-mono font-semibold text-sm">+{formatTime(overtimeElapsed)}</span>
                  <span className="text-xs text-rose-400">aşıldı</span>
                </div>
              ) : (
                <div
                  className={cn(
                    "flex items-center gap-1 font-mono font-semibold",
                    timeLeft < 60
                      ? "text-rose-600 animate-pulse"
                      : timeLeft < (test?.duration_minutes || 60) * 60 * 0.1
                      ? "text-amber-600"
                      : "text-slate-700"
                  )}
                >
                  <Clock className="w-4 h-4" />
                  {formatTime(timeLeft)}
                </div>
              )
            ) : (
              <div className="flex items-center gap-1 text-slate-600">
                <Clock className="w-4 h-4" />
                <span className="font-mono font-semibold">{formatTime(elapsedSec)}</span>
              </div>
            )
          )}
        </div>
      </div>

      <div className="flex gap-4 mb-6">
      <div className="flex-1 relative bg-white rounded-2xl border border-slate-200 p-8 overflow-hidden">
        {/* Görünür filigran — yalnızca IN_PROGRESS attempt sırasında, sadece
            soru kutusunun içinde. Review/finish modunda gizli. */}
        {testStarted && !isReviewMode && !testFinished && (
          <TestWatermark
            identity={{
              name: user?.full_name || user?.username || user?.email,
              email: user?.email,
              attemptId: resolvedAttemptId,
            }}
          />
        )}
        <QuestionCanvas
          ref={canvasRef}
          isActive={isDrawingMode}
          questionId={currentQuestion?.id}
          onHasDrawings={setHasDrawings}
        />
        <div className="relative z-20 flex items-start justify-between mb-6">
          <h2 className="text-lg font-semibold text-slate-900">Soru {currentIndex + 1}</h2>
          <div className="flex gap-2">
            {!isReviewMode && answers[currentQuestion?.id] && (
              <Button variant="ghost" size="sm" onClick={clearAnswer} className="text-rose-500">
                <Trash2 className="w-4 h-4 mr-1" />
                Boş Bırak
              </Button>
            )}
            {/* Çözüm toggle butonu — header'ın sabit konumunda yer alır.
                showSolution=false → 'Çözümü Gör' (Lightbulb)
                showSolution=true  → 'Seçeneklere Dön' (ChevronLeft)
                Aynı yerde toggle olur; aday fare hareketi yapmadan açıp kapatabilir. */}
            {(currentQuestion?.explanation || currentQuestion?.solutionMediaUrl) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSolution((v) => !v)}
                className="text-indigo-600"
              >
                {showSolution ? (
                  <><ChevronLeft className="w-4 h-4 mr-1" />Seçeneklere Dön</>
                ) : (
                  <><Lightbulb className="w-4 h-4 mr-1" />Çözümü Gör</>
                )}
              </Button>
            )}
            {/* Çözüm modu toggle — çözerken Normal/Seri arasında geçiş.
                Normal: soruları kendin ilerletirsin. Seri: cevapta sonraki boş soruya geçer. */}
            {!isReviewMode && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const next = testMode === 'serial' ? 'normal' : 'serial';
                  setTestMode(next);
                  try { localStorage.setItem('testMode_default', next); } catch { /* sessiz */ }
                  toast.success(
                    next === 'serial'
                      ? 'Seri mod açık — cevap verince sonraki soruya geçilir'
                      : 'Normal mod — soruları kendin ilerletirsin',
                  );
                }}
                className={cn(testMode === 'serial' ? "text-indigo-600 bg-indigo-50" : "text-slate-400")}
                aria-label={testMode === 'serial' ? 'Seri mod açık, normale geç' : 'Normal mod, seri moda geç'}
                title="Çözüm modu: Normal / Seri"
              >
                <FastForward className="w-4 h-4 mr-1" />
                {testMode === 'serial' ? 'Seri' : 'Normal'}
              </Button>
            )}
            {/* Kalem — her modda görünür */}
            {hasDrawings && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => canvasRef.current?.clear()}
                className="text-slate-500"
              >
                <Eraser className="w-4 h-4 mr-1" />
                Temizle
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsDrawingMode((v) => !v)}
              className={cn(isDrawingMode ? "text-indigo-600 bg-indigo-50" : "text-slate-400")}
            >
              <Pencil className="w-4 h-4 mr-1" />
              {isDrawingMode ? "Çizim Açık" : "Kalem"}
            </Button>
            {!isReviewMode && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowReportModal(true)}
                  className="text-rose-500"
                >
                  <AlertTriangle className="w-4 h-4 mr-1" />
                  Hata Bildir
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleFlag}
                  className={cn(flagged.has(currentQuestion?.id) ? "text-amber-600" : "text-slate-400")}
                >
                  <Flag className="w-4 h-4 mr-1" />
                  {flagged.has(currentQuestion?.id) ? "İşaretli" : "İşaretle"}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Web geniş ekran: görsel solda, metin+şıklar sağda (2 kolon). mediaUrl yoksa
            grid uygulanmaz → tek sütun (eski davranış; mobil/tablet değişmez). */}
        <div className={currentQuestion?.mediaUrl ? "lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-8 lg:items-start" : ""}>
        {/* Soru görseli — eğitici görsel-only soru girebilir, bu durumda metin boş kalır */}
        {currentQuestion?.mediaUrl && (
          <div className="mb-6 flex justify-center lg:mb-0 lg:sticky lg:top-4">
            <ZoomableImage
              src={currentQuestion.mediaUrl}
              alt="Soru görseli"
              className="max-h-96 w-auto max-w-full object-contain rounded-xl border border-slate-200 bg-white"
              size="lg"
            />
          </div>
        )}

        <div className="lg:min-w-0">
        {currentQuestion?.question_text && (
          <p className="text-slate-700 text-lg mb-8 leading-relaxed">
            {currentQuestion.question_text}
          </p>
        )}

        {/* Çözüm görünürken seçenekler gizlenir; toggle butonu header'da.
            Buradaki kart çözüm içeriği + doğru cevap rozetini gösterir.
            Ayrı bir 'Seçeneklere Dön' butonu yoktur (header'daki toggle yeterli).

            "Doğru Cevap: X" satırı (alt kısımda) seçenekler gizlendiği için
            adayın hangi şıkkın doğru olduğunu görmesini sağlar. Eğitici zaten
            açıklamayı aktif etmişse cevabı da görmek mantıklı. */}
        {showSolution && (currentQuestion?.explanation || currentQuestion?.solutionMediaUrl) ? (
          <div className="p-5 bg-indigo-50 border border-indigo-200 rounded-xl mb-6 space-y-3">
            <p className="text-sm font-semibold text-indigo-700 flex items-center gap-1.5">
              <Lightbulb className="w-4 h-4" /> Çözüm
            </p>
            {currentQuestion.explanation && (
              <p className="text-indigo-900 whitespace-pre-wrap leading-relaxed">{currentQuestion.explanation}</p>
            )}
            {currentQuestion.solutionMediaUrl && (
              <ZoomableImage
                src={currentQuestion.solutionMediaUrl}
                alt="Çözüm görseli"
                className="max-w-full rounded-lg border border-indigo-200"
                size="lg"
              />
            )}
            {/* Doğru Cevap rozeti — çözüm açıklamasının altında, sadece harf.
                Seçenek metni/görseli kasıtlı olarak basılmaz: gürültü
                yaratmasın, kart sade kalsın. */}
            {currentQuestion.correct_answer && (
              <div className="pt-3 mt-3 border-t border-indigo-200 flex items-center gap-3">
                <span className="text-sm font-semibold text-emerald-800 flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  Doğru Cevap:
                </span>
                <span className="w-8 h-8 rounded-lg bg-emerald-600 text-white font-bold text-sm flex items-center justify-center flex-shrink-0">
                  {currentQuestion.correct_answer}
                </span>
              </div>
            )}
          </div>
        ) : null}

        {!showSolution && (
        <div className="space-y-3">
          {optionsForCurrent.map((opt, idx) => {
            const letter = letters[idx];
            const optId = opt.id;
            const isSelected = answers[currentQuestion?.id] === letter;
            const isCorrect = currentQuestion?.correct_answer === letter;

            return (
              <button
                key={opt.id}
                onClick={() => handleAnswer(optId)}
                disabled={isReviewMode}
                className={cn(
                  "w-full p-4 rounded-xl border-2 text-left transition-all flex items-start gap-4",
                  isReviewMode && "cursor-default",
                  isReviewMode && isCorrect && "border-emerald-600 bg-emerald-50",
                  isReviewMode && isSelected && !isCorrect && "border-rose-600 bg-rose-50",
                  !isReviewMode && isSelected && "border-indigo-600 bg-indigo-50",
                  !isReviewMode && !isSelected && "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                  isReviewMode && !isCorrect && !isSelected && "border-slate-200"
                )}
              >
                <span
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center font-semibold text-sm flex-shrink-0",
                    isReviewMode && isCorrect && "bg-emerald-600 text-white",
                    isReviewMode && isSelected && !isCorrect && "bg-rose-600 text-white",
                    !isReviewMode && isSelected && "bg-indigo-600 text-white",
                    ((!isReviewMode && !isSelected) || (isReviewMode && !isCorrect && !isSelected)) &&
                      "bg-slate-100 text-slate-600"
                  )}
                >
                  {letter}
                </span>
                <div className="flex-1 flex items-center gap-3 min-w-0 flex-wrap">
                  {opt.mediaUrl && (
                    <ZoomableImage
                      src={opt.mediaUrl}
                      alt={`${letter} şıkkı görseli`}
                      className="max-h-32 w-auto max-w-xs object-contain rounded-lg border border-slate-200 bg-white"
                    />
                  )}
                  {opt.content && <span className="text-slate-700">{opt.content}</span>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isReviewMode && isCorrect && <CheckCircle className="w-5 h-5 text-emerald-600" />}
                  {isReviewMode && isSelected && !isCorrect && <XCircle className="w-5 h-5 text-rose-600" />}
                </div>
              </button>
            );
          })}
        </div>
        )}
        </div>
        </div>
      </div>

      {/* Soru navigasyon paneli — sağ sütun */}
      <div className="hidden md:flex flex-col w-16 shrink-0">
        <div
          className="bg-white rounded-2xl border border-slate-200 flex flex-col sticky top-4"
          style={{ maxHeight: "70vh" }}
        >
          {/* Yukarı ok */}
          <button
            onClick={() => {
              const el = navScrollRef.current;
              if (el) el.scrollBy({ top: -160, behavior: "smooth" });
            }}
            disabled={navAtTop}
            className="flex items-center justify-center py-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-20 transition-opacity border-b border-slate-100 rounded-t-2xl hover:bg-slate-50"
          >
            <ChevronUp className="w-4 h-4" />
          </button>

          {/* Soru listesi — scrollbar gizli */}
          <div
            ref={navScrollRef}
            onScroll={() => {
              const el = navScrollRef.current;
              if (!el) return;
              setNavAtTop(el.scrollTop === 0);
              setNavAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 1);
            }}
            className="flex-1 overflow-y-scroll flex flex-col gap-1 px-2 py-1"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {questions.map((q, idx) => {
              const ans = answers[q.id];
              let cellClass = "bg-white text-slate-500";
              if (isReviewMode && ans === q.correct_answer)
                cellClass = "bg-emerald-500 text-white";
              else if (isReviewMode && ans && ans !== q.correct_answer)
                cellClass = "bg-rose-500 text-white";
              else if (!isReviewMode && ans)
                cellClass = "bg-indigo-600 text-white";
              else if (flagged.has(q.id))
                cellClass = "bg-amber-100 text-amber-700";
              return (
                <button
                  key={q.id}
                  data-nav-idx={idx}
                  onClick={() => setCurrentIndex(idx)}
                  className={cn(
                    "w-full h-8 rounded-lg text-xs font-medium transition-all flex items-center justify-center shrink-0 border-b border-slate-100",
                    idx === currentIndex && "ring-2 ring-indigo-600 ring-offset-1",
                    cellClass
                  )}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          {/* Aşağı ok */}
          <button
            onClick={() => {
              const el = navScrollRef.current;
              if (el) el.scrollBy({ top: 160, behavior: "smooth" });
            }}
            disabled={navAtBottom}
            className="flex items-center justify-center py-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-20 transition-opacity border-t border-slate-100 rounded-b-2xl hover:bg-slate-50"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>
      </div>{/* /flex wrapper */}

      <ReportQuestionModal
        open={showReportModal}
        onClose={() => setShowReportModal(false)}
        onSubmit={(data) => reportQuestionMutation.mutate(data)}
        questionNumber={currentIndex + 1}
      />

      <Dialog open={showAnswerSheet} onOpenChange={setShowAnswerSheet}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col" container={proctorContainerRef.current}>
          <DialogHeader className="shrink-0">
            <div className="flex items-center justify-between pr-6">
              <DialogTitle>Cevaplarım</DialogTitle>
              {(() => {
                const total = questions.length;
                if (isReviewMode) {
                  const correct = questions.filter(q => answers[q.id] === q.correct_answer).length;
                  const empty   = questions.filter(q => !answers[q.id]).length;
                  const wrong   = total - correct - empty;
                  return (
                    <div className="flex items-center gap-3 text-sm">
                      <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                        <CheckCircle className="w-4 h-4" />{correct}
                      </span>
                      <span className="flex items-center gap-1 text-slate-400 font-semibold">
                        <span className="text-base leading-none">—</span>{empty}
                      </span>
                      <span className="flex items-center gap-1 text-rose-500 font-semibold">
                        <XCircle className="w-4 h-4" />{wrong}
                      </span>
                    </div>
                  );
                }
                const empty = questions.filter(q => !answers[q.id]).length;
                return (
                  <span className="text-sm text-slate-500">
                    <span className="font-semibold text-amber-600">{empty}</span> boş soru
                  </span>
                );
              })()}
            </div>
          </DialogHeader>

          {/* Başlık satırı */}
          <div className="shrink-0 grid grid-cols-[3rem_2.5rem_2.5rem_auto] gap-x-1 px-1 pb-1 border-b border-slate-100 text-xs font-semibold text-slate-400 uppercase tracking-wide">
            <span className="text-right pr-2">No</span>
            <span className="text-center">Cevap</span>
            {isReviewMode && <span className="text-center text-emerald-600">Doğru</span>}
          </div>

          {/* Satır listesi — CSS columns ile yan sütunlara akar */}
          <div
            ref={answerSheetScrollRef}
            className="overflow-y-auto mt-1"
            style={{ scrollbarWidth: "thin" }}
          >
            <div className="columns-2 sm:columns-3 gap-x-4">
              {questions.map((q, idx) => {
                const ans = answers[q.id];
                let rowClass = "hover:bg-slate-50";
                let ansClass = "text-slate-300"; // boş
                if (isReviewMode && ans === q.correct_answer) {
                  rowClass = "bg-emerald-50 hover:bg-emerald-100";
                  ansClass = "text-emerald-700 font-bold";
                } else if (isReviewMode && ans && ans !== q.correct_answer) {
                  rowClass = "bg-rose-50 hover:bg-rose-100";
                  ansClass = "text-rose-700 font-bold";
                } else if (!isReviewMode && ans) {
                  rowClass = "hover:bg-indigo-50";
                  ansClass = "text-indigo-700 font-bold";
                }
                return (
                  <button
                    key={q.id}
                    data-sheet-idx={idx}
                    onClick={() => { setCurrentIndex(idx); setShowAnswerSheet(false); }}
                    className={cn(
                      "w-full flex items-center gap-1 px-1 py-0.5 rounded transition-colors break-inside-avoid",
                      idx === currentIndex && "ring-1 ring-inset ring-indigo-400",
                      rowClass
                    )}
                  >
                    {/* Soru no */}
                    <span className="w-10 text-right text-xs text-slate-400 shrink-0">{idx + 1}</span>
                    {/* Kullanıcı cevabı */}
                    <span className={cn("w-7 text-center text-sm shrink-0", ansClass)}>
                      {ans || "—"}
                    </span>
                    {/* Doğru cevap (inceleme modu) */}
                    {isReviewMode && (
                      <span className="w-7 text-center text-xs text-emerald-600 shrink-0">
                        {q.correct_answer}
                      </span>
                    )}
                    {/* Bayrak */}
                    {flagged.has(q.id) && (
                      <Flag className="w-3 h-3 text-amber-500 ml-auto shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-between sticky bottom-0 z-30 shadow-md lg:static lg:shadow-none">
        <Button
          variant="ghost"
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          disabled={currentIndex === 0}
        >
          <ChevronLeft className="w-4 h-4 mr-2" />
          Önceki
        </Button>

        <Button
          variant="ghost"
          onClick={() => setShowAnswerSheet(true)}
          className="text-indigo-600"
        >
          <Grid3x3 className="w-4 h-4 mr-2" />
          Cevaplarım
        </Button>

        <Button
          variant="ghost"
          onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
          disabled={currentIndex === questions.length - 1}
          className="text-indigo-600 hover:bg-indigo-50"
        >
          Sonraki
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
