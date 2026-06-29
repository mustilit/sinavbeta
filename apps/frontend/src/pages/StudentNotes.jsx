import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notes as notesApi } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StickyNote, Search, ChevronLeft, ChevronRight, Pencil, Trash2, AlertCircle, Check, X } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const PAGE_SIZE = 10;
const cleanExcerpt = (s) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, 120);

/** E-Sınıf — Öğrenci Notlarım: soru çözerken aldığı tüm notlar (arama + filtre + sayfalama). */
export default function StudentNotes() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isStudent = user?.school?.schoolRole === "STUDENT";

  const [q, setQ] = useState("");
  const [onlyGeneral, setOnlyGeneral] = useState(false);
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [deleteId, setDeleteId] = useState(null);

  const params = useMemo(() => ({
    page, pageSize: PAGE_SIZE,
    ...(q.trim() ? { q: q.trim() } : {}),
    ...(onlyGeneral ? { scope: "general" } : {}),
  }), [page, q, onlyGeneral]);

  const { data, isLoading } = useQuery({
    queryKey: ["esinif", "student-notes", params],
    queryFn: () => notesApi.list(params),
    enabled: isStudent,
  });

  useEffect(() => { setPage(1); }, [q, onlyGeneral]);

  const update = useMutation({
    mutationFn: ({ id, body }) => notesApi.update(id, body),
    onSuccess: () => { setEditingId(null); toast.success("Not güncellendi"); qc.invalidateQueries({ queryKey: ["esinif", "student-notes"] }); },
    onError: () => toast.error("Güncellenemedi"),
  });
  const remove = useMutation({
    mutationFn: (id) => notesApi.remove(id),
    onSuccess: () => { setDeleteId(null); toast.success("Not silindi"); qc.invalidateQueries({ queryKey: ["esinif", "student-notes"] }); },
    onError: () => toast.error("Silinemedi"),
  });

  if (!isStudent) return <div className="max-w-lg mx-auto text-center py-20"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" /><h2 className="text-xl font-semibold text-slate-900">Erişim yok</h2></div>;

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center"><StickyNote className="w-5 h-5 text-indigo-600" /></div>
        <div><h1 className="text-2xl font-bold text-slate-900">Notlarım</h1><p className="text-sm text-slate-500">Soru çözerken aldığın tüm notlar{total ? ` · ${total}` : ""}</p></div>
      </div>

      {/* Filtre satırı — metin + sadece genel */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Notlarda ara…" className="pl-9" aria-label="Notlarda ara" />
        </div>
        <Button type="button" variant={onlyGeneral ? "default" : "outline"} onClick={() => setOnlyGeneral((v) => !v)} className={onlyGeneral ? "bg-indigo-600 hover:bg-indigo-700" : ""}>
          Sadece genel notlar
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />)}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-slate-500"><StickyNote className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>{q.trim() || onlyGeneral ? "Filtreye uygun not yok." : "Henüz not almadın. Soru çözerken “+ Not” ile ekleyebilirsin."}</p></div>
      ) : (
        <>
          <ul className="space-y-3">
            {items.map((n) => (
              <li key={n.id}>
                <Card>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500">
                      {n.testTitle && <span className="font-medium text-indigo-700">{n.testTitle}</span>}
                      {n.questionOrder ? <span className="rounded-full bg-slate-100 px-2 py-0.5">Soru {n.questionOrder}</span> : <span className="rounded-full bg-slate-100 px-2 py-0.5">Genel</span>}
                      <span className="ml-auto">{format(new Date(n.createdAt), "dd.MM.yyyy HH:mm")}</span>
                    </div>
                    {n.questionExcerpt && <p className="text-xs text-slate-400 italic">“{cleanExcerpt(n.questionExcerpt)}”</p>}
                    {editingId === n.id ? (
                      <div className="space-y-2">
                        <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={3} maxLength={4000} />
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => setEditingId(null)}><X className="w-4 h-4 mr-1" /> Vazgeç</Button>
                          <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" disabled={!editText.trim() || update.isPending} onClick={() => update.mutate({ id: n.id, body: editText.trim() })}><Check className="w-4 h-4 mr-1" /> Kaydet</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2">
                        <p className="text-sm text-slate-800 whitespace-pre-wrap flex-1">{n.body}</p>
                        <div className="flex gap-1 shrink-0">
                          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Düzenle" onClick={() => { setEditingId(n.id); setEditText(n.body); }}><Pencil className="w-4 h-4" /></Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-500 hover:text-rose-700" aria-label="Sil" onClick={() => setDeleteId(n.id)}><Trash2 className="w-4 h-4" /></Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>

          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-3 pt-1">
              <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="w-4 h-4" /> Önceki</Button>
              <span className="text-sm text-slate-500">Sayfa {safePage} / {pageCount}</span>
              <Button variant="outline" size="sm" disabled={safePage >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>Sonraki <ChevronRight className="w-4 h-4" /></Button>
            </div>
          )}
        </>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Notu sil</AlertDialogTitle>
            <AlertDialogDescription>Bu not kalıcı olarak silinecek. Bu işlem geri alınamaz.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={() => remove.mutate(deleteId)}>Sil</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
