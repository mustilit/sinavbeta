import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { adminSchools } from "@/api/dalClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import CredentialsDialog from "@/components/school/CredentialsDialog";
import { School, CalendarDays, Plus, UserCog, Power, Users, Search, ChevronLeft, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

const PAGE_SIZE = 12;

const SCHOOL_TYPES = [
  { value: "PRIMARY", label: "İlkokul" },
  { value: "MIDDLE", label: "Ortaokul" },
  { value: "HIGH", label: "Lise" },
  { value: "MIXED", label: "Karma" },
];

/** Platform Admin — E-Sınıf okul + akademik dönem yönetimi. */
export default function AdminSchools() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("schools"); // schools | periods
  const [createOpen, setCreateOpen] = useState(false);
  const [periodOpen, setPeriodOpen] = useState(false);
  const [assignFor, setAssignFor] = useState(null); // school row
  const [creds, setCreds] = useState(null);

  // Filtreler — metin alanları debounce'lanır; seçimler anında uygulanır.
  const [qInput, setQInput] = useState("");
  const [adminEmailInput, setAdminEmailInput] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [periodFilter, setPeriodFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [debounced, setDebounced] = useState({ q: "", adminEmail: "" });

  useEffect(() => {
    const t = setTimeout(() => setDebounced({ q: qInput.trim(), adminEmail: adminEmailInput.trim() }), 350);
    return () => clearTimeout(t);
  }, [qInput, adminEmailInput]);

  // Herhangi bir filtre değişince 1. sayfaya dön.
  useEffect(() => { setPage(1); }, [debounced.q, debounced.adminEmail, typeFilter, periodFilter]);

  const filterArgs = {
    q: debounced.q || undefined,
    adminEmail: debounced.adminEmail || undefined,
    schoolType: typeFilter === "ALL" ? undefined : typeFilter,
    periodId: periodFilter === "ALL" ? undefined : periodFilter,
    page,
    pageSize: PAGE_SIZE,
  };
  const hasFilters = !!(filterArgs.q || filterArgs.adminEmail || filterArgs.schoolType || filterArgs.periodId);

  const { data: schoolsData, isLoading, isFetching } = useQuery({
    queryKey: ["esinif", "schools", filterArgs],
    queryFn: () => adminSchools.list(filterArgs),
    placeholderData: keepPreviousData,
  });
  const schools = schoolsData?.items ?? [];
  const total = schoolsData?.total ?? 0;
  const totalPages = schoolsData?.totalPages ?? 1;

  const { data: periods = [] } = useQuery({ queryKey: ["esinif", "periods"], queryFn: adminSchools.listPeriods });

  const clearFilters = () => { setQInput(""); setAdminEmailInput(""); setTypeFilter("ALL"); setPeriodFilter("ALL"); };

  const createSchool = useMutation({
    mutationFn: adminSchools.create,
    onSuccess: () => { toast.success("Okul oluşturuldu"); qc.invalidateQueries({ queryKey: ["esinif", "schools"] }); setCreateOpen(false); },
    onError: (e) => toast.error(e?.response?.data?.message ?? "Okul oluşturulamadı"),
  });
  const createPeriod = useMutation({
    mutationFn: adminSchools.createPeriod,
    onSuccess: () => { toast.success("Dönem oluşturuldu"); qc.invalidateQueries({ queryKey: ["esinif", "periods"] }); setPeriodOpen(false); },
    onError: (e) => toast.error(e?.response?.data?.message ?? "Dönem oluşturulamadı"),
  });
  const assignAdmin = useMutation({
    mutationFn: ({ id, body }) => adminSchools.assignAdmin(id, body),
    onSuccess: (res) => { setCreds(res); setAssignFor(null); qc.invalidateQueries({ queryKey: ["esinif", "schools"] }); },
    onError: (e) => toast.error(e?.response?.data?.message ?? "Yönetici atanamadı"),
  });
  const toggleActive = useMutation({
    mutationFn: (s) => (s.isActive ? adminSchools.deactivate(s.id) : adminSchools.update(s.id, { isActive: true })),
    onSuccess: () => { toast.success("Güncellendi"); qc.invalidateQueries({ queryKey: ["esinif", "schools"] }); },
    onError: (e) => toast.error(e?.response?.data?.message ?? "Güncellenemedi"),
  });

  const submitSchool = (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    createSchool.mutate({
      name: f.get("name"), code: f.get("code"), city: f.get("city") || undefined,
      schoolType: f.get("schoolType") || "MIDDLE", periodId: f.get("periodId"),
      maxUsers: Number(f.get("maxUsers") || 0), annualLiveLimit: Number(f.get("annualLiveLimit") || 0),
    });
  };
  const submitPeriod = (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    createPeriod.mutate({ name: f.get("name"), startDate: f.get("startDate"), endDate: f.get("endDate"), isActive: f.get("isActive") === "on" });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center"><School className="w-5 h-5 text-indigo-600" /></div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">E-Sınıf — Okullar</h1>
          <p className="text-sm text-slate-500">Okul tanımlama, dönem atama ve okul yöneticisi belirleme</p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        <button type="button" onClick={() => setTab("schools")} className={`px-4 py-2.5 min-h-10 text-sm font-medium border-b-2 -mb-px ${tab === "schools" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-600 hover:text-slate-900"}`}>Okullar ({total})</button>
        <button type="button" onClick={() => setTab("periods")} className={`px-4 py-2.5 min-h-10 text-sm font-medium border-b-2 -mb-px ${tab === "periods" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-600 hover:text-slate-900"}`}>Dönemler ({periods.length})</button>
      </div>

      {tab === "schools" && (
        <div className="space-y-4">
          {/* Filtre çubuğu */}
          <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Okul adı / kod / şehir" className="pl-9" aria-label="Okul ara" />
              </div>
              <Input value={adminEmailInput} onChange={(e) => setAdminEmailInput(e.target.value)} placeholder="Yönetici e-posta" aria-label="Yönetici e-posta filtresi" />
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger aria-label="Okul türü filtresi"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tüm türler</SelectItem>
                  {SCHOOL_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={periodFilter} onValueChange={setPeriodFilter}>
                <SelectTrigger aria-label="Dönem filtresi"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tüm dönemler</SelectItem>
                  {periods.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">{total} okul{hasFilters ? " (filtreli)" : ""}{isFetching ? " · yükleniyor…" : ""}</span>
              <div className="flex gap-2">
                {hasFilters && (
                  <Button size="sm" variant="ghost" onClick={clearFilters} className="gap-1 text-xs text-slate-600">
                    <X className="w-3.5 h-3.5" /> Filtreyi temizle
                  </Button>
                )}
                <Button onClick={() => setCreateOpen(true)} disabled={periods.length === 0} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
                  <Plus className="w-4 h-4" /> Yeni Okul
                </Button>
              </div>
            </div>
          </div>
          {periods.length === 0 && <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">Önce bir akademik dönem oluşturun.</p>}
          {isLoading ? (
            <div className="grid sm:grid-cols-2 gap-4">{[0, 1].map((i) => <div key={i} className="h-28 bg-slate-100 rounded-xl animate-pulse" />)}</div>
          ) : schools.length === 0 ? (
            <div className="text-center py-16 text-slate-500"><School className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>{hasFilters ? "Filtreye uygun okul bulunamadı." : "Henüz okul yok."}</p></div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {schools.map((s) => (
                <Card key={s.id} className={s.isActive ? "" : "opacity-60"}>
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-900">{s.name}</p>
                          <Badge className="bg-indigo-100 text-indigo-700 font-mono">{s.code}</Badge>
                          {!s.isActive && <Badge className="bg-slate-200 text-slate-600">Pasif</Badge>}
                        </div>
                        <p className="text-xs text-slate-500 mt-1">{s.city || "—"} · {SCHOOL_TYPES.find((t) => t.value === s.schoolType)?.label} · {s.period?.name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {s.userCount}/{s.maxUsers || "∞"} kullanıcı</span>
                      <span>{s.branchCount} şube · {s.departmentCount} zümre</span>
                      <span>Canlı: {s.usedLiveCount}/{s.annualLiveLimit || "∞"}</span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <span className="text-xs text-slate-500">Yönetici: {s.adminEmail ? <span className="text-slate-700">{s.adminEmail}{s.adminName ? ` (${s.adminName})` : ""}</span> : "atanmadı"}</span>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setAssignFor(s)} className="gap-1 text-xs"><UserCog className="w-3.5 h-3.5" /> {s.adminEmail ? "Değiştir" : "Yönetici Ata"}</Button>
                        <Button size="sm" variant="outline" onClick={() => toggleActive.mutate(s)} className={`gap-1 text-xs ${s.isActive ? "text-rose-600 border-rose-200 hover:bg-rose-50" : "text-emerald-600 border-emerald-200 hover:bg-emerald-50"}`}><Power className="w-3.5 h-3.5" /> {s.isActive ? "Pasifleştir" : "Aktifleştir"}</Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || isFetching} className="gap-1">
                <ChevronLeft className="w-4 h-4" /> Önceki
              </Button>
              <span className="text-sm text-slate-600">Sayfa {page} / {totalPages}</span>
              <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || isFetching} className="gap-1">
                Sonraki <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      {tab === "periods" && (
        <div className="space-y-4">
          <div className="flex justify-end"><Button onClick={() => setPeriodOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 gap-2"><Plus className="w-4 h-4" /> Yeni Dönem</Button></div>
          {periods.length === 0 ? (
            <div className="text-center py-16 text-slate-500"><CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>Henüz dönem yok.</p></div>
          ) : (
            <div className="space-y-2">
              {periods.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
                  <div className="flex items-center gap-2"><CalendarDays className="w-4 h-4 text-slate-400" /><span className="font-medium text-slate-900">{p.name}</span>{p.isActive && <Badge className="bg-emerald-100 text-emerald-700">Aktif</Badge>}</div>
                  <span className="text-sm text-slate-500">{format(new Date(p.startDate), "d MMM yyyy", { locale: tr })} – {format(new Date(p.endDate), "d MMM yyyy", { locale: tr })}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Okul oluştur */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Yeni Okul</DialogTitle></DialogHeader>
          <form onSubmit={submitSchool} className="space-y-3">
            <div><Label htmlFor="s-name">Okul adı</Label><Input id="s-name" name="name" required maxLength={120} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="s-code">Okul kodu (3-5)</Label><Input id="s-code" name="code" required maxLength={5} placeholder="ANK" className="font-mono uppercase" /></div>
              <div><Label htmlFor="s-city">Şehir</Label><Input id="s-city" name="city" maxLength={60} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tür</Label>
                <Select name="schoolType" defaultValue="MIDDLE"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SCHOOL_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select>
              </div>
              <div>
                <Label>Dönem</Label>
                <Select name="periodId" defaultValue={periods[0]?.id}><SelectTrigger><SelectValue placeholder="Dönem seç" /></SelectTrigger><SelectContent>{periods.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="s-max">Maks. kullanıcı</Label><Input id="s-max" name="maxUsers" type="number" min={0} defaultValue={0} /></div>
              <div><Label htmlFor="s-live">Yıllık canlı sınav</Label><Input id="s-live" name="annualLiveLimit" type="number" min={0} defaultValue={0} /></div>
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>İptal</Button>
              <Button type="submit" disabled={createSchool.isPending} className="bg-indigo-600 hover:bg-indigo-700">{createSchool.isPending ? "Kaydediliyor…" : "Oluştur"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dönem oluştur */}
      <Dialog open={periodOpen} onOpenChange={setPeriodOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Yeni Akademik Dönem</DialogTitle></DialogHeader>
          <form onSubmit={submitPeriod} className="space-y-3">
            <div><Label htmlFor="p-name">Dönem adı</Label><Input id="p-name" name="name" required placeholder="2026-2027" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="p-start">Başlangıç</Label><Input id="p-start" name="startDate" type="date" required /></div>
              <div><Label htmlFor="p-end">Bitiş</Label><Input id="p-end" name="endDate" type="date" required /></div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="isActive" className="rounded" /> Aktif dönem olarak işaretle</label>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setPeriodOpen(false)}>İptal</Button>
              <Button type="submit" disabled={createPeriod.isPending} className="bg-indigo-600 hover:bg-indigo-700">{createPeriod.isPending ? "Kaydediliyor…" : "Oluştur"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Yönetici ata */}
      <Dialog open={!!assignFor} onOpenChange={(o) => !o && setAssignFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Okul Yöneticisi Ata — {assignFor?.name}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); assignAdmin.mutate({ id: assignFor.id, body: { email: (f.get("email") || "").trim(), firstName: f.get("firstName") || undefined, lastName: f.get("lastName") || undefined } }); }} className="space-y-3">
            <p className="text-sm text-slate-500">Yöneticinin e-posta adresiyle bir hesap oluşturulur; yönetici e-postasıyla giriş yapar. Yalnızca geçici şifre üretilir.</p>
            <div><Label htmlFor="a-email">E-posta</Label><Input id="a-email" name="email" type="email" required maxLength={160} placeholder="yonetici@okul.com" autoCapitalize="none" autoCorrect="off" spellCheck={false} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="a-fn">Ad</Label><Input id="a-fn" name="firstName" maxLength={60} /></div>
              <div><Label htmlFor="a-ln">Soyad</Label><Input id="a-ln" name="lastName" maxLength={60} /></div>
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setAssignFor(null)}>İptal</Button>
              <Button type="submit" disabled={assignAdmin.isPending} className="bg-indigo-600 hover:bg-indigo-700">{assignAdmin.isPending ? "Atanıyor…" : "Ata ve Oluştur"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <CredentialsDialog open={!!creds} onClose={() => setCreds(null)} creds={creds} title="Okul Yöneticisi Oluşturuldu" />
    </div>
  );
}
