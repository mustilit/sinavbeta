import { useState, useEffect, useRef, useDeferredValue } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { school as schoolApi } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { useAppNavigate, buildPageUrl } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ClipboardList, Plus, BarChart3, Send, Lock, Unlock, AlertCircle, CalendarRange, ChevronDown, ChevronLeft, ChevronRight, Search, CheckCircle2, RotateCcw, BookOpen } from "lucide-react";
import { AssignmentTimeline } from "@/components/school/AssignmentTimeline";
import { toast } from "sonner";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { PeriodSelect } from "@/components/school/PeriodSelect";

const STATUS_META = {
  SCHEDULED: { label: "Planlandı", color: "bg-amber-100 text-amber-700" },
  ACTIVE: { label: "Aktif", color: "bg-emerald-100 text-emerald-700" },
  CLOSED: { label: "Kapalı", color: "bg-slate-200 text-slate-600" },
};
const RESULT_OPTS = [
  { value: "SUBMIT", label: "Teslimden sonra" },
  { value: "DUE_DATE", label: "Son tarihten sonra" },
  { value: "TEACHER_RELEASE", label: "Ben yayımlayınca" },
];
const PAGE_SIZE = 20;

/** E-Sınıf — Öğretmen ödev listesi + atama (sınav havuzundan veya sistem dışı). */
export default function SchoolAssignments() {
  const { user } = useAuth();
  const navigate = useAppNavigate();
  const qc = useQueryClient();
  const role = user?.school?.schoolRole;
  // Atama: öğretmen/zümre başkanı + yöneticiler (backend kapsama göre sınırlar).
  const canCreate = ["TEACHER", "DEPT_HEAD", "SCHOOL_ADMIN", "BRANCH_ADMIN"].includes(role);
  // Yayımla/Aç/Kapat yalnız ödevi yöneten öğretmen/zümre başkanı (yönetici salt-izler).
  const canManageRow = role === "TEACHER" || role === "DEPT_HEAD";
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("exam"); // exam | offline — dialog sekmesi
  const [examId, setExamId] = useState("");
  const [offlineSubjectId, setOfflineSubjectId] = useState("");
  const [picked, setPicked] = useState(new Set());
  const [level, setLevel] = useState("");     // gradeLevel (string)
  const [subject, setSubject] = useState(""); // ders adı (sınav filtresi)
  const [periodId, setPeriodId] = useState("");
  const [showTimeline, setShowTimeline] = useState(true);
  // Liste filtreleri (server-side)
  const [q, setQ] = useState("");
  const deferredQ = useDeferredValue(q);
  const [fStatus, setFStatus] = useState("ALL");
  const [fKind, setFKind] = useState("ALL");
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [deferredQ, fStatus, fKind, periodId]);

  const { data, isLoading } = useQuery({
    queryKey: ["esinif", "assignments", periodId, page, fStatus, fKind, deferredQ],
    queryFn: () => schoolApi.assignments.list({
      periodId,
      page,
      pageSize: PAGE_SIZE,
      q: deferredQ.trim() || undefined,
      status: fStatus === "ALL" ? undefined : fStatus,
      kind: fKind === "ALL" ? undefined : fKind,
    }),
    enabled: !!role && !!periodId,
  });
  const assignments = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const { data: exams = [] } = useQuery({ queryKey: ["esinif", "exam-pool", "for-assign"], queryFn: () => schoolApi.exams.list(), enabled: open });
  const { data: classrooms = [] } = useQuery({ queryKey: ["esinif", "classrooms", "all"], queryFn: () => schoolApi.listClassrooms(), enabled: open });
  // Hiyerarşik atama seçenekleri (seviye + ders) — okul yön. tümü, seviye sor. kendi seviyesi, zümre kendi seviye+dersi
  const { data: options } = useQuery({ queryKey: ["esinif", "assign-options"], queryFn: () => schoolApi.assignments.options(), enabled: open && canCreate });
  const levelOpts = options?.levels ?? [];
  const subjectOpts = options?.subjects ?? [];
  // Seçilen seviye+derse uygun sınavlar; sınıflar seçilen seviyeye göre süzülür.
  const filteredExams = exams.filter((e) => !e.isArchived && e.questionCount > 0
    && (!level || String(e.gradeLevel) === level)
    && (!subject || e.subject === subject));
  const filteredClassrooms = classrooms.filter((c) => !level || String(c.gradeLevel) === level);
  const openCreate = () => { setMode("exam"); setExamId(""); setOfflineSubjectId(""); setPicked(new Set()); setLevel(""); setSubject(""); setOpen(true); };

  // Sınav Havuzu'ndan "Ödev Ata" → ?examId ile gelince: dialog'u aç + seçili sınavın
  // seviye/dersini ön-doldur + sınavı seçili getir (yalnız bir kez).
  const [searchParams] = useSearchParams();
  const presetExamId = searchParams.get("examId");
  const presetAppliedRef = useRef(false);
  useEffect(() => {
    if (presetAppliedRef.current || !presetExamId || !canCreate) return;
    if (exams.length === 0) { setOpen(true); return; } // exams sorgusu enabled:open → önce aç
    const ex = exams.find((e) => e.id === presetExamId);
    presetAppliedRef.current = true;
    if (ex) { setMode("exam"); setLevel(String(ex.gradeLevel ?? "")); setSubject(ex.subject ?? ""); setExamId(ex.id); setOpen(true); }
  }, [presetExamId, exams, canCreate]);

  const create = useMutation({
    mutationFn: (/** @type {any} */ body) => schoolApi.assignments.create(body),
    onSuccess: (res) => { toast.success(`${res.created} sınıfa ödev atandı`); qc.invalidateQueries({ queryKey: ["esinif", "assignments"] }); setOpen(false); setExamId(""); setOfflineSubjectId(""); setPicked(new Set()); },
    onError: (e) => toast.error(e?.response?.data?.message ?? "Atanamadı"),
  });
  const release = useMutation({
    mutationFn: (/** @type {any} */ id) => schoolApi.assignments.releaseResults(id),
    onSuccess: () => { toast.success("Sonuçlar yayımlandı"); qc.invalidateQueries({ queryKey: ["esinif", "assignments"] }); },
    onError: (e) => toast.error(e?.response?.data?.message ?? "Yayımlanamadı"),
  });
  const setStatus = useMutation({
    mutationFn: (/** @type {any} */ { id, status }) => schoolApi.assignments.setStatus(id, status),
    onSuccess: () => { toast.success("Güncellendi"); qc.invalidateQueries({ queryKey: ["esinif", "assignments"] }); },
    onError: (e) => toast.error(e?.response?.data?.message ?? "Güncellenemedi"),
  });
  const offlineDone = useMutation({
    mutationFn: (/** @type {any} */ { id, done }) => schoolApi.assignments.markOfflineDone(id, done),
    onSuccess: (_res, vars) => { toast.success(vars.done ? "Yapıldı olarak işaretlendi" : "Geri alındı"); qc.invalidateQueries({ queryKey: ["esinif", "assignments"] }); },
    onError: (e) => toast.error(e?.response?.data?.message ?? "İşaretlenemedi"),
  });

  if (!role) return <div className="max-w-lg mx-auto text-center py-20"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" /><h2 className="text-xl font-semibold text-slate-900">Erişim yok</h2></div>;

  const togglePick = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const submit = (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (mode === "offline") {
      if (!offlineSubjectId) return toast.error("Ders seçin");
      const title = (f.get("offlineTitle") ?? "").toString().trim();
      const description = (f.get("offlineDescription") ?? "").toString().trim();
      if (!title) return toast.error("Ödev başlığı yazın");
      if (!description) return toast.error("Ödev açıklaması yazın");
      if (picked.size === 0) return toast.error("En az bir sınıf seçin");
      create.mutate({
        isOffline: true, offlineSubjectId, offlineDescription: description, title,
        classroomIds: [...picked],
        availableFrom: new Date(String(f.get("availableFrom"))).toISOString(),
        dueDate: new Date(String(f.get("dueDate"))).toISOString(),
      });
      return;
    }
    if (!examId) return toast.error("Sınav seçin");
    if (picked.size === 0) return toast.error("En az bir sınıf seçin");
    create.mutate({
      examId, classroomIds: [...picked],
      availableFrom: new Date(String(f.get("availableFrom"))).toISOString(),
      dueDate: new Date(String(f.get("dueDate"))).toISOString(),
      showResultAfter: f.get("showResultAfter"),
      allowLateSubmit: f.get("allowLateSubmit") === "on",
    });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center"><ClipboardList className="w-5 h-5 text-indigo-600" /></div>
          <div><h1 className="text-2xl font-bold text-slate-900">Ödevler</h1><p className="text-sm text-slate-500">Havuzdan sınav veya sistem dışı ödev atayın, sonuçları izleyin</p></div>
        </div>
        <div className="flex items-center gap-2">
          <PeriodSelect value={periodId} onChange={setPeriodId} />
          {canCreate && <Button onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-700 gap-2"><Plus className="w-4 h-4" /> Yeni Ödev</Button>}
        </div>
      </div>

      {/* Filtre satırı — arama + durum + tür (server-side) */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ödev ara…" className="pl-9" aria-label="Ödev ara" />
        </div>
        <Select value={fStatus} onValueChange={setFStatus}>
          <SelectTrigger className="w-full sm:w-40" aria-label="Durum filtresi"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tüm durumlar</SelectItem>
            <SelectItem value="SCHEDULED">Planlandı</SelectItem>
            <SelectItem value="ACTIVE">Aktif</SelectItem>
            <SelectItem value="CLOSED">Kapalı</SelectItem>
          </SelectContent>
        </Select>
        <Select value={fKind} onValueChange={setFKind}>
          <SelectTrigger className="w-full sm:w-40" aria-label="Tür filtresi"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tüm türler</SelectItem>
            <SelectItem value="exam">Sınav ödevi</SelectItem>
            <SelectItem value="offline">Sistem dışı</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />)}</div>
      ) : assignments.length === 0 ? (
        <div className="text-center py-16 text-slate-500"><ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>{q.trim() || fStatus !== "ALL" || fKind !== "ALL" ? "Filtreye uyan ödev yok." : "Henüz ödev yok."}</p></div>
      ) : (
        <>
        <div className="space-y-2">
          {assignments.map((a) => {
            const sm = STATUS_META[a.status] ?? STATUS_META.SCHEDULED;
            const isOwner = a.createdById === user?.id;
            return (
              <div key={a.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-slate-900 truncate">{a.title}</span>
                    <Badge className={sm.color}>{sm.label}</Badge>
                    {a.isOffline && <Badge className="bg-amber-100 text-amber-700">Sistem Dışı</Badge>}
                    {a.isOffline && a.offlineSubjectName && <Badge className="bg-indigo-50 text-indigo-600">{a.offlineSubjectName}</Badge>}
                    <Badge className="bg-slate-100 text-slate-600">{a.classroomName}</Badge>
                    {a.isOffline && a.offlineDoneAt && <Badge className="bg-emerald-100 text-emerald-700 gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Yapıldı</Badge>}
                  </div>
                  {a.isOffline && a.offlineDescription && (
                    <p className="text-xs text-slate-600 mt-1 line-clamp-2 whitespace-pre-line">{a.offlineDescription}</p>
                  )}
                  <p className="text-xs text-slate-500 mt-1">
                    Son teslim: {format(new Date(a.dueDate), "d MMM yyyy HH:mm", { locale: tr })}{a.isOffline ? "" : ` · ${a.submissionCount} teslim`}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  {a.isOffline ? (
                    (canManageRow || isOwner) && (a.offlineDoneAt ? (
                      <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" disabled={offlineDone.isPending} onClick={() => offlineDone.mutate({ id: a.id, done: false })}><RotateCcw className="w-3.5 h-3.5" /> Geri Al</Button>
                    ) : (
                      <Button size="sm" variant="outline" className="h-8 gap-1 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50" disabled={offlineDone.isPending} onClick={() => offlineDone.mutate({ id: a.id, done: true })}><CheckCircle2 className="w-3.5 h-3.5" /> Yapıldı</Button>
                    ))
                  ) : (
                    <>
                      <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => navigate(buildPageUrl("SchoolAssignmentReport", { id: a.id }))}><BarChart3 className="w-3.5 h-3.5" /> Rapor</Button>
                      {/* Yayımla/Aç/Kapat yalnız ödevi yöneten öğretmen/zümre başkanına; yönetici izler (salt-okunur). */}
                      {canManageRow && a.showResultAfter === "TEACHER_RELEASE" && !a.resultsReleased && (
                        <Button size="sm" variant="outline" className="h-8 gap-1 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50" onClick={() => release.mutate(a.id)}><Send className="w-3.5 h-3.5" /> Yayımla</Button>
                      )}
                      {canManageRow && (a.status === "CLOSED"
                        ? <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => setStatus.mutate({ id: a.id, status: "ACTIVE" })}><Unlock className="w-3.5 h-3.5" /> Aç</Button>
                        : <Button size="sm" variant="outline" className="h-8 gap-1 text-xs text-rose-600 border-rose-200 hover:bg-rose-50" onClick={() => setStatus.mutate({ id: a.id, status: "CLOSED" })}><Lock className="w-3.5 h-3.5" /> Kapat</Button>)}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {pageCount > 1 && (
          <div className="flex items-center justify-center gap-3 pt-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="w-4 h-4" /> Önceki</Button>
            <span className="text-sm text-slate-500">Sayfa {page} / {pageCount} · {total} ödev</span>
            <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>Sonraki <ChevronRight className="w-4 h-4" /></Button>
          </div>
        )}
        </>
      )}

      {/* Ödev takvimi — sayfanın EN ALTINA YAPIŞIK (sticky); açık/kapalı her halde altta kalır */}
      {assignments.length > 0 && (
        <div className="sticky bottom-0 z-20 -mx-6 lg:-mx-8 px-6 lg:px-8 py-2 space-y-2 border-t border-slate-200 bg-white/95 backdrop-blur">
          <button type="button" onClick={() => setShowTimeline((v) => !v)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 min-h-10">
            <CalendarRange className="w-4 h-4 text-indigo-600" /> Ödev Takvimi
            <ChevronDown className={`w-4 h-4 transition-transform ${showTimeline ? "" : "-rotate-90"}`} />
          </button>
          {showTimeline && <AssignmentTimeline items={assignments} />}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Yeni Ödev Ata</DialogTitle></DialogHeader>
          {/* Tür sekmesi: havuzdan sınav / sistem dışı (ders + serbest metin) */}
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Ödev türü">
            {/** @type {[string, string, any][]} */ ([["exam", "Sınav Ödevi", ClipboardList], ["offline", "Sistem Dışı", BookOpen]]).map(([k, label, Icon]) => (
              <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 min-h-10 text-sm font-medium transition-colors ${mode === k ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="space-y-3">
            {mode === "exam" ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Seviye</Label>
                    <Select value={level} onValueChange={(v) => { setLevel(v); setExamId(""); setPicked(new Set()); }}>
                      <SelectTrigger><SelectValue placeholder="Seviye seç" /></SelectTrigger>
                      <SelectContent>
                        {levelOpts.map((l) => <SelectItem key={l.gradeLevel} value={String(l.gradeLevel)}>{l.gradeLevel}. Sınıf</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Ders</Label>
                    <Select value={subject} onValueChange={(v) => { setSubject(v); setExamId(""); }}>
                      <SelectTrigger><SelectValue placeholder="Ders seç" /></SelectTrigger>
                      <SelectContent>
                        {subjectOpts.map((s) => <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Havuzdan sınav {level && subject ? "" : <span className="text-xs font-normal text-slate-400">(önce seviye + ders seçin)</span>}</Label>
                  <Select value={examId} onValueChange={setExamId} disabled={!level || !subject}>
                    <SelectTrigger><SelectValue placeholder={level && subject ? "Sınav seç" : "Seviye + ders seçin"} /></SelectTrigger>
                    <SelectContent>
                      {filteredExams.length === 0
                        ? <div className="px-3 py-2 text-xs text-slate-400">Bu seviye/derste sınav yok.</div>
                        : filteredExams.map((e) => (
                          <SelectItem key={e.id} value={e.id}>{e.title} · {e.examType} · {e.questionCount} soru</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Ders</Label>
                    <Select value={offlineSubjectId} onValueChange={setOfflineSubjectId}>
                      <SelectTrigger><SelectValue placeholder="Ders seç" /></SelectTrigger>
                      <SelectContent>
                        {subjectOpts.filter((s) => s.id).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Seviye <span className="text-xs font-normal text-slate-400">(sınıf süzme)</span></Label>
                    <Select value={level} onValueChange={(v) => { setLevel(v); setPicked(new Set()); }}>
                      <SelectTrigger><SelectValue placeholder="Seviye seç" /></SelectTrigger>
                      <SelectContent>
                        {levelOpts.map((l) => <SelectItem key={l.gradeLevel} value={String(l.gradeLevel)}>{l.gradeLevel}. Sınıf</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label htmlFor="ot">Ödev başlığı</Label><Input id="ot" name="offlineTitle" maxLength={200} required placeholder="Örn: Kitap özeti — 3. bölüm" /></div>
                <div><Label htmlFor="od">Açıklama / yönerge</Label><Textarea id="od" name="offlineDescription" maxLength={4000} required rows={4} placeholder="Ödevin içeriğini ve beklentilerinizi yazın…" /></div>
              </>
            )}
            <div>
              <div className="flex items-center justify-between">
                <Label>Sınıflar {level ? `(${level}. Sınıf)` : ""}</Label>
                {filteredClassrooms.length > 0 && (
                  <button type="button" className="text-xs text-indigo-600 hover:underline"
                    onClick={() => {
                      const allPicked = filteredClassrooms.every((c) => picked.has(c.id));
                      setPicked((s) => {
                        const n = new Set(s);
                        filteredClassrooms.forEach((c) => { allPicked ? n.delete(c.id) : n.add(c.id); });
                        return n;
                      });
                    }}>
                    {filteredClassrooms.every((c) => picked.has(c.id)) ? "Seçimi kaldır" : "Tümünü seç"}
                  </button>
                )}
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1 mt-1 border border-slate-200 rounded-lg p-2">
                {filteredClassrooms.length === 0 ? <p className="text-xs text-slate-400 p-2">{level ? "Bu seviyede sınıf yok." : "Önce seviye seçin."}</p> : filteredClassrooms.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={picked.has(c.id)} onChange={() => togglePick(c.id)} className="rounded" />
                    <span className="text-sm">{c.name}</span><span className="text-xs text-slate-400">({c.studentCount} öğr.)</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="af">Başlangıç</Label><Input id="af" name="availableFrom" type="datetime-local" required defaultValue={new Date().toISOString().slice(0, 16)} /></div>
              <div><Label htmlFor="dd">Son teslim</Label><Input id="dd" name="dueDate" type="datetime-local" required /></div>
            </div>
            {mode === "exam" && (
              <>
                <div>
                  <Label>Sonuç ne zaman görünsün?</Label>
                  <Select name="showResultAfter" defaultValue="SUBMIT"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{RESULT_OPTS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="allowLateSubmit" className="rounded" /> Geç teslime izin ver</label>
              </>
            )}
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>İptal</Button>
              <Button type="submit" disabled={create.isPending} className="bg-indigo-600 hover:bg-indigo-700">{create.isPending ? "Atanıyor…" : "Ata"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
