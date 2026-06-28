import { useState } from "react";
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
import { ClipboardList, Plus, BarChart3, Send, Lock, Unlock, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

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

/** E-Sınıf — Öğretmen ödev listesi + atama. */
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
  const [examId, setExamId] = useState("");
  const [picked, setPicked] = useState(new Set());
  const [level, setLevel] = useState("");     // gradeLevel (string)
  const [subject, setSubject] = useState(""); // ders adı

  const { data: assignments = [], isLoading } = useQuery({ queryKey: ["esinif", "assignments"], queryFn: () => schoolApi.assignments.list(), enabled: !!role });
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
  const openCreate = () => { setExamId(""); setPicked(new Set()); setLevel(""); setSubject(""); setOpen(true); };

  const create = useMutation({
    mutationFn: (body) => schoolApi.assignments.create(body),
    onSuccess: (res) => { toast.success(`${res.created} sınıfa ödev atandı`); qc.invalidateQueries({ queryKey: ["esinif", "assignments"] }); setOpen(false); setExamId(""); setPicked(new Set()); },
    onError: (e) => toast.error(e?.response?.data?.message ?? "Atanamadı"),
  });
  const release = useMutation({
    mutationFn: (id) => schoolApi.assignments.releaseResults(id),
    onSuccess: () => { toast.success("Sonuçlar yayımlandı"); qc.invalidateQueries({ queryKey: ["esinif", "assignments"] }); },
    onError: (e) => toast.error(e?.response?.data?.message ?? "Yayımlanamadı"),
  });
  const setStatus = useMutation({
    mutationFn: ({ id, status }) => schoolApi.assignments.setStatus(id, status),
    onSuccess: () => { toast.success("Güncellendi"); qc.invalidateQueries({ queryKey: ["esinif", "assignments"] }); },
    onError: (e) => toast.error(e?.response?.data?.message ?? "Güncellenemedi"),
  });

  if (!role) return <div className="max-w-lg mx-auto text-center py-20"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" /><h2 className="text-xl font-semibold text-slate-900">Erişim yok</h2></div>;

  const togglePick = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const submit = (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (!examId) return toast.error("Sınav seçin");
    if (picked.size === 0) return toast.error("En az bir sınıf seçin");
    create.mutate({
      examId, classroomIds: [...picked],
      availableFrom: new Date(f.get("availableFrom")).toISOString(),
      dueDate: new Date(f.get("dueDate")).toISOString(),
      showResultAfter: f.get("showResultAfter"),
      allowLateSubmit: f.get("allowLateSubmit") === "on",
    });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center"><ClipboardList className="w-5 h-5 text-indigo-600" /></div>
          <div><h1 className="text-2xl font-bold text-slate-900">Ödevler</h1><p className="text-sm text-slate-500">Havuzdan sınav atayın, sonuçları izleyin</p></div>
        </div>
        {canCreate && <Button onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-700 gap-2"><Plus className="w-4 h-4" /> Yeni Ödev</Button>}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />)}</div>
      ) : assignments.length === 0 ? (
        <div className="text-center py-16 text-slate-500"><ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>Henüz ödev yok.</p></div>
      ) : (
        <div className="space-y-2">
          {assignments.map((a) => {
            const sm = STATUS_META[a.status] ?? STATUS_META.SCHEDULED;
            return (
              <div key={a.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-slate-900 truncate">{a.title}</span>
                    <Badge className={sm.color}>{sm.label}</Badge>
                    <Badge className="bg-slate-100 text-slate-600">{a.classroomName}</Badge>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Son teslim: {format(new Date(a.dueDate), "d MMM yyyy HH:mm", { locale: tr })} · {a.submissionCount} teslim
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => navigate(buildPageUrl("SchoolAssignmentReport", { id: a.id }))}><BarChart3 className="w-3.5 h-3.5" /> Rapor</Button>
                  {/* Yayımla/Aç/Kapat yalnız ödevi yöneten öğretmen/zümre başkanına; yönetici izler (salt-okunur). */}
                  {canManageRow && a.showResultAfter === "TEACHER_RELEASE" && !a.resultsReleased && (
                    <Button size="sm" variant="outline" className="h-8 gap-1 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50" onClick={() => release.mutate(a.id)}><Send className="w-3.5 h-3.5" /> Yayımla</Button>
                  )}
                  {canManageRow && (a.status === "CLOSED"
                    ? <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => setStatus.mutate({ id: a.id, status: "ACTIVE" })}><Unlock className="w-3.5 h-3.5" /> Aç</Button>
                    : <Button size="sm" variant="outline" className="h-8 gap-1 text-xs text-rose-600 border-rose-200 hover:bg-rose-50" onClick={() => setStatus.mutate({ id: a.id, status: "CLOSED" })}><Lock className="w-3.5 h-3.5" /> Kapat</Button>)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Yeni Ödev Ata</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-3">
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
            <div>
              <Label>Sonuç ne zaman görünsün?</Label>
              <Select name="showResultAfter" defaultValue="SUBMIT"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{RESULT_OPTS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="allowLateSubmit" className="rounded" /> Geç teslime izin ver</label>
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
