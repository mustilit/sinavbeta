import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { school as schoolApi } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Building2, Plus, UserCog, GraduationCap, AlertCircle, ChevronRight, ChevronDown,
  Layers, Users, Trash2, UserPlus, Upload, Download, Copy, Check, KeyRound,
} from "lucide-react";
import { toast } from "sonner";

/** Excel (Ad + Soyad) → [{firstName, lastName}]. Başlık varsa eşler; yoksa ilk iki sütun. */
async function parseStudentRows(file) {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" });
  if (!rows.length) return [];
  const norm = (v) => String(v ?? "").trim().toLocaleLowerCase("tr");
  const header = (rows[0] || []).map(norm);
  const AD = ["ad", "adı", "isim", "öğrenci adı", "first name", "firstname", "name"];
  const SOYAD = ["soyad", "soyadı", "öğrenci soyadı", "surname", "last name", "lastname"];
  const NO = ["no", "numara", "öğrenci no", "öğrenci numarası", "okul no", "number", "studentno", "öğrenci numara"];
  const adIdx = header.findIndex((h) => AD.includes(h));
  const soyadIdx = header.findIndex((h) => SOYAD.includes(h));
  const noIdx = header.findIndex((h) => NO.includes(h));
  const out = [];
  if (adIdx !== -1 || soyadIdx !== -1) {
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const fn = adIdx !== -1 ? String(r[adIdx] ?? "").trim() : "";
      const ln = soyadIdx !== -1 ? String(r[soyadIdx] ?? "").trim() : "";
      const no = noIdx !== -1 ? String(r[noIdx] ?? "").trim() : "";
      if (fn || ln) out.push({ firstName: fn, lastName: ln, studentNo: no || undefined });
    }
    return out;
  }
  // Başlık yok → tüm satırlar veri; ilk iki sütun ad/soyad, üçüncü sütun varsa no
  const looksHeader = header.some((h) => /ad|soyad|isim|name|surname|no|numara/.test(h));
  const dataRows = looksHeader ? rows.slice(1) : rows;
  for (const r of dataRows) {
    const c0 = String(r?.[0] ?? "").trim();
    const c1 = String(r?.[1] ?? "").trim();
    const c2 = String(r?.[2] ?? "").trim();
    if (c1) out.push({ firstName: c0, lastName: c1, studentNo: c2 || undefined });
    else if (c0) {
      const parts = c0.split(/\s+/);
      const lastName = parts.length > 1 ? parts.pop() : "";
      out.push({ firstName: parts.join(" "), lastName });
    }
  }
  return out;
}

