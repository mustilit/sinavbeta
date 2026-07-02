import { useState } from "react";
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { school as schoolApi } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import CredentialsDialog from "@/components/school/CredentialsDialog";
import { StudentImportDialog, BulkCredentialsDialog } from "@/components/school/studentImport";
import { PeriodSelect } from "@/components/school/PeriodSelect";
import { Users, Plus, Power, KeyRound, Search, AlertCircle, GraduationCap, Upload } from "lucide-react";
import { toast } from "sonner";

const ROLE_LABEL = { SCHOOL_ADMIN: "Okul Yön.", BRANCH_ADMIN: "Şube Yön.", DEPT_HEAD: "Zümre Bşk.", TEACHER: "Öğretmen", STUDENT: "Öğrenci" };
const ROLE_COLOR = { SCHOOL_ADMIN: "bg-violet-100 text-violet-700", BRANCH_ADMIN: "bg-blue-100 text-blue-700", DEPT_HEAD: "bg-amber-100 text-amber-700", TEACHER: "bg-emerald-100 text-emerald-700", STUDENT: "bg-slate-100 text-slate-600" };
// Öğrenciler buradan değil, sınıf sayfasından Excel ile eklenir — yalnız öğretmen ve üstü.
const CREATE_ROLES = [
  { value: "TEACHER", label: "Öğretmen" },
  { value: "DEPT_HEAD", label: "Zümre Başkanı" },
  { value: "BRANCH_ADMIN", label: "Şube Yöneticisi" },
];

