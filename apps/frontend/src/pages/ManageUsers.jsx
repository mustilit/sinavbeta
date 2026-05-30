import { useState } from "react";
import api from "@/lib/api/apiClient";
import { adminEducators } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Pagination } from "@/components/ui/Pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Users, UserPlus, ShieldCheck, ChevronDown, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { FileText, GraduationCap, Mail, UserCircle, AlertTriangle, Loader2, ExternalLink } from "lucide-react";

// ---------------------------------------------------------------------------
// Worker sayfaları — sayfa ağacı tanımı
// ---------------------------------------------------------------------------
const WORKER_PAGE_TREE = [
  {
    section: "Yönetim Raporları",
    pages: [
      { key: "AdminDashboard", label: "Yönetim Paneli" },
      { key: "AdminCandidateReport", label: "Aday Raporu" },
      { key: "AdminEducatorReport", label: "Eğitici Raporu" },
      { key: "AdminCommissionReport", label: "Komisyon Raporu" },
      { key: "AdminAdReport", label: "Reklam Raporu" },
    ],
  },
  {
    section: "İçerik Yönetimi",
    pages: [
      { key: "ManageExamTypes", label: "Sınav Türleri" },
      { key: "ManageTopics", label: "Soru Konuları" },
      { key: "ManageUsers", label: "Kullanıcılar" },
      { key: "ManageTests", label: "Tüm Testler" },
      { key: "ManageRefunds", label: "İade Talepleri" },
      { key: "AdminObjections", label: "Hata Bildirimleri" },
      { key: "AdminSystemControls", label: "Sistem Kontrolleri" },
    ],
  },
];

