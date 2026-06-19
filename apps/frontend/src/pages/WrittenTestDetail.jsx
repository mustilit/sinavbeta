import { useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { candidateWritten } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PaymentModal } from "@/components/ui/PaymentModal";
import { buildPageUrl } from "@/lib/navigation";
import { Loader2, ArrowLeft, FileText, Clock, ShoppingCart, PlayCircle, CheckCircle2, BookOpen } from "lucide-react";

/**
 * WrittenTestDetail — yazılı paket detay + satın alma + test listesi.
 * Satın alınmadıysa PaymentModal (kind="written"). Alındıysa her test için
 * Başla/Devam/İncele → TakeWrittenTest. Çözüm/soru içeriği detayda sızdırılmaz.
 */
function WrittenTestDetail() {
  const { t } = useTranslation(["pages"]);
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const id = sp.get("id");
  const [payOpen, setPayOpen] = useState(false);

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

  if (isLoading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-indigo-500" /></div>;
  if (!pkg) return <div className="mx-auto max-w-xl px-4 py-16 text-center text-slate-500">{t("pages:writtenDetail.notFound")}</div>;

  const purchasedEntry = (mine?.items ?? []).find((p) => p.packageId === id);
  const purchased = !!purchasedEntry;
  const priceLabel = pkg.priceCents > 0 ? `${(pkg.priceCents / 100).toFixed(2)} ₺` : t("pages:writtenDetail.free");
  // Satın alındıysa deneme durumları my-packages'tan; değilse public test listesi
  const tests = purchased ? purchasedEntry.tests : (pkg.tests ?? []);

  const stateLabel = (st) => {
    if (st === "SUBMITTED" || st === "TIMEOUT") return { label: t("pages:writtenDetail.review"), icon: CheckCircle2 };
    if (st === "IN_PROGRESS") return { label: t("pages:writtenDetail.continue"), icon: PlayCircle };
    return { label: t("pages:writtenDetail.start"), icon: PlayCircle };
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4"><ArrowLeft className="mr-1 h-4 w-4" />{t("pages:writtenDetail.back")}</Button>

      {/* Hero */}
      <div className="relative mb-6 h-44 overflow-hidden rounded-2xl" style={{ backgroundColor: pkg.coverImageUrl ? "transparent" : "#0000CD" }}>
        {pkg.coverImageUrl ? <img src={pkg.coverImageUrl} alt={pkg.title} className="h-full w-full object-cover" /> : <div className="absolute inset-0 flex items-center justify-center"><BookOpen className="h-16 w-16 text-white/30" /></div>}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-4 left-4 right-4">
          <Badge className="mb-1 bg-amber-100 text-amber-700"><FileText className="mr-1 h-3 w-3" />{t("pages:writtenDetail.typeBadge")}</Badge>
          <h1 className="truncate text-2xl font-bold text-white">{pkg.title}</h1>
          {pkg.educatorName && <p className="text-sm text-white/80">{pkg.educatorName}</p>}
        </div>
      </div>

      {pkg.description && <p className="mb-6 whitespace-pre-wrap text-slate-600 dark:text-gray-300">{pkg.description}</p>}

      {/* Satın alma / durum */}
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

      <PaymentModal
        isOpen={payOpen}
        onClose={() => setPayOpen(false)}
        kind="written"
        test={{ id: pkg.id, title: pkg.title, price: pkg.priceCents / 100 }}
        onPurchased={() => { setPayOpen(false); refetchMine(); }}
      />
    </div>
  );
}

export default WrittenTestDetail;
export { WrittenTestDetail };
