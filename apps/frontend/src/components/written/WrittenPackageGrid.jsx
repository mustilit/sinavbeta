import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { candidateWritten } from "@/api/dalClient";
import { buildPageUrl } from "@/lib/navigation";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, BookOpen } from "lucide-react";

/**
 * WrittenPackageGrid — yazılı paket kart ızgarası.
 * mode="discover" → pazar (yayımlı paketler); mode="mine" → satın alınanlar.
 * Kart tıklanınca WrittenTestDetail'e gider.
 */
export function WrittenPackageGrid({ mode = "discover" }) {
  const { t } = useTranslation(["pages"]);
  const isMine = mode === "mine";

  const { data, isLoading, isError } = useQuery({
    queryKey: ["candidateWritten", isMine ? "mine" : "discover"],
    queryFn: () => (isMine ? candidateWritten.myPackages() : candidateWritten.listPackages({ limit: 40 })),
    staleTime: 30_000,
  });

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-indigo-500" /></div>;
  if (isError) return <p className="py-16 text-center text-sm text-rose-500">{t("pages:writtenGrid.loadError")}</p>;

  const items = data?.items ?? [];
  if (!items.length) {
    return <p className="py-16 text-center text-sm text-slate-500">{isMine ? t("pages:writtenGrid.emptyMine") : t("pages:writtenGrid.emptyDiscover")}</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((p) => {
        const pkgId = isMine ? p.packageId : p.id;
        const priceLabel = isMine ? null : p.priceCents > 0 ? `${(p.priceCents / 100).toFixed(2)} ₺` : t("pages:writtenGrid.free");
        return (
          <Link key={pkgId} to={`${buildPageUrl("WrittenTestDetail")}?id=${pkgId}`}
            className="group overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:shadow-md dark:border-gray-800 dark:bg-gray-900">
            <div className="relative h-28" style={{ backgroundColor: p.coverImageUrl ? "transparent" : "#0000CD" }}>
              {p.coverImageUrl ? <img src={p.coverImageUrl} alt={p.title} className="h-full w-full object-cover" /> : <div className="absolute inset-0 flex items-center justify-center"><BookOpen className="h-10 w-10 text-white/30" /></div>}
              <Badge className="absolute left-2 top-2 bg-amber-100 text-amber-700"><FileText className="mr-1 h-3 w-3" />{t("pages:writtenGrid.typeBadge")}</Badge>
            </div>
            <div className="p-3">
              <div className="truncate font-semibold text-slate-900 dark:text-gray-100">{p.title}</div>
              {p.educatorName && <div className="mt-0.5 truncate text-xs text-slate-500">{p.educatorName}</div>}
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-slate-500">{(isMine ? p.tests?.length : p.testCount) ?? 0} {t("pages:writtenGrid.testsSuffix")}</span>
                {priceLabel && <span className="font-bold text-indigo-600">{priceLabel}</span>}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
