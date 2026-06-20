import { useState, useDeferredValue } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { candidateWritten } from "@/api/dalClient";
import { PaymentModal } from "@/components/ui/PaymentModal";
import WrittenPackageCard from "@/components/written/WrittenPackageCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Loader2, Search, SlidersHorizontal, Star, X } from "lucide-react";

/**
 * WrittenPackageGrid — yazılı paket kart ızgarası (TestPackageCard görünümünde).
 * mode="discover" → pazar + Keşfet'teki test filtresinin aynısı (Sınav Türü hariç —
 * yazılı pakette examType yok). mode="mine" → satın alınanlar (filtresiz).
 */
export function WrittenPackageGrid({ mode = "discover" }) {
  const { t } = useTranslation(["pages"]);
  const isMine = mode === "mine";
  const queryClient = useQueryClient();
  const [payTarget, setPayTarget] = useState(null);

  // Filtre state (discover) — Explore ile aynı
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDifficulty, setSelectedDifficulty] = useState("");
  const [priceRange, setPriceRange] = useState("");
  const [selectedEducator, setSelectedEducator] = useState("");
  const [minRating, setMinRating] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const deferredSearch = useDeferredValue(searchQuery);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["candidateWritten", isMine ? "mine" : "discover"],
    queryFn: () => (isMine ? candidateWritten.myPackages() : candidateWritten.listPackages({ limit: 40 })),
    staleTime: 30_000,
  });

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-indigo-500" /></div>;
  if (isError) return <p className="py-16 text-center text-sm text-rose-500">{t("pages:writtenGrid.loadError")}</p>;

  const allItems = data?.items ?? [];

  // Discover filtreleme (Explore mantığıyla birebir)
  const q = deferredSearch.trim().toLowerCase();
  const eduQ = selectedEducator.trim().toLowerCase();
  const items = isMine
    ? allItems
    : allItems.filter((p) => {
        const price = (p.priceCents ?? 0) / 100;
        const matchesSearch =
          !q ||
          (p.title ?? "").toLowerCase().includes(q) ||
          (p.description ?? "").toLowerCase().includes(q) ||
          (p.educatorName ?? "").toLowerCase().includes(q);
        const matchesDifficulty = !selectedDifficulty || p.difficulty === selectedDifficulty;
        const matchesEducator = !eduQ || (p.educatorName ?? "").toLowerCase().includes(eduQ);
        const matchesRating = !minRating || (p.avgRating || 0) >= minRating;
        let matchesPrice = true;
        if (priceRange === "100to250") matchesPrice = price >= 100 && price <= 250;
        else if (priceRange === "251to500") matchesPrice = price >= 251 && price <= 500;
        else if (priceRange === "501to1000") matchesPrice = price >= 501 && price <= 1000;
        else if (priceRange === "over1000") matchesPrice = price > 1000;
        return matchesSearch && matchesDifficulty && matchesEducator && matchesRating && matchesPrice;
      });

  const hasActiveFilters = searchQuery || selectedDifficulty || priceRange || minRating > 0 || selectedEducator;
  const clearFilters = () => { setSearchQuery(""); setSelectedDifficulty(""); setPriceRange(""); setSelectedEducator(""); setMinRating(0); };

  return (
    <>
      {/* Filtre çubuğu — Keşfet test filtresinin aynısı (discover) */}
      {!isMine && allItems.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-8">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <Input placeholder={t("pages:explore.searchPlaceholder")} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-12 h-12 border-slate-200" />
            </div>
            <Button variant="outline" className="lg:hidden" onClick={() => setShowFilters(!showFilters)}>
              <SlidersHorizontal className="w-4 h-4 mr-2" />{t("pages:explore.filtersButton")}
            </Button>
            <div className={`flex flex-col lg:flex-row gap-4 ${showFilters ? "block" : "hidden lg:flex"}`}>
              <Select value={selectedDifficulty} onValueChange={setSelectedDifficulty}>
                <SelectTrigger aria-label={t("pages:explore.filter.difficultyAria")} className="w-full lg:w-36 h-12">
                  <SelectValue placeholder={t("pages:explore.filter.difficulty")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>{t("pages:explore.filter.all")}</SelectItem>
                  <SelectItem value="easy">{t("pages:testCard.difficulty.easy")}</SelectItem>
                  <SelectItem value="medium">{t("pages:testCard.difficulty.medium")}</SelectItem>
                  <SelectItem value="hard">{t("pages:testCard.difficulty.hard")}</SelectItem>
                </SelectContent>
              </Select>

              <Select value={priceRange} onValueChange={setPriceRange}>
                <SelectTrigger aria-label={t("pages:explore.filter.priceAria")} className="w-full lg:w-36 h-12">
                  <SelectValue placeholder={t("pages:explore.filter.price")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>{t("pages:explore.filter.all")}</SelectItem>
                  <SelectItem value="100to250">{t("pages:explore.filter.price100to250")}</SelectItem>
                  <SelectItem value="251to500">{t("pages:explore.filter.price251to500")}</SelectItem>
                  <SelectItem value="501to1000">{t("pages:explore.filter.price501to1000")}</SelectItem>
                  <SelectItem value="over1000">{t("pages:explore.filter.priceOver1000")}</SelectItem>
                </SelectContent>
              </Select>

              <Input aria-label={t("pages:explore.filter.educatorAria")} placeholder={t("pages:explore.filter.educator")} value={selectedEducator} onChange={(e) => setSelectedEducator(e.target.value)} className="w-full lg:w-44 h-12" />

              <div className="flex items-center gap-2 px-3 h-12 bg-white border rounded-md min-w-[140px]">
                <Star className="w-4 h-4 text-amber-500" />
                <span className="text-sm text-slate-600 w-6">{minRating}+</span>
                <Slider value={[minRating]} onValueChange={([v]) => setMinRating(v)} max={5} step={1} className="w-16" aria-label={t("pages:explore.filter.ratingAria")} />
              </div>
            </div>
          </div>
          {hasActiveFilters && (
            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100">
              <span className="text-sm text-slate-500">{t("pages:explore.filter.active")}</span>
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-rose-600 hover:text-rose-700">
                <X className="w-4 h-4 mr-1" />{t("pages:explore.filter.clear")}
              </Button>
            </div>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <p className="py-16 text-center text-sm text-slate-500">{isMine ? t("pages:writtenGrid.emptyMine") : t("pages:writtenGrid.emptyDiscover")}</p>
      ) : (
        <div className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
          {items.map((pkg) => (
            <WrittenPackageCard key={pkg.id ?? pkg.packageId} pkg={pkg} purchased={isMine} onBuy={(p) => setPayTarget(p)} />
          ))}
        </div>
      )}

      <PaymentModal
        isOpen={!!payTarget}
        onClose={() => setPayTarget(null)}
        kind="written"
        test={payTarget ? { id: payTarget.id, title: payTarget.title, price: (payTarget.priceCents ?? 0) / 100 } : null}
        onPurchased={() => { setPayTarget(null); queryClient.invalidateQueries({ queryKey: ["candidateWritten"] }); }}
      />
    </>
  );
}
