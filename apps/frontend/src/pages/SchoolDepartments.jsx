import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { school as schoolApi } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  BookOpen, Plus, Users, AlertCircle, ChevronRight, ChevronDown, Building2, Layers,
  Trash2, UserCog, School as SchoolIcon,
} from "lucide-react";
import { toast } from "sonner";

const errMsg = (e) => e?.response?.data?.error?.message ?? e?.response?.data?.message ?? "İşlem başarısız";

function HeadBadge({ label }) {
  if (!label) return null;
  return <Badge className="bg-blue-50 text-blue-700 border border-blue-200 gap-1 font-normal"><UserCog className="w-3 h-3" /> {label}</Badge>;
}

/** Okul Yöneticisi — Zümreler: Tüm Okul + Şube → Seviye ağacı; her düğüme zümre eklenir. */
export default function SchoolDepartments() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const role = user?.school?.schoolRole;
  const canManage = role === "SCHOOL_ADMIN" || role === "BRANCH_ADMIN";
  const isSchoolAdmin = role === "SCHOOL_ADMIN";

  const [createFor, setCreateFor] = useState(null); // { scope, branchId?, levelId?, title }
  const [membersFor, setMembersFor] = useState(null);
  const [deleteFor, setDeleteFor] = useState(null);
  const [picked, setPicked] = useState(new Set());
  const [head, setHead] = useState("");

  const { data: tree, isLoading } = useQuery({ queryKey: ["esinif", "department-tree"], queryFn: schoolApi.departmentTree });
  const schoolWide = tree?.schoolWide ?? [];
  const branches = tree?.branches ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ["esinif", "department-tree"] });

  const createDept = useMutation({
    mutationFn: (body) => schoolApi.createDepartment(body),
    onSuccess: () => { toast.success("Zümre oluşturuldu"); invalidate(); setCreateFor(null); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const assignMembers = useMutation({
    mutationFn: ({ id, body }) => schoolApi.assignMembers(id, body),
    onSuccess: (res) => { toast.success(`${res?.assigned ?? 0} öğretmen atandı`); invalidate(); setMembersFor(null); setPicked(new Set()); setHead(""); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const removeDept = useMutation({
    mutationFn: (id) => schoolApi.deleteDepartment(id),
    onSuccess: () => { toast.success("Zümre silindi"); invalidate(); setDeleteFor(null); },
    onError: (e) => toast.error(errMsg(e)),
  });

  if (!role) {
    return <div className="max-w-lg mx-auto text-center py-20"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" /><h2 className="text-xl font-semibold text-slate-900">Erişim yok</h2></div>;
  }

  const togglePick = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const openMembers = (d) => { setMembersFor(d); setPicked(new Set()); setHead(""); };
  const empty = !isLoading && schoolWide.length === 0 && branches.length === 0;

  const submitCreate = (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = { name: f.get("name"), subject: f.get("subject") };
    if (createFor.scope === "level") body.levelId = createFor.levelId;
    else if (createFor.scope === "branch") body.branchId = createFor.branchId;
    createDept.mutate(body);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center"><BookOpen className="w-5 h-5 text-indigo-600" /></div>
        <div><h1 className="text-2xl font-bold text-slate-900">Zümreler</h1><p className="text-sm text-slate-500">Tüm Okul, Şube geneli veya Seviyeye özel zümreler — öğretmen ve başkan atama</p></div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}</div>
      ) : empty ? (
        <div className="text-center py-16 text-slate-500"><BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>Henüz şube/seviye yok. Önce Şubeler &amp; Sınıflar sayfasından yapı oluşturun.</p></div>
      ) : (
        <div className="space-y-4">
          {/* Tüm Okul (genel) */}
          <div className="rounded-xl border border-slate-200 bg-white p-2">
            <div className="flex items-center gap-2 py-2.5 px-3 group">
              <SchoolIcon className="w-4 h-4 text-violet-600 shrink-0" />
              <span className="font-semibold text-slate-800 flex-1">Tüm Okul (genel)</span>
              <Badge className="bg-slate-100 text-slate-500">{schoolWide.length} zümre</Badge>
              {isSchoolAdmin && <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-slate-500 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity" title="Genel Zümre Ekle" onClick={() => setCreateFor({ scope: "school", title: "Tüm Okul" })}><Plus className="w-3.5 h-3.5" /></Button>}
            </div>
            {schoolWide.length > 0 && (
              <div className="ml-6 border-l-2 border-slate-100 pl-2">
                {schoolWide.map((d) => <DeptRow key={d.id} dept={d} canManage={canManage} onMembers={openMembers} onDelete={setDeleteFor} />)}
              </div>
            )}
          </div>

          {/* Şube → Seviye ağacı */}
          {branches.map((b) => (
            <div key={b.id} className="rounded-xl border border-slate-200 bg-white p-2">
              <BranchDeptNode
                branch={b} canManage={canManage}
                onAddBranch={() => setCreateFor({ scope: "branch", branchId: b.id, title: `${b.name} (şube geneli)` })}
                onAddLevel={(lv) => setCreateFor({ scope: "level", levelId: lv.id, title: `${b.name} / ${lv.gradeLevel}. Seviye` })}
                onMembers={openMembers} onDelete={setDeleteFor}
              />
            </div>
          ))}
        </div>
      )}

      {/* Zümre ekle */}
      <Dialog open={!!createFor} onOpenChange={(o) => !o && setCreateFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Yeni Zümre — {createFor?.title}</DialogTitle></DialogHeader>
          <form onSubmit={submitCreate} className="space-y-3">
            <div><Label htmlFor="d-name">Zümre adı</Label><Input id="d-name" name="name" required maxLength={80} placeholder="Matematik Zümresi" /></div>
            <div><Label htmlFor="d-subject">Ders</Label><Input id="d-subject" name="subject" required maxLength={60} placeholder="Matematik" /></div>
            <DialogFooter className="gap-2"><Button type="button" variant="outline" onClick={() => setCreateFor(null)}>İptal</Button><Button type="submit" disabled={createDept.isPending} className="bg-indigo-600 hover:bg-indigo-700">Oluştur</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Öğretmen/başkan ata */}
      <MembersDialog
        dept={membersFor} picked={picked} head={head} togglePick={togglePick} setHead={setHead}
        onClose={() => { setMembersFor(null); setPicked(new Set()); setHead(""); }}
        onSubmit={() => assignMembers.mutate({ id: membersFor.id, body: { schoolUserIds: [...picked], headSchoolUserId: head || undefined } })}
        pending={assignMembers.isPending}
      />

      {/* Silme onayı */}
      <AlertDialog open={!!deleteFor} onOpenChange={(o) => !o && setDeleteFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Zümreyi sil</AlertDialogTitle>
            <AlertDialogDescription><strong>{deleteFor?.name}</strong> silinecek. Zümrede öğretmen varsa silinemez. Bu işlem geri alınamaz.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={() => removeDept.mutate(deleteFor.id)}>Sil</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Şube düğümü (zümre ağacı) ─────────────────────────────────────────────────
function BranchDeptNode({ branch, canManage, onAddBranch, onAddLevel, onMembers, onDelete }) {
  const [open, setOpen] = useState(true);
  const total = branch.departments.length + branch.levels.reduce((n, l) => n + l.departments.length, 0);
  return (
    <div>
      <div className="flex items-center gap-2 py-2.5 px-3 rounded-lg hover:bg-slate-50 group">
        <button type="button" className="w-5 h-5 flex items-center justify-center text-slate-400 shrink-0" onClick={() => setOpen((v) => !v)} aria-label={open ? "Daralt" : "Genişlet"}>
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <Building2 className="w-4 h-4 text-indigo-600 shrink-0" />
        <span className="font-semibold text-slate-800 flex-1">{branch.name}</span>
        <Badge className="bg-slate-100 text-slate-500">{total} zümre</Badge>
        {canManage && <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-slate-500 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity" title="Şube Geneli Zümre Ekle" onClick={onAddBranch}><Plus className="w-3.5 h-3.5" /></Button>}
      </div>
      {open && (
        <div className="ml-6 border-l-2 border-slate-100 pl-2 mt-0.5">
          {/* Şube geneli zümreler */}
          {branch.departments.map((d) => <DeptRow key={d.id} dept={d} canManage={canManage} onMembers={onMembers} onDelete={onDelete} scopeTag="şube geneli" />)}
          {/* Seviyeler */}
          {branch.levels.map((lv) => <LevelDeptNode key={lv.id} level={lv} canManage={canManage} onAddLevel={() => onAddLevel(lv)} onMembers={onMembers} onDelete={onDelete} />)}
          {branch.departments.length === 0 && branch.levels.length === 0 && <p className="text-xs text-slate-400 px-3 py-2">Bu şubede henüz seviye yok.</p>}
        </div>
      )}
    </div>
  );
}

// ── Seviye düğümü ─────────────────────────────────────────────────────────────
function LevelDeptNode({ level, canManage, onAddLevel, onMembers, onDelete }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <div className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-slate-50 group">
        <button type="button" className="w-5 h-5 flex items-center justify-center text-slate-400 shrink-0" onClick={() => setOpen((v) => !v)} aria-label={open ? "Daralt" : "Genişlet"}>
          {level.departments.length ? (open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />) : <span className="w-4" />}
        </button>
        <Layers className="w-4 h-4 text-amber-500 shrink-0" />
        <span className="font-medium text-slate-700 flex-1">{level.gradeLevel}. Seviye</span>
        <Badge className="bg-slate-100 text-slate-500">{level.departments.length} zümre</Badge>
        {canManage && <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-slate-500 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity" title="Seviye Zümresi Ekle" onClick={onAddLevel}><Plus className="w-3.5 h-3.5" /></Button>}
      </div>
      {open && level.departments.length > 0 && (
        <div className="ml-6 border-l-2 border-slate-100 pl-2 mt-0.5">
          {level.departments.map((d) => <DeptRow key={d.id} dept={d} canManage={canManage} onMembers={onMembers} onDelete={onDelete} />)}
        </div>
      )}
    </div>
  );
}

// ── Zümre satırı (yaprak) ─────────────────────────────────────────────────────
function DeptRow({ dept, canManage, onMembers, onDelete, scopeTag }) {
  return (
    <div className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-slate-50 group">
      <span className="w-5 shrink-0" />
      <BookOpen className="w-4 h-4 text-emerald-500 shrink-0" />
      <span className="font-medium text-slate-700">{dept.name}</span>
      <span className="text-xs text-slate-400">· {dept.subject}</span>
      {scopeTag && <Badge className="bg-violet-50 text-violet-600 text-[10px] border border-violet-100">{scopeTag}</Badge>}
      <span className="flex-1" />
      <Badge className="bg-slate-100 text-slate-500 gap-1"><Users className="w-3 h-3" /> {dept.memberCount}</Badge>
      <HeadBadge label={dept.headLabel} />
      {canManage && (
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-slate-500 hover:text-indigo-600" title="Öğretmen / Başkan Ata" onClick={() => onMembers(dept)}><Users className="w-3.5 h-3.5" /></Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-slate-500 hover:text-rose-600" title="Zümreyi Sil" onClick={() => onDelete(dept)}><Trash2 className="w-3.5 h-3.5" /></Button>
        </div>
      )}
    </div>
  );
}

// ── Öğretmen/başkan atama diyaloğu ────────────────────────────────────────────
function MembersDialog({ dept, picked, head, togglePick, setHead, onClose, onSubmit, pending }) {
  const { data: teachers } = useQuery({
    queryKey: ["esinif", "users", "teacher-pick"],
    queryFn: () => schoolApi.listUsers({ limit: 100 }),
    enabled: !!dept,
  });
  const candidates = (teachers?.items ?? []).filter((u) => u.schoolRole === "TEACHER" || u.schoolRole === "DEPT_HEAD");
  return (
    <Dialog open={!!dept} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Öğretmen Ata — {dept?.name}</DialogTitle></DialogHeader>
        <div className="max-h-72 overflow-y-auto space-y-1">
          {candidates.length === 0 ? <p className="text-sm text-slate-400 py-6 text-center">Öğretmen yok. Önce öğretmen ekleyin.</p> : candidates.map((u) => (
            <div key={u.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
              <input type="checkbox" checked={picked.has(u.id)} onChange={() => togglePick(u.id)} className="rounded" />
              <span className="font-mono text-sm">{u.username}</span>
              <span className="text-xs text-slate-500">{u.fullName || ""}</span>
              <label className="ml-auto flex items-center gap-1 text-xs text-slate-500">
                <input type="radio" name="head" checked={head === u.id} onChange={() => { setHead(u.id); if (!picked.has(u.id)) togglePick(u.id); }} /> Başkan
              </label>
            </div>
          ))}
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose}>İptal</Button>
          <Button onClick={onSubmit} disabled={picked.size === 0 || pending} className="bg-indigo-600 hover:bg-indigo-700">Ata</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
