import { useState, useMemo, useEffect, useLayoutEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { createPageUrl } from "@/utils";
import { useAuth } from "@/lib/AuthContext";
import { useQuery } from "@tanstack/react-query";
import OnboardingTour from "@/components/onboarding/OnboardingTour";
import { useShouldShowTour, useCompleteTour, TOUR_KEYS } from "@/lib/useOnboarding";
import { CANDIDATE_WELCOME_STEPS } from "@/components/onboarding/tourSteps";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildPageUrl, useAppNavigate } from "@/lib/navigation";
import api from "@/lib/api/apiClient";
import { entities, candidateWritten } from "@/api/dalClient";
// Test paket kartı — Explore sayfasıyla görsel tutarlılık için aynı bileşen
import TestPackageCard from "@/components/ui/TestPackageCard";
import {
  GraduationCap,
  Search,
  TrendingUp,
  Users,
  BookOpen,
  ArrowRight,
  CheckCircle,
  Star,
  User,
  UserCircle,
  Briefcase,
  Sparkles,
  Megaphone,
  Play,
  Eye,
} from "lucide-react";
import { getExamTypeIcon } from "@/lib/examTypeIcons";

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * /marketplace/packages endpoint cevabını TestPackageCard'ın beklediği şekle
 * dönüştürür. Veri kaynağı aynı; yalnızca alan isimleri eşlenir.
 *
 * NOT: Marketplace response'u educator e-postası içermez — link yerine düz
 * metin gösterilir (TestPackageCard educator_email yoksa Link yerine span
 * render eder).
 */
function pkgToTestCard(pkg) {
  const priceTL = typeof pkg.priceCents === 'number' ? pkg.priceCents / 100 : 0;
  return {
    id: pkg.id,
    title: pkg.title,
    cover_image: pkg.coverImageUrl ?? null,
    exam_type_name: pkg.examTypeName ?? null,
    difficulty: pkg.difficulty ?? 'medium',
    has_solutions: false,
    educator_name: pkg.educatorUsername ?? null,
    educator_email: null, // marketplace endpoint email vermez → link yerine metin
    test_count: pkg.testCount ?? 0,
    question_count: pkg.questionCount ?? 0,
    duration_minutes: null, // marketplace özet endpoint'i süreyi paket geneli için döndürmez
    average_rating: pkg.ratingAvg ?? 0,
    price: priceTL,
    campaign_price: null,
  };
}

// ── inline educator card ────────────────────────────────────────────────────

/**
 * Tek bir eğitici kartı.
 * tags dizisinde 'AD_BOOSTED' varsa "Öne Çıkan" rozeti gösterilir.
 * NOT: educator.username user-generated — çevrilmez.
 */
function EducatorCard({ educator }) {
  const { t } = useTranslation(["pages"]);
  const isBoosted = Array.isArray(educator.tags) && educator.tags.includes('AD_BOOSTED');

  return (
    <Link
      to={createPageUrl("EducatorProfile") + `?id=${educator.id}`}
      className="group flex items-start gap-4 p-5 rounded-2xl bg-white border border-slate-100 hover:shadow-lg hover:shadow-slate-200/60 transition-all duration-300"
    >
      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
        {educator.avatarUrl
          ? <img src={educator.avatarUrl} alt={educator.username} className="w-full h-full object-cover" />
          : <User className="w-7 h-7 text-indigo-500" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-slate-900 truncate group-hover:text-indigo-700 transition-colors">
            {educator.username}
          </p>
          {isBoosted && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200 flex-shrink-0">
              <Megaphone className="w-3 h-3" /> {t("pages:card.boosted")}
            </span>
          )}
        </div>
        <div className="flex items-center flex-wrap gap-3 mt-1.5 text-sm text-slate-500">
          <span className="flex items-center gap-1">
            <BookOpen className="w-3.5 h-3.5" />
            {t("pages:card.testsCount", { count: educator.testCount ?? 0 })}
          </span>
          {educator.saleCount > 0 && (
            <span className="flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" />
              {t("pages:card.salesCount", { count: educator.saleCount })}
            </span>
          )}
          {/* Eğitici puanı (Review.educatorRating ortalaması) — yalnızca varsa, en sağa hizalı.
              Puan yoksa hiçbir şey gösterilmez. Test puanından TÜRETİLMEZ. */}
          {educator.ratingAvg != null && Number(educator.ratingAvg) > 0 && (
            <span className="flex items-center gap-1 ml-auto font-medium text-amber-600">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              {Number(educator.ratingAvg).toFixed(1)}
            </span>
          )}
        </div>
      </div>
      <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-colors flex-shrink-0 mt-1" />
    </Link>
  );
}

