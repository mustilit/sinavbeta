import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { createPageUrl } from "@/utils";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, BookOpen, Star, User, TrendingUp, GraduationCap } from "lucide-react";
import api from "@/lib/api/apiClient";
import PaginationBar from "@/components/ui/PaginationBar";

const PAGE_SIZE = 10;

export default function Educators() {
  const { t } = useTranslation(["pages"]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedExamTypeId, setSelectedExamTypeId] = useState(null);

  // Sınav türleri
  const { data: examTypes = [] } = useQuery({
    queryKey: ["examTypesPublic"],
    queryFn: async () => {
      const res = await api.get("/site/exam-types");
      return Array.isArray(res?.data) ? res.data : [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Tek kaynak: /site/featured-educators — seçili exam türüne göre filtrele
  const { data: rawEducators = [], isLoading } = useQuery({
    queryKey: ["allEducators", selectedExamTypeId],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "100" });
      if (selectedExamTypeId) params.set("examTypeIds", selectedExamTypeId);
      const res = await api.get(`/site/featured-educators?${params}`);
      const data = res?.data ?? res;
      return Array.isArray(data) ? data : (data?.items ?? []);
    },
    staleTime: 2 * 60 * 1000,
  });

  // Backend shape: { id, username, avatarUrl, testCount, saleCount, ratingAvg }
  const educators = rawEducators
    .map((e) => ({
      id: e.id,
      name: e.username ?? e.name ?? e.id,
      avatarUrl: e.avatarUrl ?? null,
      testCount: e.testCount ?? 0,
      totalSales: e.saleCount ?? 0,
      avgRating: e.ratingAvg ?? 0,
    }))
    .sort((a, b) => b.totalSales - a.totalSales || b.testCount - a.testCount);

  const filteredEducators = educators.filter((edu) =>
    !searchQuery || (edu.name?.toLowerCase() ?? "").includes(searchQuery.toLowerCase())
  );

  // Paging — 10 satır / sayfa. Filtre veya arama değişince 1. sayfaya dön.
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [searchQuery, selectedExamTypeId]);
  const totalPages = Math.max(1, Math.ceil(filteredEducators.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedEducators = useMemo(
    () => filteredEducators.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredEducators, currentPage],
  );

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">{t("pages:titles.educators")}</h1>
        <p className="text-slate-500 mt-2">{t("pages:titles.educatorsDesc")}</p>
      </div>

      {/* Arama + Filtre */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-6 space-y-3">
        {/* Arama */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <Input
            placeholder="Eğitici ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 h-11 border-slate-200"
          />
        </div>

        {/* Uzmanlık Alanı (Sınav Türü) Filtreleri */}
        {examTypes.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500 shrink-0">
              <GraduationCap className="w-3.5 h-3.5" />
              Uzmanlık:
            </span>
            <button
              onClick={() => setSelectedExamTypeId(null)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                !selectedExamTypeId
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Tümü
            </button>
            {examTypes.map((et) => (
              <button
                key={et.id}
                onClick={() => setSelectedExamTypeId(et.id === selectedExamTypeId ? null : et.id)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                  selectedExamTypeId === et.id
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {et.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Sonuçlar */}
      {isLoading ? (
        <div className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 p-6 h-40 animate-pulse">
              <div className="flex gap-4">
                <div className="w-16 h-16 bg-slate-200 rounded-full" />
                <div className="flex-1 space-y-3">
                  <div className="h-5 bg-slate-200 rounded w-3/4" />
                  <div className="h-4 bg-slate-200 rounded w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredEducators.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-20 h-20 mx-auto bg-slate-100 rounded-full flex items-center justify-center mb-4">
            <Search className="w-10 h-10 text-slate-400" />
          </div>
          <h3 className="text-xl font-semibold text-slate-900">Eğitici bulunamadı</h3>
          <p className="text-slate-500 mt-2">
            {selectedExamTypeId ? "Bu uzmanlık alanında eğitici yok" : "Farklı bir arama terimi deneyin"}
          </p>
          {selectedExamTypeId && (
            <button
              onClick={() => setSelectedExamTypeId(null)}
              className="mt-4 text-sm text-indigo-600 hover:underline"
            >
              Tüm eğiticileri göster
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-500 mb-6">{filteredEducators.length} eğitici bulundu</p>
          <div className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
            {pagedEducators.map((educator) => (
              <Link
                key={educator.id}
                to={createPageUrl("EducatorProfile") + `?id=${encodeURIComponent(educator.id)}`}
                className="group bg-white rounded-2xl border border-slate-100 p-6 hover:shadow-xl hover:border-indigo-200 transition-all"
              >
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-indigo-100 to-violet-100 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {educator.avatarUrl
                      ? <img src={educator.avatarUrl} alt={educator.name} className="w-full h-full object-cover" />
                      : <User className="w-8 h-8 text-indigo-600" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-lg text-slate-900 group-hover:text-indigo-600 transition-colors truncate mb-3">
                      {educator.name}
                    </h3>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <BookOpen className="w-4 h-4 text-indigo-500" />
                        <span>{educator.testCount} Test</span>
                      </div>
                      {educator.avgRating > 0 && (
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                          <span>{educator.avgRating} Puan</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <TrendingUp className="w-4 h-4 text-emerald-500" />
                        <span>{educator.totalSales} Satış</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <Button variant="ghost" size="sm" className="w-full text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50">
                    Testleri Görüntüle
                  </Button>
                </div>
              </Link>
            ))}
          </div>
          <PaginationBar
            page={currentPage}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
