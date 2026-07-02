import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { school as schoolApi } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SubjectCombobox } from "@/components/ui/SubjectCombobox";
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
  const myId = user?.id; // zümre başkanı: dept.headUserId === myId

  const [createFor, setCreateFor] = useState(null); // { scope, branchId?, levelId?, title }
  const [membersFor, setMembersFor] = useState(null);
  const [deleteFor, setDeleteFor] = useState(null);

  const { data: tree, isLoading } = useQuery({ queryKey: ["esinif", "department-tree"], queryFn: schoolApi.departmentTree });
  const { data: subjects = [] } = useQuery({ queryKey: ["esinif", "subjects"], queryFn: schoolApi.listSubjects, enabled: canManage });
  const schoolWide = tree?.schoolWide ?? [];
  const branches = tree?.branches ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ["esinif", "department-tree"] });

  const createDept = useMutation({
    mutationFn: (/** @type {any} */ body) => schoolApi.createDepartment(body),
    onSuccess: () => { toast.success("Zümre oluşturuldu"); invalidate(); setCreateFor(null); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const assignMembers = useMutation({
    mutationFn: (/** @type {any} */ { id, body }) => schoolApi.assignMembers(id, body),
    onSuccess: (res) => { toast.success(`${res?.assigned ?? 0} öğretmen · ${res?.removed ?? 0} çıkarıldı`); invalidate(); setMembersFor(null); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const removeDept = useMutation({
    mutationFn: (/** @type {any} */ id) => schoolApi.deleteDepartment(id),
    onSuccess: () => { toast.success("Zümre silindi"); invalidate(); setDeleteFor(null); },
    onError: (e) => toast.error(errMsg(e)),
  });

  if (!role) {
    return <div className="max-w-lg mx-auto text-center py-20"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" /><h2 className="text-xl font-semibold text-slate-900">Erişim yok</h2></div>;
  }

  const empty = !isLoading && schoolWide.length === 0 && branches.length === 0;

  const submitCreate = ({ name, subject }) => {
    const body = { name, subject };
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
                {schoolWide.map((d) => <DeptRow key={d.id} dept={d} canManage={canManage} myId={myId} onMembers={setMembersFor} onDelete={setDeleteFor} />)}
              </div>
            )}
          </div>

          {/* Şube → Seviye ağacı */}
          {branches.map((b) => (
            <div key={b.id} className="rounded-xl border border-slate-200 bg-white p-2">
              <BranchDeptNode
                branch={b} canManage={canManage} myId={myId}
                onAddBranch={() => setCreateFor({ scope: "branch", branchId: b.id, title: `${b.name} (şube geneli)` })}
                onAddLevel={(lv) => setCreateFor({ scope: "level", levelId: lv.id, title: `${b.name} / ${lv.gradeLevel}. Seviye` })}
                onMembers={setMembersFor} onDelete={setDeleteFor}
              />
            </div>
          ))}
        </div>
      )}

      {/* Zümre ekle */}
      <CreateDeptDialog
        createFor={createFor} subjects={subjects}
        onClose={() => setCreateFor(null)}
        onSubmit={submitCreate} pending={createDept.isPending}
      />

      {/* Öğretmen/başkan ata (güncelle) */}
      <MembersDialog
        dept={membersFor}
        onClose={() => setMembersFor(null)}
        onSubmit={(body) => assignMembers.mutate({ id: membersFor.id, body })}
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
function BranchDeptNode({ branch, canManage, myId, onAddBranch, onAddLevel, onMembers, onDelete }) {
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
          {branch.departments.map((d) => <DeptRow key={d.id} dept={d} canManage={canManage} myId={myId} onMembers={onMembers} onDelete={onDelete} scopeTag="şube geneli" />)}
          {/* Seviyeler */}
          {branch.levels.map((lv) => <LevelDeptNode key={lv.id} level={lv} canManage={canManage} myId={myId} onAddLevel={() => onAddLevel(lv)} onMembers={onMembers} onDelete={onDelete} />)}
          {branch.departments.length === 0 && branch.levels.length === 0 && <p className="text-xs text-slate-400 px-3 py-2">Bu şubede henüz seviye yok.</p>}
        </div>
      )}
    </div>
  );
}

// ── Seviye düğümü ─────────────────────────────────────────────────────────────
function LevelDeptNode({ level, canManage, myId, onAddLevel, onMembers, onDelete }) {
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
          {level.departments.map((d) => <DeptRow key={d.id} dept={d} canManage={canManage} myId={myId} onMembers={onMembers} onDelete={onDelete} />)}
        </div>
      )}
    </div>
  );
}

