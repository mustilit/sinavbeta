import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { school as schoolApi } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { useAppNavigate, buildPageUrl } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Radio, Plus, Trash2, Play, Eye, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const STATUS = { DRAFT: { l: "Taslak", c: "bg-slate-100 text-slate-600" }, ACTIVE: { l: "Yayında", c: "bg-emerald-100 text-emerald-700" }, ENDED: { l: "Bitti", c: "bg-slate-200 text-slate-500" } };
const emptyQ = () => ({ content: "", options: [{ content: "", isCorrect: true }, { content: "", isCorrect: false }] });

/** E-Sınıf — Öğretmen canlı sınav: liste + oluştur. */
export default function SchoolLive() {
  const { user } = useAuth();
  const navigate = useAppNavigate();
  const qc = useQueryClient();
  const role = user?.school?.schoolRole;
  const canCreate = role === "TEACHER" || role === "DEPT_HEAD";
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState([emptyQ()]);

  const { data: sessions = [], isLoading } = useQuery({ queryKey: ["esinif", "live-list"], queryFn: schoolApi.live.list, enabled: !!role });
  const create = useMutation({
    mutationFn: () => schoolApi.live.create({ title, questions }),
    onSuccess: (res) => { toast.success("Oturum oluşturuldu"); qc.invalidateQueries({ queryKey: ["esinif", "live-list"] }); setOpen(false); navigate(buildPageUrl("SchoolLiveHost", { id: res.id })); },
    onError: (e) => toast.error(e?.response?.data?.message ?? "Oluşturulamadı"),
  });

  if (!role) return <div className="max-w-lg mx-auto text-center py-20"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" /><h2 className="text-xl font-semibold text-slate-900">Erişim yok</h2></div>;

  const setQ = (i, patch) => setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  const setOpt = (i, j, patch) => setQ(i, { options: questions[i].options.map((o, idx) => (idx === j ? { ...o, ...patch } : o)) });
  const setCorrect = (i, j) => setQ(i, { options: questions[i].options.map((o, idx) => ({ ...o, isCorrect: idx === j })) });
  const reset = () => { setTitle(""); setQuestions([emptyQ()]); };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center"><Radio className="w-5 h-5 text-amber-600" /></div>
          <div><h1 className="text-2xl font-bold text-slate-900">Canlı Sınav</h1><p className="text-sm text-slate-500">Eş zamanlı, kodla katılımlı sınav</p></div>
        </div>
        {canCreate && <Button onClick={() => { reset(); setOpen(true); }} className="bg-amber-500 hover:bg-amber-600 gap-2"><Plus className="w-4 h-4" /> Yeni Oturum</Button>}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />)}</div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-16 text-slate-500"><Radio className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>Henüz canlı oturum yok.</p></div>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => {
            const st = STATUS[s.status] ?? STATUS.DRAFT;
            return (
              <div key={s.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2"><span className="font-medium text-slate-900 truncate">{s.title}</span><Badge className={st.c}>{st.l}</Badge></div>
                  <p className="text-xs text-slate-500 mt-1">Kod: <span className="font-mono font-semibold">{s.joinCode}</span> · {s.questionCount} soru · {s.participantCount} katılımcı</p>
                </div>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => navigate(buildPageUrl("SchoolLiveHost", { id: s.id }))}>{s.status === "ENDED" ? <Eye className="w-4 h-4" /> : <Play className="w-4 h-4" />} {s.status === "ENDED" ? "Görüntüle" : "Yönet"}</Button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Yeni Canlı Oturum</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label htmlFor="lt">Başlık</Label><Input id="lt" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} /></div>
            {questions.map((q, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-3 space-y-2">
                <div className="flex items-center justify-between"><span className="text-sm font-medium">Soru {i + 1}</span>{questions.length > 1 && <button type="button" onClick={() => setQuestions((qs) => qs.filter((_, idx) => idx !== i))} className="text-rose-500"><Trash2 className="w-4 h-4" /></button>}</div>
                <Textarea value={q.content} onChange={(e) => setQ(i, { content: e.target.value })} rows={2} placeholder="Soru metni" />
                {q.options.map((o, j) => (
                  <div key={j} className="flex items-center gap-2">
                    <button type="button" onClick={() => setCorrect(i, j)} className={`shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-full border ${o.isCorrect ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300 text-transparent"}`}><CheckCircle2 className="w-3.5 h-3.5" /></button>
                    <Input value={o.content} onChange={(e) => setOpt(i, j, { content: e.target.value })} placeholder={`${String.fromCharCode(65 + j)} şıkkı`} className="h-9" />
                    {q.options.length > 2 && <button type="button" onClick={() => setQ(i, { options: q.options.filter((_, idx) => idx !== j) })} className="text-slate-400"><Trash2 className="w-4 h-4" /></button>}
                  </div>
                ))}
                <Button type="button" variant="ghost" size="sm" className="text-indigo-600 gap-1" onClick={() => setQ(i, { options: [...q.options, { content: "", isCorrect: false }] })}><Plus className="w-3.5 h-3.5" /> Şık</Button>
              </div>
            ))}
            <Button type="button" variant="outline" onClick={() => setQuestions((qs) => [...qs, emptyQ()])} className="w-full gap-1"><Plus className="w-4 h-4" /> Soru Ekle</Button>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>İptal</Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending || !title.trim()} className="bg-amber-500 hover:bg-amber-600">{create.isPending ? "Oluşturuluyor…" : "Oluştur"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