async function downloadStudentTemplate() {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet([["Ad", "Soyad", "Öğrenci No"], ["Ahmet", "Yılmaz", "101"], ["Ayşe", "Demir", "102"]]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Öğrenciler");
  XLSX.writeFile(wb, "ogrenci-sablonu.xlsx");
}

const GRADES = Array.from({ length: 12 }, (_, i) => i + 1);

// Atama hedefine göre etiket/rol bilgisi
const ASSIGN_META = {
  branch: { title: "Şube Yöneticisi", role: null },        // tüm kullanıcılar (BRANCH_ADMIN'e yükseltilir)
  level: { title: "Seviye Sorumlusu", role: "TEACHER" },
  classroom: { title: "Sınıf Öğretmeni", role: "TEACHER" },
};

const errMsg = (e) => e?.response?.data?.error?.message ?? e?.response?.data?.message ?? "İşlem başarısız";

function ManagerBadge({ label }) {
  if (!label) return null;
  return (
    <Badge className="bg-blue-50 text-blue-700 border border-blue-200 gap-1 font-normal">
      <UserCog className="w-3 h-3" /> {label}
    </Badge>
  );
}

/** Okul Yöneticisi — Şube → Seviye → Sınıf ağaç görünümü; her satırda + ve yönetici atama. */
export default function SchoolBranches() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const role = user?.school?.schoolRole;
  const canManage = role === "SCHOOL_ADMIN" || role === "BRANCH_ADMIN";
  const isSchoolAdmin = role === "SCHOOL_ADMIN";
  const myId = user?.id; // designation kontrolü: seviye sorumlusu / sınıf öğretmeni node.adminUserId ile eşleşir

  const [branchOpen, setBranchOpen] = useState(false);
  const [levelFor, setLevelFor] = useState(null);       // branch row → seviye ekle
  const [classFor, setClassFor] = useState(null);       // { branch, level } → sınıf ekle
  const [studentsFor, setStudentsFor] = useState(null); // classroom row → öğrenci ata
  const [assignFor, setAssignFor] = useState(null);     // { kind, id, name } → yönetici ata
  const [deleteFor, setDeleteFor] = useState(null);     // { kind, id, name }
  const [picked, setPicked] = useState(new Set());
  const [creds, setCreds] = useState(null);             // toplu oluşturulan öğrenci kimlikleri

  const { data: tree = [], isLoading } = useQuery({ queryKey: ["esinif", "tree"], queryFn: schoolApi.tree });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["esinif", "tree"] });

  const createBranch = useMutation({
    mutationFn: schoolApi.createBranch,
    onSuccess: () => { toast.success("Şube oluşturuldu"); invalidate(); setBranchOpen(false); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const createLevel = useMutation({
    mutationFn: ({ branchId, gradeLevel }) => schoolApi.createLevel({ branchId, gradeLevel }),
    onSuccess: () => { toast.success("Seviye eklendi"); invalidate(); setLevelFor(null); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const createClassroom = useMutation({
    mutationFn: ({ levelId, name }) => schoolApi.createClassroom({ levelId, name }),
    onSuccess: () => { toast.success("Sınıf oluşturuldu"); invalidate(); setClassFor(null); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const assignStudents = useMutation({
    mutationFn: ({ id, ids }) => schoolApi.assignStudents(id, ids),
    onSuccess: (res) => { toast.success(`${res?.assigned ?? 0} öğrenci atandı`); invalidate(); setStudentsFor(null); setPicked(new Set()); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const bulkStudents = useMutation({
    mutationFn: ({ id, students }) => schoolApi.bulkCreateStudents(id, students),
    onSuccess: (res) => {
      toast.success(`${res?.count ?? 0} öğrenci oluşturuldu`);
      invalidate();
      setStudentsFor(null);
      setCreds(res?.created ?? []);
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const assignManager = useMutation({
    mutationFn: ({ kind, id, schoolUserId }) =>
      kind === "branch" ? schoolApi.assignBranchAdmin(id, { schoolUserId })
        : kind === "level" ? schoolApi.assignLevelAdmin(id, { schoolUserId })
          : schoolApi.assignClassroomAdmin(id, { schoolUserId }),
    onSuccess: () => { toast.success("Yönetici atandı"); invalidate(); setAssignFor(null); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const removeNode = useMutation({
    mutationFn: ({ kind, id }) => (kind === "level" ? schoolApi.deleteLevel(id) : schoolApi.deleteClassroom(id)),
    onSuccess: () => { toast.success("Silindi"); invalidate(); setDeleteFor(null); },
    onError: (e) => toast.error(errMsg(e)),
  });

  if (!role) {
    return <div className="max-w-lg mx-auto text-center py-20"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" /><h2 className="text-xl font-semibold text-slate-900">Erişim yok</h2></div>;
  }

  const togglePick = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center"><Building2 className="w-5 h-5 text-indigo-600" /></div>
          <div><h1 className="text-2xl font-bold text-slate-900">Şubeler & Sınıflar</h1><p className="text-sm text-slate-500">Şube → Seviye → Sınıf ağacı; her satırda ekleme ve yönetici atama</p></div>
        </div>
        {isSchoolAdmin && <Button onClick={() => setBranchOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 gap-2"><Plus className="w-4 h-4" /> Şube Ekle</Button>}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}</div>
      ) : tree.length === 0 ? (
        <div className="text-center py-16 text-slate-500"><Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>Henüz şube yok. {isSchoolAdmin && "Başlamak için bir şube ekleyin."}</p></div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-2">
          {tree.map((b) => (
            <BranchNode
              key={b.id} branch={b} canManage={canManage} isSchoolAdmin={isSchoolAdmin} myId={myId}
              onAddLevel={() => setLevelFor(b)}
              onAddClass={(lv) => setClassFor({ branch: b, level: lv })}
              onAssign={(node) => setAssignFor(node)}
              onStudents={(c) => setStudentsFor(c)}
              onDelete={(node) => setDeleteFor(node)}
            />
          ))}
        </div>
      )}

      {/* Şube ekle */}
      <Dialog open={branchOpen} onOpenChange={setBranchOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Yeni Şube</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); createBranch.mutate({ name: new FormData(e.currentTarget).get("name") }); }} className="space-y-3">
            <div><Label htmlFor="b-name">Şube adı</Label><Input id="b-name" name="name" required maxLength={80} placeholder="Ankara Şubesi" /></div>
            <DialogFooter className="gap-2"><Button type="button" variant="outline" onClick={() => setBranchOpen(false)}>İptal</Button><Button type="submit" disabled={createBranch.isPending} className="bg-indigo-600 hover:bg-indigo-700">Oluştur</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Seviye ekle */}
      <Dialog open={!!levelFor} onOpenChange={(o) => !o && setLevelFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Seviye Ekle — {levelFor?.name}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); createLevel.mutate({ branchId: levelFor.id, gradeLevel: Number(new FormData(e.currentTarget).get("gradeLevel")) }); }} className="space-y-3">
            <div>
              <Label>Seviye</Label>
              <Select name="gradeLevel" defaultValue="5"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{GRADES.map((g) => <SelectItem key={g} value={String(g)}>{g}. Seviye</SelectItem>)}</SelectContent></Select>
              <p className="text-xs text-slate-400 mt-1">Şubede aynı seviye yalnız bir kez eklenir.</p>
            </div>
            <DialogFooter className="gap-2"><Button type="button" variant="outline" onClick={() => setLevelFor(null)}>İptal</Button><Button type="submit" disabled={createLevel.isPending} className="bg-indigo-600 hover:bg-indigo-700">Ekle</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Sınıf ekle */}
      <Dialog open={!!classFor} onOpenChange={(o) => !o && setClassFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Sınıf Ekle — {classFor?.branch?.name} / {classFor?.level?.gradeLevel}. Seviye</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); createClassroom.mutate({ levelId: classFor.level.id, name: new FormData(e.currentTarget).get("name") }); }} className="space-y-3">
            <div><Label htmlFor="c-name">Sınıf adı</Label><Input id="c-name" name="name" required maxLength={40} placeholder={`${classFor?.level?.gradeLevel ?? ""}-A`} /></div>
            <DialogFooter className="gap-2"><Button type="button" variant="outline" onClick={() => setClassFor(null)}>İptal</Button><Button type="submit" disabled={createClassroom.isPending} className="bg-indigo-600 hover:bg-indigo-700">Oluştur</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Öğrenci ata */}
      <StudentsDialog
        open={!!studentsFor} classroom={studentsFor} picked={picked} togglePick={togglePick}
        onClose={() => { setStudentsFor(null); setPicked(new Set()); }}
        onSubmit={() => assignStudents.mutate({ id: studentsFor.id, ids: [...picked] })}
        onImport={(students) => bulkStudents.mutate({ id: studentsFor.id, students })}
        pending={assignStudents.isPending}
        importing={bulkStudents.isPending}
      />

      {/* Toplu oluşturma sonrası kimlik listesi */}
      <BulkCredentialsDialog creds={creds} onClose={() => setCreds(null)} />

      {/* Yönetici ata (şube/seviye/sınıf) */}
      <AssignManagerDialog
        node={assignFor} onClose={() => setAssignFor(null)}
        onSubmit={(schoolUserId) => assignManager.mutate({ kind: assignFor.kind, id: assignFor.id, schoolUserId })}
        pending={assignManager.isPending}
      />

      {/* Silme onayı */}
      <AlertDialog open={!!deleteFor} onOpenChange={(o) => !o && setDeleteFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteFor?.kind === "level" ? "Seviyeyi sil" : "Sınıfı sil"}</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteFor?.name}</strong> silinecek. {deleteFor?.kind === "level" ? "Seviyede sınıf varsa silinemez." : "Sınıfta öğrenci varsa silinemez."} Bu işlem geri alınamaz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={() => removeNode.mutate({ kind: deleteFor.kind, id: deleteFor.id })}>Sil</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Şube düğümü ───────────────────────────────────────────────────────────────
function BranchNode({ branch, canManage, isSchoolAdmin, myId, onAddLevel, onAddClass, onAssign, onStudents, onDelete }) {
  const [open, setOpen] = useState(true);
  const classCount = branch.levels.reduce((n, l) => n + l.classrooms.length, 0);
  return (
    <div>
      <div className="flex items-center gap-2 py-2.5 px-3 rounded-lg hover:bg-slate-50 group">
        <button type="button" className="w-5 h-5 flex items-center justify-center text-slate-400 shrink-0" onClick={() => setOpen((v) => !v)} aria-label={open ? "Daralt" : "Genişlet"}>
          {branch.levels.length ? (open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />) : <span className="w-4" />}
        </button>
        <Building2 className="w-4 h-4 text-indigo-600 shrink-0" />
        <span className="font-semibold text-slate-800 flex-1">{branch.name}</span>
        <Badge className="bg-slate-100 text-slate-500">{branch.levels.length} seviye · {classCount} sınıf</Badge>
        <ManagerBadge label={branch.adminLabel} />
        {canManage && (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-slate-500 hover:text-indigo-600" title="Seviye Ekle" onClick={onAddLevel}><Plus className="w-3.5 h-3.5" /></Button>
            {isSchoolAdmin && <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-slate-500 hover:text-blue-600" title="Şube Yöneticisi Ata" onClick={() => onAssign({ kind: "branch", id: branch.id, name: branch.name })}><UserCog className="w-3.5 h-3.5" /></Button>}
          </div>
        )}
      </div>
      {open && branch.levels.length > 0 && (
        <div className="ml-6 border-l-2 border-slate-100 pl-2 mt-0.5">
          {branch.levels.map((lv) => (
            <LevelNode key={lv.id} level={lv} canManage={canManage} myId={myId} onAddClass={() => onAddClass(lv)} onAssign={onAssign} onStudents={onStudents} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Seviye düğümü ─────────────────────────────────────────────────────────────
function LevelNode({ level, canManage, myId, onAddClass, onAssign, onStudents, onDelete }) {
  const [open, setOpen] = useState(true);
  const levelHead = !!myId && level.adminUserId === myId; // seviye sorumlusu
  const levelManage = canManage || levelHead;
  return (
    <div>
      <div className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-slate-50 group">
        <button type="button" className="w-5 h-5 flex items-center justify-center text-slate-400 shrink-0" onClick={() => setOpen((v) => !v)} aria-label={open ? "Daralt" : "Genişlet"}>
          {level.classrooms.length ? (open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />) : <span className="w-4" />}
        </button>
        <Layers className="w-4 h-4 text-amber-500 shrink-0" />
        <span className="font-medium text-slate-700 flex-1">{level.gradeLevel}. Seviye</span>
        <Badge className="bg-slate-100 text-slate-500">{level.classrooms.length} sınıf</Badge>
        <ManagerBadge label={level.adminLabel} />
        {levelManage && (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-slate-500 hover:text-indigo-600" title="Sınıf Ekle" onClick={onAddClass}><Plus className="w-3.5 h-3.5" /></Button>
            {canManage && <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-slate-500 hover:text-blue-600" title="Seviye Sorumlusu Ata" onClick={() => onAssign({ kind: "level", id: level.id, name: `${level.gradeLevel}. Seviye` })}><UserCog className="w-3.5 h-3.5" /></Button>}
            {canManage && <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-slate-500 hover:text-rose-600" title="Seviyeyi Sil" onClick={() => onDelete({ kind: "level", id: level.id, name: `${level.gradeLevel}. Seviye` })}><Trash2 className="w-3.5 h-3.5" /></Button>}
          </div>
        )}
      </div>
      {open && level.classrooms.length > 0 && (
        <div className="ml-6 border-l-2 border-slate-100 pl-2 mt-0.5">
          {level.classrooms.map((c) => (
            <ClassNode key={c.id} classroom={c} canManage={canManage} levelHead={levelHead} myId={myId} onAssign={onAssign} onStudents={onStudents} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sınıf düğümü (yaprak) ─────────────────────────────────────────────────────
function ClassNode({ classroom, canManage, levelHead, myId, onAssign, onStudents, onDelete }) {
  const classTeacher = !!myId && classroom.adminUserId === myId; // sınıf öğretmeni
  const classManage = canManage || levelHead || classTeacher;   // öğrenci atama/Excel
  const teacherAndDelete = canManage || levelHead;              // öğretmen ata / sil
  return (
    <div className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-slate-50 group">
      <span className="w-5 shrink-0" />
      <GraduationCap className="w-4 h-4 text-emerald-500 shrink-0" />
      <span className="font-medium text-slate-700 flex-1">{classroom.name}</span>
      <Badge className="bg-slate-100 text-slate-500 gap-1"><Users className="w-3 h-3" /> {classroom.studentCount}</Badge>
      <ManagerBadge label={classroom.adminLabel} />
      {classManage && (
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-slate-500 hover:text-indigo-600" title="Öğrenci Ata" onClick={() => onStudents(classroom)}><UserPlus className="w-3.5 h-3.5" /></Button>
          {teacherAndDelete && <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-slate-500 hover:text-blue-600" title="Sınıf Öğretmeni Ata" onClick={() => onAssign({ kind: "classroom", id: classroom.id, name: classroom.name })}><UserCog className="w-3.5 h-3.5" /></Button>}
          {teacherAndDelete && <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-slate-500 hover:text-rose-600" title="Sınıfı Sil" onClick={() => onDelete({ kind: "classroom", id: classroom.id, name: classroom.name })}><Trash2 className="w-3.5 h-3.5" /></Button>}
        </div>
      )}
    </div>
  );
}

// ── Yönetici atama diyaloğu (şube/seviye/sınıf ortak) ─────────────────────────
function AssignManagerDialog({ node, onClose, onSubmit, pending }) {
  const meta = node ? ASSIGN_META[node.kind] : null;
  const { data: users } = useQuery({
    queryKey: ["esinif", "users", "assign-pick", meta?.role ?? "all"],
    queryFn: () => schoolApi.listUsers({ ...(meta?.role ? { role: meta.role } : {}), limit: 100 }),
    enabled: !!node,
  });
  const items = users?.items ?? [];
  return (
    <Dialog open={!!node} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{meta?.title} Ata — {node?.name}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); const id = new FormData(e.currentTarget).get("schoolUserId"); if (!id) return toast.error("Kullanıcı seçin"); onSubmit(id); }} className="space-y-3">
          <div>
            <Label>Kullanıcı</Label>
            <Select name="schoolUserId">
              <SelectTrigger><SelectValue placeholder={items.length ? "Kullanıcı seç" : "Uygun kullanıcı yok"} /></SelectTrigger>
              <SelectContent>{items.map((m) => <SelectItem key={m.id} value={m.id}>{m.username}{m.fullName ? ` · ${m.fullName}` : ""}</SelectItem>)}</SelectContent>
            </Select>
            {node?.kind === "branch"
              ? <p className="text-xs text-slate-400 mt-1">Seçilen kullanıcı Şube Yöneticisi rolüne yükseltilir.</p>
              : <p className="text-xs text-slate-400 mt-1">Sorumlu/öğretmen olarak etiketlenir; rolü değişmez.</p>}
          </div>
          <DialogFooter className="gap-2"><Button type="button" variant="outline" onClick={onClose}>İptal</Button><Button type="submit" disabled={pending} className="bg-indigo-600 hover:bg-indigo-700">Ata</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Öğrenci atama diyaloğu ────────────────────────────────────────────────────
function StudentsDialog({ open, classroom, picked, togglePick, onClose, onSubmit, onImport, pending, importing }) {
  const { data: students } = useQuery({
    queryKey: ["esinif", "users", "STUDENT-pick"],
    queryFn: () => schoolApi.listUsers({ role: "STUDENT", limit: 100 }),
    enabled: open,
  });
  const items = students?.items ?? [];
  const fileRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const rows = await parseStudentRows(file);
      if (!rows.length) { toast.error("Geçerli Ad/Soyad satırı bulunamadı"); return; }
      onImport(rows);
    } catch {
      toast.error("Excel okunamadı");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Öğrenci Ekle — {classroom?.name}</DialogTitle></DialogHeader>

        {/* Excel ile toplu oluşturma */}
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 space-y-2">
          <p className="text-sm font-medium text-indigo-900">Excel ile öğrenci ekle</p>
          <p className="text-xs text-slate-500">Ad, Soyad (ve opsiyonel Öğrenci No) sütunlu dosya yükleyin; sistem her öğrenci için kullanıcı adı + geçici şifre üretir, bu sınıfa ekler.</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={handleFile} />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={() => fileRef.current?.click()} disabled={importing} className="bg-indigo-600 hover:bg-indigo-700 gap-1.5">
              <Upload className="w-3.5 h-3.5" /> {importing ? "Yükleniyor…" : "Excel Seç"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={downloadStudentTemplate} className="text-slate-500 gap-1.5">
              <Download className="w-3.5 h-3.5" /> Şablon indir
            </Button>
          </div>
        </div>

        <div className="relative my-1">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
          <div className="relative flex justify-center"><span className="bg-white px-2 text-xs text-slate-400">veya mevcut öğrencilerden seç</span></div>
        </div>

        <div className="max-h-56 overflow-y-auto space-y-1">
          {items.length === 0 ? <p className="text-sm text-slate-400 py-4 text-center">Atanabilir öğrenci yok.</p> : items.map((s) => (
            <label key={s.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 cursor-pointer hover:bg-slate-50">
              <input type="checkbox" checked={picked.has(s.id)} onChange={() => togglePick(s.id)} className="rounded" />
              <span className="font-mono text-sm">{s.username}</span>
              <span className="text-xs text-slate-500">{s.fullName || ""}</span>
              {s.classroomName && <Badge className="ml-auto bg-slate-100 text-slate-500 text-[10px]">{s.classroomName}</Badge>}
            </label>
          ))}
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Kapat</Button>
          <Button onClick={onSubmit} disabled={picked.size === 0 || pending} className="bg-indigo-600 hover:bg-indigo-700">{picked.size} öğrenci ata</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Toplu oluşturulan öğrenci kimlik bilgileri (tek sefer görünür) ────────────
function BulkCredentialsDialog({ creds, onClose }) {
  const [copied, setCopied] = useState(false);
  if (!creds) return null;

  const copyAll = async () => {
    const text = creds.map((c) => `${c.name}\t${c.studentNo ?? ""}\t${c.username}\t${c.tempPassword}`).join("\n");
    try { await navigator.clipboard.writeText(`Ad Soyad\tÖğrenci No\tKullanıcı adı\tŞifre\n${text}`); setCopied(true); toast.success("Panoya kopyalandı"); setTimeout(() => setCopied(false), 1500); }
    catch { toast.error("Kopyalanamadı"); }
  };
  const exportExcel = async () => {
    try {
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.aoa_to_sheet([["Ad Soyad", "Öğrenci No", "Kullanıcı adı", "Şifre"], ...creds.map((c) => [c.name, c.studentNo ?? "", c.username, c.tempPassword])]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Öğrenciler");
      XLSX.writeFile(wb, `ogrenci-sifreleri-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch { toast.error("Excel oluşturulamadı"); }
  };

  return (
    <Dialog open={!!creds} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><KeyRound className="h-4 w-4" /></span>
            Oluşturulan Öğrenciler ({creds.length})
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          Geçici şifreler yalnızca şimdi görünür. İndirin veya kopyalayın; öğrencilere güvenli şekilde iletin.
        </p>
        <div className="flex gap-2">
          <Button onClick={exportExcel} className="bg-indigo-600 hover:bg-indigo-700 gap-2"><Download className="w-4 h-4" /> Excel indir</Button>
          <Button variant="outline" onClick={copyAll} className="gap-2">{copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />} Kopyala</Button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs"><tr><th className="px-3 py-2 text-left">Ad Soyad</th><th className="px-3 py-2 text-left">No</th><th className="px-3 py-2 text-left">Kullanıcı adı</th><th className="px-3 py-2 text-left">Şifre</th></tr></thead>
            <tbody>
              {creds.map((c, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-3 py-2">{c.name || "—"}</td>
                  <td className="px-3 py-2 text-slate-500">{c.studentNo || "—"}</td>
                  <td className="px-3 py-2 font-mono">{c.username}</td>
                  <td className="px-3 py-2 font-mono font-semibold text-slate-900">{c.tempPassword}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <DialogFooter><Button onClick={onClose} className="bg-indigo-600 hover:bg-indigo-700">Tamam</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
