import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { buildPageUrl } from "@/lib/navigation";
import { BookOpen, FileText, Star, User, Play, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * WrittenPackageCard — yazılı (açık uçlu) paket kartı.
 * TestPackageCard ile birebir görünüm/içerik; linkler WrittenTestDetail'e gider.
 * `pkg` camelCase (candidateWritten endpoint çıktısı). discover'da onBuy; mine'da
 * purchased → Çöz linki.
 */
export default function WrittenPackageCard({ pkg, purchased = false }) {
  const { t } = useTranslation(["pages"]);
  const id = pkg.id ?? pkg.packageId;
  const detailUrl = `${buildPageUrl("WrittenTestDetail")}?id=${id}`;
  const testCount = pkg.testCount ?? pkg.tests?.length ?? 0;
  const questionCount = pkg.totalQuestions ?? (pkg.tests?.reduce((s, tt) => s + (tt.questionCount ?? 0), 0) ?? 0);

  const difficultyColorClass = {
    easy: "bg-emerald-100 text-emerald-700",
    medium: "bg-amber-100 text-amber-700",
    hard: "bg-rose-100 text-rose-700",
  }[pkg.difficulty] || "bg-amber-100 text-amber-700";
  const difficultyLabel = t(`pages:testCard.difficulty.${pkg.difficulty || "medium"}`);

  return (
    <div className="group bg-white rounded-2xl border border-slate-100 overflow-hidden hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-300 dark:bg-gray-900 dark:border-gray-800">
      <Link to={detailUrl}>
        <div className="relative h-40 overflow-hidden cursor-pointer" style={{ backgroundColor: "#0000CD" }}>
          {pkg.coverImageUrl ? (
            <img src={pkg.coverImageUrl} alt={pkg.title} className="w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center"><BookOpen className="w-16 h-16 text-white/30" /></div>
          )}
          <div className="absolute top-3 left-3">
            <Badge className="bg-white/90 text-amber-700 backdrop-blur-sm">{t("pages:writtenGrid.typeBadge")}</Badge>
          </div>
          <div className="absolute bottom-3 right-3">
            <Badge className={`bg-white/90 backdrop-blur-sm ${difficultyColorClass}`}>{difficultyLabel}</Badge>
          </div>
        </div>
      </Link>

      <div className="p-5">
        <Link to={detailUrl}>
          <h3 className="font-semibold text-lg text-slate-900 dark:text-gray-100 line-clamp-2 cursor-pointer transition-colors hover:text-indigo-700">{pkg.title}</h3>
        </Link>

        {pkg.educatorName && (
          pkg.educatorId ? (
            <Link to={`${buildPageUrl("EducatorProfile")}?id=${pkg.educatorId}`} onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-2 mt-2 text-sm text-slate-500 hover:text-indigo-700 max-w-full min-w-0">
              <User className="w-4 h-4 flex-shrink-0" /><span className="truncate">{pkg.educatorName}</span>
            </Link>
          ) : (
            <span className="flex items-center gap-2 mt-2 text-sm text-slate-500 max-w-full min-w-0">
              <User className="w-4 h-4 flex-shrink-0" /><span className="truncate">{pkg.educatorName}</span>
            </span>
          )
        )}

        <div className="flex items-center gap-4 mt-4 text-sm text-slate-500 flex-wrap">
          {testCount > 0 && (
            <div className="flex items-center gap-1"><BookOpen className="w-4 h-4" /><span>{t("pages:writtenGrid.testsLabel", { count: testCount })}</span></div>
          )}
          <div className="flex items-center gap-1"><FileText className="w-4 h-4" /><span>{t("pages:testCard.questionsLabel", { count: questionCount })}</span></div>
          {pkg.avgRating > 0 && (
            <div className="flex items-center gap-1"><Star className="w-4 h-4 fill-amber-400 text-amber-400" /><span>{pkg.avgRating.toFixed(1)}</span></div>
          )}
        </div>

        <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100 dark:border-gray-800 flex-wrap gap-3">
          {purchased ? (() => {
            // Paket durumu (TestPackageCard deseni): devam eden varsa turuncu "Devam Et";
            // hepsi tamamlandıysa gri "İncele"; aksi halde mavi "Başla".
            const states = (pkg.tests ?? []).map((tt) => tt.state);
            const anyInProgress = states.includes("IN_PROGRESS");
            const allDone = states.length > 0 && states.every((s) => s === "SUBMITTED" || s === "TIMEOUT");
            const style = { backgroundColor: anyInProgress ? "#f59e0b" : allDone ? "#64748b" : "#0000CD" };
            const label = anyInProgress ? t("pages:writtenDetail.continue") : allDone ? t("pages:writtenDetail.review") : t("pages:writtenDetail.start");
            return (
              <>
                <span className="text-sm font-medium text-emerald-700">{t("pages:writtenGrid.purchasedLabel")}</span>
                <Link to={detailUrl}>
                  <Button size="sm" style={style} className="text-white hover:opacity-90 flex items-center gap-1">
                    {allDone ? <Eye className="w-4 h-4" /> : <Play className="w-4 h-4" />}{label}
                  </Button>
                </Link>
              </>
            );
          })() : (
            <>
              <div className="min-w-0 text-2xl font-bold text-slate-900 dark:text-gray-100">
                {pkg.priceCents === 0 ? t("pages:testCard.free") : `₺${(pkg.priceCents / 100).toFixed(0)}`}
              </div>
              {/* Test paketi deseni: "Satın Al" inceleme (detay) sayfasına gider; ödeme orada (giriş kapısıyla). */}
              <Link to={detailUrl}>
                <Button className="bg-indigo-600 text-white hover:bg-indigo-700">{t("pages:testCard.buy")}</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