// ── Zümre satırı (yaprak) ─────────────────────────────────────────────────────
function DeptRow({ dept, canManage, myId, onMembers, onDelete, scopeTag = null }) {
  const isHead = !!myId && dept.headUserId === myId; // zümre başkanı
  const memberManage = canManage || isHead;
  const [open, setOpen] = useState(false);
  const members = dept.members ?? [];
  return (
    <div>
      <div className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-slate-50 group">
        <span className="w-5 shrink-0" />
        <BookOpen className="w-4 h-4 text-emerald-500 shrink-0" />
        <span className="font-medium text-slate-700">{dept.name}</span>
        <span className="text-xs text-slate-400">· {dept.subject}</span>
        {scopeTag && <Badge className="bg-violet-50 text-violet-600 text-[10px] border border-violet-100">{scopeTag}</Badge>}
        <span className="flex-1" />
        {/* Üye sayısı — herkes tıklayıp isimleri görebilir (salt-okuma) */}
        <button type="button" onClick={() => setOpen((v) => !v)} title="Üyeleri göster/gizle"
          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-200 focus-visible:ring-2 focus-visible:ring-indigo-300">
          <Users className="w-3 h-3" /> {dept.memberCount}
        </button>
        <HeadBadge label={dept.headLabel} />
        {memberManage && (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-slate-500 hover:text-indigo-600" title="Öğretmen / Başkan Ata" onClick={() => onMembers(dept)}><Users className="w-3.5 h-3.5" /></Button>
            {canManage && <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-slate-500 hover:text-rose-600" title="Zümreyi Sil" onClick={() => onDelete(dept)}><Trash2 className="w-3.5 h-3.5" /></Button>}
          </div>
        )}
      </div>
      {open && (
        <div className="ml-12 mb-2 flex flex-wrap gap-1.5">
          {members.length === 0
            ? <span className="text-xs text-slate-400">Üye yok.</span>
            : members.map((nm, i) => (
                <span key={i} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">{nm}</span>
              ))}
        </div>
      )}
    </div>
  );
}

// ── Zümre oluşturma diyaloğu (ders aramalı seçim) ─────────────────────────────
function CreateDeptDialog({ createFor, subjects, onClose, onSubmit, pending }) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");

  // Dialog her açıldığında alanları sıfırla
  useEffect(() => { if (createFor) { setName(""); setSubject(""); } }, [createFor]);

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Zümre adı zorunlu");
    if (!subject) return toast.error("Ders seçin");
    onSubmit({ name: name.trim(), subject });
  };

  return (
    <Dialog open={!!createFor} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Yeni Zümre — {createFor?.title}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div><Label htmlFor="d-name">Zümre adı</Label><Input id="d-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} placeholder="Matematik Zümresi" /></div>
          <div>
            <Label>Ders</Label>
            <SubjectCombobox value={subject} onChange={setSubject} subjects={subjects} />
            {subjects.length === 0 && <p className="text-xs text-amber-600 mt-1">Önce "Dersler" sayfasından ders ekleyin.</p>}
          </div>
          <DialogFooter className="gap-2"><Button type="button" variant="outline" onClick={onClose}>İptal</Button><Button type="submit" disabled={pending || subjects.length === 0} className="bg-indigo-600 hover:bg-indigo-700">Oluştur</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Öğretmen/başkan atama diyaloğu (GÜNCELLE: mevcutları göster, ekle/çıkar) ───
function MembersDialog({ dept, onClose, onSubmit, pending }) {
  const { data, isLoading } = useQuery({
    queryKey: ["esinif", "dept-members", dept?.id],
    queryFn: () => schoolApi.departmentMembers(dept.id),
    enabled: !!dept,
  });
  const candidates = data?.candidates ?? [];
  const [picked, setPicked] = useState(new Set());
  const [head, setHead] = useState("");

  // Sunucudan gelen mevcut durumu yükle: zümredekiler işaretli, başkan seçili
  useEffect(() => {
    if (data?.candidates) {
      setPicked(new Set(data.candidates.filter((c) => c.inDept).map((c) => c.id)));
      setHead(data.candidates.find((c) => c.isHead)?.id ?? "");
    }
  }, [data]);

  const togglePick = (id) => setPicked((s) => {
    const n = new Set(s);
    if (n.has(id)) { n.delete(id); }
    else n.add(id);
    return n;
  });

  const save = () => {
    // başkan, seçili kümede değilse başkanlığı düşür
    const headId = head && picked.has(head) ? head : undefined;
    onSubmit({ schoolUserIds: [...picked], headSchoolUserId: headId });
  };

  return (
    <Dialog open={!!dept} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Öğretmenler — {dept?.name}</DialogTitle></DialogHeader>
        <p className="text-xs text-slate-500 -mt-2">Zümredekiler işaretli gelir. İşareti kaldırırsan çıkarılır, ekleyebilirsin. Başkanı seç veya "Başkan yok" bırak.</p>
        <div className="max-h-72 overflow-y-auto space-y-1 mt-1">
          {isLoading ? (
            [0, 1, 2].map((i) => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)
          ) : candidates.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">Öğretmen yok. Önce öğretmen ekleyin.</p>
          ) : candidates.map((u) => {
            const checked = picked.has(u.id);
            return (
              <div key={u.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${checked ? "border-indigo-200 bg-indigo-50/40" : "border-slate-200"}`}>
                <input type="checkbox" checked={checked} onChange={() => togglePick(u.id)} className="rounded" />
                <span className="font-mono text-sm">{u.username}</span>
                <span className="text-xs text-slate-500 truncate">{u.fullName || ""}</span>
                {u.otherDept && !checked && <Badge className="bg-amber-50 text-amber-600 text-[10px] border border-amber-100">{u.otherDept}</Badge>}
                <label className={`ml-auto flex items-center gap-1 text-xs ${checked ? "text-slate-600" : "text-slate-300"}`}>
                  <input type="radio" name="head" disabled={!checked} checked={head === u.id} onChange={() => setHead(u.id)} /> Başkan
                </label>
              </div>
            );
          })}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" size="sm" className="text-slate-500" onClick={() => setHead("")}>Başkan yok</Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>İptal</Button>
            <Button onClick={save} disabled={pending || isLoading} className="bg-indigo-600 hover:bg-indigo-700">Kaydet</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