// ── section header component ────────────────────────────────────────────────

function SectionHeader({ title, isPersonalized, linkTo, linkLabel }) {
  const { t } = useTranslation(["pages"]);
  const resolvedLinkLabel = linkLabel ?? t("pages:card.seeAll");
  return (
    <div className="flex items-center justify-between mb-7">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
        {isPersonalized && (
          <span
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ backgroundColor: "rgba(0,0,205,0.08)", color: "#0000CD" }}
          >
            <Sparkles className="w-3 h-3" />
            {t("pages:card.personalized")}
          </span>
        )}
      </div>
      {linkTo && (
        <Link
          to={linkTo}
          className="flex items-center gap-1.5 text-sm font-medium hover:opacity-75 transition-opacity"
          style={{ color: "#0000CD" }}
        >
          {resolvedLinkLabel} <ArrowRight className="w-4 h-4" />
        </Link>
      )}
    </div>
  );
}

/**
 * ExamTypesCarousel — Anasayfa Sınav Türleri bandının otomatik kayar versiyonu.
 *
 * Davranış:
 *   - Her 4 saniyede 5 sınav türü kart genişliği kadar sola kayar
 *   - Mouse hover (veya klavye focus) → durur
 *   - Sona ulaşınca başa sarar (instant — smooth geri-animasyon yapardı)
 *
 * Kart genişliği DOM ölçümünden alınır (ilk child'ın `offsetWidth`'i). Bu
 * sayede responsive breakpoint'leri (mobil 2, tablet 3, desktop 6 görünür)
 * otomatik takip eder.
 *
 * Erişilebilirlik: dış sarmalayıcı `role="region"` ile etiketlendi. Klavye
 * kullanıcısı sekme ile bağlantılar arasında dolaşabilir. Reduced-motion
 * kullanıcısı için animasyon kapalı.
 */
const CAROUSEL_INTERVAL_MS = 4000; // 4 saniye
const CAROUSEL_STEP_ITEMS = 5;     // tek tıkta 5 sınav türü ileri

