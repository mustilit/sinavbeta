import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { school as schoolApi } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { BookOpen, Plus, Users, AlertCircle } from "lucide-react";
import { toast } from "sonner";

/** Okul Yöneticisi — zümre yönetimi + öğretmen/başkan atama. */
export default function SchoolDepartments() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = user?.school?.schoolRole === "SCHOOL_ADMIN";
  const [createOpen, setCreateOpen] = useState(false);
  const [membersFor, setMembersFor] = useState(null);
  const [picked, setPicked] = useState(new Set());
  const [head, setHead] = useState("");

  const { data: departments = [], isLoading } = useQuery({ queryKey: ["esinif", "departments"], queryFn: schoolApi.listDepartments });
  const { data: teachers } = useQuery({
    queryKey: ["esinif", "users", "teacher-pick"],
    queryFn: () => schoolApi.listUsers({ limit: 100 }),
    enabled: !!membersFor,
  });

  const createDept = useMutation({
    mutationFn: schoolApi.createDepartment,
    onSuccess: () => { toast.success("Zümre oluşturuldu"); qc.invalidateQueries({ queryKey: ["esinif", "departments"] }); setCreateOpen(false); },
    onError: (e) => toast.error(e?.response?.data?.message ?? "Zümre oluşturulamadı"),
  });
  const assignMembers = useMutation({
    mutationFn: ({ id, body }) => schoolApi.assignMembers(id, body),
    onSuccess: (res) => { toast.success(`${res.assigned} öğretmen atandı`); qc.invalidateQueries({ queryKey: ["esinif", "departments"] }); setMembersFor(null); setPicked(new Set()); setHead(""); },
    onError: (e) => toast.error(e?.response?.data?.message ?? "Atanamadı"),
  });

  if (!user?.school?.schoolRole) {
    return <div className="max-w-lg mx-auto text-center py-20"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" /><h2 className="text-xl font-semibold text-slate-900">Erişim yok</h2></div>;
  }

  // Öğretmen/zümre başkanı adayları
  const candidates = (teachers?.items ?? []).filter((u) => u.schoolRole === "TEACHER" || u.schoolRole === "DEPT_HEAD");
  const togglePick = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center"><BookOpen className="w-5 h-5 text-indigo-600" /></div>
          <div><h1 className="text-2xl font-bold text-slate-900">Zümreler</h1><p className="text-sm text-slate-500">Zümre düzeni + öğretmen ve başkan atama</p></div>
        </div>
        {isAdmin && <Button onClick={() => setCreateOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 gap-2"><Plus className="w-4 h-4" /> Zümre Ekle</Button>}
      </div>

      {isLoading ? (
        <div className="grid sm:grid-cols-2 gap-4">{[0, 1].map((i) => <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />)}</div>
      ) : departments.length === 0 ? (
        <div className="text-center py-16 text-slate-500"><BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>Henüz zümre yok.</p></div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {departments.map((d) => (
            <Card key={d.id}>
              <CardContent className="p-5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{d.name}</p>
                    <p className="text-xs text-slate-500">{d.subject}</p>
                  </div>
                  <Badge className="bg-slate-100 text-slate-600 gap-1"><Users className="w-3 h-3" /> {d.memberCount}</Badge>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <span className="text-xs text-slate-500">Başkan: {d.headUsername ? <span className="font-mono text-slate-700">{d.headUsername}</span> : "atanmadı"}</span>
                  {isAdmin && <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => { setMembersFor(d); setHead(""); setPicked(new Set()); }}><Users className="w-3.5 h-3.5" /> Öğretmen Ata</Button>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Zümre ekle */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Yeni Zümre</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); createDept.mutate({ name: f.get("name"), subject: f.get("subject") }); }} className="space-y-3">
            <div><Label htmlFor="d-name">Zümre adı</Label><Input id="d-name" name="name" required maxLength={80} placeholder="Matematik Zümresi" /></div>
            <div><Label htmlFor="d-subject">Ders</Label><Input id="d-subject" name="subject" required maxLength={60} placeholder="Matematik" /></div>
            <DialogFooter className="gap-2"><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>İptal</Button><Button type="submit" disabled={createDept.isPending} className="bg-indigo-600 hover:bg-indigo-700">Oluştur</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Öğretmen/başkan ata */}
      <Dialog open={!!membersFor} onOpenChange={(o) => !o && (setMembersFor(null), setPicked(new Set()), setHead(""))}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Öğretmen Ata — {membersFor?.name}</DialogTitle></DialogHeader>
          <div className="max-h-72 overflow-y-auto space-y-1">
            {candidates.length === 0 ? <p className="text-sm text-slate-400 py-6 text-center">Öğretmen yok. Önce öğretmen ekleyin.</p> : candidates.map((u) => (
              <div key={u.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
                <input type="checkbox" checked={picked.has(u.id)} onChange={() => togglePick(u.id)} className="rounded" />
                <span className="font-mono text-sm">{u.username}</span>
                <span className="text-xs text-slate-500">{u.fullName || ""}</span>
                <label className="ml-auto flex items-center gap-1 text-xs text-slate-500">
                  <input type="radio" name="head" checked={head === u.id} onChange={() => { setHead(u.id); setPicked((s) => new Set(s).add(u.id)); }} /> Başkan
                </label>
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => { setMembersFor(null); setPicked(new Set()); setHead(""); }}>İptal</Button>
            <Button onClick={() => assignMembers.mutate({ id: membersFor.id, body: { schoolUserIds: [...picked], headSchoolUserId: head || undefined } })} disabled={picked.size === 0 || assignMembers.isPending} className="bg-indigo-600 hover:bg-indigo-700">Ata</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
