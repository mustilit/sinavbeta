import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { school as schoolApi } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Building2, Plus, UserCog, GraduationCap, AlertCircle } from "lucide-react";
import { toast } from "sonner";

/** Okul Yöneticisi — şube + sınıf düzeni, sınıfa öğrenci atama. */
export default function SchoolBranches() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = user?.school?.schoolRole === "SCHOOL_ADMIN";
  const [branchOpen, setBranchOpen] = useState(false);
  const [classFor, setClassFor] = useState(null); // branch row
  const [studentsFor, setStudentsFor] = useState(null); // classroom row
  const [adminFor, setAdminFor] = useState(null); // branch row
  const [picked, setPicked] = useState(new Set());

  const { data: branches = [], isLoading } = useQuery({ queryKey: ["esinif", "branches"], queryFn: schoolApi.listBranches });
  const { data: classrooms = [] } = useQuery({ queryKey: ["esinif", "classrooms", "all"], queryFn: () => schoolApi.listClassrooms() });
  const { data: freeStudents } = useQuery({
    queryKey: ["esinif", "users", "STUDENT-pick"],
    queryFn: () => schoolApi.listUsers({ role: "STUDENT", limit: 100 }),
    enabled: !!studentsFor,
  });
  const { data: managers } = useQuery({
    queryKey: ["esinif", "users", "branchadmin-pick"],
    queryFn: () => schoolApi.listUsers({ limit: 100 }),
    enabled: !!adminFor,
  });

  const createBranch = useMutation({
    mutationFn: schoolApi.createBranch,
    onSuccess: () => { toast.success("Şube oluşturuldu"); qc.invalidateQueries({ queryKey: ["esinif", "branches"] }); setBranchOpen(false); },
    onError: (e) => toast.error(e?.response?.data?.message ?? "Şube oluşturulamadı"),
  });
  const createClassroom = useMutation({
    mutationFn: schoolApi.createClassroom,
    onSuccess: () => { toast.success("Sınıf oluşturuldu"); qc.invalidateQueries({ queryKey: ["esinif", "classrooms"] }); setClassFor(null); },
    onError: (e) => toast.error(e?.response?.data?.message ?? "Sınıf oluşturulamadı"),
  });
  const assignStudents = useMutation({
    mutationFn: ({ id, ids }) => schoolApi.assignStudents(id, ids),
    onSuccess: (res) => { toast.success(`${res.assigned} öğrenci atandı`); qc.invalidateQueries({ queryKey: ["esinif", "classrooms"] }); setStudentsFor(null); setPicked(new Set()); },
    onError: (e) => toast.error(e?.response?.data?.message ?? "Atanamadı"),
  });
  const assignBranchAdmin = useMutation({
    mutationFn: ({ id, schoolUserId }) => schoolApi.assignBranchAdmin(id, { schoolUserId }),
    onSuccess: () => { toast.success("Şube yöneticisi atandı"); qc.invalidateQueries({ queryKey: ["esinif", "branches"] }); setAdminFor(null); },
    onError: (e) => toast.error(e?.response?.data?.message ?? "Atanamadı"),
  });

  if (!user?.school?.schoolRole) {
    return <div className="max-w-lg mx-auto text-center py-20"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" /><h2 className="text-xl font-semibold text-slate-900">Erişim yok</h2></div>;
  }

  const togglePick = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const classroomsOf = (branchId) => classrooms.filter((c) => c.branchId === branchId);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center"><Building2 className="w-5 h-5 text-indigo-600" /></div>
          <div><h1 className="text-2xl font-bold text-slate-900">Şubeler & Sınıflar</h1><p className="text-sm text-slate-500">Şube ve sınıf düzeni, öğrenci atama</p></div>
        </div>
        {isAdmin && <Button onClick={() => setBranchOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 gap-2"><Plus className="w-4 h-4" /> Şube Ekle</Button>}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />)}</div>
      ) : branches.length === 0 ? (
        <div className="text-center py-16 text-slate-500"><Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>Henüz şube yok.</p></div>
      ) : (
        <div className="space-y-4">
          {branches.map((b) => (
            <Card key={b.id}>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-900">{b.name}</p>
                    <Badge className="bg-slate-100 text-slate-600">{b.classroomCount} sınıf</Badge>
                    {b.adminUsername && <Badge className="bg-blue-100 text-blue-700 font-mono">{b.adminUsername}</Badge>}
                  </div>
                  {isAdmin && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setAdminFor(b)}><UserCog className="w-3.5 h-3.5" /> Yönetici</Button>
                      <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setClassFor(b)}><Plus className="w-3.5 h-3.5" /> Sınıf</Button>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {classroomsOf(b.id).length === 0 ? <span className="text-xs text-slate-400">Sınıf yok</span> : classroomsOf(b.id).map((c) => (
                    <button key={c.id} type="button" onClick={() => isAdmin && setStudentsFor(c)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs hover:bg-slate-50">
                      <GraduationCap className="w-3.5 h-3.5 text-indigo-500" /> <span className="font-medium">{c.name}</span>
                      <span className="text-slate-400">· {c.studentCount} öğr.</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
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

      {/* Sınıf ekle */}
      <Dialog open={!!classFor} onOpenChange={(o) => !o && setClassFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Yeni Sınıf — {classFor?.name}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); createClassroom.mutate({ branchId: classFor.id, name: f.get("name"), gradeLevel: Number(f.get("gradeLevel")) }); }} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="c-name">Sınıf adı</Label><Input id="c-name" name="name" required maxLength={40} placeholder="5-A" /></div>
              <div><Label htmlFor="c-grade">Seviye</Label><Input id="c-grade" name="gradeLevel" type="number" min={1} max={12} required defaultValue={5} /></div>
            </div>
            <DialogFooter className="gap-2"><Button type="button" variant="outline" onClick={() => setClassFor(null)}>İptal</Button><Button type="submit" disabled={createClassroom.isPending} className="bg-indigo-600 hover:bg-indigo-700">Oluştur</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Öğrenci ata */}
      <Dialog open={!!studentsFor} onOpenChange={(o) => !o && (setStudentsFor(null), setPicked(new Set()))}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Öğrenci Ata — {studentsFor?.name}</DialogTitle></DialogHeader>
          <div className="max-h-80 overflow-y-auto space-y-1">
            {(freeStudents?.items ?? []).length === 0 ? <p className="text-sm text-slate-400 py-6 text-center">Öğrenci yok.</p> : (freeStudents?.items ?? []).map((s) => (
              <label key={s.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 cursor-pointer hover:bg-slate-50">
                <input type="checkbox" checked={picked.has(s.id)} onChange={() => togglePick(s.id)} className="rounded" />
                <span className="font-mono text-sm">{s.username}</span>
                <span className="text-xs text-slate-500">{s.fullName || ""}</span>
                {s.classroomName && <Badge className="ml-auto bg-slate-100 text-slate-500 text-[10px]">{s.classroomName}</Badge>}
              </label>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => { setStudentsFor(null); setPicked(new Set()); }}>İptal</Button>
            <Button onClick={() => assignStudents.mutate({ id: studentsFor.id, ids: [...picked] })} disabled={picked.size === 0 || assignStudents.isPending} className="bg-indigo-600 hover:bg-indigo-700">{picked.size} öğrenci ata</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Şube yöneticisi ata */}
      <Dialog open={!!adminFor} onOpenChange={(o) => !o && setAdminFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Şube Yöneticisi Ata — {adminFor?.name}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); const id = new FormData(e.currentTarget).get("schoolUserId"); if (!id) return toast.error("Kullanıcı seçin"); assignBranchAdmin.mutate({ id: adminFor.id, schoolUserId: id }); }} className="space-y-3">
            <div>
              <Label>Kullanıcı</Label>
              <Select name="schoolUserId"><SelectTrigger><SelectValue placeholder="Kullanıcı seç" /></SelectTrigger><SelectContent>{(managers?.items ?? []).map((m) => <SelectItem key={m.id} value={m.id}>{m.username} {m.fullName ? `· ${m.fullName}` : ""}</SelectItem>)}</SelectContent></Select>
              <p className="text-xs text-slate-400 mt-1">Seçilen kullanıcı şube yöneticisi rolüne yükseltilir.</p>
            </div>
            <DialogFooter className="gap-2"><Button type="button" variant="outline" onClick={() => setAdminFor(null)}>İptal</Button><Button type="submit" disabled={assignBranchAdmin.isPending} className="bg-indigo-600 hover:bg-indigo-700">Ata</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
