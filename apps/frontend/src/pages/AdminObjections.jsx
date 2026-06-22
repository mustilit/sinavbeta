import { useMemo, useState } from "react";
import api from "@/lib/api/apiClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { Pagination } from "@/components/ui/Pagination";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { AlertTriangle, BarChart3, MessageSquare, TrendingUp, Search, X, ShieldCheck, Eye, Check, Minus } from "lucide-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

const statusConfig = {
  OPEN:      { label: "Beklemede",           color: "bg-amber-100 text-amber-700" },
  ANSWERED:  { label: "Yanıtlandı",          color: "bg-emerald-100 text-emerald-700" },
  ESCALATED: { label: "Yöneticiye İletildi", color: "bg-violet-100 text-violet-700" },
  RESOLVED:  { label: "Çözüldü",             color: "bg-emerald-100 text-emerald-700" },
};

export default function AdminObjections() {
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [testFilter, setTestFilter] = useState("ALL");
  const [educatorFilter, setEducatorFilter] = useState("ALL");
  const [reporterFilter, setReporterFilter] = useState("ALL");
  const [reasonSearch, setReasonSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [statsPage, setStatsPage] = useState(1);
  const [statsPageSize, setStatsPageSize] = useState(25);

  // Admin yanıt dialog state'i
  const [selectedObjection, setSelectedObjection] = useState(null);
  const [adminAnswerText, setAdminAnswerText] = useState("");
  const queryClient = useQueryClient();

  const adminAnswerMutation = useMutation({
    mutationFn: ({ id, text, kind }) =>
      kind
        ? api.post(`/admin/objections/content/${kind}/${id}/note`, { adminAnswerText: text })
        : api.post(`/admin/objections/${id}/admin-answer`, { adminAnswerText: text }),
    onSuccess: () => {
      toast.success("Admin yanıtı kaydedildi");
      queryClient.invalidateQueries({ queryKey: ["adminObjectionsAll"] });
      setSelectedObjection(null);
      setAdminAnswerText("");
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message ?? "Yanıt kaydedilemedi");
    },
  });

  const submitAdminAnswer = () => {
    if (adminAnswerText.trim().length < 5) {
      toast.error("En az 5 karakter yazın");
      return;
    }
    adminAnswerMutation.mutate({ id: selectedObjection.id, text: adminAnswerText.trim(), kind: selectedObjection.kind });
  };

  /* All objections – enriched */
  const { data: all = [], isLoading: loadingAll } = useQuery({
    queryKey: ["adminObjectionsAll", statusFilter],
    queryFn: async () => {
      const params = statusFilter !== "ALL" ? `?status=${statusFilter}` : "";
      const { data } = await api.get(`/admin/objections/all${params}`);
      return Array.isArray(data) ? data : [];
    },
  });

  /* Test-level stats */
  const { data: stats = [], isLoading: loadingStats } = useQuery({
    queryKey: ["adminObjectionStats"],
    queryFn: async () => {
      const { data } = await api.get("/admin/objections/test-stats");
      return Array.isArray(data) ? data : [];
    },
  });

  const totalOpen      = stats.reduce((s, t) => s + t.openCount, 0);
  const totalAnswered  = stats.reduce((s, t) => s + t.answeredCount, 0);
  const totalEscalated = stats.reduce((s, t) => s + t.escalatedCount, 0);
  const totalAll       = stats.reduce((s, t) => s + t.totalCount, 0);

  // Filtre seçenekleri — `all` listesinden tekil testler/eğiticiler/adaylar çıkar
  const uniqueTests = useMemo(() => {
    const m = new Map();
    for (const o of all) if (o.testId) m.set(o.testId, { id: o.testId, title: o.testTitle || "(Adsız)" });
    return [...m.values()].sort((a, b) => a.title.localeCompare(b.title, "tr"));
  }, [all]);

  const uniqueEducators = useMemo(() => {
    const m = new Map();
    for (const o of all) if (o.educatorId) m.set(o.educatorId, { id: o.educatorId, name: o.educatorName || "(Bilinmiyor)" });
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }, [all]);

  const uniqueReporters = useMemo(() => {
    const m = new Map();
    for (const o of all) if (o.reporterId) m.set(o.reporterId, { id: o.reporterId, name: o.reporterName || "(Bilinmiyor)" });
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }, [all]);

  // Filtrelenmiş itiraz listesi
  const filtered = useMemo(() => {
    const q = reasonSearch.trim().toLowerCase();
    return all.filter((o) => {
      if (testFilter !== "ALL" && o.testId !== testFilter) return false;
      if (educatorFilter !== "ALL" && o.educatorId !== educatorFilter) return false;
      if (reporterFilter !== "ALL" && o.reporterId !== reporterFilter) return false;
      if (q) {
        const hay = `${o.reason ?? ""} ${o.questionContent ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [all, testFilter, educatorFilter, reporterFilter, reasonSearch]);

  const hasActiveFilter =
    statusFilter !== "ALL" ||
    testFilter !== "ALL" ||
    educatorFilter !== "ALL" ||
    reporterFilter !== "ALL" ||
    reasonSearch.trim().length > 0;

  const clearFilters = () => {
    setStatusFilter("ALL");
    setTestFilter("ALL");
    setEducatorFilter("ALL");
    setReporterFilter("ALL");
    setReasonSearch("");
    setPage(1);
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Hata Bildirimleri — Yönetim</h1>
        <p className="text-slate-500 mt-2">Tüm adaylardan gelen soru itirazlarını görüntüle</p>
      </div>

      {/* Özet kartlar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Toplam",          value: totalAll,       color: "text-slate-800",   bg: "bg-slate-50"    },
          { label: "Beklemede",       value: totalOpen,      color: "text-amber-700",   bg: "bg-amber-50"    },
          { label: "Yanıtlandı",      value: totalAnswered,  color: "text-emerald-700", bg: "bg-emerald-50"  },
          { label: "İletildi",        value: totalEscalated, color: "text-violet-700",  bg: "bg-violet-50"   },
        ].map(({ label, value, color, bg }) => (
          <Card key={label} className={`${bg} border-0`}>
            <CardContent className="p-5">
              <p className="text-xs text-slate-500 mb-1">{label}</p>
              <p className={`text-3xl font-bold ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="all" className="space-y-6">
        <TabsList>
          <TabsTrigger value="all">
            <MessageSquare className="w-4 h-4 mr-1.5" />
            Tüm Bildirimler
          </TabsTrigger>
          <TabsTrigger value="stats">
            <BarChart3 className="w-4 h-4 mr-1.5" />
            Test Raporu
          </TabsTrigger>
        </TabsList>

        {/* ── Tüm Bildirimler ── */}
        <TabsContent value="all">
          <Card className="mb-4">
            <CardContent className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {/* Durum */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Durum</label>
                  <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Tüm Durumlar</SelectItem>
                      <SelectItem value="OPEN">Beklemede</SelectItem>
                      <SelectItem value="ANSWERED">Yanıtlandı</SelectItem>
                      <SelectItem value="ESCALATED">İletildi</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {/* Test */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Test</label>
                  <SearchableSelect
                    value={testFilter}
                    onChange={(v) => { setTestFilter(v); setPage(1); }}
                    options={uniqueTests.map((t) => ({ value: t.id, label: t.title }))}
                    allLabel="Tüm Testler"
                    placeholder="Test seçin..."
                    searchPlaceholder="Test ara..."
                    emptyText="Sonuç yok"
                    ariaLabel="Test filtresi"
                  />
                </div>
                {/* Eğitici */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Eğitici</label>
                  <SearchableSelect
                    value={educatorFilter}
                    onChange={(v) => { setEducatorFilter(v); setPage(1); }}
                    options={uniqueEducators.map((e) => ({ value: e.id, label: e.name }))}
                    allLabel="Tüm Eğiticiler"
                    placeholder="Eğitici seçin..."
                    searchPlaceholder="Eğitici ara..."
                    emptyText="Sonuç yok"
                    ariaLabel="Eğitici filtresi"
                  />
                </div>
                {/* Aday (Bildiren) */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Bildiren Aday</label>
                  <SearchableSelect
                    value={reporterFilter}
                    onChange={(v) => { setReporterFilter(v); setPage(1); }}
                    options={uniqueReporters.map((r) => ({ value: r.id, label: r.name }))}
                    allLabel="Tüm Adaylar"
                    placeholder="Aday seçin..."
                    searchPlaceholder="Aday ara..."
                    emptyText="Sonuç yok"
                    ariaLabel="Bildiren aday filtresi"
                  />
                </div>
                {/* Hata türü / sebep araması */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Hata türü / sebep</label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" aria-hidden="true" />
                    <Input
                      type="text"
                      placeholder="örn. kötü içerik, yanlış cevap..."
                      value={reasonSearch}
                      onChange={(e) => { setReasonSearch(e.target.value); setPage(1); }}
                      className="h-9 pl-8"
                      aria-label="Hata türü veya sebep ara"
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 mt-3">
                <span className="text-sm text-slate-500">
                  {filtered.length} / {all.length} bildirim
                </span>
                {hasActiveFilter && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs">
                    <X className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                    Filtreleri Temizle
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {loadingAll ? (
            <div className="space-y-3">
              {[1, 2, 4].map(i => <div key={i} className="h-20 bg-slate-100 rounded-lg animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12 text-slate-400">
                {all.length === 0 ? "Bildirim bulunamadı" : "Seçili filtrelere uyan bildirim yok"}
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="space-y-3">
              {filtered.slice((page - 1) * pageSize, page * pageSize).map(obj => (
                <Card key={obj.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <Badge className={statusConfig[obj.status]?.color ?? "bg-slate-100 text-slate-700"}>
                        {statusConfig[obj.status]?.label ?? obj.status}
                      </Badge>
                      {obj.kind === "tunnel" && <Badge className="bg-indigo-100 text-indigo-700">Tünel</Badge>}
                      {obj.kind === "written" && <Badge className="bg-sky-100 text-sky-700">Yazılı</Badge>}
                      <span className="text-sm font-semibold text-slate-800 truncate max-w-[260px]" title={obj.testTitle}>
                        {obj.testTitle}
                      </span>
                      {obj.educatorName && (
                        <span className="text-xs text-slate-500">
                          <span className="text-slate-400">Eğitici:</span> {obj.educatorName}
                        </span>
                      )}
                      <span className="text-xs text-slate-500">
                        <span className="text-slate-400">Aday:</span> {obj.reporterName}
                      </span>

                      {/* Yanıt göstergeleri */}
                      <span
                        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded ${
                          obj.answerText
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-400"
                        }`}
                        title={obj.answerText ? "Eğitici yanıt verdi" : "Eğitici henüz yanıt vermedi"}
                      >
                        {obj.answerText ? (
                          <Check className="w-3.5 h-3.5" aria-hidden="true" />
                        ) : (
                          <Minus className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                        Eğitici
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded ${
                          obj.adminAnswerText
                            ? "bg-indigo-50 text-indigo-700"
                            : "bg-slate-100 text-slate-400"
                        }`}
                        title={obj.adminAnswerText ? "Admin yanıt verdi" : "Admin henüz yanıt vermedi"}
                      >
                        {obj.adminAnswerText ? (
                          <Check className="w-3.5 h-3.5" aria-hidden="true" />
                        ) : (
                          <Minus className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                        Admin
                      </span>

                      <span className="flex-1" />
                      <span className="text-xs text-slate-400">
                        {format(new Date(obj.createdAt), "d MMM yyyy", { locale: tr })}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedObjection(obj);
                          setAdminAnswerText(obj.adminAnswerText ?? "");
                        }}
                        className="shrink-0 h-8 text-xs"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                        Detayı Görüntüle
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              </div>
              <Pagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} />
            </>
          )}
        </TabsContent>

        {/* ── Test Raporu ── */}
        <TabsContent value="stats">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                En Çok Bildirim Alan Testler
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingStats ? (
                <div className="p-6 space-y-3">
                  {[1, 2, 3].map(i => <div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />)}
                </div>
              ) : stats.length === 0 ? (
                <p className="text-center text-slate-400 py-8">Henüz bildirim yok</p>
              ) : (
                <>
                <div className="divide-y">
                  {stats.slice((statsPage - 1) * statsPageSize, statsPage * statsPageSize).map((s, idx) => (
                    <div key={s.testId} className="flex items-center gap-4 px-6 py-4">
                      <span className={`text-xl font-bold w-8 shrink-0 ${idx < 3 ? "text-rose-500" : "text-slate-300"}`}>
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{s.testTitle}</p>
                        {s.educatorName && (
                          <p className="text-xs text-slate-400">{s.educatorName}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0 text-xs">
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-semibold">
                          {s.totalCount} toplam
                        </span>
                        {s.openCount > 0 && (
                          <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
                            {s.openCount} bekliyor
                          </span>
                        )}
                        {s.answeredCount > 0 && (
                          <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">
                            {s.answeredCount} yanıtlandı
                          </span>
                        )}
                        {s.escalatedCount > 0 && (
                          <span className="bg-violet-100 text-violet-700 px-2 py-0.5 rounded">
                            {s.escalatedCount} iletildi
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <Pagination page={statsPage} pageSize={statsPageSize} total={stats.length} onPageChange={setStatsPage} onPageSizeChange={setStatsPageSize} />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── İtiraz Detay & Admin Yanıt Dialog ── */}
      <Dialog open={!!selectedObjection} onOpenChange={() => setSelectedObjection(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" aria-hidden="true" />
              Bildirim Detayı
            </DialogTitle>
          </DialogHeader>
          {selectedObjection && (
            <div className="space-y-4 mt-2">
              {/* Üst meta — durum + tarih */}
              <div className="flex items-center gap-3 flex-wrap">
                <Badge className={statusConfig[selectedObjection.status]?.color ?? "bg-slate-100 text-slate-700"}>
                  {statusConfig[selectedObjection.status]?.label ?? selectedObjection.status}
                </Badge>
                <span className="text-xs text-slate-500">
                  Bildirim:&nbsp;
                  {format(new Date(selectedObjection.createdAt), "d MMM yyyy HH:mm", { locale: tr })}
                </span>
                {selectedObjection.deadlineAt && (
                  <span className="text-xs text-slate-500">
                    SLA bitiş:&nbsp;
                    {format(new Date(selectedObjection.deadlineAt), "d MMM yyyy", { locale: tr })}
                  </span>
                )}
              </div>

              {/* Bilgi grid */}
              <div className="p-4 bg-slate-50 rounded-lg space-y-3">
                <div>
                  <p className="text-xs text-slate-400 font-medium">Test</p>
                  <p className="text-sm font-semibold text-slate-800">{selectedObjection.testTitle}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-slate-400 font-medium">Eğitici</p>
                    <p className="text-sm text-slate-700">{selectedObjection.educatorName ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-medium">Bildiren Aday</p>
                    <p className="text-sm text-slate-700">{selectedObjection.reporterName ?? "—"}</p>
                  </div>
                </div>
                {selectedObjection.questionContent && (
                  <div>
                    <p className="text-xs text-slate-400 font-medium">Soru (ilk 150 karakter)</p>
                    <p className="text-sm text-slate-600 italic">"{selectedObjection.questionContent}"</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-slate-400 font-medium">Aday Bildirimi</p>
                  <p className="text-sm text-slate-700">{selectedObjection.reason}</p>
                </div>
              </div>

              {/* Eğitici yanıtı (varsa) */}
              {selectedObjection.answerText ? (
                <div className="p-3 bg-emerald-50 rounded border border-emerald-100">
                  <p className="text-xs text-emerald-700 font-semibold mb-1">Eğitici Yanıtı:</p>
                  <p className="text-sm text-slate-700">{selectedObjection.answerText}</p>
                  {selectedObjection.answeredAt && (
                    <p className="text-xs text-emerald-500 mt-1">
                      {format(new Date(selectedObjection.answeredAt), "d MMM yyyy HH:mm", { locale: tr })}
                    </p>
                  )}
                </div>
              ) : (
                <div className="p-3 bg-slate-50 rounded border border-slate-200">
                  <p className="text-xs text-slate-500">Eğitici henüz yanıt vermedi.</p>
                </div>
              )}

              {/* Mevcut admin yanıtı (varsa) */}
              {selectedObjection.adminAnswerText && (
                <div className="p-3 bg-indigo-50 rounded border border-indigo-100">
                  <p className="text-xs text-indigo-700 font-semibold mb-1 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                    Mevcut Admin Yanıtı{selectedObjection.adminAnswererName ? ` (${selectedObjection.adminAnswererName})` : ""}:
                  </p>
                  <p className="text-sm text-slate-700">{selectedObjection.adminAnswerText}</p>
                  {selectedObjection.adminAnsweredAt && (
                    <p className="text-xs text-indigo-500 mt-1">
                      {format(new Date(selectedObjection.adminAnsweredAt), "d MMM yyyy HH:mm", { locale: tr })}
                    </p>
                  )}
                </div>
              )}

              {/* Admin yanıt ekleme/düzenleme alanı */}
              <div>
                <p className="text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                  {selectedObjection.adminAnswerText ? "Admin Yanıtını Düzenle" : "Admin Yanıtı Ekle"}
                </p>
                <Textarea
                  value={adminAnswerText}
                  onChange={(e) => setAdminAnswerText(e.target.value)}
                  placeholder="Admin yanıtınızı yazın (en az 5 karakter)..."
                  rows={4}
                  aria-label="Admin yanıtı"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Bu yanıt eğitici işleminden bağımsızdır; itirazın durumunu değiştirmez.
                </p>
              </div>

              <div className="flex gap-3 justify-end pt-2 border-t">
                <Button variant="outline" onClick={() => setSelectedObjection(null)}>Kapat</Button>
                <Button
                  onClick={submitAdminAnswer}
                  disabled={adminAnswerMutation.isPending || adminAnswerText.trim().length < 5}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  {adminAnswerMutation.isPending ? "Kaydediliyor..." : "Admin Yanıtını Kaydet"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