/** Okul Yöneticisi — kullanıcı yönetimi (ekle/listele/pasifleştir/şifre sıfırla). */
export default function SchoolUsers() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = user?.school?.schoolRole === "SCHOOL_ADMIN";
  const [tab, setTab] = useState("staff"); // "staff" (Eğitimciler) | "students" (Öğrenciler)
  const [roleFilter, setRoleFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [periodId, setPeriodId] = useState(""); // yalnız Öğrenciler sekmesi (dönemsel arşiv)
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addRole, setAddRole] = useState("TEACHER");
  const [creds, setCreds] = useState(null);
  const [studentImportOpen, setStudentImportOpen] = useState(false);
  const [bulkCreds, setBulkCreds] = useState(null);

  const { data: branches = [] } = useQuery({ queryKey: ["esinif", "branches"], queryFn: schoolApi.listBranches, enabled: isAdmin });
  const { data: departments = [] } = useQuery({ queryKey: ["esinif", "departments"], queryFn: schoolApi.listDepartments, enabled: isAdmin });

  // Eğitimciler sekmesi: rol verilmezse backend öğrenci HARİÇ döner; Öğrenciler sekmesi: role=STUDENT
  const effectiveRole = tab === "students" ? "STUDENT" : (roleFilter === "all" ? undefined : roleFilter);
  const studentPeriod = tab === "students" ? (periodId || undefined) : undefined;
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ["esinif", "users", tab, roleFilter, branchFilter, q, studentPeriod],
    queryFn: ({ pageParam }) => schoolApi.listUsers({ role: effectiveRole, branchId: branchFilter === "all" ? undefined : branchFilter, q: q || undefined, periodId: studentPeriod, cursor: pageParam, limit: 30 }),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const users = (data?.pages ?? []).flatMap((p) => p.items);

  const createUser = useMutation({
    mutationFn: schoolApi.createUser,
    onSuccess: (res) => { setCreds({ username: res.username, tempPassword: res.tempPassword }); setAddOpen(false); qc.invalidateQueries({ queryKey: ["esinif", "users"] }); qc.invalidateQueries({ queryKey: ["esinif", "quota"] }); },
    onError: (e) => toast.error(e?.response?.data?.message ?? "Kullanıcı eklenemedi"),
  });
  const setActive = useMutation({
    mutationFn: (/** @type {any} */ { id, isActive }) => schoolApi.setUserActive(id, isActive),
    onSuccess: () => { toast.success("Güncellendi"); qc.invalidateQueries({ queryKey: ["esinif", "users"] }); },
    onError: (e) => toast.error(e?.response?.data?.message ?? "Güncellenemedi"),
  });
  const resetPw = useMutation({
    mutationFn: (/** @type {any} */ id) => schoolApi.resetPassword(id),
    onSuccess: (res) => setCreds(res),
    onError: (e) => toast.error(e?.response?.data?.message ?? "Şifre sıfırlanamadı"),
  });

  if (!user?.school?.schoolRole) {
    return <div className="max-w-lg mx-auto text-center py-20"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" /><h2 className="text-xl font-semibold text-slate-900">Erişim yok</h2></div>;
  }

  const submitAdd = (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = { schoolRole: addRole, firstName: f.get("firstName") || undefined, lastName: f.get("lastName") || undefined };
    if (addRole === "BRANCH_ADMIN") body.branchId = f.get("branchId") || undefined;
    if (addRole === "TEACHER" || addRole === "DEPT_HEAD") body.departmentId = f.get("departmentId") || undefined;
    createUser.mutate(body);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center"><Users className="w-5 h-5 text-indigo-600" /></div>
          <div><h1 className="text-2xl font-bold text-slate-900">Kullanıcılar</h1><p className="text-sm text-slate-500">Eğitimci ve öğrenci hesapları</p></div>
        </div>
        {isAdmin && (tab === "staff"
          ? <Button onClick={() => { setAddRole("TEACHER"); setAddOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700 gap-2"><Plus className="w-4 h-4" /> Kullanıcı Ekle</Button>
          : <Button onClick={() => setStudentImportOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 gap-2"><Upload className="w-4 h-4" /> Öğrenci Ekle</Button>)}
      </div>

      {/* Sekmeler: Eğitimciler / Öğrenciler */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        {/** @type {[string, string, any][]} */ ([["staff", "Eğitimciler", Users], ["students", "Öğrenciler", GraduationCap]]).map(([key, label, Icon]) => (
          <button key={key} type="button" onClick={() => { setTab(key); setRoleFilter("all"); }}
            className={"inline-flex items-center gap-2 border-b-2 -mb-px px-4 py-2.5 min-h-10 text-sm font-medium transition-colors " + (tab === key ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-600 hover:text-slate-900")}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kullanıcı adı ara…" className="pl-10" />
        </div>
        {tab === "staff" && (
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm eğitimciler</SelectItem>
              {CREATE_ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {tab === "students" && <PeriodSelect value={periodId} onChange={setPeriodId} className="w-44" />}
        {isAdmin && (
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="w-44" aria-label="Şube filtresi"><SelectValue placeholder="Şube" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm şubeler</SelectItem>
              {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-14 bg-slate-100 rounded-lg animate-pulse" />)}</div>
      ) : users.length === 0 ? (
        <div className="text-center py-16 text-slate-500"><Users className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>Kullanıcı bulunamadı.</p></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs">
              <tr><th className="px-3 py-2 text-left">Kullanıcı Adı</th><th className="px-3 py-2 text-left">Ad Soyad</th><th className="px-3 py-2 text-left">Rol</th><th className="px-3 py-2 text-left">Sınıf/Zümre</th><th className="px-3 py-2 text-left">Durum</th>{isAdmin && <th className="px-3 py-2 text-right">İşlem</th>}</tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-slate-800">{u.username}</td>
                  <td className="px-3 py-2 text-slate-700">{u.fullName || "—"}</td>
                  <td className="px-3 py-2"><Badge className={ROLE_COLOR[u.schoolRole] ?? "bg-slate-100"}>{ROLE_LABEL[u.schoolRole] ?? u.schoolRole}</Badge></td>
                  <td className="px-3 py-2 text-slate-500 text-xs">{u.classroomName || u.departmentName || u.branchName || "—"}</td>
                  <td className="px-3 py-2">{u.isActive ? <span className="text-emerald-600 text-xs font-medium">Aktif</span> : <span className="text-slate-400 text-xs">Pasif</span>}</td>
                  {isAdmin && (
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => resetPw.mutate(u.id)} disabled={resetPw.isPending}><KeyRound className="w-3.5 h-3.5" /> Şifre</Button>
                        <Button size="sm" variant="outline" className={`h-8 gap-1 text-xs ${u.isActive ? "text-rose-600 border-rose-200 hover:bg-rose-50" : "text-emerald-600 border-emerald-200 hover:bg-emerald-50"}`} onClick={() => setActive.mutate({ id: u.id, isActive: !u.isActive })}><Power className="w-3.5 h-3.5" /> {u.isActive ? "Pasif" : "Aktif"}</Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {hasNextPage && <div className="text-center mt-4"><Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>{isFetchingNextPage ? "Yükleniyor…" : "Daha fazla"}</Button></div>}
        </div>
      )}

      {/* Kullanıcı ekle */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Kullanıcı Ekle</DialogTitle></DialogHeader>
          <form onSubmit={submitAdd} className="space-y-3">
            <div>
              <Label>Rol</Label>
              <Select value={addRole} onValueChange={setAddRole}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CREATE_ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="u-fn">Ad</Label><Input id="u-fn" name="firstName" maxLength={60} /></div>
              <div><Label htmlFor="u-ln">Soyad</Label><Input id="u-ln" name="lastName" maxLength={60} /></div>
            </div>
            {addRole === "BRANCH_ADMIN" && (
              <div>
                <Label>Şube</Label>
                <Select name="branchId"><SelectTrigger><SelectValue placeholder="Şube seç (opsiyonel)" /></SelectTrigger><SelectContent>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent></Select>
              </div>
            )}
            {(addRole === "TEACHER" || addRole === "DEPT_HEAD") && (
              <div>
                <Label>Zümre</Label>
                <Select name="departmentId"><SelectTrigger><SelectValue placeholder="Zümre seç (opsiyonel)" /></SelectTrigger><SelectContent>{departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select>
              </div>
            )}
            <p className="text-xs text-slate-400">Kullanıcı adı ve geçici şifre otomatik üretilecek.</p>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>İptal</Button>
              <Button type="submit" disabled={createUser.isPending} className="bg-indigo-600 hover:bg-indigo-700">{createUser.isPending ? "Ekleniyor…" : "Ekle"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <CredentialsDialog open={!!creds} onClose={() => setCreds(null)} creds={creds} />

      {/* Öğrenci ekle (Excel ile toplu) — Öğrenciler sekmesi */}
      <StudentImportDialog
        open={studentImportOpen}
        onClose={() => setStudentImportOpen(false)}
        onCreated={(created) => { setBulkCreds(created); qc.invalidateQueries({ queryKey: ["esinif", "users"] }); qc.invalidateQueries({ queryKey: ["esinif", "quota"] }); }}
      />
      <BulkCredentialsDialog creds={bulkCreds} onClose={() => setBulkCreds(null)} />
    </div>
  );
}
