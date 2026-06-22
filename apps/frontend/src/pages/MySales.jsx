import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { entities } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import StatCard from "@/components/ui/StatCard";
import { ShoppingBag, TrendingUp, Users, DollarSign, Search, Download, X, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import PaginationBar from "@/components/ui/PaginationBar";
import { toast } from "sonner";

const PAGE_SIZE = 15;

export default function MySales() {
  const { t } = useTranslation(["pages"]);
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all"); // sınav türü: all | package | written | tunnel
  const [page, setPage] = useState(1);

  // Satış kaydının türü (package/written/tunnel) — kind yoksa "package" sayılır (legacy).
  const saleKind = (s) => (s.kind === "tunnel" || s.kind === "written" ? s.kind : "package");

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ["mySales", user?.email],
    queryFn: () => entities.Purchase.filter({ educator_email: user.email }, "-created_date"),
    enabled: !!user,
  });

  // Filter sales
  const filteredSales = sales.filter(sale => {
    const matchesSearch = sale.user_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         sale.user_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         sale.test_package_title?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || sale.status === statusFilter;
    const matchesKind = kindFilter === "all" || saleKind(sale) === kindFilter;

    let matchesDate = true;
    if (dateFilter === "today") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      matchesDate = new Date(sale.created_date) >= today;
    } else if (dateFilter === "week") {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      matchesDate = new Date(sale.created_date) >= weekAgo;
    } else if (dateFilter === "month") {
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      matchesDate = new Date(sale.created_date) >= monthAgo;
    }
    
    return matchesSearch && matchesStatus && matchesKind && matchesDate;
  });

  // Sayfalama: 15 satır/sayfa. Filtre değişimlerinde 1. sayfaya dön.
  // currentPage'i totalPages'a clamp ediyoruz çünkü filtre liste boyutunu
  // küçültürse mevcut sayfa numarası geçersiz olabilir.
  const totalPages = Math.max(1, Math.ceil(filteredSales.length / PAGE_SIZE));
  useEffect(() => { setPage(1); }, [searchQuery, statusFilter, dateFilter, kindFilter]);
  const currentPage = Math.min(page, totalPages);
  const pagedSales = useMemo(
    () => filteredSales.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    // filteredSales her render'da yeni referans; filtre/page tetikler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentPage, searchQuery, statusFilter, dateFilter, kindFilter, sales.length],
  );

  const totalRevenue = sales.reduce((sum, s) => sum + (s.price_paid || 0), 0);
  const uniqueBuyers = new Set(sales.map(s => s.user_email)).size;

  // This month's stats
  const thisMonth = new Date();
  thisMonth.setDate(1);
  const thisMonthSales = sales.filter(s => new Date(s.created_date) >= thisMonth);
  const thisMonthRevenue = thisMonthSales.reduce((sum, s) => sum + (s.price_paid || 0), 0);

  const hasActiveFilters = searchQuery || statusFilter !== "all" || dateFilter !== "all" || kindFilter !== "all";

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setDateFilter("all");
    setKindFilter("all");
  };

  // S\u0131nav t\u00FCr\u00FC etiketi (export + ileride gerekirse).
  const kindLabel = (s) => {
    const k = saleKind(s);
    return k === "tunnel" ? t("pages:mySales.filter.kindTunnel")
      : k === "written" ? t("pages:mySales.filter.kindWritten")
      : t("pages:mySales.filter.kindPackage");
  };

  const exportToExcel = async () => {
    // Sprint 12 #1: xlsx (~429 KB) yaln\u0131zca indirme an\u0131nda dinamik y\u00FCklenir.
    const XLSX = await import("xlsx");
    const headers = [
      t("pages:mySales.excel.headers.buyer"),
      t("pages:mySales.excel.headers.email"),
      t("pages:mySales.excel.headers.type"),
      t("pages:mySales.excel.headers.test"),
      t("pages:mySales.excel.headers.amount"),
      t("pages:mySales.excel.headers.status"),
      t("pages:mySales.excel.headers.date"),
    ];
    const rows = filteredSales.map((sale) => [
      sale.user_name || t("pages:mySales.table.buyerFallback"),
      sale.user_email,
      kindLabel(sale),
      sale.test_package_title,
      sale.price_paid,
      sale.status === "completed" ? t("pages:mySales.filter.completed") : sale.status === "refunded" ? t("pages:mySales.filter.refunded") : t("pages:mySales.filter.pending"),
      sale.created_date && format(new Date(sale.created_date), "d MMM yyyy HH:mm", { locale: tr }),
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = [{ wch: 20 }, { wch: 26 }, { wch: 10 }, { wch: 28 }, { wch: 12 }, { wch: 14 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, t("pages:titles.mySales"));
    const filePrefix = t("pages:mySales.excel.filePrefix");
    XLSX.writeFile(wb, `${filePrefix}-${new Date().toISOString().split("T")[0]}.xlsx`);
    toast.success(t("pages:mySales.toasts.excelDownloaded"));
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">{t("pages:titles.mySales")}</h1>
        <p className="text-slate-500 mt-2">{t("pages:titles.mySalesDesc")}</p>
      </div>

      {/* Stats */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title={t("pages:mySales.stats.totalSales")}
          value={sales.length}
          icon={ShoppingBag}
          bgColor="bg-indigo-500"
        />
        <StatCard
          title={t("pages:mySales.stats.totalRevenue")}
          value={`₺${totalRevenue.toLocaleString()}`}
          icon={TrendingUp}
          bgColor="bg-emerald-500"
        />
        <StatCard
          title={t("pages:mySales.stats.monthRevenue")}
          value={`₺${thisMonthRevenue.toLocaleString()}`}
          icon={DollarSign}
          bgColor="bg-violet-500"
        />
        <StatCard
          title={t("pages:mySales.stats.uniqueBuyers")}
          value={uniqueBuyers}
          icon={Users}
          bgColor="bg-amber-500"
        />
      </div>

      {/* Filters */}
      {!isLoading && sales.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder={t("pages:mySales.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full lg:w-40">
                <SelectValue placeholder={t("pages:mySales.filter.statusPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("pages:mySales.filter.allStatuses")}</SelectItem>
                <SelectItem value="completed">{t("pages:mySales.filter.completed")}</SelectItem>
                <SelectItem value="pending">{t("pages:mySales.filter.pending")}</SelectItem>
                <SelectItem value="refunded">{t("pages:mySales.filter.refunded")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={kindFilter} onValueChange={setKindFilter}>
              <SelectTrigger className="w-full lg:w-40">
                <SelectValue placeholder={t("pages:mySales.filter.kindPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("pages:mySales.filter.allKinds")}</SelectItem>
                <SelectItem value="package">{t("pages:mySales.filter.kindPackage")}</SelectItem>
                <SelectItem value="written">{t("pages:mySales.filter.kindWritten")}</SelectItem>
                <SelectItem value="tunnel">{t("pages:mySales.filter.kindTunnel")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-full lg:w-40">
                <SelectValue placeholder={t("pages:mySales.filter.datePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("pages:mySales.filter.allDates")}</SelectItem>
                <SelectItem value="today">{t("pages:mySales.filter.today")}</SelectItem>
                <SelectItem value="week">{t("pages:mySales.filter.lastWeek")}</SelectItem>
                <SelectItem value="month">{t("pages:mySales.filter.lastMonth")}</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={exportToExcel}
              className="w-full lg:w-auto"
            >
              <Download className="w-4 h-4 mr-2" />
              {t("pages:mySales.filter.exportExcel")}
            </Button>
            {hasActiveFilters && (
              <Button variant="ghost" onClick={clearFilters} className="w-full lg:w-auto">
                <X className="w-4 h-4 mr-2" />
                {t("pages:mySales.filter.clear")}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Sales Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t("pages:mySales.tableTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : sales.length === 0 ? (
            <div className="text-center py-12">
              <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">{t("pages:mySales.empty.noSales")}</p>
            </div>
          ) : filteredSales.length === 0 ? (
            <div className="text-center py-12">
              <Filter className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 mb-4">{t("pages:mySales.empty.noResults")}</p>
              <Button variant="outline" onClick={clearFilters}>
                <X className="w-4 h-4 mr-2" />
                {t("pages:mySales.empty.clearFilters")}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("pages:mySales.table.buyer")}</TableHead>
                    <TableHead>{t("pages:mySales.table.test")}</TableHead>
                    <TableHead className="text-right">{t("pages:mySales.table.amount")}</TableHead>
                    <TableHead>{t("pages:mySales.table.status")}</TableHead>
                    <TableHead>{t("pages:mySales.table.date")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedSales.map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell>
                        <div>
                          {/* user_name user-generated — fallback i18n */}
                          <p className="font-medium text-slate-900">{sale.user_name || t("pages:mySales.table.buyerFallback")}</p>
                          <p className="text-sm text-slate-500">{sale.user_email}</p>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[220px]">
                        <div className="flex items-center gap-1.5">
                          <span className={
                            "flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold " +
                            (sale.kind === "tunnel" ? "bg-indigo-50 text-indigo-600"
                              : sale.kind === "written" ? "bg-amber-50 text-amber-700"
                              : "bg-slate-100 text-slate-500")
                          }>
                            {sale.kind === "tunnel" ? "Tünel" : sale.kind === "written" ? "Yazılı" : "Paket"}
                          </span>
                          {/* test_package_title user-generated */}
                          <span className="truncate">{sale.test_package_title}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-emerald-600">
                        ₺{sale.price_paid}
                      </TableCell>
                      <TableCell>
                        <Badge className={
                          sale.status === "completed"
                            ? "bg-emerald-100 text-emerald-700"
                            : sale.status === "refunded"
                              ? "bg-rose-100 text-rose-700"
                              : "bg-amber-100 text-amber-700"
                        }>
                          {sale.status === "completed" ? t("pages:mySales.filter.completed")
                            : sale.status === "refunded" ? t("pages:mySales.filter.refunded") : t("pages:mySales.filter.pending")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-500">
                        {sale.created_date && format(new Date(sale.created_date), "d MMM yyyy HH:mm", { locale: tr })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <PaginationBar
                page={currentPage}
                totalPages={totalPages}
                onPageChange={setPage}
              />
              {totalPages > 1 && (
                <p className="text-center text-xs text-slate-500 mt-2">
                  {t("pages:mySales.pageInfo", {
                    defaultValue: "{{from}}–{{to}} / {{total}} sonuç",
                    from: (currentPage - 1) * PAGE_SIZE + 1,
                    to: Math.min(currentPage * PAGE_SIZE, filteredSales.length),
                    total: filteredSales.length,
                  })}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}