// ---------------------------------------------------------------------------
// PageTree bileşeni — checkbox ağacı
// ---------------------------------------------------------------------------
function PageTree({ selected, onChange }) {
  const [collapsed, setCollapsed] = useState({});

  const toggle = (key) => {
    onChange(
      selected.includes(key)
        ? selected.filter((p) => p !== key)
        : [...selected, key]
    );
  };

  const toggleSection = (section) => {
    const sectionKeys = section.pages.map((p) => p.key);
    const allSelected = sectionKeys.every((k) => selected.includes(k));
    if (allSelected) {
      onChange(selected.filter((p) => !sectionKeys.includes(p)));
    } else {
      const combined = Array.from(new Set([...selected, ...sectionKeys]));
      onChange(combined);
    }
  };

  return (
    <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
      {WORKER_PAGE_TREE.map((group) => {
        const sectionKeys = group.pages.map((p) => p.key);
        const allSelected = sectionKeys.every((k) => selected.includes(k));
        const someSelected = sectionKeys.some((k) => selected.includes(k));
        const isCollapsed = collapsed[group.section];

        return (
          <div key={group.section} className="border border-slate-200 rounded-lg overflow-hidden">
            {/* Bölüm başlığı */}
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50">
              <Checkbox
                id={`section-${group.section}`}
                checked={allSelected}
                // indeterminate state simülasyonu: bazıları seçiliyse "checked" görünür ama tam değil
                className={someSelected && !allSelected ? "opacity-60" : ""}
                onCheckedChange={() => toggleSection(group)}
              />
              <button
                type="button"
                className="flex-1 flex items-center gap-1 text-sm font-semibold text-slate-700 text-left"
                onClick={() => setCollapsed((c) => ({ ...c, [group.section]: !c[group.section] }))}
              >
                {isCollapsed
                  ? <ChevronRight className="w-4 h-4 text-slate-400" />
                  : <ChevronDown className="w-4 h-4 text-slate-400" />
                }
                {group.section}
                <span className="ml-auto text-xs font-normal text-slate-400">
                  {sectionKeys.filter((k) => selected.includes(k)).length}/{sectionKeys.length}
                </span>
              </button>
            </div>

            {/* Sayfa satırları */}
            {!isCollapsed && (
              <div className="divide-y divide-slate-100">
                {group.pages.map((page) => (
                  <label
                    key={page.key}
                    htmlFor={`page-${page.key}`}
                    className="flex items-center gap-2 px-4 py-2 cursor-pointer hover:bg-slate-50 text-sm text-slate-700"
                  >
                    <Checkbox
                      id={`page-${page.key}`}
                      checked={selected.includes(page.key)}
                      onCheckedChange={() => toggle(page.key)}
                    />
                    {page.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ana sayfa
// ---------------------------------------------------------------------------
export default function ManageUsers() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [showInvite, setShowInvite] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectUserId, setRejectUserId] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");
  // Eğitici başvuru "İncele" popup'ı — detay + onayla/reddet (inline sebep) tek modal
  const [reviewUserId, setReviewUserId] = useState(null);
  const [reviewRejectMode, setReviewRejectMode] = useState(false);
  const [reviewRejectReason, setReviewRejectReason] = useState("");
  const closeReviewModal = () => {
    setReviewUserId(null);
    setReviewRejectMode(false);
    setReviewRejectReason("");
  };

  // Davet form state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteUsername, setInviteUsername] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [selectedPages, setSelectedPages] = useState([]);

  // Worker izin düzenleme
  const [editWorker, setEditWorker] = useState(null); // { id, email, username, pages[] }
  const [editPages, setEditPages] = useState([]);

  const queryClient = useQueryClient();

  // Kullanıcı listesi
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["allUsers", filterRole, searchQuery],
    queryFn: async () => {
      const params = {};
      if (filterRole !== "all") params.role = filterRole;
      if (searchQuery) params.q = searchQuery;
      const { data } = await api.get("/admin/users", { params });
      return Array.isArray(data) ? data : (data?.items ?? []);
    },
    enabled: (user?.role || '').toUpperCase() === "ADMIN",
  });

  // Kullanıcı güncelle (rol, onay vb.)
  const updateUserMutation = useMutation({
    mutationFn: ({ id, body }) => api.patch(`/admin/users/${id}`, body),
    onSuccess: () => {
      toast.success("Kullanıcı güncellendi");
      queryClient.invalidateQueries({ queryKey: ["allUsers"] });
    },
    onError: () => toast.error("Güncelleme başarısız"),
  });

  // Pending eğitici başvurusunu onayla — adanmış endpoint /admin/educators/:id/approve
  const approveEducatorMutation = useMutation({
    mutationFn: (educatorId) => adminEducators.approve(educatorId),
    onSuccess: () => {
      toast.success("Eğitici onaylandı");
      queryClient.invalidateQueries({ queryKey: ["allUsers"] });
    },
    onError: (err) => {
      const msg = err?.response?.data?.error?.message || err?.response?.data?.message || "Onaylama başarısız";
      toast.error(typeof msg === "string" ? msg : "Onaylama başarısız");
    },
  });

  // İncele popup'ı için eğitici detayını çek — yalnız modal açıkken
  const { data: reviewDetail, isLoading: reviewLoading } = useQuery({
    queryKey: ["adminEducatorDetail", reviewUserId],
    queryFn: () => adminEducators.getDetail(reviewUserId),
    enabled: !!reviewUserId,
    staleTime: 0,
  });

  // Pending eğitici başvurusunu reddet — sebep zorunlu (/admin/educators/:id/reject)
  const rejectEducatorMutation = useMutation({
    mutationFn: ({ id, reason }) => adminEducators.reject(id, reason),
    onSuccess: () => {
      toast.success("Eğitici başvurusu reddedildi");
      queryClient.invalidateQueries({ queryKey: ["allUsers"] });
    },
    onError: (err) => {
      const msg = err?.response?.data?.error?.message || err?.response?.data?.message || "Reddetme başarısız";
      toast.error(typeof msg === "string" ? msg : "Reddetme başarısız");
    },
  });

  // Worker oluştur
  const createWorkerMutation = useMutation({
    mutationFn: (body) => api.post("/admin/workers", body),
    onSuccess: () => {
      toast.success("Worker başarıyla oluşturuldu");
      queryClient.invalidateQueries({ queryKey: ["allUsers"] });
      setShowInvite(false);
      resetInviteForm();
    },
    onError: (e) => toast.error(e?.response?.data?.message ?? "Worker oluşturulamadı"),
  });

  // Worker izinleri güncelle
  const updatePermsMutation = useMutation({
    mutationFn: ({ id, pages }) => api.put(`/admin/workers/${id}/permissions`, { pages }),
    onSuccess: () => {
      toast.success("İzinler güncellendi");
      queryClient.invalidateQueries({ queryKey: ["allUsers"] });
      setEditWorker(null);
    },
    onError: () => toast.error("İzinler güncellenemedi"),
  });

  const resetInviteForm = () => {
    setInviteEmail("");
    setInviteUsername("");
    setInvitePassword("");
    setSelectedPages([]);
  };

  const handleCreateWorker = () => {
    if (!inviteEmail || !inviteUsername || !invitePassword) {
      toast.error("E-posta, kullanıcı adı ve şifre zorunludur");
      return;
    }
    createWorkerMutation.mutate({
      email: inviteEmail,
      username: inviteUsername,
      password: invitePassword,
      pages: selectedPages,
    });
  };

  const openEditWorker = async (workerUser) => {
    try {
      const { data } = await api.get(`/admin/workers/${workerUser.id}/permissions`);
      setEditWorker(workerUser);
      setEditPages(data.pages ?? []);
    } catch {
      toast.error("İzinler yüklenemedi");
    }
  };

  const handleReject = () => {
    if (!rejectionReason.trim()) {
      toast.error("Lütfen red nedeni belirtin");
      return;
    }
    // Yeni adanmış endpoint: /admin/educators/:id/reject {reason}
    rejectEducatorMutation.mutate(
      { id: rejectUserId, reason: rejectionReason },
      {
        onSettled: () => {
          setShowRejectDialog(false);
          setRejectUserId(null);
          setRejectionReason("");
        },
      },
    );
  };

  const roleBadge = (role) => {
    const map = {
      ADMIN: { label: "Admin", cls: "bg-violet-100 text-violet-700" },
      EDUCATOR: { label: "Eğitici", cls: "bg-indigo-100 text-indigo-700" },
      CANDIDATE: { label: "Aday", cls: "bg-slate-100 text-slate-700" },
      WORKER: { label: "Çalışan", cls: "bg-amber-100 text-amber-700" },
    };
    const m = map[role] ?? { label: role ?? "?", cls: "bg-slate-100 text-slate-700" };
    return <Badge className={m.cls}>{m.label}</Badge>;
  };

  if ((user?.role || '').toUpperCase() !== "ADMIN") {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-semibold text-slate-900">Erişim Engellendi</h2>
        <p className="text-slate-500 mt-2">Bu sayfaya erişim yetkiniz yok</p>
      </div>
    );
  }

  const workers = users.filter((u) => u.role === "WORKER");

  return (
    <div>
      {/* Başlık */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Kullanıcılar</h1>
          <p className="text-slate-500 mt-2">Tüm kullanıcıları görüntüle ve yönet</p>
        </div>
        <Button onClick={() => setShowInvite(true)} className="bg-indigo-600 hover:bg-indigo-700">
          <UserPlus className="w-4 h-4 mr-2" />
          Worker Ekle
        </Button>
      </div>

      {/* Workers bölümü */}
      {workers.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-amber-500" />
              Çalışanlar (Worker)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kullanıcı</TableHead>
                    <TableHead>E-posta</TableHead>
                    <TableHead>İzinli Sayfalar</TableHead>
                    <TableHead>Eklenme</TableHead>
                    <TableHead>İşlemler</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workers.map((w) => (
                    <TableRow key={w.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-amber-100 rounded-full flex items-center justify-center">
                            <span className="font-semibold text-amber-700 text-sm">
                              {(w.username || w.email || "?")[0]?.toUpperCase()}
                            </span>
                          </div>
                          <p className="font-medium text-slate-900">{w.username}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-500 text-sm">{w.email}</TableCell>
                      <TableCell>
                        <span className="text-sm text-slate-600">
                          {Array.isArray(w.workerPages) ? w.workerPages.length : "?"} sayfa
                        </span>
                      </TableCell>
                      <TableCell className="text-slate-500 text-sm">
                        {w.createdAt && format(new Date(w.createdAt), "d MMM yyyy", { locale: tr })}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditWorker(w)}
                        >
                          İzinleri Düzenle
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filtreler */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <Input
            placeholder="İsim veya e-posta ara..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            className="pl-10"
          />
        </div>
        <Select value={filterRole} onValueChange={(v) => { setFilterRole(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm Roller</SelectItem>
            <SelectItem value="CANDIDATE">Adaylar</SelectItem>
            <SelectItem value="EDUCATOR">Eğiticiler</SelectItem>
            <SelectItem value="ADMIN">Adminler</SelectItem>
            <SelectItem value="WORKER">Çalışanlar</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Kullanıcı tablosu */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">Kullanıcı bulunamadı</p>
            </div>
          ) : (
            <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kullanıcı</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead>Kayıt Tarihi</TableHead>
                    <TableHead>İşlemler</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.slice((page - 1) * pageSize, page * pageSize).map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                            <span className="font-semibold text-slate-600">
                              {(u.username || u.email || "?")[0]?.toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">{u.username || "-"}</p>
                            <p className="text-sm text-slate-500">{u.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{roleBadge(u.role)}</TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          u.status === "ACTIVE"
                            ? "bg-emerald-100 text-emerald-700"
                            : u.status === "SUSPENDED"
                            ? "bg-rose-100 text-rose-700"
                            : "bg-slate-100 text-slate-600"
                        }`}>
                          {u.status === "ACTIVE" ? "Aktif" : u.status === "SUSPENDED" ? "Askıya Alındı" : (u.status ?? "-")}
                        </span>
                      </TableCell>
                      <TableCell className="text-slate-500">
                        {u.createdAt && format(new Date(u.createdAt), "d MMM yyyy", { locale: tr })}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {u.role === "EDUCATOR" && (
                            <>
                              {/* Pending başvuru → tek "İncele" butonu, popup içinde Onayla/Reddet */}
                              {u.status === "PENDING_EDUCATOR_APPROVAL" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-indigo-600 hover:text-indigo-700"
                                  onClick={() => setReviewUserId(u.id)}
                                >
                                  İncele
                                </Button>
                              )}
                              {/* Aktif eğitici: Askıya Al (mevcut suspend akışı) */}
                              {u.status === "ACTIVE" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-rose-600 hover:text-rose-700"
                                  onClick={() => {
                                    setRejectUserId(u.id);
                                    setShowRejectDialog(true);
                                  }}
                                >
                                  Reddet
                                </Button>
                              )}
                            </>
                          )}
                          {u.role === "WORKER" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-amber-600 hover:text-amber-700"
                              onClick={() => openEditWorker(u)}
                            >
                              İzinler
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pagination page={page} pageSize={pageSize} total={users.length} onPageChange={setPage} onPageSizeChange={setPageSize} />
            </>
          )}
        </CardContent>
      </Card>

      {/* Worker Ekle Dialog */}
      <Dialog open={showInvite} onOpenChange={(v) => { setShowInvite(v); if (!v) resetInviteForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Worker Ekle</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>E-posta Adresi *</Label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="calisan@sirket.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Kullanıcı Adı *</Label>
              <Input
                value={inviteUsername}
                onChange={(e) => setInviteUsername(e.target.value)}
                placeholder="kullaniciadi"
              />
            </div>
            <div className="space-y-2">
              <Label>Şifre *</Label>
              <Input
                type="password"
                value={invitePassword}
                onChange={(e) => setInvitePassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <ShieldCheck className="w-4 h-4 text-amber-500" />
                Sayfa İzinleri
                <span className="text-xs text-slate-400 font-normal ml-1">
                  ({selectedPages.length} seçildi)
                </span>
              </Label>
              <PageTree selected={selectedPages} onChange={setSelectedPages} />
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <Button variant="outline" onClick={() => { setShowInvite(false); resetInviteForm(); }}>
                İptal
              </Button>
              <Button
                onClick={handleCreateWorker}
                disabled={createWorkerMutation.isPending}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {createWorkerMutation.isPending ? "Oluşturuluyor..." : "Worker Oluştur"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Worker İzin Düzenleme Dialog */}
      <Dialog open={!!editWorker} onOpenChange={(v) => { if (!v) setEditWorker(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              İzinleri Düzenle — {editWorker?.username ?? editWorker?.email}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <p className="text-sm text-slate-500">
              Bu çalışanın erişebileceği sayfaları seçin.
            </p>
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <ShieldCheck className="w-4 h-4 text-amber-500" />
                Sayfa İzinleri
                <span className="text-xs text-slate-400 font-normal ml-1">
                  ({editPages.length} seçildi)
                </span>
              </Label>
              <PageTree selected={editPages} onChange={setEditPages} />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <Button variant="outline" onClick={() => setEditWorker(null)}>
                İptal
              </Button>
              <Button
                onClick={() => updatePermsMutation.mutate({ id: editWorker.id, pages: editPages })}
                disabled={updatePermsMutation.isPending}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {updatePermsMutation.isPending ? "Kaydediliyor..." : "Kaydet"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Eğitici Red Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Başvuruyu Reddet</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Red Nedeni *</Label>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Başvurunun red edilme nedenini açıklayın..."
                rows={4}
              />
              <p className="text-sm text-slate-500">Bu açıklama eğitici tarafından görülebilecek</p>
            </div>
            <div className="flex gap-3 justify-end pt-4">
              <Button variant="outline" onClick={() => {
                setShowRejectDialog(false);
                setRejectUserId(null);
                setRejectionReason("");
              }}>
                İptal
              </Button>
              <Button onClick={handleReject} className="bg-rose-600 hover:bg-rose-700">
                Reddet
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Eğitici başvurusu "İncele" popup'ı — tüm bilgi + Onayla/Reddet aynı modal içinde */}
      <Dialog open={!!reviewUserId} onOpenChange={(open) => { if (!open) closeReviewModal(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Eğitici Başvurusu</DialogTitle>
            <DialogDescription>
              Bilgileri inceleyin; uygunsa onaylayın, uygun değilse sebep girip reddedin.
            </DialogDescription>
          </DialogHeader>

          {reviewLoading && (
            <div className="py-12 flex justify-center" role="status" aria-live="polite">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-600" aria-hidden="true" />
            </div>
          )}

          {!reviewLoading && reviewDetail && (
            <div className="space-y-5">
              {/* Kişisel bilgi */}
              <div className="rounded-lg border border-slate-200 p-4">
                <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <UserCircle className="w-4 h-4 text-indigo-500" aria-hidden="true" />
                  Kişisel Bilgi
                </h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="text-slate-500">Ad Soyad</dt>
                  <dd className="text-slate-900 font-medium">
                    {(reviewDetail.firstName || reviewDetail.lastName) ? `${reviewDetail.firstName ?? ""} ${reviewDetail.lastName ?? ""}`.trim() : "—"}
                  </dd>
                  <dt className="text-slate-500">Kullanıcı Adı</dt>
                  <dd className="text-slate-900">{reviewDetail.username}</dd>
                  <dt className="text-slate-500 flex items-center gap-1"><Mail className="w-3 h-3" aria-hidden="true" /> E-posta</dt>
                  <dd className="text-slate-900">
                    {reviewDetail.email}
                    {reviewDetail.emailVerified && <span className="ml-2 text-xs text-emerald-600">✓ doğrulandı</span>}
                  </dd>
                  <dt className="text-slate-500">Kayıt Tarihi</dt>
                  <dd className="text-slate-900">{reviewDetail.createdAt && format(new Date(reviewDetail.createdAt), "d MMM yyyy HH:mm", { locale: tr })}</dd>
                </dl>
              </div>

              {/* CV */}
              {reviewDetail.metadata?.cv_url && (
                <div className="rounded-lg border border-slate-200 p-4">
                  <h3 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-500" aria-hidden="true" />
                    CV / Özgeçmiş
                  </h3>
                  <a
                    href={reviewDetail.metadata.cv_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline"
                  >
                    CV'yi yeni sekmede aç <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  </a>
                </div>
              )}

              {/* Uzmanlık alanları */}
              {reviewDetail.specializations?.length > 0 && (
                <div className="rounded-lg border border-slate-200 p-4">
                  <h3 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-indigo-500" aria-hidden="true" />
                    Uzmanlık Alanları
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {reviewDetail.specializations.map((s) => (
                      <span
                        key={s.id}
                        className="text-xs px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 font-medium"
                      >
                        {s.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Mezuniyet ve tanıtım */}
              {(reviewDetail.metadata?.education_info || reviewDetail.bio) && (
                <div className="rounded-lg border border-slate-200 p-4 space-y-3">
                  {reviewDetail.metadata?.education_info && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Mezuniyet Bilgisi</p>
                      <p className="text-sm text-slate-900 whitespace-pre-wrap">{reviewDetail.metadata.education_info}</p>
                    </div>
                  )}
                  {reviewDetail.bio && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Tanıtım Metni</p>
                      <p className="text-sm text-slate-900 whitespace-pre-wrap">{reviewDetail.bio}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Sözleşme kabul (delil) */}
              {reviewDetail.contractAcceptances?.length > 0 && (
                <div className="rounded-lg border border-slate-200 p-4">
                  <h3 className="text-sm font-semibold text-slate-900 mb-2">Sözleşme Onayları</h3>
                  <ul className="text-xs text-slate-600 space-y-1">
                    {reviewDetail.contractAcceptances.map((a, i) => (
                      <li key={i}>
                        <strong>{a.contract?.title || a.contract?.type}</strong>
                        {a.contract?.version != null && <span className="ml-1 text-slate-400">v{a.contract.version}</span>}
                        <span className="text-slate-400"> · {a.acceptedAt && format(new Date(a.acceptedAt), "d MMM yyyy HH:mm", { locale: tr })}</span>
                        {a.ip && <span className="text-slate-400"> · IP: {a.ip}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Reddet sebebi inline (sadece Reddet'e basıldıktan sonra) */}
              {reviewRejectMode && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
                  <h3 className="text-sm font-semibold text-rose-900 mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                    Red Sebebi
                  </h3>
                  <Textarea
                    value={reviewRejectReason}
                    onChange={(e) => setReviewRejectReason(e.target.value)}
                    placeholder="Eğiticiye iletilecek açıklama (zorunlu, en az 5 karakter)..."
                    rows={4}
                    className="bg-white"
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 flex-row sm:justify-end">
            <Button variant="outline" onClick={closeReviewModal}>
              Kapat
            </Button>
            {reviewDetail && !reviewRejectMode && (
              <>
                <Button
                  variant="outline"
                  className="text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                  onClick={() => setReviewRejectMode(true)}
                >
                  Reddet
                </Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => approveEducatorMutation.mutate(reviewDetail.id, {
                    onSuccess: closeReviewModal,
                  })}
                  disabled={approveEducatorMutation.isPending}
                >
                  {approveEducatorMutation.isPending ? "Kaydediliyor…" : "Onayla"}
                </Button>
              </>
            )}
            {reviewDetail && reviewRejectMode && (
              <>
                <Button variant="outline" onClick={() => { setReviewRejectMode(false); setReviewRejectReason(""); }}>
                  Geri
                </Button>
                <Button
                  className="bg-rose-600 hover:bg-rose-700"
                  onClick={() => {
                    if (reviewRejectReason.trim().length < 5) {
                      toast.error("Red sebebi en az 5 karakter olmalı");
                      return;
                    }
                    rejectEducatorMutation.mutate(
                      { id: reviewDetail.id, reason: reviewRejectReason.trim() },
                      { onSuccess: closeReviewModal },
                    );
                  }}
                  disabled={rejectEducatorMutation.isPending}
                >
                  {rejectEducatorMutation.isPending ? "Kaydediliyor…" : "Red Sebebini Gönder"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
