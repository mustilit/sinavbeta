import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Layers, Loader2, Play, ShoppingCart, CheckCircle2, FileText, User, X, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PaginationBar from "@/components/ui/PaginationBar";
import { candidateTunnels as api } from "@/api/dalClient";
import { createPageUrl } from "@/utils";

const PAGE_SIZE = 9;

/**
 * Tünel kart ızgarası — Keşfet (mode="discover") ve Satın Aldıklarım (mode="mine").
 * Filtre (arama + sınav türü + durum) + sayfalama, Testler sekmesindeki filtre
 * kutusuyla aynı görünümde. Karta tıklayınca TunnelDetail'e gider.
 */
export function TunnelGrid({ mode = "discover" }) {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["candidateTunnels"],
    queryFn: () => api.list(),
    staleTime: 30_000,
  });

  const all = useMemo(
    () => (data?.items ?? []).filter((t) => (mode === "mine" ? t.purchased : !t.purchased)),
    [data, mode],
  );
  const examTypes = useMemo(() => [...new Set(all.map((t) => t.examTypeName).filter(Boolean))], [all]);
  const topics = useMemo(() => [...new Set(all.map((t) => t.topicName).filter(Boolean))], [all]);
  const educators = useMemo(() => [...new Set(all.map((t) => t.educatorUsername).filter(Boolean))], [all]);

  const [search, setSearch] = useState("");
  const [examType, setExamType] = useState("all");
  const [topic, setTopic] = useState("all");
  const [educator, setEducator] = useState("all"); // yalnız discover (Keşfet)
  const [priceRange, setPriceRange] = useState("all"); // yalnız discover
  const [status, setStatus] = useState("all"); // yalnız mine
  const [page, setPage] = useState(1);

  const filtered = useMemo(
    () => {
      const inPrice = (cents) => {
        const tl = (cents || 0) / 100;
        switch (priceRange) {
          case "100to250": return tl >= 100 && tl <= 250;
          case "251to500": return tl >= 251 && tl <= 500;
          case "501to1000": return tl >= 501 && tl <= 1000;
          case "over1000": return tl > 1000;
          default: return true;
        }
      };
      return all.filter((t) => {
        if (search && !(t.title || "").toLowerCase().includes(search.toLowerCase())) return false;
        if (examType !== "all" && t.examTypeName !== examType) return false;
        if (topic !== "all" && t.topicName !== topic) return false;
        if (mode === "discover") {
          if (educator !== "all" && t.educatorUsername !== educator) return false;
          if (!inPrice(t.priceCents)) return false;
        }
        if (mode === "mine" && status !== "all") {
          const s = t.attemptStatus;
          if (status === "not_started" && s) return false;
          if (status === "in_progress" && s !== "IN_PROGRESS") return false;
          if (status === "completed" && s !== "COMPLETED") return false;
        }
        return true;
      });
    },
    [all, search, examType, topic, educator, priceRange, status, mode],
  );

  useEffect(() => { setPage(1); }, [search, examType, topic, educator, priceRange, status, mode]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const hasActiveFilters =
    !!search || examType !== "all" || topic !== "all" || educator !== "all" || priceRange !== "all" || status !== "all";
  const clearFilters = () => {
    setSearch(""); setExamType("all"); setTopic("all"); setEducator("all"); setPriceRange("all"); setStatus("all");
  };

  const detailUrl = (t) => createPageUrl("TunnelDetail") + `?id=${t.id}`;

  const card = (t) => (
    <li key={t.id}>
      <div
        onClick={() => navigate(detailUrl(t))}
        className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white transition-all duration-300 hover:shadow-xl hover:shadow-slate-200/50"
      >
        <div className="relative h-40 overflow-hidden" style={{ backgroundColor: t.coverImageUrl ? "transparent" : "#0000CD" }}>
          {t.coverImageUrl ? (
            <img src={t.coverImageUrl} alt={t.title} className="h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center"><Layers className="h-16 w-16 text-white/30" /></div>
          )}
          <div className="absolute left-3 top-3">
            <Badge className="bg-indigo-600/95 text-white backdrop-blur-sm hover:bg-indigo-600"><Layers className="mr-1 h-3 w-3" /> Tünel</Badge>
          </div>
          {t.examTypeName && (
            <div className="absolute right-3 top-3"><Badge className="bg-white/90 text-slate-700 backdrop-blur-sm hover:bg-white">{t.examTypeName}</Badge></div>
          )}
        </div>
        <div className="flex flex-1 flex-col p-5">
          <h3 className="line-clamp-2 text-lg font-semibold text-slate-900">{t.title}</h3>
          {t.topicName && <p className="mt-1 text-sm text-slate-500">{t.topicName}</p>}
          {t.educatorUsername && (
            <span className="mt-2 flex items-center gap-1.5 text-sm text-slate-500"><User className="h-4 w-4 flex-shrink-0" /><span className="truncate">{t.educatorUsername}</span></span>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-500">
            <span className="flex items-center gap-1"><Layers className="h-4 w-4" /> {t.layerCount} katman</span>
            {t.questionCount > 0 && <span className="flex items-center gap-1"><FileText className="h-4 w-4" /> {t.questionCount} soru</span>}
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <span className="text-2xl font-bold text-slate-900">{t.priceCents > 0 ? `₺${(t.priceCents / 100).toFixed(0)}` : "Ücretsiz"}</span>
            {t.purchased ? (
              <Button size="sm" className="bg-indigo-600 text-white hover:bg-indigo-700" onClick={(e) => { e.stopPropagation(); navigate(createPageUrl("TakeTunnel") + `?id=${t.id}`); }}>
                {t.attemptStatus === "COMPLETED" ? (<><CheckCircle2 className="mr-1.5 h-4 w-4" /> Tamamlandı</>) : (<><Play className="mr-1.5 h-4 w-4" /> {t.attemptStatus ? "Devam Et" : "Başla"}</>)}
              </Button>
            ) : (
              <Button size="sm" className="bg-indigo-600 text-white hover:bg-indigo-700" onClick={(e) => { e.stopPropagation(); navigate(detailUrl(t)); }}>
                <ShoppingCart className="mr-1.5 h-4 w-4" /> İncele & Satın Al
              </Button>
            )}
          </div>
        </div>
      </div>
    </li>
  );

  return (
    <div>
      {/* Filtre — başlıksız, hafif satır */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative sm:w-56">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tünel ara" className="pl-9" />
        </div>
        <Select value={examType} onValueChange={setExamType}>
          <SelectTrigger className="sm:w-44" aria-label="Sınav türü"><SelectValue placeholder="Sınav Türü" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm Sınav Türleri</SelectItem>
            {examTypes.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={topic} onValueChange={setTopic}>
          <SelectTrigger className="sm:w-44" aria-label="Konu"><SelectValue placeholder="Konu" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm Konular</SelectItem>
            {topics.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
        {mode === "discover" && (
          <Select value={educator} onValueChange={setEducator}>
            <SelectTrigger className="sm:w-44" aria-label="Eğitici"><SelectValue placeholder="Eğitici" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Eğiticiler</SelectItem>
              {educators.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {mode === "discover" && (
          <Select value={priceRange} onValueChange={setPriceRange}>
            <SelectTrigger className="sm:w-44" aria-label="Fiyat"><SelectValue placeholder="Fiyat" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tümü</SelectItem>
              <SelectItem value="100to250">₺100 – ₺250</SelectItem>
              <SelectItem value="251to500">₺251 – ₺500</SelectItem>
              <SelectItem value="501to1000">₺501 – ₺1000</SelectItem>
              <SelectItem value="over1000">₺1000 Üstü</SelectItem>
            </SelectContent>
          </Select>
        )}
        {mode === "mine" && (
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="sm:w-44" aria-label="Durum"><SelectValue placeholder="Durum" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Durumlar</SelectItem>
              <SelectItem value="not_started">Başlanmadı</SelectItem>
              <SelectItem value="in_progress">Devam Ediyor</SelectItem>
              <SelectItem value="completed">Tamamlandı</SelectItem>
            </SelectContent>
          </Select>
        )}
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-rose-600 hover:text-rose-700">
            <X className="mr-1 h-4 w-4" /> Temizle
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      ) : filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-slate-500">
          {hasActiveFilters
            ? "Filtreye uyan tünel yok."
            : mode === "mine"
              ? "Henüz satın aldığın tünel yok. Keşfet'ten bir tünel edin."
              : "Şu an keşfedilecek tünel yok."}
        </p>
      ) : (
        <>
          <ul className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">{paged.map(card)}</ul>
          <PaginationBar page={currentPage} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
