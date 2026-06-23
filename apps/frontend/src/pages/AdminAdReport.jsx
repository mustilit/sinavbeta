/**
 * AdminAdReport — Admin reklam satın alım raporu.
 * Filtreler: dönem (yıl/ay), eğitici adı, hedef türü (TEST/EDUCATOR), durum (aktif/süresi dolmuş).
 * Tablo: her satın alım için eğitici, paket, tür, test adı, gösterim istatistikleri, tutar, durum.
 */
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api/apiClient";
import { Pagination } from "@/components/ui/Pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Megaphone,
  RefreshCw,
  TrendingUp,
  Eye,
  Zap,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  User,
  Package,
  FileText,
} from "lucide-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

// ── Sabitler ────────────────────────────────────────────────────────────────

const MONTHS = [
  { value: 1, label: "Ocak" },   { value: 2, label: "Şubat" },
  { value: 3, label: "Mart" },   { value: 4, label: "Nisan" },
  { value: 5, label: "Mayıs" },  { value: 6, label: "Haziran" },
  { value: 7, label: "Temmuz" }, { value: 8, label: "Ağustos" },
  { value: 9, label: "Eylül" },  { value: 10, label: "Ekim" },
  { value: 11, label: "Kasım" }, { value: 12, label: "Aralık" },
];

// ── Yardımcı fonksiyonlar ────────────────────────────────────────────────────

/** Kuruş cinsinden değeri Türk lirası formatında gösterir */
function formatTL(cents) {
  return (cents / 100).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " ₺";
}

/** Gösterim oranı yüzdesini hesaplar */
function deliveryPct(delivered, total) {
  if (!total) return 0;
  return Math.round((delivered / total) * 100);
}

// ── Ana bileşen ──────────────────────────────────────────────────────────────

