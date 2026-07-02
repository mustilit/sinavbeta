import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { school as schoolApi } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BookMarked, Plus, Trash2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const errMsg = (e) => e?.response?.data?.error?.message ?? e?.response?.data?.message ?? "İşlem başarısız";

/** Okul Yöneticisi — Ders havuzu. Zümre oluştururken bu listeden seçilir. */
export default function SchoolSubjects() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isSchoolAdmin = user?.school?.schoolRole === "SCHOOL_ADMIN";
  const [name, setName] = useState("");
  const [deleteFor, setDeleteFor] = useState(null);

  const { data: subjects = [], isLoading } = useQuery({ queryKey: ["esinif", "subjects"], queryFn: schoolApi.listSubjects, enabled: isSchoolAdmin });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["esinif", "subjects"] });

  const createSubject = useMutation({
    mutationFn: (/** @type {any} */ n) => schoolApi.createSubject({ name: n }),
    onSuccess: () => { toast.success("Ders eklendi"); invalidate(); setName(""); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const removeSubject = useMutation({
    mutationFn: (/** @type {any} */ id) => schoolApi.deleteSubject(id),
    onSuccess: () => { toast.success("Ders silindi"); invalidate(); setDeleteFor(null); },
    onError: (e) => toast.error(errMsg(e)),
  });

  if (!isSchoolAdmin) {
    return <div className="max-w-lg mx-auto text-center py-20"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" /><h2 className="text-xl font-semibold text-slate-900">Erişim yok</h2></div>;
  }

  const submit = (e) => { e.preventDefault(); const n = name.trim(); if (!n) return; createSubject.mutate(n); };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center"><BookMarked className="w-5 h-5 text-indigo-600" /></div>
        <div><h1 className="text-2xl font-bold text-slate-900">Dersler</h1><p className="text-sm text-slate-500">Zümre oluştururken seçilecek ders havuzu</p></div>
      </div>

      <form onSubmit={submit} className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ders adı (örn. Matematik)" maxLength={60} className="flex-1" />
        <Button type="submit" disabled={createSubject.isPending || !name.trim()} className="bg-indigo-600 hover:bg-indigo-700 gap-2"><Plus className="w-4 h-4" /> Ekle</Button>
      </form>

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />)}</div>
      ) : subjects.length === 0 ? (
        <div className="text-center py-16 text-slate-500"><BookMarked className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>Henüz ders yok. Yukarıdan ekleyin.</p></div>
      ) : (
        <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
          {subjects.map((s) => (
            <div key={s.id} className="flex items-center justify-between px-4 py-3 group">
              <span className="font-medium text-slate-800">{s.name}</span>
              <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-slate-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity" title="Sil" onClick={() => setDeleteFor(s)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-slate-400">Toplam {subjects.length} ders. <Badge className="bg-slate-100 text-slate-500">Zümrelerde kullanılır</Badge></p>

      <AlertDialog open={!!deleteFor} onOpenChange={(o) => !o && setDeleteFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dersi sil</AlertDialogTitle>
            <AlertDialogDescription><strong>{deleteFor?.name}</strong> ders havuzundan kaldırılacak. Mevcut zümreler etkilenmez (ders adı kayıtlı kalır). Bu işlem geri alınamaz.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={() => removeSubject.mutate(deleteFor.id)}>Sil</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