function ExamTypesCarousel({ examTypes, examTypeIds, isPersonalized, t }) {
  const scrollRef = useRef(null);
  const [paused, setPaused] = useState(false);

  // prefers-reduced-motion → animasyon devre dışı
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    if (paused || prefersReducedMotion) return;
    if (!scrollRef.current) return;
    const tick = () => {
      const el = scrollRef.current;
      if (!el) return;
      const maxScroll = el.scrollWidth - el.clientWidth;
      if (maxScroll <= 0) return; // kaydıracak içerik yok
      // İlk kartın genişliğinden bir öğe boyutunu bul
      const firstCard = el.firstElementChild;
      const itemWidth = firstCard ? firstCard.offsetWidth : 0;
      if (itemWidth <= 0) return;
      const step = itemWidth * CAROUSEL_STEP_ITEMS;
      const next = el.scrollLeft + step;
      if (next >= maxScroll - 1) {
        // Sona ulaştık — instant başa dön
        el.scrollTo({ left: 0, behavior: 'auto' });
      } else {
        el.scrollTo({ left: next, behavior: 'smooth' });
      }
    };
    const id = setInterval(tick, CAROUSEL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [paused, prefersReducedMotion]);

  return (
    <section>
      <SectionHeader
        title={t("pages:home.sections.examTypes")}
        isPersonalized={false}
        linkTo={createPageUrl("ExamTypes")}
      />
      <div
        className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
        role="region"
        aria-label={t("pages:home.sections.examTypes")}
      >
        <div
          ref={scrollRef}
          className="flex overflow-x-auto scrollbar-none"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {/* webkit scrollbar gizleme — inline style ile yapılamaz, ::-webkit-scrollbar
              pseudo'su global CSS gerektirir; pragmatik çözüm: çok ince scrollbar zaten
              gizli kalır flex container içinde */}
          {examTypes.map((exam) => {
            const isPreferred = isPersonalized && examTypeIds.includes(exam.id);
            const ExamIcon = getExamTypeIcon(exam.metadata?.icon);
            return (
              <Link
                key={exam.id}
                to={createPageUrl("Explore") + `?exam_type=${exam.id}`}
                className={`group flex-shrink-0 basis-1/2 sm:basis-1/3 lg:basis-1/6 p-6 text-center transition-all border-r last:border-r-0 border-slate-100 ${
                  isPreferred
                    ? "bg-indigo-50/60 hover:bg-indigo-50"
                    : "hover:bg-slate-50"
                }`}
              >
                <div
                  className="w-12 h-12 mx-auto rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform"
                  style={{
                    backgroundColor: isPreferred
                      ? "rgba(0,0,205,0.15)"
                      : "rgba(0,0,205,0.07)",
                  }}
                >
                  <ExamIcon className="w-6 h-6" style={{ color: "#0000CD" }} />
                </div>
                {/* exam.name user-generated — çevrilmez */}
                <p className="mt-3 font-semibold text-slate-800 text-sm truncate">
                  {exam.name}
                </p>
                {exam.description && (
                  /* exam.description user-generated — çevrilmez */
                  <p className="mt-1 text-xs text-slate-600 line-clamp-2 leading-snug">
                    {exam.description}
                  </p>
                )}
                {isPreferred && (
                  <p className="mt-1 text-xs font-medium" style={{ color: "#0000CD" }}>
                    {t("pages:home.interestedExamType")}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** GradeLevelsCarousel — Anasayfa "Sınıflar" bandı (ExamTypesCarousel ile aynı yapı). */
function GradeLevelsCarousel({ gradeLevels, t }) {
  const scrollRef = useRef(null);
  const [paused, setPaused] = useState(false);

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    if (paused || prefersReducedMotion) return;
    if (!scrollRef.current) return;
    const tick = () => {
      const el = scrollRef.current;
      if (!el) return;
      const maxScroll = el.scrollWidth - el.clientWidth;
      if (maxScroll <= 0) return;
      const firstCard = el.firstElementChild;
      const itemWidth = firstCard ? firstCard.offsetWidth : 0;
      if (itemWidth <= 0) return;
      const next = el.scrollLeft + itemWidth * CAROUSEL_STEP_ITEMS;
      if (next >= maxScroll - 1) el.scrollTo({ left: 0, behavior: 'auto' });
      else el.scrollTo({ left: next, behavior: 'smooth' });
    };
    const id = setInterval(tick, CAROUSEL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [paused, prefersReducedMotion]);

  const title = t("pages:home.sections.gradeLevels", { defaultValue: "Sınıflar" });

  return (
    <section>
      <SectionHeader title={title} isPersonalized={false} linkTo={createPageUrl("Explore")} />
      <div
        className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
        role="region"
        aria-label={title}
      >
        <div ref={scrollRef} className="flex overflow-x-auto scrollbar-none" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {gradeLevels.map((g) => {
            const GradeIcon = getExamTypeIcon(g.metadata?.icon);
            return (
              <Link
                key={g.id}
                to={createPageUrl("Explore") + `?grade_level=${g.id}`}
                className="group flex-shrink-0 basis-1/2 sm:basis-1/3 lg:basis-1/6 p-6 text-center transition-all border-r last:border-r-0 border-slate-100 hover:bg-slate-50"
              >
                <div
                  className="w-12 h-12 mx-auto rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform"
                  style={{ backgroundColor: "rgba(0,0,205,0.07)" }}
                >
                  <GradeIcon className="w-6 h-6" style={{ color: "#0000CD" }} />
                </div>
                {/* g.name user-generated — çevrilmez */}
                <p className="mt-3 font-semibold text-slate-800 text-sm truncate">{g.name}</p>
                {g.description && (
                  /* g.description user-generated — çevrilmez */
                  <p className="mt-1 text-xs text-slate-600 line-clamp-2 leading-snug">{g.description}</p>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── main component ──────────────────────────────────────────────────────────

export default function Home() {
  const { t } = useTranslation(["pages", "common"]);
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useAppNavigate();

  // ── Onboarding ────────────────────────────────────────────────────────────
  const role = (user?.role || '').toString().toUpperCase();
  const isCandidate = role === 'CANDIDATE' || (role !== 'EDUCATOR' && role !== 'ADMIN' && !!user);
  const showWelcomeTour = useShouldShowTour(TOUR_KEYS.CANDIDATE_WELCOME) && isCandidate;
  const completeTour = useCompleteTour();

  const examTypeIds = useMemo(() => {
    const ids = user?.interested_exam_types;
    if (Array.isArray(ids) && ids.length > 0) return ids;
    return [];
  }, [user?.interested_exam_types]);

  const isPersonalized = examTypeIds.length > 0;
  const examTypeIdsParam = isPersonalized ? examTypeIds.join(",") : undefined;

  const { data: examTypes = [] } = useQuery({
    queryKey: ["home-exam-types"],
    queryFn: async () => {
      const { data } = await api.get("/site/exam-types");
      return Array.isArray(data) ? data : [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: gradeLevels = [] } = useQuery({
    queryKey: ["home-grade-levels"],
    queryFn: async () => {
      const { data } = await api.get("/site/grade-levels");
      return Array.isArray(data) ? data : [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: packages = [], isLoading: pkgsLoading } = useQuery({
    queryKey: ["home-popular-packages", examTypeIdsParam],
    queryFn: async () => {
      // Genel popüler paketler — grid HER ZAMAN dolar (boş yer kalmaz).
      const general = await api
        .get(`/marketplace/packages?${new URLSearchParams({ limit: "12" })}`)
        .then((r) => (Array.isArray(r.data?.items) ? r.data.items : []));
      // İlgi alanı yoksa doğrudan genel liste.
      if (!examTypeIdsParam) return general;
      // "Size Özel": ilgi alanına uyan paketleri BAŞA al, kalanı genel listeden doldur.
      const firstType = examTypeIdsParam.split(",")[0]?.trim();
      const personalized = firstType
        ? await api
            .get(`/marketplace/packages?${new URLSearchParams({ limit: "12", examTypeId: firstType })}`)
            .then((r) => (Array.isArray(r.data?.items) ? r.data.items : []))
        : [];
      const seen = new Set(personalized.map((p) => p.id));
      return [...personalized, ...general.filter((p) => !seen.has(p.id))];
    },
    staleTime: 3 * 60 * 1000,
  });

  // "Test Paketleri" grid'i auto-fill olduğundan sütun sayısı viewport'a göre
  // değişir. Sabit sayı yarım satır bırakır; bunun yerine grid'in çözdüğü gerçek
  // sütun sayısını ölçüp TAM 2 satır (cols × 2) kadar paket gösteririz.
  const pkgGridRef = useRef(null);
  const [pkgCols, setPkgCols] = useState(0);
  useLayoutEffect(() => {
    const el = pkgGridRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => {
      const tracks = getComputedStyle(el)
        .gridTemplateColumns.split(" ")
        .filter(Boolean).length;
      if (tracks > 0) setPkgCols(tracks);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [packages.length]);
  // Ölçülene kadar 8 (4 sütunlu masaüstünde 2 satır) ile başla; ölçüm sonrası tam 2 satır.
  // (visiblePackages, satın alınan paketler çıkarıldıktan SONRA aşağıda hesaplanır —
  //  ownedPackages query'sinin altında.)

  const { data: ownedPackages = [] } = useQuery({
    queryKey: ["home-owned-packages", user?.id],
    queryFn: async () => {
      const purchases = await entities.Purchase.filter({});
      const grouped = new Map();
      const fallbackTitle = t("pages:home.fallbackPackageTitle");
      for (const p of Array.isArray(purchases) ? purchases : []) {
        if (p.payment_status && !["PAID", "COMPLETED", "ACTIVE"].includes(String(p.payment_status).toUpperCase())) continue;
        const id = p.package_id ?? p.test_package_id;
        if (!id) continue;
        // Paketteki TÜM testlerin attempt'larından durum çıkar. p.attempt (tekil)
        // paket alımlarında null gelir; bu yüzden p.attempts[] kullanılır.
        // "BU TUR" mantığı: attemptsResetAt sonrası başlamış denemeler bu tura aittir.
        // Reset + hiç başlamadı durumunda bu turda ne IN_PROGRESS ne SUBMITTED kalır →
        // paket "Devam Et" listesinden ÇIKARILIR (ne devam ne incele).
        const atts = Array.isArray(p.attempts) ? p.attempts : (p.attempt ? [p.attempt] : []);
        const resetAt = p.attemptsResetAt ? new Date(p.attemptsResetAt).getTime() : null;
        const inCurrentRound = (a) =>
          !resetAt || (a?.startedAt && new Date(a.startedAt).getTime() > resetAt);
        const hasInProgress = atts.some(
          (a) => a && (a.status === "IN_PROGRESS" || a.status === "PAUSED") && inCurrentRound(a),
        );
        const hasCompleted = atts.some(
          (a) => a && (a.status === "SUBMITTED" || a.status === "TIMEOUT") && inCurrentRound(a),
        );
        const prev = grouped.get(id);
        if (!prev) {
          grouped.set(id, {
            id,
            title: p.package?.title ?? p.test_package_title ?? fallbackTitle,
            educatorUsername: p.package?.educatorUsername ?? p.test?.educator?.username ?? null,
            hasInProgress,
            hasCompleted,
          });
        } else {
          prev.hasInProgress = prev.hasInProgress || hasInProgress;
          prev.hasCompleted = prev.hasCompleted || hasCompleted;
        }
      }
      return Array.from(grouped.values())
        // "Devam Et" yalnızca bu turda etkinliği olan paketleri gösterir:
        //  - aktif deneme → Devam Et (Play)
        //  - aktif yok ama tamamlanmış → İncele (Eye)
        // Bu turda hiçbir şey yoksa (hiç başlanmamış VEYA reset+başlanmamış) listeden çıkar.
        .filter((p) => p.hasInProgress || p.hasCompleted)
        .map((p) => ({ ...p, isCompleted: !p.hasInProgress && p.hasCompleted }))
        .sort((a, b) => Number(a.isCompleted) - Number(b.isCompleted));
    },
    enabled: isCandidate && !!user,
    staleTime: 60 * 1000,
  });

  // Yazılı (açık uçlu) paketlerden bu turda etkin olanlar — Devam Et'e dahil edilir.
  const { data: writtenContinue = [] } = useQuery({
    queryKey: ["home-written-continue", user?.id],
    queryFn: async () => {
      const res = await candidateWritten.myPackages();
      const items = res?.items ?? [];
      return items
        .map((p) => {
          const states = (p.tests ?? []).map((tt) => tt.state);
          const hasInProgress = states.includes("IN_PROGRESS");
          const hasCompleted = states.some((s) => s === "SUBMITTED" || s === "TIMEOUT");
          return {
            id: p.packageId,
            title: p.title,
            educatorUsername: p.educatorName ?? null,
            hasInProgress,
            hasCompleted,
            isCompleted: !hasInProgress && hasCompleted,
            kind: "written",
          };
        })
        .filter((p) => p.hasInProgress || p.hasCompleted)
        .sort((a, b) => Number(a.isCompleted) - Number(b.isCompleted));
    },
    enabled: isCandidate && !!user,
    staleTime: 60 * 1000,
  });

  // Devam Et = normal test paketleri + yazılı paketler (kind ile link ayrışır).
  const continueItems = [...ownedPackages.map((p) => ({ ...p, kind: "test" })), ...writtenContinue];

  // Satın alınan paketleri öneri listesinden çıkar — Home "Test Paketleri" yalnızca
  // YENİ keşif önerir. Satın alınanlar "Satın Alınan Testler" sayfasında görünür.
  const ownedPackageIds = new Set(ownedPackages.map((p) => p.id));
  const visiblePackages = packages
    .filter((p) => !ownedPackageIds.has(p.id))
    .slice(0, (pkgCols > 0 ? pkgCols : 4) * 2);

  const { data: educators = [], isLoading: eduLoading } = useQuery({
    queryKey: ["home-featured-educators", examTypeIdsParam],
    queryFn: async () => {
      // Genel öne çıkan eğiticiler — grid'i doldurur (boş yer kalmaz).
      const general = await api
        .get(`/site/featured-educators?${new URLSearchParams({ limit: "6" })}`)
        .then((r) => (Array.isArray(r.data) ? r.data : []));
      if (!examTypeIdsParam) return general;
      // İlgi alanına uyan eğiticileri BAŞA al, kalanı genel listeden doldur.
      const personalized = await api
        .get(`/site/featured-educators?${new URLSearchParams({ limit: "6", examTypeIds: examTypeIdsParam })}`)
        .then((r) => (Array.isArray(r.data) ? r.data : []));
      const seen = new Set(personalized.map((e) => e.id));
      return [...personalized, ...general.filter((e) => !seen.has(e.id))].slice(0, 6);
    },
    staleTime: 3 * 60 * 1000,
  });

  const sortedExamTypes = useMemo(() => {
    if (!isPersonalized) return examTypes;
    const set = new Set(examTypeIds);
    return [...examTypes].sort((a, b) => {
      const aMatch = set.has(a.id) ? 1 : 0;
      const bMatch = set.has(b.id) ? 1 : 0;
      return bMatch - aMatch;
    });
  }, [examTypes, examTypeIds, isPersonalized]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    navigate(buildPageUrl("Explore", { q: searchQuery.trim() }));
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {showWelcomeTour && (
        <OnboardingTour
          steps={CANDIDATE_WELCOME_STEPS}
          tourKey={TOUR_KEYS.CANDIDATE_WELCOME}
          persona="candidate"
          onComplete={() => completeTour(TOUR_KEYS.CANDIDATE_WELCOME)}
          onSkip={() => completeTour(TOUR_KEYS.CANDIDATE_WELCOME)}
        />
      )}

      {/* Topbar artık Layout tarafından PublicHeader olarak render ediliyor (tüm public sayfalarda paylaşılır) */}

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Marka indigo gradient — kendi içinde (dış bağımlılık YOK). Önceden desen
            dış Unsplash görselinden geliyordu; anonim/dış kullanıcıda yüklenmeyince
            düz #0000CD kalıp renk mora kayıyor + desen kayboluyordu. */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #4f46e5 0%, #4338ca 55%, #3730a3 100%)" }} />
        {/* Desen — inline SVG (her kullanıcıda görünür; ağ/CSP'ye bağlı değil) */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='1.5' fill='%23ffffff'/%3E%3C/svg%3E\")",
            backgroundSize: "32px 32px",
          }}
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32">
          <div className="max-w-3xl">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight">
              {t("pages:home.hero.titleLine1")}
              <span className="block text-indigo-200">{t("pages:home.hero.titleLine2")}</span>
            </h1>
            <p className="mt-6 text-lg text-indigo-100 max-w-xl">
              {t("pages:home.hero.subtitle")}
            </p>

            <form onSubmit={handleSearch} className="mt-10 flex gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                  placeholder={t("pages:home.hero.searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-12 h-14 bg-white/95 backdrop-blur border-0 rounded-xl text-lg"
                />
              </div>
              <Button
                type="submit"
                size="lg"
                className="h-14 px-8 bg-white hover:bg-slate-100 rounded-xl"
                style={{ color: "#0000CD" }}
              >
                {t("pages:home.hero.searchButton")}
              </Button>
            </form>

            <div className="mt-10 flex flex-wrap gap-6 text-white/90">
              {[
                { key: "uniqueTests", label: t("pages:home.hero.features.uniqueTests") },
                { key: "experiencedEducators", label: t("pages:home.hero.features.experiencedEducators") },
                { key: "performanceTracking", label: t("pages:home.hero.features.performanceTracking") },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16 py-16">

        {/* ── 0. Devam Et ───────────────────────────────────────────────── */}
        {isCandidate && continueItems.length > 0 && (
          <section>
            <SectionHeader
              title={t("pages:home.sections.continue")}
              isPersonalized={false}
              linkTo={createPageUrl("MyTests")}
            />
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {continueItems.slice(0, 6).map((pkg) => (
                <Link
                  key={`${pkg.kind}-${pkg.id}`}
                  to={createPageUrl(pkg.kind === "written" ? "WrittenTestDetail" : "TestDetail") + `?id=${pkg.id}`}
                  className="group flex items-center gap-4 p-5 rounded-2xl bg-white border border-slate-100 hover:shadow-lg hover:shadow-slate-200/60 transition-all duration-300"
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{
                      backgroundColor: pkg.isCompleted ? "rgba(16,185,129,0.10)" : "rgba(0,0,205,0.08)",
                    }}
                    aria-label={pkg.isCompleted ? t("pages:home.completedAria") : t("pages:home.continueAria")}
                  >
                    {pkg.isCompleted ? (
                      <Eye className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <Play className="w-5 h-5" style={{ color: "#0000CD" }} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 truncate group-hover:text-indigo-700 transition-colors">
                      {pkg.title}
                    </p>
                    {pkg.educatorUsername && (
                      <p className="text-sm text-slate-500 truncate flex items-center gap-1.5 mt-1">
                        <User className="w-3.5 h-3.5 flex-shrink-0" />
                        {pkg.educatorUsername}
                      </p>
                    )}
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-colors flex-shrink-0" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── 1. Sınav Türleri band — otomatik kaydırma ──────────────────── */}
        {examTypes.length > 0 && (
          <ExamTypesCarousel
            examTypes={sortedExamTypes}
            examTypeIds={examTypeIds}
            isPersonalized={isPersonalized}
            t={t}
          />
        )}

        {/* ── 1b. Sınıflar band — Sınav Türleri ile aynı yapı ────────────── */}
        {gradeLevels.length > 0 && (
          <GradeLevelsCarousel gradeLevels={gradeLevels} t={t} />
        )}

        {/* ── 2. Test Paketleri ─────────────────────────────────────────── */}
        <section>
          <SectionHeader
            title={t("pages:home.sections.testPackages")}
            isPersonalized={isPersonalized}
            linkTo={
              isPersonalized && examTypeIds[0]
                ? createPageUrl("Explore") + `?exam_type=${examTypeIds[0]}`
                : createPageUrl("Explore")
            }
          />

          {pkgsLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="bg-white rounded-2xl border border-slate-100 h-52 animate-pulse"
                />
              ))}
            </div>
          ) : packages.length === 0 ? (
            <div className="text-center py-16 text-slate-600">
              <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>{t("pages:home.empty.noPackages")}</p>
            </div>
          ) : (
            <div ref={pkgGridRef} className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
              {visiblePackages.map((pkg) => (
                <TestPackageCard
                  key={pkg.id}
                  test={pkgToTestCard(pkg)}
                  onBuy={() => navigate(buildPageUrl("TestDetail", { id: pkg.id }))}
                />
              ))}
            </div>
          )}

        </section>

        {/* ── 3. Eğiticiler ─────────────────────────────────────────────── */}
        <section>
          <SectionHeader
            title={t("pages:home.sections.educators")}
            isPersonalized={isPersonalized}
            linkTo={createPageUrl("Educators")}
          />

          {eduLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="bg-white rounded-2xl border border-slate-100 h-24 animate-pulse"
                />
              ))}
            </div>
          ) : educators.length === 0 ? (
            <div className="text-center py-16 text-slate-600">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>{t("pages:home.empty.noEducators")}</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {educators.map((edu) => (
                <EducatorCard key={edu.id} educator={edu} />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ── Stats band ──────────────────────────────────────────────────── */}
      <section className="py-20" style={{ backgroundColor: "#0000CD" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 divide-x divide-white/20">
            {[
              { key: "tests", icon: Users, value: t("pages:home.stats.testsValue"), label: t("pages:home.stats.testsLabel") },
              { key: "content", icon: BookOpen, value: t("pages:home.stats.contentValue"), label: t("pages:home.stats.contentLabel") },
              { key: "educators", icon: GraduationCap, value: t("pages:home.stats.educatorsValue"), label: t("pages:home.stats.educatorsLabel") },
              { key: "performance", icon: TrendingUp, value: t("pages:home.stats.performanceValue"), label: t("pages:home.stats.performanceLabel") },
            ].map(({ key, icon: Icon, value, label }) => (
              <div key={key} className="text-center p-8">
                <div className="w-14 h-14 mx-auto bg-white/20 rounded-2xl flex items-center justify-center mb-4">
                  <Icon className="w-7 h-7 text-white" strokeWidth={1.5} />
                </div>
                <p className="text-3xl font-bold text-white">{value}</p>
                <p className="text-white/80 mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA (only for guests) ───────────────────────────────────────── */}
      {!user && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                type: "candidate",
                title: t("pages:home.cta.candidateTitle"),
                desc: t("pages:home.cta.candidateDesc"),
                icon: UserCircle,
              },
              {
                type: "educator",
                title: t("pages:home.cta.educatorTitle"),
                desc: t("pages:home.cta.educatorDesc"),
                icon: Briefcase,
              },
            ].map(({ type, title, desc, icon: Icon }) => (
              // Grid'in iki kartı eşit yükseklikte gerilir (grid default: align-items: stretch).
              // Kart içi flex-col + button'da mt-auto → desc'in satır sayısı ne olursa olsun
              // butonlar kartların altında aynı hizaya oturur.
              <div
                key={type}
                className="rounded-3xl p-10 text-center flex flex-col h-full"
                style={{ backgroundColor: "#0000CD" }}
              >
                <div className="w-16 h-16 mx-auto bg-white/15 rounded-2xl flex items-center justify-center mb-5">
                  <Icon className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-3">{title}</h2>
                {/* min-h: minimum kullanılan alanı sabitle (her iki kart aynı baseline) */}
                <p className="text-white/80 text-sm mb-7">{desc}</p>
                <Button
                  size="lg"
                  className="bg-white hover:bg-slate-100 mt-auto self-center"
                  style={{ color: "#0000CD" }}
                  onClick={() => {
                    navigate(createPageUrl("Register") + `?role=${type}`);
                  }}
                >
                  {t("pages:home.cta.startNow")}
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Footer artık Layout tarafından PublicFooter olarak render ediliyor (tüm public sayfalarda paylaşılır) */}
    </div>
  );
}
