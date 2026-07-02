import { useState } from "react";
import api from "@/lib/api/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Users, Mail, Star, ChevronUp, ChevronDown } from "lucide-react";
import { Pagination } from "@/components/ui/Pagination";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { toast } from "sonner";

export default function AdminEducatorReport() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Filter state
  const [filters, setFilters] = useState({
    q: "",
    status: "all",
    lastLoginFrom: "",
    lastLoginTo: "",
    approvedFrom: "",
    approvedTo: "",
    minTests: "",
    maxTests: "",
    minSales: "",
    maxSales: "",
    minRating: "",
    maxRating: "",
    hasOpenObjections: false,
  });

  const [appliedFilters, setAppliedFilters] = useState(/** @type {any} */ ({}));
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortBy, setSortBy] = useState("registeredAt");
  const [order, setOrder] = useState("desc");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [selectAllOnPage, setSelectAllOnPage] = useState(false);

  // Build query params for API call
  const buildQueryParams = (f) => {
    const params = new URLSearchParams();
    if (f.q) params.append("q", f.q);
    if (f.status && f.status !== "all") params.append("status", f.status);
    if (f.lastLoginFrom) params.append("lastLoginFrom", f.lastLoginFrom);
    if (f.lastLoginTo) params.append("lastLoginTo", f.lastLoginTo);
    if (f.approvedFrom) params.append("approvedFrom", f.approvedFrom);
    if (f.approvedTo) params.append("approvedTo", f.approvedTo);
    if (f.minTests) params.append("minTests", f.minTests);
    if (f.maxTests) params.append("maxTests", f.maxTests);
    if (f.minSales) params.append("minSales", f.minSales);
    if (f.maxSales) params.append("maxSales", f.maxSales);
    if (f.minRating) params.append("minRating", f.minRating);
    if (f.maxRating) params.append("maxRating", f.maxRating);
    if (f.hasOpenObjections) params.append("hasOpenObjections", "true");
    params.append("page", String(page));
    params.append("limit", String(pageSize));
    params.append("sortBy", sortBy);
    params.append("order", order);
    return params.toString();
  };

  // Fetch educators
  const { data: reportData = {}, isLoading, error } = useQuery({
    queryKey: ["educatorReport", appliedFilters, page, pageSize, sortBy, order],
    queryFn: async () => {
      const queryStr = buildQueryParams(appliedFilters);
      const { data } = await api.get(
        `/admin/educator-report?${queryStr}`
      );
      return data || { items: [], total: 0, page: 1, pages: 1 };
    },
    enabled: (user?.role || "").toString().toUpperCase() === "ADMIN",
  });

  const educators = reportData.items || [];
  const totalCount = reportData.total || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Bulk email mutation
  const emailMutation = useMutation({
    mutationFn: async () => {
      if (!emailSubject.trim()) {
        throw new Error("Konu gerekli");
      }
      if (!emailBody.trim() || emailBody.trim().length < 20) {
        throw new Error("Mesaj en az 20 karakter olmalıdır");
      }
      if (selectedIds.size === 0) {
        throw new Error("En az bir eğitici seçilmelidir");
      }
      const { data } = await api.post("/admin/educator-report/bulk-email", {
        educatorIds: Array.from(selectedIds),
        subject: emailSubject,
        body: emailBody,
      });
      return data;
    },
    onSuccess: () => {
      toast.success(
        `${selectedIds.size} eğiticiye mail gönderildi`
      );
      setShowEmailDialog(false);
      setEmailSubject("");
      setEmailBody("");
      setSelectedIds(new Set());
      setSelectAllOnPage(false);
    },
    onError: (err) => {
      toast.error(err.message || "Mail gönderilemedi");
    },
  });

  // Handlers
  const handleApplyFilters = () => {
    setAppliedFilters(filters);
    setPage(1);
    setSelectedIds(new Set());
    setSelectAllOnPage(false);
  };

  const handleClearFilters = () => {
    setFilters({
      q: "",
      status: "all",
      lastLoginFrom: "",
      lastLoginTo: "",
      approvedFrom: "",
      approvedTo: "",
      minTests: "",
      maxTests: "",
      minSales: "",
      maxSales: "",
      minRating: "",
      maxRating: "",
      hasOpenObjections: false,
    });
    setAppliedFilters({});
    setPage(1);
    setSelectedIds(new Set());
    setSelectAllOnPage(false);
  };

  const handleSelectId = (id) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
    // Update selectAll if all on page are selected
    setSelectAllOnPage(newSet.size === educators.length && educators.length > 0);
  };

  const handleSelectAll = () => {
    if (selectAllOnPage) {
      setSelectedIds(new Set());
      setSelectAllOnPage(false);
    } else {
      const ids = new Set(educators.map((e) => e.id));
      setSelectedIds(ids);
      setSelectAllOnPage(true);
    }
  };

  const handleSort = (column) => {
    if (sortBy === column) {
      setOrder(order === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setOrder("desc");
    }
    setPage(1);
  };

  const handlePageChange = (newPage) => {
    setPage(newPage);
    setSelectedIds(new Set());
    setSelectAllOnPage(false);
  };

  const handleSendEmail = () => {
    emailMutation.mutate();
  };

  // Utility to render sort indicator
  const SortIcon = ({ column }) => {
    if (sortBy !== column) return <span className="text-slate-300 ml-1">↕</span>;
    return order === "asc" ? (
      <ChevronUp className="w-4 h-4 inline ml-1" />
    ) : (
      <ChevronDown className="w-4 h-4 inline ml-1" />
    );
  };

  const StatusBadge = ({ status }) => {
    const statusConfig = {
      ACTIVE: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Aktif" },
      SUSPENDED: { bg: "bg-rose-100", text: "text-rose-700", label: "Askıya Alınmış" },
      PENDING_EDUCATOR_APPROVAL: { bg: "bg-amber-100", text: "text-amber-700", label: "Onay Bekliyor" },
    };
    const config = statusConfig[status] || statusConfig.ACTIVE;
    return (
      <Badge className={`${config.bg} ${config.text}`}>
        {config.label}
      </Badge>
    );
  };

  const RatingBadge = ({ rating }) => {
    if (rating === null || rating === undefined) return <span className="text-slate-400">-</span>;
    const num = parseFloat(rating);
    return (
      <span className="text-amber-600 flex items-center gap-1">
        <Star className="w-3 h-3 fill-amber-600" />
        {num.toFixed(1)}
      </span>
    );
  };

  const ObjectionsBadge = ({ open, total }) => {
    const color = open > 0 ? "text-rose-600" : "text-slate-600";
    return <span className={color}>{open}/{total}</span>;
  };

  if ((user?.role || "").toString().toUpperCase() !== "ADMIN") {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-semibold text-slate-900">Erişim Engellendi</h2>
        <p className="text-slate-500 mt-2">Bu sayfaya erişim yetkiniz yok</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Eğitici Profil Raporu</h1>
        <p className="text-slate-500 mt-2">Tüm eğiticiler hakkında ayrıntılı analitik</p>
      </div>

      {/* Filter Panel */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Filtreler</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            {/* Search */}
            <div>
              <Label className="text-xs font-medium text-slate-600 mb-2 block">
                Arama (E-posta / Kullanıcı Adı)
              </Label>
              <Input
                placeholder="Ara..."
                value={filters.q}
                onChange={(e) =>
                  setFilters({ ...filters, q: e.target.value })
                }
              />
            </div>

            {/* Status */}
            <div>
              <Label className="text-xs font-medium text-slate-600 mb-2 block">
                Durum
              </Label>
              <Select
                value={filters.status}
                onValueChange={(v) =>
                  setFilters({ ...filters, status: v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tümü</SelectItem>
                  <SelectItem value="ACTIVE">Aktif</SelectItem>
                  <SelectItem value="SUSPENDED">Askıya Alınmış</SelectItem>
                  <SelectItem value="PENDING_EDUCATOR_APPROVAL">Onay Bekliyor</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Last Login From */}
            <div>
              <Label className="text-xs font-medium text-slate-600 mb-2 block">
                Son Giriş: Başlangıç
              </Label>
              <Input
                type="date"
                value={filters.lastLoginFrom}
                onChange={(e) =>
                  setFilters({ ...filters, lastLoginFrom: e.target.value })
                }
              />
            </div>

            {/* Last Login To */}
            <div>
              <Label className="text-xs font-medium text-slate-600 mb-2 block">
                Son Giriş: Bitiş
              </Label>
              <Input
                type="date"
                value={filters.lastLoginTo}
                onChange={(e) =>
                  setFilters({ ...filters, lastLoginTo: e.target.value })
                }
              />
            </div>

            {/* Approved From */}
            <div>
              <Label className="text-xs font-medium text-slate-600 mb-2 block">
                Onay Tarihi: Başlangıç
              </Label>
              <Input
                type="date"
                value={filters.approvedFrom}
                onChange={(e) =>
                  setFilters({ ...filters, approvedFrom: e.target.value })
                }
              />
            </div>

            {/* Approved To */}
            <div>
              <Label className="text-xs font-medium text-slate-600 mb-2 block">
                Onay Tarihi: Bitiş
              </Label>
              <Input
                type="date"
                value={filters.approvedTo}
                onChange={(e) =>
                  setFilters({ ...filters, approvedTo: e.target.value })
                }
              />
            </div>

            {/* Min Tests */}
            <div>
              <Label className="text-xs font-medium text-slate-600 mb-2 block">
                Min. Test Sayısı
              </Label>
              <Input
                type="number"
                min="0"
                placeholder="0"
                value={filters.minTests}
                onChange={(e) =>
                  setFilters({ ...filters, minTests: e.target.value })
                }
              />
            </div>

            {/* Max Tests */}
            <div>
              <Label className="text-xs font-medium text-slate-600 mb-2 block">
                Maks. Test Sayısı
              </Label>
              <Input
                type="number"
                min="0"
                placeholder="999"
                value={filters.maxTests}
                onChange={(e) =>
                  setFilters({ ...filters, maxTests: e.target.value })
                }
              />
            </div>

            {/* Min Sales */}
            <div>
              <Label className="text-xs font-medium text-slate-600 mb-2 block">
                Min. Satış
              </Label>
              <Input
                type="number"
                min="0"
                placeholder="0"
                value={filters.minSales}
                onChange={(e) =>
                  setFilters({ ...filters, minSales: e.target.value })
                }
              />
            </div>

            {/* Max Sales */}
            <div>
              <Label className="text-xs font-medium text-slate-600 mb-2 block">
                Maks. Satış
              </Label>
              <Input
                type="number"
                min="0"
                placeholder="999"
                value={filters.maxSales}
                onChange={(e) =>
                  setFilters({ ...filters, maxSales: e.target.value })
                }
              />
            </div>

            {/* Min Rating */}
            <div>
              <Label className="text-xs font-medium text-slate-600 mb-2 block">
                Min. Puan (1-5)
              </Label>
              <Input
                type="number"
                min="1"
                max="5"
                step="0.1"
                placeholder="1"
                value={filters.minRating}
                onChange={(e) =>
                  setFilters({ ...filters, minRating: e.target.value })
                }
              />
            </div>

            {/* Max Rating */}
            <div>
              <Label className="text-xs font-medium text-slate-600 mb-2 block">
                Maks. Puan (1-5)
              </Label>
              <Input
                type="number"
                min="1"
                max="5"
                step="0.1"
                placeholder="5"
                value={filters.maxRating}
                onChange={(e) =>
                  setFilters({ ...filters, maxRating: e.target.value })
                }
              />
            </div>

            {/* Has Open Objections */}
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.hasOpenObjections}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      hasOpenObjections: e.target.checked,
                    })
                  }
                  className="w-4 h-4"
                />
                <span className="text-sm text-slate-700">
                  Açık Hata Bildirimi Olanlar
                </span>
              </label>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            <Button
              onClick={handleApplyFilters}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              Filtrele
            </Button>
            <Button
              variant="outline"
              onClick={handleClearFilters}
            >
              Temizle
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Bar */}
      <div className="flex items-center justify-between mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
        <div className="text-sm text-slate-700">
          <span className="font-semibold">{totalCount}</span> eğitici bulundu •{" "}
          <span className="font-semibold">{selectedIds.size}</span> seçili
        </div>
        <Button
          onClick={() => setShowEmailDialog(true)}
          disabled={selectedIds.size === 0 || emailMutation.isPending}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
        >
          <Mail className="w-4 h-4 mr-2" />
          Toplu Mail Gönder
        </Button>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="p-6 bg-rose-50 border border-rose-200 rounded-lg">
          <p className="text-rose-700 font-medium">Hata: {error.message}</p>
        </div>
      )}

      {/* Table */}
      {!isLoading && !error && (
        <Card>
          <CardContent className="p-0">
            {educators.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">Eğitici bulunamadı</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <input
                          type="checkbox"
                          checked={selectAllOnPage}
                          onChange={handleSelectAll}
                          className="w-4 h-4 rounded"
                        />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-slate-900"
                        onClick={() => handleSort("username")}
                      >
                        Kullanıcı Adı <SortIcon column="username" />
                      </TableHead>
                      <TableHead>E-posta</TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-slate-900"
                        onClick={() => handleSort("status")}
                      >
                        Durum <SortIcon column="status" />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-slate-900"
                        onClick={() => handleSort("registeredAt")}
                      >
                        Kayıt Tarihi <SortIcon column="registeredAt" />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-slate-900"
                        onClick={() => handleSort("lastLoginAt")}
                      >
                        Son Giriş <SortIcon column="lastLoginAt" />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-slate-900"
                        onClick={() => handleSort("lastPublishedAt")}
                      >
                        Son Paket <SortIcon column="lastPublishedAt" />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-slate-900"
                        onClick={() => handleSort("totalTests")}
                      >
                        Testler <SortIcon column="totalTests" />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-slate-900"
                        onClick={() => handleSort("totalSales")}
                      >
                        Satış <SortIcon column="totalSales" />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-slate-900"
                        onClick={() => handleSort("totalRevenue")}
                      >
                        Gelir <SortIcon column="totalRevenue" />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-slate-900"
                        onClick={() => handleSort("uniqueCandidates")}
                      >
                        Aday <SortIcon column="uniqueCandidates" />
                      </TableHead>
                      <TableHead>Test Puanı</TableHead>
                      <TableHead>Eğitici Puanı</TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-slate-900"
                        onClick={() => handleSort("totalObjections")}
                      >
                        Hata Bildirimi <SortIcon column="totalObjections" />
                      </TableHead>
                      <TableHead>İçerik Alanı</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {educators.map((educator) => (
                      <TableRow key={educator.id}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(educator.id)}
                            onChange={() => handleSelectId(educator.id)}
                            className="w-4 h-4 rounded"
                          />
                        </TableCell>
                        <TableCell className="font-medium text-sm">
                          {educator.username}
                        </TableCell>
                        <TableCell className="text-sm text-slate-500">
                          {educator.email}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={educator.status} />
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {educator.registeredAt
                            ? format(
                                new Date(educator.registeredAt),
                                "dd MMM yyyy",
                                { locale: tr }
                              )
                            : "-"}
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {educator.lastLoginAt
                            ? format(
                                new Date(educator.lastLoginAt),
                                "dd MMM yyyy",
                                { locale: tr }
                              )
                            : "Hiç giriş yok"}
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {educator.lastPublishedAt
                            ? format(
                                new Date(educator.lastPublishedAt),
                                "dd MMM yyyy",
                                { locale: tr }
                              )
                            : "-"}
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {educator.publishedTests}/{educator.totalTests}
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {educator.totalSales || 0}
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          ₺{(educator.totalRevenueCents / 100).toLocaleString("tr-TR", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {educator.uniqueCandidates || 0}
                        </TableCell>
                        <TableCell className="text-sm">
                          <RatingBadge rating={educator.avgTestRating} />
                        </TableCell>
                        <TableCell className="text-sm">
                          <RatingBadge rating={educator.avgEducatorRating} />
                        </TableCell>
                        <TableCell className="text-sm">
                          <ObjectionsBadge
                            open={educator.openObjections || 0}
                            total={educator.totalObjections || 0}
                          />
                        </TableCell>
                        <TableCell className="text-sm text-slate-600" title={educator.examTypeNames || ""}>
                          {educator.examTypeNames
                            ? educator.examTypeNames.length > 30
                              ? `${educator.examTypeNames.substring(0, 30)}...`
                              : educator.examTypeNames
                            : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {!isLoading && !error && (
        <div className="mt-4 bg-white border border-slate-200 rounded-xl">
          <Pagination
            page={page}
            pageSize={pageSize}
            total={totalCount}
            onPageChange={handlePageChange}
            onPageSizeChange={(newSize) => { setPageSize(newSize); handlePageChange(1); }}
            pageSizeOptions={[25, 50, 100]}
          />
        </div>
      )}

      {/* Bulk Email Dialog */}
      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Toplu Mail Gönder</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <p className="text-sm text-slate-600">
              <span className="font-semibold">{selectedIds.size}</span> eğiticiye
              mail gönderilecek
            </p>
            <div className="space-y-2">
              <Label>Konu *</Label>
              <Input
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Mail konusu..."
              />
            </div>
            <div className="space-y-2">
              <Label>Mesaj *</Label>
              <Textarea
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                placeholder="Mail mesajı (en az 20 karakter)..."
                rows={6}
              />
              <p className="text-xs text-slate-500">
                En az 20 karakter gereklidir
              </p>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowEmailDialog(false);
                  setEmailSubject("");
                  setEmailBody("");
                }}
              >
                İptal
              </Button>
              <Button
                onClick={handleSendEmail}
                disabled={emailMutation.isPending}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {emailMutation.isPending ? "Gönderiliyor..." : "Gönder"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