export default function AdminAdReport() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  // Filtre alanları (form state)
  const [year, setYear]           = useState(String(currentYear));
  const [month, setMonth]         = useState("all");          // "all" = ay filtresi yok
  const [targetType, setTargetType] = useState("all");        // "all" | "TEST" | "EDUCATOR"
  const [statusFilter, setStatus] = useState("all");          // "all" | "active" | "expired"
  const [searchText, setSearchText] = useState("");           // eğitici kullanıcı adı / e-posta arama
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Uygulanmış (fetch edilmiş) filtre değerleri
  const [applied, setApplied] = useState({
    year: String(currentYear), month: "all", targetType: "all",
  });

  // Yıl seçenekleri: son 5 yıl + "Tümü"
  const yearOptions = useMemo(() =>
    Array.from({ length: 5 }, (_, i) => String(currentYear - i)), [currentYear]);

  // API'den reklam raporu verisini çek
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-ad-report", applied],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (applied.year !== "all") params.set("year", applied.year);
      if (applied.month !== "all") params.set("month", applied.month);
      if (applied.targetType !== "all") params.set("targetType", applied.targetType);
      const { data } = await api.get(`/admin/ads/report?${params}`);
      return data;
    },
  });

  const handleApply = () => {
    setApplied({ year, month, targetType });
    setPage(1);
  };

  // İstemci tarafı filtreler: durum ve metin araması
  const filteredItems = useMemo(() => {
    const items = data?.items ?? [];
    return items.filter((item) => {
      // Durum filtresi
      if (statusFilter === "active" && !item.isActive) return false;
      if (statusFilter === "expired" && item.isActive) return false;
      // Eğitici adı / e-posta metin araması
      if (searchText.trim()) {
        const q = searchText.toLowerCase();
        if (
          !item.educatorUsername?.toLowerCase().includes(q) &&
          !item.educatorEmail?.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [data, statusFilter, searchText]);

  // Özet kart değerleri
  const summary = data ?? { totalRevenueCents: 0, totalImpressionsSold: 0, totalImpressionsDelivered: 0, activeCount: 0 };
  const totalCount = data?.items?.length ?? 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* ── Başlık ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
            <Megaphone className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Reklam Raporu</h1>
            <p className="text-slate-500 mt-0.5 text-sm">
              Eğiticilerin reklam satın alımlarını ve gösterim istatistiklerini görüntüleyin
            </p>
          </div>
        </div>
      </div>

      {/* ── Filtreler ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <p className="text-sm font-medium text-slate-700 mb-4">Filtrele</p>
        <div className="flex items-end gap-3 flex-wrap">

          {/* Yıl */}
          <div>
            <label className="block text-xs text-slate-500 mb-1.5">Yıl</label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tümü</SelectItem>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Ay */}
          <div>
            <label className="block text-xs text-slate-500 mb-1.5">Ay</label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Aylar</SelectItem>
                {MONTHS.map((m) => (
                  <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Hedef türü */}
          <div>
            <label className="block text-xs text-slate-500 mb-1.5">Hedef Türü</label>
            <Select value={targetType} onValueChange={setTargetType}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tümü</SelectItem>
                {/* TEST: belirli bir test paketi öne çıkarma */}
                <SelectItem value="TEST">Test Paketi</SelectItem>
                {/* WRITTEN: yazılı paket öne çıkarma */}
                <SelectItem value="WRITTEN">Yazılı Paketi</SelectItem>
                {/* EDUCATOR: eğiticinin kendisi öne çıkarma */}
                <SelectItem value="EDUCATOR">Eğitici Profili</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleApply}
            className="bg-indigo-600 hover:bg-indigo-700 gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Raporu Getir
          </Button>
        </div>

        {/* İstemci tarafı filtreler — fetch sonrası anlık süzgeç */}
        {data && (
          <div className="flex items-end gap-3 flex-wrap mt-4 pt-4 border-t border-slate-100">
            {/* Metin araması */}
            <div className="flex-1 min-w-48">
              <label className="block text-xs text-slate-500 mb-1.5">Eğitici Ara</label>
              <Input
                placeholder="Kullanıcı adı veya e-posta..."
                value={searchText}
                onChange={(e) => { setSearchText(e.target.value); setPage(1); }}
                className="h-9 text-sm"
              />
            </div>
            {/* Durum filtresi */}
            <div>
              <label className="block text-xs text-slate-500 mb-1.5">Durum</label>
              <Select value={statusFilter} onValueChange={(v) => { setStatus(v); setPage(1); }}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tümü</SelectItem>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="expired">Süresi Dolmuş</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {/* ── Özet Kartlar ───────────────────────────────────────────────── */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: "Toplam Satın Alım",
              value: totalCount,
              icon: Package,
              color: "bg-indigo-50 text-indigo-600",
            },
            {
              label: "Toplam Gelir",
              value: formatTL(summary.totalRevenueCents),
              icon: TrendingUp,
              color: "bg-emerald-50 text-emerald-600",
            },
            {
              label: "Toplam Gösterim Satışı",
              value: summary.totalImpressionsSold.toLocaleString("tr-TR"),
              icon: Eye,
              color: "bg-violet-50 text-violet-600",
            },
            {
              label: "Aktif Reklam",
              value: summary.activeCount,
              icon: Zap,
              color: "bg-orange-50 text-orange-600",
            },
          ].map((card) => (
            <div key={card.label} className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${card.color}`}>
                  <card.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">{card.label}</p>
                  <p className="text-2xl font-bold text-slate-900">{card.value}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Tablo ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Reklam Satın Alımları</h2>
          {data && (
            <span className="text-sm text-slate-500">
              {filteredItems.length} / {totalCount} kayıt
            </span>
          )}
        </div>

        {/* Yükleniyor */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
          </div>
        )}

        {/* Hata */}
        {error && (
          <div className="flex items-center justify-center gap-3 py-20 text-rose-600">
            <AlertCircle className="w-5 h-5" />
            <span>Rapor yüklenemedi</span>
          </div>
        )}

        {/* Boş sonuç */}
        {!isLoading && !error && filteredItems.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Megaphone className="w-12 h-12 mb-3 opacity-30" />
            <p className="font-medium">Kayıt bulunamadı</p>
            <p className="text-sm mt-1">Filtre kriterlerinizi değiştirmeyi deneyin</p>
          </div>
        )}

        {/* Veri tablosu */}
        {!isLoading && !error && filteredItems.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Eğitici</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Paket</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Tür</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Test / Hedef</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Gösterim</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Tutar</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Geçerlilik</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-600">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredItems.slice((page - 1) * pageSize, page * pageSize).map((item) => {
                  const pct = deliveryPct(item.impressionsDelivered, item.totalImpressions);
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">

                      {/* Eğitici */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-indigo-50 rounded-full flex items-center justify-center flex-shrink-0">
                            <User className="w-4 h-4 text-indigo-500" />
                          </div>
                          <div>
                            <p className="font-medium text-slate-900 text-xs">{item.educatorUsername}</p>
                            <p className="text-slate-400 text-xs">{item.educatorEmail}</p>
                          </div>
                        </div>
                      </td>

                      {/* Paket adı */}
                      <td className="px-4 py-3.5">
                        <p className="text-slate-800 font-medium text-xs">{item.packageName}</p>
                        <p className="text-slate-400 text-xs">{item.durationDays} gün</p>
                      </td>

                      {/* Hedef türü rozeti */}
                      <td className="px-4 py-3.5">
                        {item.targetType === "TEST" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                            <Package className="w-3 h-3" /> Test
                          </span>
                        ) : item.targetType === "WRITTEN" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                            <FileText className="w-3 h-3" /> Yazılı
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-700">
                            <User className="w-3 h-3" /> Eğitici
                          </span>
                        )}
                      </td>

                      {/* TEST → test adı; WRITTEN → yazılı paket adı; EDUCATOR → profil */}
                      <td className="px-4 py-3.5 max-w-[180px]">
                        {item.targetType === "WRITTEN" ? (
                          item.writtenPackageTitle ? (
                            <p className="text-slate-700 text-xs line-clamp-2">{item.writtenPackageTitle}</p>
                          ) : (
                            <span className="text-slate-400 text-xs">Yazılı paket</span>
                          )
                        ) : item.testTitle ? (
                          <p className="text-slate-700 text-xs line-clamp-2">{item.testTitle}</p>
                        ) : (
                          <span className="text-slate-400 text-xs">Eğitici profili</span>
                        )}
                      </td>

                      {/* Gösterim çubuğu */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="text-xs text-slate-700 font-medium mb-1">
                          {item.impressionsDelivered.toLocaleString("tr-TR")} / {item.totalImpressions.toLocaleString("tr-TR")}
                        </div>
                        {/* İlerleme çubuğu */}
                        <div className="w-24 ml-auto bg-slate-100 rounded-full h-1.5">
                          <div
                            className="h-1.5 rounded-full bg-indigo-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-slate-400 text-xs mt-0.5">%{pct}</p>
                      </td>

                      {/* Tutar */}
                      <td className="px-4 py-3.5 text-right font-semibold text-slate-900 text-sm">
                        {formatTL(item.priceCents)}
                      </td>

                      {/* Tarih */}
                      <td className="px-4 py-3.5">
                        <div className="text-xs text-slate-500">
                          <p>{format(new Date(item.createdAt), "dd MMM yyyy", { locale: tr })}</p>
                          {/* Geçerlilik bitiş tarihi */}
                          <p className="text-slate-400">
                            → {format(new Date(item.validUntil), "dd MMM yyyy", { locale: tr })}
                          </p>
                        </div>
                      </td>

                      {/* Durum rozeti */}
                      <td className="px-4 py-3.5 text-center">
                        {item.isActive ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                            <CheckCircle2 className="w-3 h-3" /> Aktif
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                            <XCircle className="w-3 h-3" /> Doldu
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Tablo özet satırı */}
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-200">
                  <td colSpan={4} className="px-4 py-3.5 font-bold text-slate-900 text-sm">
                    Toplam ({filteredItems.length} satın alım)
                  </td>
                  <td className="px-4 py-3.5 text-right font-bold text-slate-900 text-sm">
                    {filteredItems.reduce((s, i) => s + i.impressionsDelivered, 0).toLocaleString("tr-TR")}
                    {" / "}
                    {filteredItems.reduce((s, i) => s + i.totalImpressions, 0).toLocaleString("tr-TR")}
                  </td>
                  <td className="px-4 py-3.5 text-right font-bold text-emerald-700 text-sm">
                    {formatTL(filteredItems.reduce((s, i) => s + i.priceCents, 0))}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
            <Pagination page={page} pageSize={pageSize} total={filteredItems.length} onPageChange={setPage} onPageSizeChange={setPageSize} />
          </div>
        )}
      </div>
    </div>
  );
}
