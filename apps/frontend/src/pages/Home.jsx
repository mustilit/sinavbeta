import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
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
import { entities } from "@/api/dalClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  GraduationCap,
  Search,
  TrendingUp,
  Users,
  BookOpen,
  Award,
  ArrowRight,
  CheckCircle,
  Star,
  User,
  UserCircle,
  Briefcase,
  Clock,
  Sparkles,
  Megaphone,
  Play,
  Eye,
} from "lucide-react";

// ── helpers ────────────────────────────────────────────────────────────────

function priceTL(cents) {
  if (cents === null || cents === undefined) return "Ücretsiz";
  if (cents === 0) return "Ücretsiz";
  return `₺${(cents / 100).toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function starStr(avg) {
  if (!avg) return null;
  return Number(avg).toFixed(1);
}

// ── inline package card (uses backend PopularPackageItem format) ───────────

/**
 * Tek bir test paketi kartı.
 * tags dizisinde 'AD_BOOSTED' varsa "Öne Çıkan" rozeti gösterilir.
 */
function PackageCard({ pkg }) {
  // Reklam destekli öne çıkarma kontrolü
  const isBoosted = Array.isArray(pkg.tags) && pkg.tags.includes('AD_BOOSTED');

  return (
    <Link
      to={createPageUrl("TestDetail") + `?id=${pkg.id}`}
      className="group bg-white rounded-2xl border border-slate-100 hover:shadow-lg hover:shadow-slate-200/60 transition-all duration-300 flex flex-col overflow-hidden"
    >
      {/* Renkli üst şerit — reklam destekliyse turuncu, aksi hâlde mavi */}
      <div
        className="h-2 w-full"
        style={{ backgroundColor: isBoosted ? "#f97316" : "#0000CD", opacity: 0.85 }}
      />
      <div className="p-5 flex flex-col flex-1 gap-3">
        {/* badge row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Reklam öne çıkarma rozeti */}
          {isBoosted && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200">
              <Megaphone className="w-3 h-3" /> Öne Çıkan
            </span>
          )}
          {pkg.examTypeName && (
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-full"
              style={{ backgroundColor: "rgba(0,0,205,0.08)", color: "#0000CD" }}
            >
              {pkg.examTypeName}
            </span>
          )}
          {pkg.isTimed && (
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Süreli
            </span>
          )}
        </div>

        {/* title */}
        <h3
          className="font-semibold text-slate-900 line-clamp-2 text-base leading-snug group-hover:text-indigo-700 transition-colors"
        >
          {pkg.title}
        </h3>

        {/* educator */}
        {pkg.educatorUsername && (
          <p className="text-sm text-slate-500 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 flex-shrink-0" />
            {pkg.educatorUsername}
          </p>
        )}

        {/* stats row */}
        <div className="flex items-center gap-4 text-xs text-slate-500 mt-auto pt-1">
          <span className="flex items-center gap-1">
            <BookOpen className="w-3.5 h-3.5" />
            {pkg.questionCount} soru
          </span>
          {starStr(pkg.ratingAvg) && (
            <span className="flex items-center gap-1">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              {starStr(pkg.ratingAvg)}
            </span>
          )}
          {pkg.saleCount > 0 && (
            <span className="flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" />
              {pkg.saleCount} satış
            </span>
          )}
        </div>

        {/* price + cta */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-1">
          <span className="text-lg font-bold text-slate-900">
            {priceTL(pkg.priceCents)}
          </span>
          <span
            className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white"
            style={{ backgroundColor: "#0000CD" }}
          >
            İncele
          </span>
        </div>
      </div>
    </Link>
  );
}

// ── inline educator card ────────────────────────────────────────────────────

/**
 * Tek bir eğitici kartı.
 * tags dizisinde 'AD_BOOSTED' varsa "Öne Çıkan" rozeti gösterilir.
 */
function EducatorCard({ educator }) {
  // Reklam destekli öne çıkarma kontrolü
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
          {/* Reklam öne çıkarma rozeti */}
          {isBoosted && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200 flex-shrink-0">
              <Megaphone className="w-3 h-3" /> Öne Çıkan
            </span>
          )}
        </div>
        <div className="flex items-center flex-wrap gap-3 mt-1.5 text-sm text-slate-500">
          <span className="flex items-center gap-1">
            <BookOpen className="w-3.5 h-3.5" />
            {educator.testCount} test
          </span>
          {educator.saleCount > 0 && (
            <span className="flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" />
              {educator.saleCount} satış
            </span>
          )}
          {educator.ratingAvg != null && Number(educator.ratingAvg) > 0 && (
            <span className="flex items-center gap-1">
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

function SectionHeader({ title, isPersonalized, linkTo, linkLabel = "Tümünü Gör" }) {
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
            Size Özel
          </span>
        )}
      </div>
      {linkTo && (
        <Link
          to={linkTo}
          className="flex items-center gap-1.5 text-sm font-medium hover:opacity-75 transition-opacity"
          style={{ color: "#0000CD" }}
        >
          {linkLabel} <ArrowRight className="w-4 h-4" />
        </Link>
      )}
    </div>
  );
}

// ── main component ──────────────────────────────────────────────────────────

export default function Home() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const navigate = useAppNavigate();

  // ── Onboarding ────────────────────────────────────────────────────────────
  const role = (user?.role || '').toString().toUpperCase();
  const isCandidate = role === 'CANDIDATE' || (role !== 'EDUCATOR' && role !== 'ADMIN' && !!user);
  const showWelcomeTour = useShouldShowTour(TOUR_KEYS.CANDIDATE_WELCOME) && isCandidate;
  const completeTour = useCompleteTour();

  // Compute personalisation exam-type IDs from user profile
  const examTypeIds = useMemo(() => {
    const ids = user?.interested_exam_types;
    if (Array.isArray(ids) && ids.length > 0) return ids;
    return [];
  }, [user?.interested_exam_types]);

  const isPersonalized = examTypeIds.length > 0;
  const examTypeIdsParam = isPersonalized ? examTypeIds.join(",") : undefined;

  // ── data queries ──────────────────────────────────────────────────────────

  const { data: examTypes = [] } = useQuery({
    queryKey: ["home-exam-types"],
    queryFn: async () => {
      const { data } = await api.get("/site/exam-types");
      return Array.isArray(data) ? data : [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: packages = [], isLoading: pkgsLoading } = useQuery({
    queryKey: ["home-popular-packages", examTypeIdsParam],
    queryFn: async () => {
      // /marketplace/packages kullan — TestPackage ID döner (tek kaynak)
      const params = new URLSearchParams({ limit: "6" });
      if (examTypeIdsParam) {
        // examTypeIdsParam virgülle ayrılmış olabilir, ilk değeri al
        const firstType = examTypeIdsParam.split(",")[0]?.trim();
        if (firstType) params.set("examTypeId", firstType);
      }
      const { data } = await api.get(`/marketplace/packages?${params}`);
      return Array.isArray(data?.items) ? data.items : [];
    },
    staleTime: 3 * 60 * 1000,
  });

  // Aday için satın alınmış paketler — "Devam Et" bandını besler
  const { data: ownedPackages = [] } = useQuery({
    queryKey: ["home-owned-packages", user?.id],
    queryFn: async () => {
      const purchases = await entities.Purchase.filter({});
      const grouped = new Map();
      for (const p of Array.isArray(purchases) ? purchases : []) {
        if (p.payment_status && !["PAID", "COMPLETED", "ACTIVE"].includes(String(p.payment_status).toUpperCase())) continue;
        const id = p.package_id ?? p.test_package_id;
        if (!id) continue;
        const submitted = !!(p.attempt?.submittedAt || p.attempt?.status === "SUBMITTED");
        const prev = grouped.get(id);
        if (!prev) {
          grouped.set(id, {
            id,
            title: p.package?.title ?? p.test_package_title ?? "Test paketi",
            educatorUsername: p.package?.educatorUsername ?? p.test?.educator?.username ?? null,
            total: 1,
            done: submitted ? 1 : 0,
          });
        } else {
          prev.total += 1;
          if (submitted) prev.done += 1;
        }
      }
      return Array.from(grouped.values())
        .map((p) => ({ ...p, isCompleted: p.total > 0 && p.done >= p.total }))
        // Devam edilecekler (tamamlanmamış) önce, tamamlananlar sonra
        .sort((a, b) => Number(a.isCompleted) - Number(b.isCompleted));
    },
    enabled: isCandidate && !!user,
    staleTime: 60 * 1000,
  });

  const { data: educators = [], isLoading: eduLoading } = useQuery({
    queryKey: ["home-featured-educators", examTypeIdsParam],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "6" });
      if (examTypeIdsParam) params.set("examTypeIds", examTypeIdsParam);
      const { data } = await api.get(`/site/featured-educators?${params}`);
      return Array.isArray(data) ? data : [];
    },
    staleTime: 3 * 60 * 1000,
  });

  // Sort exam types by match with user's interested types
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

  const handleLogin = (userType) => {
    sessionStorage.setItem("preferred_user_type", userType);
    navigate(buildPageUrl("Login", { from: createPageUrl("Explore") }));
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Onboarding Tour ──────────────────────────────────────────────── */}
      {showWelcomeTour && (
        <OnboardingTour
          steps={CANDIDATE_WELCOME_STEPS}
          onComplete={() => completeTour(TOUR_KEYS.CANDIDATE_WELCOME)}
          onSkip={() => completeTour(TOUR_KEYS.CANDIDATE_WELCOME)}
        />
      )}

      {/* ── Topbar ──────────────────────────────────────────────────────── */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-slate-100 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: "#0000CD" }}
              >
                <GraduationCap className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold text-slate-900">Sınav Salonu</span>
            </div>
            <nav className="flex items-center gap-3">
              <Link
                to={createPageUrl("Explore")}
                className="text-slate-600 hover:text-slate-900 transition-colors text-sm"
              >
                Testleri Keşfet
              </Link>
              <Link
                to={createPageUrl("Educators")}
                className="text-slate-600 hover:text-slate-900 transition-colors text-sm"
              >
                Eğiticiler
              </Link>
              {!user && (
                <Button
                  onClick={() => setShowLoginDialog(true)}
                  style={{ backgroundColor: "#0000CD" }}
                  className="hover:opacity-90"
                >
                  Giriş Yap
                </Button>
              )}
            </nav>
          </div>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0" style={{ backgroundColor: "#0000CD" }} />
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=1920')] bg-cover bg-center opacity-10" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32">
          <div className="max-w-3xl">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight">
              Sınavlara
              <span className="block text-indigo-200">Güvenle Hazırlan</span>
            </h1>
            <p className="mt-6 text-lg text-indigo-100 max-w-xl">
              Alanında uzman eğiticilerden binlerce test çöz, performansını takip et ve hedefine ulaş.
            </p>

            <form onSubmit={handleSearch} className="mt-10 flex gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                  placeholder="Test, konu veya eğitici ara..."
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
                Ara
              </Button>
            </form>

            <div className="mt-10 flex flex-wrap gap-6 text-white/90">
              {[
                { icon: CheckCircle, label: "Özgün Testler" },
                { icon: CheckCircle, label: "Tecrübeli Eğiticiler" },
                { icon: CheckCircle, label: "Performans Takibi" },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-2">
                  <Icon className="w-5 h-5 text-emerald-400" />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16 py-16">

        {/* ── 0. Devam Et (aday, satın aldığı paketler) ──────────────────── */}
        {isCandidate && ownedPackages.length > 0 && (
          <section>
            <SectionHeader
              title="Devam Et"
              isPersonalized={false}
              linkTo={createPageUrl("MyTests")}
            />
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {ownedPackages.slice(0, 6).map((pkg) => (
                <Link
                  key={pkg.id}
                  to={createPageUrl("TestDetail") + `?id=${pkg.id}`}
                  className="group flex items-center gap-4 p-5 rounded-2xl bg-white border border-slate-100 hover:shadow-lg hover:shadow-slate-200/60 transition-all duration-300"
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{
                      backgroundColor: pkg.isCompleted ? "rgba(16,185,129,0.10)" : "rgba(0,0,205,0.08)",
                    }}
                    aria-label={pkg.isCompleted ? "Tamamlandı" : "Devam et"}
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

        {/* ── 1. Sınav Türleri band ──────────────────────────────────────── */}
        {examTypes.length > 0 && (
          <section>
            <SectionHeader
              title="Sınav Türleri"
              isPersonalized={false}
              linkTo={createPageUrl("ExamTypes")}
            />
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
                {sortedExamTypes.slice(0, 6).map((exam, idx) => {
                  const isPreferred = isPersonalized && examTypeIds.includes(exam.id);
                  return (
                    <Link
                      key={exam.id}
                      to={createPageUrl("Explore") + `?exam_type=${exam.id}`}
                      className={`group p-6 text-center transition-all border-r last:border-r-0 border-b lg:border-b-0 border-slate-100 ${
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
                        <Award className="w-6 h-6" style={{ color: "#0000CD" }} />
                      </div>
                      <p className="mt-3 font-semibold text-slate-800 text-sm">
                        {exam.name}
                      </p>
                      {isPreferred && (
                        <p className="mt-1 text-xs font-medium" style={{ color: "#0000CD" }}>
                          İlgi alanınız
                        </p>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* ── 2. Test Paketleri ─────────────────────────────────────────── */}
        <section>
          <SectionHeader
            title="Test Paketleri"
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
            <div className="text-center py-16 text-slate-400">
              <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Henüz yayınlanmış test paketi yok</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {packages.map((pkg) => (
                <PackageCard key={pkg.id} pkg={pkg} />
              ))}
            </div>
          )}

        </section>

        {/* ── 3. Eğiticiler ─────────────────────────────────────────────── */}
        <section>
          <SectionHeader
            title="Eğiticiler"
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
            <div className="text-center py-16 text-slate-400">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Eğitici bulunamadı</p>
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
              { icon: Users, value: "Canlı", label: "Testler" },
              { icon: BookOpen, value: "Özgün", label: "Test İçeriği" },
              { icon: GraduationCap, value: "Tecrübeli", label: "Eğiticiler" },
              { icon: TrendingUp, value: "Performans", label: "Takibi" },
            ].map(({ icon: Icon, value, label }) => (
              <div key={label} className="text-center p-8">
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
                title: "Aday Olarak Katıl",
                desc: "Alanında uzman eğiticilerden binlerce test çöz, performansını takip et ve hedefine ulaş.",
                icon: UserCircle,
              },
              {
                type: "educator",
                title: "Eğitici Olarak Katıl",
                desc: "Uzman olduğun konuda test paketleri oluştur, binlerce adaya ulaş ve gelir elde et.",
                icon: Briefcase,
              },
            ].map(({ type, title, desc, icon: Icon }) => (
              <div
                key={type}
                className="rounded-3xl p-10 text-center"
                style={{ backgroundColor: "#0000CD" }}
              >
                <div className="w-16 h-16 mx-auto bg-white/15 rounded-2xl flex items-center justify-center mb-5">
                  <Icon className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-3">{title}</h2>
                <p className="text-white/80 mb-7 text-sm">{desc}</p>
                <Button
                  size="lg"
                  className="bg-white hover:bg-slate-100"
                  style={{ color: "#0000CD" }}
                  onClick={() => {
                    navigate(createPageUrl("Register") + `?role=${type}`);
                  }}
                >
                  Hemen Başla
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="text-slate-400 py-12" style={{ backgroundColor: "#0000CD" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/10">
                  <GraduationCap className="w-6 h-6 text-white" />
                </div>
                <span className="text-lg font-bold text-white">Sınav Salonu</span>
              </div>
              <p className="text-white/70 text-sm">
                Sınavlara hazırlık için en güvenilir platform.
                <br />
                Alanında uzman eğiticilerden test çöz,
                <br />
                performansını takip et.
              </p>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-4">Kurumsal</h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Hakkımızda", page: "About" },
                  { label: "İletişim", page: "Contact" },
                  { label: "Gizlilik Politikası", page: "Privacy" },
                  { label: "İş Ortaklığı", page: "Partnership" },
                ].map(({ label, page }) => (
                  <Link
                    key={page}
                    to={createPageUrl(page)}
                    className="text-white/70 hover:text-white text-sm transition-colors"
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-4">Destek</h3>
              <Link
                to={createPageUrl("Support")}
                className="text-white/70 hover:text-white text-sm transition-colors block"
              >
                Yardım ve Destek
              </Link>
            </div>
          </div>
          <div className="pt-8 border-t border-white/10">
            <p className="text-sm text-white/80 text-center">
              © {new Date().getFullYear()} Sınav Salonu. Tüm hakları saklıdır.
            </p>
          </div>
        </div>
      </footer>

      {/* ── Login type dialog ────────────────────────────────────────────── */}
      <Dialog open={showLoginDialog} onOpenChange={setShowLoginDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl text-center">
              Sınav Salonu'na Hoş Geldiniz
            </DialogTitle>
            <DialogDescription className="text-center">
              Devam etmek için hesap türünüzü seçin
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-4">
            {[
              {
                type: "candidate",
                label: "Aday Olarak Giriş",
                sub: "Test çöz ve performansını takip et",
                icon: UserCircle,
              },
              {
                type: "educator",
                label: "Eğitici Olarak Giriş",
                sub: "Test paketi oluştur ve gelir elde et",
                icon: Briefcase,
              },
            ].map(({ type, label, sub, icon: Icon }) => (
              <button
                key={type}
                onClick={() => handleLogin(type)}
                className="w-full p-5 rounded-xl border-2 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 transition-all text-left flex items-center gap-4"
              >
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: "rgba(0,0,205,0.1)" }}
                >
                  <Icon className="w-5 h-5" style={{ color: "#0000CD" }} />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{label}</p>
                  <p className="text-sm text-slate-500">{sub}</p>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
