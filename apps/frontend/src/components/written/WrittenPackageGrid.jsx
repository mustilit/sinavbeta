import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { candidateWritten } from "@/api/dalClient";
import { PaymentModal } from "@/components/ui/PaymentModal";
import WrittenPackageCard from "@/components/written/WrittenPackageCard";
import { Loader2 } from "lucide-react";

/**
 * WrittenPackageGrid — yazılı paket kart ızgarası (TestPackageCard görünümünde).
 * mode="discover" → pazar + Satın Al (PaymentModal); mode="mine" → satın alınanlar (Çöz).
 */
export function WrittenPackageGrid({ mode = "discover" }) {
  const { t } = useTranslation(["pages"]);
  const isMine = mode === "mine";
  const queryClient = useQueryClient();
  const [payTarget, setPayTarget] = useState(null);

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
    <>
      {/* Test bölümüyle birebir aynı grid: auto-fill, min 280px → satır başı kart sayısı eşit */}
      <div className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
        {items.map((pkg) => (
          <WrittenPackageCard
            key={pkg.id ?? pkg.packageId}
            pkg={pkg}
            purchased={isMine}
            onBuy={(p) => setPayTarget(p)}
          />
        ))}
      </div>

      <PaymentModal
        isOpen={!!payTarget}
        onClose={() => setPayTarget(null)}
        kind="written"
        test={payTarget ? { id: payTarget.id, title: payTarget.title, price: (payTarget.priceCents ?? 0) / 100 } : null}
        onPurchased={() => {
          setPayTarget(null);
          queryClient.invalidateQueries({ queryKey: ["candidateWritten"] });
        }}
      />
    </>
  );
}
