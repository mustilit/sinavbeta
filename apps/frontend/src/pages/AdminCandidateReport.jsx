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

export default function AdminCandidateReport() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Filter state
  const [filters, setFilters] = useState({
    q: "",
    status: "all",
    registeredFrom: "",
    registeredTo: "",
    lastLoginFrom: "",
    lastLoginTo: "",
    hasNeverLoggedIn: false,
    minPurchases: "",
    maxPurchases: "",
    minSpent: "",
    maxSpent: "",
    minCorrectRate: "",
    maxCorrectRate: "",
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
    if (f.registeredFrom) params.append("registeredFrom", f.registeredFrom);
    if (f.registeredTo) params.append("registeredTo", f.registeredTo);
    if (f.lastLoginFrom) params.append("lastLoginFrom", f.lastLoginFrom);
    if (f.lastLoginTo) params.append("lastLoginTo", f.lastLoginTo);
    if (f.hasNeverLoggedIn) params.append("hasNeverLoggedIn", "true");
    if (f.minPurchases) params.append("minPurchases", f.minPurchases);
    if (f.maxPurchases) params.append("maxPurchases", f.maxPurchases);
    if (f.minSpent) {
      const cents = Math.round(parseFloat(f.minSpent) * 100);
      params.append("minSpentCents", String(cents));
    }
    if (f.maxSpent) {
      const cents = Math.round(parseFloat(f.maxSpent) * 100);
      params.append("maxSpentCents", String(cents));
    }
    if (f.minCorrectRate) params.append("minCorrectRate", f.minCorrectRate);
    if (f.maxCorrectRate) params.append("maxCorrectRate", f.maxCorrectRate);
    params.append("page", String(page));
    params.append("limit", String(pageSize));
    params.append("sortBy", sortBy);
    params.append("order", order);
    return params.toString();
  };

  // Fetch candidates
  const { data: reportData = {}, isLoading, error } = useQuery({
    queryKey: ["candidateReport", appliedFilters, page, pageSize, sortBy, order],
    queryFn: async () => {
      const queryStr = buildQueryParams(appliedFilters);
      const { data } = await api.get(
        `/admin/candidates/report?${queryStr}`
      );
      return data || { items: [], total: 0, page: 1, pages: 1 };
    },
    enabled: (user?.role || "").toString().toUpperCase() === "ADMIN",
  });

  const candidates = reportData.items || [];
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
        throw new Error("En az bir aday seçilmelidir");
      }
      const { data } = await api.post("/admin/candidates/bulk-email", {
        candidateIds: Array.from(selectedIds),
        subject: emailSubject,
        body: emailBody,
      });
      return data;
    },
    onSuccess: () => {
      toast.success(
        `${selectedIds.size} adaya mail gönderildi`
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
      registeredFrom: "",
      registeredTo: "",
      lastLoginFrom: "",
      lastLoginTo: "",
      hasNeverLoggedIn: false,
      minPurchases: "",
      maxPurchases: "",
      minSpent: "",
      maxSpent: "",
      minCorrectRate: "",
      maxCorrectRate: "",
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
    setSelectAllOnPage(newSet.size === candidates.length && candidates.length > 0);
  };

  const handleSelectAll = () => {
    if (selectAllOnPage) {
      setSelectedIds(new Set());
      setSelectAllOnPage(false);
    } else {
      const ids = new Set(candidates.map((c) => c.id));
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

  const CorrectRateBadge = ({ rate }) => {
    if (rate === null || rate === undefined) return <span className="text-slate-400">-</span>;
    const num = parseFloat(rate);
    let color = "text-rose-600";
    if (num >= 70) color = "text-emerald-600";
    else if (num >= 40) color = "text-amber-600";
    return <span className={color}>{num.toFixed(0)}%</span>;
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
        <h1 className="text-3xl font-bold text-slate-900">Aday Profil Raporu</h1>
        <p className="text-slate-500 mt-2">Tüm adaylar hakkında ayrıntılı analitik</p>
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
                </SelectContent>
              </Select>
            </div>

            {/* Registered Date From */}
            <div>
              <Label className="text-xs font-medium text-slate-600 mb-2 block">
                Kayıt: Başlangıç
              </Label>
              <Input
                type="date"
                value={filters.registeredFrom}
                onChange={(e) =>
                  setFilters({ ...filters, registeredFrom: e.target.value })
                }
              />
            </div>

            {/* Registered Date To */}
            <div>
              <Label className="text-xs font-medium text-slate-600 mb-2 block">
                Kayıt: Bitiş
              </Label>
              <Input
                type="date"
                value={filters.registeredTo}
                onChange={(e) =>
                  setFilters({ ...filters, registeredTo: e.target.value })
                }
              />
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

            {/* Never Logged In */}
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.hasNeverLoggedIn}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      hasNeverLoggedIn: e.target.checked,
                    })
                  }
                  className="w-4 h-4"
                />
                <span className="text-sm text-slate-700">
                  Hiç giriş yapmamış
                </span>
              </label>
            </div>

            {/* Min Purchases */}
            <div>
              <Label className="text-xs font-medium text-slate-600 mb-2 block">
                Min. Satın Alma
              </Label>
              <Input
                type="number"
                min="0"
                placeholder="0"
                value={filters.minPurchases}
                onChange={(e) =>
                  setFilters({ ...filters, minPurchases: e.target.value })
                }
              />
            </div>

            {/* Max Purchases */}
            <div>
              <Label className="text-xs font-medium text-slate-600 mb-2 block">
                Max. Satın Alma
              </Label>
              <Input
                type="number"
                min="0"
                placeholder="999"
                value={filters.maxPurchases}
                onChange={(e) =>
                  setFilters({ ...filters, maxPurchases: e.target.value })
                }
              />
            </div>

            {/* Min Spent */}
            <div>
              <Label className="text-xs font-medium text-slate-600 mb-2 block">
                Min. Harcama (₺)
              </Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={filters.minSpent}
                onChange={(e) =>
                  setFilters({ ...filters, minSpent: e.target.value })
                }
              />
            </div>

            {/* Max Spent */}
            <div>
              <Label className="text-xs font-medium text-slate-600 mb-2 block">
                Max. Harcama (₺)
              </Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="999999"
                value={filters.maxSpent}
                onChange={(e) =>
                  setFilters({ ...filters, maxSpent: e.target.value })
                }
              />
            </div>

            {/* Min Correct Rate */}
            <div>
              <Label className="text-xs font-medium text-slate-600 mb-2 block">
                Min. Doğru Oranı (%)
              </Label>
              <Input
                type="number"
                min="0"
                max="100"
                placeholder="0"
                value={filters.minCorrectRate}
                onChange={(e) =>
                  setFilters({ ...filters, minCorrectRate: e.target.value })
                }
              />
            </div>

            {/* Max Correct Rate */}
            <div>
              <Label className="text-xs font-medium text-slate-600 mb-2 block">
                Max. Doğru Oranı (%)
              </Label>
              <Input
                type="number"
                min="0"
                max="100"
                placeholder="100"
                value={filters.maxCorrectRate}
                onChange={(e) =>
                  setFilters({ ...filters, maxCorrectRate: e.target.value })
                }
              />
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
          <span className="font-semibold">{totalCount}</span> aday bulundu •{" "}
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
            {candidates.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">Aday bulunamadı</p>
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
                        onClick={() => handleSort("lastPurchaseAt")}
                      >
                        Son Satın Alma <SortIcon column="lastPurchaseAt" />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-slate-900"
                        onClick={() => handleSort("totalPurchases")}
                      >
                        Toplam Satın Alma <SortIcon column="totalPurchases" />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-slate-900"
                        onClick={() => handleSort("totalSpentCents")}
                      >
                        Harcama (₺) <SortIcon column="totalSpentCents" />
                      </TableHead>
                      <TableHead>Ort. Test Puanı</TableHead>
                      <TableHead>Ort. Eğitici Puanı</TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-slate-900"
                        onClick={() => handleSort("totalAttempts")}
                      >
                        Toplam Deneme <SortIcon column="totalAttempts" />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-slate-900"
                        onClick={() => handleSort("totalAnswered")}
                      >
                        Cevaplanan <SortIcon column="totalAnswered" />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-slate-900"
                        onClick={() => handleSort("correctRate")}
                      >
                        Doğru Oranı <SortIcon column="correctRate" />
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {candidates.map((candidate) => (
                      <TableRow key={candidate.id}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(candidate.id)}
                            onChange={() => handleSelectId(candidate.id)}
                            className="w-4 h-4 rounded"
                          />
                        </TableCell>
                        <TableCell className="font-medium text-sm">
                          {candidate.username}
                        </TableCell>
                        <TableCell className="text-sm text-slate-500">
                          {candidate.email}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={
                              candidate.status === "ACTIVE"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-rose-100 text-rose-700"
                            }
                          >
                            {candidate.status === "ACTIVE"
                              ? "Aktif"
                              : "Askıya Alınmış"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {candidate.registeredAt
                            ? format(
                                new Date(candidate.registeredAt),
                                "dd MMM yyyy",
                                { locale: tr }
                              )
                            : "-"}
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {candidate.lastLoginAt
                            ? format(
                                new Date(candidate.lastLoginAt),
                                "dd MMM yyyy",
                                { locale: tr }
                              )
                            : "Hiç giriş yok"}
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {candidate.lastPurchaseAt
                            ? format(
                                new Date(candidate.lastPurchaseAt),
                                "dd MMM yyyy",
                                { locale: tr }
                              )
                            : "-"}
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {candidate.totalPurchases || 0}
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          ₺{(candidate.totalSpentCents / 100).toLocaleString("tr-TR", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </TableCell>
                        <TableCell className="text-sm">
                          {candidate.avgTestRating !== null &&
                          candidate.avgTestRating !== undefined ? (
                            <span className="text-amber-600 flex items-center gap-1">
                              <Star className="w-3 h-3 fill-amber-600" />
                              {(candidate.avgTestRating).toFixed(1)}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {candidate.avgEducatorRating !== null &&
                          candidate.avgEducatorRating !== undefined ? (
                            <span className="text-amber-600 flex items-center gap-1">
                              <Star className="w-3 h-3 fill-amber-600" />
                              {(candidate.avgEducatorRating).toFixed(1)}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {candidate.totalAttempts || 0}
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {candidate.totalAnswered || 0}
                        </TableCell>
                        <TableCell className="text-sm">
                          <CorrectRateBadge rate={candidate.correctRate} />
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
              <span className="font-semibold">{selectedIds.size}</span> adaya
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
