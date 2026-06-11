import { useState, useMemo } from "react";
import api from "@/lib/api/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Pagination } from "@/components/ui/Pagination";
import { Plus, Edit2, Trash2, Award, Search, X, CalendarDays } from "lucide-react";
import { EXAM_TYPE_ICONS, getExamTypeIcon } from "@/lib/examTypeIcons";
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
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export default function ManageExamTypes() {
  const { user } = useAuth();
  const [showDialog, setShowDialog] = useState(false);
  const [editingExam, setEditingExam] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [formData, setFormData] = useState({ name: "", description: "", active: true, icon: "" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const queryClient = useQueryClient();

  // Filtreler
  const [searchName, setSearchName] = useState("");
  const [filterStatus, setFilterStatus] = useState("all"); // "all" | "active" | "passive"
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const hasFilter = searchName || filterStatus !== "all" || filterDateFrom || filterDateTo;

  const clearFilters = () => {
    setSearchName("");
    setFilterStatus("all");
    setFilterDateFrom("");
    setFilterDateTo("");
    setPage(1);
  };

  const { data: examTypes = [], isLoading } = useQuery({
    queryKey: ["examTypes"],
    queryFn: async () => {
      const { data } = await api.get("/admin/exam-types", { params: { activeOnly: "false" } });
      return Array.isArray(data) ? data : (data?.items ?? []);
    },
    enabled: (user?.role || '').toString().toUpperCase() === "ADMIN",
  });

  // İstemci tarafı filtreleme
  const filteredExamTypes = useMemo(() => {
    return examTypes.filter((exam) => {
      if (searchName && !exam.name.toLowerCase().includes(searchName.toLowerCase())) return false;
      if (filterStatus === "active" && !exam.active) return false;
      if (filterStatus === "passive" && exam.active) return false;
      if (filterDateFrom) {
        const created = new Date(exam.createdAt);
        const from = new Date(filterDateFrom);
        if (created < from) return false;
      }
      if (filterDateTo) {
        const created = new Date(exam.createdAt);
        const to = new Date(filterDateTo);
        to.setHours(23, 59, 59, 999);
        if (created > to) return false;
      }
      return true;
    });
  }, [examTypes, searchName, filterStatus, filterDateFrom, filterDateTo]);

  const createMutation = useMutation({
    mutationFn: (data) => api.post("/admin/exam-types", data),
    onSuccess: () => {
      toast.success("Sınav türü oluşturuldu");
      queryClient.invalidateQueries({ queryKey: ["examTypes"] });
      closeDialog();
    },
    onError: (e) => toast.error(e?.response?.data?.message ?? "Oluşturma başarısız"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.patch(`/admin/exam-types/${id}`, data),
    onSuccess: () => {
      toast.success("Sınav türü güncellendi");
      queryClient.invalidateQueries({ queryKey: ["examTypes"] });
      closeDialog();
    },
    onError: (e) => toast.error(e?.response?.data?.message ?? "Güncelleme başarısız"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/admin/exam-types/${id}`),
    onSuccess: () => {
      toast.success("Sınav türü silindi");
      queryClient.invalidateQueries({ queryKey: ["examTypes"] });
      setDeleteId(null);
    },
    onError: (e) => toast.error(e?.response?.data?.message ?? "Silme başarısız"),
  });

  const openDialog = (exam = null) => {
    if (exam) {
      setEditingExam(exam);
      setFormData({ name: exam.name, description: exam.description || "", active: exam.active ?? true, icon: exam.metadata?.icon ?? "" });
    } else {
      setEditingExam(null);
      setFormData({ name: "", description: "", active: true, icon: "" });
    }
    setShowDialog(true);
  };

  const closeDialog = () => {
    setShowDialog(false);
    setEditingExam(null);
    setFormData({ name: "", description: "", active: true, icon: "" });
  };

  const handleSubmit = () => {
    if (!formData.name) {
      toast.error("Sınav türü adı gerekli");
      return;
    }
    if (editingExam) {
      updateMutation.mutate({ id: editingExam.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  if ((user?.role || '').toString().toUpperCase() !== "ADMIN") {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-semibold text-slate-900">Erişim Engellendi</h2>
        <p className="text-slate-500 mt-2">Bu sayfaya erişim yetkiniz yok</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Sınav Türleri</h1>
          <p className="text-slate-500 mt-2">Platformdaki sınav türlerini yönet</p>
        </div>
        <Button onClick={() => openDialog()} className="bg-indigo-600 hover:bg-indigo-700">
          <Plus className="w-4 h-4 mr-2" />
          Yeni Sınav Türü
        </Button>
      </div>

      {/* Filtre Paneli */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            {/* İsim arama */}
            <div className="flex-1 min-w-[180px]">
              <Label className="text-xs text-slate-500 mb-1 block">İsim</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  value={searchName}
                  onChange={(e) => { setSearchName(e.target.value); setPage(1); }}
                  placeholder="Sınav türü ara..."
                  className="pl-8 h-9"
                />
              </div>
            </div>

            {/* Aktiflik */}
            <div className="min-w-[140px]">
              <Label className="text-xs text-slate-500 mb-1 block">Durum</Label>
              <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(1); }}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tümü</SelectItem>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="passive">Pasif</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tarih aralığı */}
            <div className="min-w-[140px]">
              <Label className="text-xs text-slate-500 mb-1 block">
                <CalendarDays className="inline w-3.5 h-3.5 mr-1" />
                Başlangıç tarihi
              </Label>
              <Input
                type="date"
                value={filterDateFrom}
                onChange={(e) => { setFilterDateFrom(e.target.value); setPage(1); }}
                className="h-9"
              />
            </div>
            <div className="min-w-[140px]">
              <Label className="text-xs text-slate-500 mb-1 block">
                <CalendarDays className="inline w-3.5 h-3.5 mr-1" />
                Bitiş tarihi
              </Label>
              <Input
                type="date"
                value={filterDateTo}
                onChange={(e) => { setFilterDateTo(e.target.value); setPage(1); }}
                className="h-9"
              />
            </div>

            {/* Temizle */}
            {hasFilter && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-slate-500">
                <X className="w-4 h-4 mr-1" />
                Temizle
              </Button>
            )}
          </div>

          {/* Sonuç özeti */}
          {hasFilter && (
            <p className="text-xs text-slate-400 mt-2">
              {filteredExamTypes.length} / {examTypes.length} sonuç gösteriliyor
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : filteredExamTypes.length === 0 ? (
            <div className="text-center py-12">
              <Award className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">
                {hasFilter ? "Filtreyle eşleşen sınav türü bulunamadı" : "Henüz sınav türü yok"}
              </p>
              {hasFilter && (
                <Button variant="link" size="sm" onClick={clearFilters} className="mt-1 text-indigo-600">
                  Filtreleri temizle
                </Button>
              )}
            </div>
          ) : (
            <>
            <div className="divide-y divide-slate-100">
              {filteredExamTypes.slice((page - 1) * pageSize, page * pageSize).map((exam) => (
                <div key={exam.id} className="flex items-center justify-between p-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center overflow-hidden">
                      {(() => {
                        const Ico = getExamTypeIcon(exam.metadata?.icon);
                        if (exam.metadata?.icon) return <Ico className="w-6 h-6 text-indigo-600" />;
                        if (exam.metadata?.iconUrl) return <img src={exam.metadata.iconUrl} alt="" className="w-full h-full object-cover" />;
                        return <Award className="w-6 h-6 text-indigo-600" />;
                      })()}
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">{exam.name}</h3>
                      <p className="text-sm text-slate-500 line-clamp-1">
                        {exam.description || "Açıklama yok"}
                      </p>
                      {exam.createdAt && (
                        <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                          <CalendarDays className="w-3 h-3" />
                          {new Date(exam.createdAt).toLocaleDateString("tr-TR", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`text-sm px-3 py-1 rounded-full ${
                      exam.active 
                        ? "bg-emerald-100 text-emerald-700" 
                        : "bg-slate-100 text-slate-600"
                    }`}>
                      {exam.active ? "Aktif" : "Pasif"}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => openDialog(exam)}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-rose-600"
                      onClick={() => setDeleteId(exam.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <Pagination page={page} pageSize={pageSize} total={filteredExamTypes.length} onPageChange={setPage} onPageSizeChange={setPageSize} />
            </>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingExam ? "Sınav Türünü Düzenle" : "Yeni Sınav Türü"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Sınav Türü Adı *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Örn: KPSS"
              />
            </div>
            <div className="space-y-2">
              <Label>Logo</Label>
              <p className="text-xs text-slate-500">Havuzdan konuya uygun bir çizgi logo seçin.</p>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-44 overflow-y-auto p-1 rounded-lg border border-slate-200">
                {EXAM_TYPE_ICONS.map(({ key, Icon, label }) => {
                  const selected = formData.icon === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      title={label}
                      aria-label={label}
                      aria-pressed={selected}
                      onClick={() => setFormData((p) => ({ ...p, icon: selected ? "" : key }))}
                      className={`flex items-center justify-center h-10 rounded-lg border transition-colors ${
                        selected
                          ? "border-indigo-500 bg-indigo-50 text-indigo-600 ring-2 ring-indigo-200"
                          : "border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                      }`}
                    >
                      <Icon className="w-5 h-5" aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Açıklama</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Sınav türü hakkında kısa açıklama"
                rows={3}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Aktif</Label>
              <Switch
                checked={formData.active}
                onCheckedChange={(v) => setFormData({ ...formData, active: v })}
              />
            </div>
            <div className="flex gap-3 justify-end pt-4">
              <Button variant="outline" onClick={closeDialog}>İptal</Button>
              <Button 
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {createMutation.isPending || updateMutation.isPending ? "Kaydediliyor..." : "Kaydet"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sınav türünü silmek istediğinize emin misiniz?</AlertDialogTitle>
            <AlertDialogDescription>
              Bu işlem geri alınamaz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-rose-600 hover:bg-rose-700"
              onClick={() => deleteMutation.mutate(deleteId)}
            >
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}